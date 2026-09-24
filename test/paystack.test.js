const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  paystackRequest,
  toKesMinorUnits,
  verifyWebhookSignature,
} = require('../utils/paystack');

test('converts KES amounts to Paystack minor units without rounding floats', () => {
  assert.equal(toKesMinorUnits('2500'), 250000);
  assert.equal(toKesMinorUnits('2500.50'), 250050);
  assert.throws(() => toKesMinorUnits('12.345'));
});

test('validates a Paystack webhook signature against the raw body', () => {
  const body = Buffer.from('{"event":"charge.success"}');
  const secret = 'test_secret';
  const signature = crypto.createHmac('sha512', secret).update(body).digest('hex');

  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(body, 'invalid', secret), false);
});

test('sends the Paystack secret only as a backend authorization header', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = 'test_key';

  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.paystack.co/transaction/initialize');
    assert.equal(options.headers.Authorization, 'Bearer test_key');
    assert.equal(options.method, 'POST');
    return {
      ok: true,
      json: async () => ({ status: true, data: { reference: 'test_reference' } }),
    };
  };

  try {
    const response = await paystackRequest('/transaction/initialize', { method: 'POST' });
    assert.equal(response.reference, 'test_reference');
  } finally {
    global.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env.PAYSTACK_SECRET_KEY;
    } else {
      process.env.PAYSTACK_SECRET_KEY = originalSecret;
    }
  }
});