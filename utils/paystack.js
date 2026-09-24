const crypto = require('crypto');

const PAYSTACK_API_URL = 'https://api.paystack.co';

const toKesMinorUnits = (amount) => {
  const value = String(amount).trim();
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    throw new Error('Order amount must be a positive KES amount with at most two decimal places');
  }

  const major = BigInt(match[1]);
  const fractional = BigInt((match[2] || '').padEnd(2, '0') || '0');
  const minor = major * 100n + fractional;

  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Order amount is outside Paystack supported limits');
  }

  return Number(minor);
};

const generatePaystackReference = () => `caseproz_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;

const verifyWebhookSignature = (rawBody, signature, secretKey) => {
  if (!signature || !secretKey || !Buffer.isBuffer(rawBody)) return false;

  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  const supplied = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return supplied.length === expectedBuffer.length && crypto.timingSafeEqual(supplied, expectedBuffer);
};

const paystackRequest = async (path, options = {}) => {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    const error = new Error('Paystack is not configured');
    error.code = 'PAYSTACK_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${PAYSTACK_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.status) {
      const error = new Error(data?.message || 'Paystack request failed');
      error.code = 'PAYSTACK_REQUEST_FAILED';
      throw error;
    }

    return data.data;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  generatePaystackReference,
  paystackRequest,
  toKesMinorUnits,
  verifyWebhookSignature,
};