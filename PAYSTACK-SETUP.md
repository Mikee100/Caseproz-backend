# Paystack Payments

## Environment

Set these backend environment variables. Never put the secret key in `frontend/.env` or any browser code.

```env
PAYSTACK_SECRET_KEY=sk_test_your_secret_key
PAYSTACK_CALLBACK_URL=http://localhost:3000/payment/callback
```

`PAYSTACK_CALLBACK_URL` must point to the frontend payment callback. Use the deployed frontend URL in production, for example `https://caseproz.co.ke/payment/callback`.

## Paystack Dashboard

1. Create or select the Paystack business account that supports KES and its enabled Kenyan payment methods.
2. In Dashboard > Settings > API Keys & Webhooks, add this webhook URL:
   `https://<your-backend-host>/api/payments/paystack/webhook`
3. Use the matching test or live secret key in the backend environment. Deploy before registering the production webhook.
4. Paystack Checkout presents the payment channels enabled for the account, including M-PESA where Paystack makes it available. The application does not force a channel.

## Payment Lifecycle

Checkout creates a server-priced order, then sends only its ID to the authenticated payment initializer. The backend stores a pending payment with a unique Paystack reference, initializes hosted checkout in KES minor units, and redirects the customer to Paystack. On return, the frontend asks the backend for the status. The backend verifies Paystack's reference, status, amount, and currency before updating the payment to `SUCCESS` and setting the order to paid.

Paystack's signed `charge.success` webhook follows the same verification path. Duplicate webhook deliveries are safe: the payment status transition and order update are idempotent.

## Local Testing

Run the backend and frontend with test credentials. Set the callback URL to the frontend's local URL. To test webhooks locally, expose the backend with a secure tunnel and register the tunnel URL in Paystack. Use Paystack's test payment methods; do not use live keys locally.

## Production

Set `PAYSTACK_SECRET_KEY` and `PAYSTACK_CALLBACK_URL` in the backend host configuration, configure the production webhook URL, and ensure the backend is publicly reachable over HTTPS. Payment secrets must not be committed or added to Vercel/frontend variables.