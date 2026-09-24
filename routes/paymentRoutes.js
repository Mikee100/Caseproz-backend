const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const { protect } = require('../middleware/authMiddleware');
const {
  generatePaystackReference,
  paystackRequest,
  toKesMinorUnits,
  verifyWebhookSignature,
} = require('../utils/paystack');

const CURRENCY = 'KES';
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const isValidObjectId = (value) => typeof value === 'string' && OBJECT_ID_REGEX.test(value);

const paymentSummary = (payment) => ({
  orderId: String(payment.order),
  reference: payment.providerReference,
  status: payment.status,
  paidAt: payment.paidAt || null,
});

const verifiedResponse = (transaction) => ({
  transactionId: transaction.id ? String(transaction.id) : undefined,
  reference: transaction.reference,
  status: transaction.status,
  amount: Number(transaction.amount),
  currency: transaction.currency,
  paidAt: transaction.paid_at || undefined,
  channel: transaction.channel || undefined,
});

const assertVerifiedTransaction = (payment, transaction) => {
  if (
    transaction?.reference !== payment.providerReference ||
    transaction?.status !== 'success' ||
    Number(transaction.amount) !== payment.amount ||
    transaction.currency !== payment.currency
  ) {
    throw new Error('Paystack transaction does not match the pending payment');
  }
};

const markPaymentSuccessful = async (payment, transaction) => {
  assertVerifiedTransaction(payment, transaction);

  const providerResponse = verifiedResponse(transaction);
  const paidAt = transaction.paid_at ? new Date(transaction.paid_at) : new Date();
  const updatedPayment = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'PENDING' },
    { $set: { status: 'SUCCESS', paidAt, providerResponse } },
    { returnDocument: 'after' }
  );

  const successfulPayment = updatedPayment || await Payment.findById(payment._id);
  if (!successfulPayment || successfulPayment.status !== 'SUCCESS') {
    throw new Error('Payment is no longer eligible to be marked successful');
  }

  // This update is intentionally idempotent so a webhook retry also repairs an
  // order update if a process stopped between the payment and order writes.
  await Order.updateOne(
    { _id: successfulPayment.order, user: successfulPayment.user, isPaid: false },
    {
      $set: {
        isPaid: true,
        paidAt: successfulPayment.paidAt,
        paymentResult: {
          id: providerResponse.transactionId,
          status: 'SUCCESS',
          update_time: successfulPayment.paidAt.toISOString(),
        },
      },
    }
  );

  return successfulPayment;
};

const verifyPaymentWithPaystack = async (payment) => {
  const transaction = await paystackRequest(
    `/transaction/verify/${encodeURIComponent(payment.providerReference)}`
  );

  if (transaction.status === 'success') {
    return markPaymentSuccessful(payment, transaction);
  }

  if (transaction.status === 'failed' && payment.status === 'PENDING') {
    await Payment.updateOne(
      { _id: payment._id, status: 'PENDING' },
      { $set: { status: 'FAILED', providerResponse: verifiedResponse(transaction) } }
    );
  }

  return Payment.findById(payment._id);
};

// @desc    Initialize a Paystack checkout session for the authenticated order owner
// @route   POST /api/payments/paystack/initialize
// @access  Private
router.post('/paystack/initialize', protect, async (req, res) => {
  const { orderId } = req.body;
  if (!isValidObjectId(orderId)) {
    return res.status(400).json({ message: 'A valid orderId is required' });
  }

  try {
    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.isPaid) return res.status(409).json({ message: 'This order has already been paid' });
    if (order.status === 'cancelled') return res.status(409).json({ message: 'Cancelled orders cannot be paid' });

    const existingPayment = await Payment.findOne({ order: order._id, status: 'PENDING' });
    if (existingPayment?.authorizationUrl) {
      return res.json({
        authorizationUrl: existingPayment.authorizationUrl,
        accessCode: existingPayment.accessCode,
        reference: existingPayment.providerReference,
      });
    }
    if (existingPayment) {
      return res.status(409).json({ message: 'A payment initialization is already in progress. Please try again shortly.' });
    }

    const amount = toKesMinorUnits(order.totalPrice);
    const payment = await Payment.create({
      order: order._id,
      user: req.user._id,
      providerReference: generatePaystackReference(),
      amount,
      currency: CURRENCY,
    });

    try {
      const transaction = await paystackRequest('/transaction/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: req.user.email,
          amount: String(amount),
          currency: CURRENCY,
          reference: payment.providerReference,
          callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined,
          metadata: { orderId: String(order._id), paymentId: String(payment._id) },
        }),
      });

      if (!transaction?.authorization_url || transaction.reference !== payment.providerReference) {
        throw new Error('Paystack returned an invalid initialization response');
      }

      payment.authorizationUrl = transaction.authorization_url;
      payment.accessCode = transaction.access_code;
      await payment.save();

      return res.json({
        authorizationUrl: payment.authorizationUrl,
        accessCode: payment.accessCode,
        reference: payment.providerReference,
      });
    } catch (error) {
      await Payment.updateOne(
        { _id: payment._id, status: 'PENDING' },
        { $set: { status: 'FAILED', providerResponse: { error: error.message, occurredAt: new Date() } } }
      );
      console.error('Paystack initialization failed:', error.message);
      return res.status(error.code === 'PAYSTACK_NOT_CONFIGURED' ? 503 : 502).json({
        message: 'Unable to start payment at this time. Please try again shortly.',
      });
    }
  } catch (error) {
    if (error?.code === 11000) {
      const pendingPayment = await Payment.findOne({ order: orderId, status: 'PENDING' });
      if (pendingPayment?.authorizationUrl) {
        return res.json({
          authorizationUrl: pendingPayment.authorizationUrl,
          accessCode: pendingPayment.accessCode,
          reference: pendingPayment.providerReference,
        });
      }
      return res.status(409).json({ message: 'A payment initialization is already in progress. Please try again shortly.' });
    }
    console.error('Paystack payment initialization error:', error.message);
    return res.status(500).json({ message: 'Unable to initialize payment' });
  }
});

// @desc    Get the latest payment record for an order
// @route   GET /api/payments/order/:orderId
// @access  Private (order owner or admin)
router.get('/order/:orderId', protect, async (req, res) => {
  if (!isValidObjectId(req.params.orderId)) {
    return res.status(400).json({ message: 'A valid orderId is required' });
  }

  try {
    const orderQuery = { _id: req.params.orderId };
    if (!req.user.isAdmin) orderQuery.user = req.user._id;

    const order = await Order.findOne(orderQuery).select('_id');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const payment = await Payment.findOne({ order: order._id })
      .sort({ createdAt: -1 })
      .select('provider providerReference amount currency status paidAt providerResponse createdAt');

    if (!payment) return res.json({ payment: null });

    return res.json({
      payment: {
        provider: payment.provider,
        reference: payment.providerReference,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        paidAt: payment.paidAt || null,
        channel: payment.providerResponse?.channel || null,
        receiptNumber: payment.providerResponse?.transactionId || null,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    console.error('Order payment lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to retrieve payment details' });
  }
});

// @desc    Get authoritative Paystack payment status after the hosted checkout returns
// @route   GET /api/payments/paystack/:reference
// @access  Private
router.get('/paystack/:reference', protect, async (req, res) => {
  try {
    let payment = await Payment.findOne({
      providerReference: req.params.reference,
      user: req.user._id,
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    if (payment.status === 'PENDING') {
      try {
        payment = await verifyPaymentWithPaystack(payment);
      } catch (error) {
        console.error('Paystack payment verification failed:', error.message);
        return res.status(502).json({ message: 'Unable to verify payment status. Please try again shortly.' });
      }
    }

    return res.json(paymentSummary(payment));
  } catch (error) {
    console.error('Paystack payment status error:', error.message);
    return res.status(500).json({ message: 'Unable to retrieve payment status' });
  }
});

// @desc    Process signed Paystack payment events
// @route   POST /api/payments/paystack/webhook
// @access  Public (signed by Paystack)
router.post('/paystack/webhook', async (req, res) => {
  const rawBody = req.body;
  const signature = req.get('x-paystack-signature');

  if (!verifyWebhookSignature(rawBody, signature, process.env.PAYSTACK_SECRET_KEY)) {
    return res.status(401).json({ message: 'Invalid Paystack webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Invalid webhook payload' });
  }

  const reference = event?.data?.reference;
  if (!reference) return res.status(200).json({ received: true });

  try {
    const payment = await Payment.findOne({ providerReference: reference });
    if (!payment) {
      console.warn(`Paystack webhook received for unknown reference: ${reference}`);
      return res.status(200).json({ received: true });
    }

    if (event.event === 'charge.success') {
      const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
      await markPaymentSuccessful(payment, transaction);
    } else if (event.event === 'charge.failed' && payment.status === 'PENDING') {
      await Payment.updateOne(
        { _id: payment._id, status: 'PENDING' },
        { $set: { status: 'FAILED', providerResponse: verifiedResponse(event.data) } }
      );
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Paystack webhook processing failed:', error.message);
    return res.status(500).json({ message: 'Webhook processing failed' });
  }
});

module.exports = router;