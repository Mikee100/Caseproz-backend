/**
 * Generates the HTML for the order confirmation email.
 * @param {Object} order - The order object.
 * @param {Object} user - The user object (optional).
 * @param {Array} recommendedProducts - An array of 3 recommended products.
 * @returns {string} The HTML content.
 */
const generateOrderConfirmationEmail = (order, user, recommendedProducts = []) => {

  const itemsRowsHtml = order.orderItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; font-size: 15px; color: #222;">
          <div style="font-weight: 600;">${item.name}</div>
        </td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #4a5568; font-size: 15px;">${item.qty}</td>
        <td style="padding: 16px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #e53e3e; font-size: 15px;">KSh ${item.price.toLocaleString()}</td>
      </tr>`
    )
    .join('');

  const shippingText = order.shippingAddress
    ? `${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}, ${order.shippingAddress.country}`
    : 'N/A';

  const recommendedHtml = recommendedProducts.length > 0 ? `
    <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e2e8f0;">
      <h3 style="margin: 0 0 20px; font-size: 18px; color: #1a202c; text-align: center; text-transform: uppercase; letter-spacing: 1px;">Recommended for You</h3>
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 18px;">
        ${recommendedProducts.map(p => `
          <div style="flex: 1; min-width: 160px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; margin-bottom: 15px;">
            <img src="${p.images && p.images[0] ? p.images[0] : 'https://via.placeholder.com/150'}" alt="${p.name}" style="width: 100%; height: 120px; object-fit: contain; margin-bottom: 10px; border-radius: 6px;">
            <div style="font-size: 14px; font-weight: 600; color: #1a202c; height: 36px; overflow: hidden; margin-bottom: 8px;">${p.name}</div>
            <div style="font-size: 15px; color: #e53e3e; font-weight: 700;">KSh ${p.price.toLocaleString()}</div>
            <a href="https://caseproz.co.ke/product/${p.slug}" style="display: inline-block; margin-top: 10px; padding: 7px 14px; background: #1a202c; color: #fff; text-decoration: none; font-size: 12px; border-radius: 5px; font-weight: 600;">VIEW ITEM</a>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CaseProz Order Confirmation</title>
      <style>
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; padding: 10px !important; }
          .col-mobile { display: block !important; width: 100% !important; margin-bottom: 20px !important; }
        }
        .cta-btn {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(90deg, #e53e3e 0%, #f56565 100%);
          color: #fff !important;
          font-weight: bold;
          border-radius: 8px;
          font-size: 16px;
          text-decoration: none;
          margin-top: 18px;
          margin-bottom: 10px;
          letter-spacing: 1px;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f7fafc; color: #2d3748;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f7fafc; padding: 20px 0;">
        <tr>
          <td align="center">
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 24px -2px rgba(0,0,0,0.08), 0 1.5px 4px -1px rgba(0,0,0,0.04);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #e53e3e 0%, #1a202c 100%); padding: 44px 30px 32px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #fff; font-size: 32px; font-weight: 900; letter-spacing: 2px;">CASEPROZ</h1>
                      <div style="margin-top: 12px; height: 2.5px; width: 48px; background: #fff; margin-left: auto; margin-right: auto;"></div>
                      <p style="margin: 18px 0 0; color: #f7fafc; font-size: 15px; text-transform: uppercase; letter-spacing: 1.5px;">Order Confirmation</p>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding: 44px 32px 32px 32px;">
                      <h2 style="margin: 0 0 18px; font-size: 24px; color: #1a202c; font-weight: 800;">Thank you for your order!</h2>
                      <p style="margin: 0 0 22px; line-height: 1.7; color: #4a5568; font-size: 16px;">
                        Hi ${user ? user.name.split(' ')[0] : 'there'}, we've received your order and it's being processed.<br>Your order ID is <strong style="color: #e53e3e;">#${order._id}</strong>.
                      </p>
                      <div style="background: #e6f7ee; border: 1.5px solid #38a169; border-radius: 10px; padding: 18px 20px; margin: 28px 0 32px 0; color: #22543d; font-weight: 600; font-size: 16px;">
                        <span style="margin-right: 8px;">💳</span>
                        <strong>Lipa na M-Pesa Instructions:</strong><br />
                        To pay for your order, use <strong>Lipa na Mpesa</strong> and enter:<br />
                        <strong>Account Number:</strong> 40043<br />
                        <strong>Business Number:</strong> ${user && user.name ? user.name : '(your name as entered in the order)'}
                      </div>

                      <!-- Order Details -->
                      <div style="background: #f8fafc; border-radius: 10px; padding: 22px 20px; margin-bottom: 32px; border: 1.5px solid #e2e8f0;">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                          <tr>
                            <td class="col-mobile" width="50%" style="vertical-align: top;">
                              <h4 style="margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px;">Shipping To</h4>
                              <p style="margin: 0; font-size: 15px; color: #2d3748; line-height: 1.5;">
                                ${user ? `<strong>${user.name}</strong><br>` : ''}
                                ${shippingText}
                              </p>
                            </td>
                            <td class="col-mobile" width="50%" style="vertical-align: top;">
                              <h4 style="margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px;">Order Details</h4>
                              <p style="margin: 0; font-size: 15px; color: #2d3748; line-height: 1.5;">
                                Date: ${new Date(order.createdAt).toLocaleDateString()}<br>
                                Payment: ${order.paymentMethod || 'N/A'}<br>
                                Status: <span style="color: #3182ce; font-weight: 700;">${order.status.toUpperCase()}</span>
                              </p>
                            </td>
                          </tr>
                        </table>
                      </div>

                      <!-- Items Table -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px; border-radius: 10px; overflow: hidden;">
                        <thead>
                          <tr style="background: #f1f5f9;">
                            <th style="text-align: left; padding: 14px; border-bottom: 2px solid #e2e8f0; font-size: 14px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px;">Item</th>
                            <th style="text-align: center; padding: 14px; border-bottom: 2px solid #e2e8f0; font-size: 14px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px;">Qty</th>
                            <th style="text-align: right; padding: 14px; border-bottom: 2px solid #e2e8f0; font-size: 14px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px;">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${itemsRowsHtml}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colspan="2" style="padding: 12px 12px 6px; text-align: right; color: #718096; font-size: 15px;">Subtotal</td>
                            <td style="padding: 12px 12px 6px; text-align: right; color: #1a202c; font-size: 15px; font-weight: 700;">KSh ${order.itemsPrice.toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td colspan="2" style="padding: 6px 12px; text-align: right; color: #718096; font-size: 15px;">Shipping</td>
                            <td style="padding: 6px 12px; text-align: right; color: #1a202c; font-size: 15px; font-weight: 700;">KSh ${order.shippingPrice.toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td colspan="2" style="padding: 6px 12px; text-align: right; color: #718096; font-size: 15px;">Tax</td>
                            <td style="padding: 6px 12px; text-align: right; color: #1a202c; font-size: 15px; font-weight: 700;">KSh ${order.taxPrice.toLocaleString()}</td>
                          </tr>
                          ${order.discountAmount > 0 ? `
                            <tr>
                              <td colspan="2" style="padding: 6px 12px; text-align: right; color: #38a169; font-size: 15px;">Discount ${order.discountCode ? `(${order.discountCode})` : ''}</td>
                              <td style="padding: 6px 12px; text-align: right; color: #38a169; font-size: 15px; font-weight: 700;">-KSh ${order.discountAmount.toLocaleString()}</td>
                            </tr>
                          ` : ''}
                          <tr>
                            <td colspan="2" style="padding: 15px 12px; text-align: right; font-size: 19px; font-weight: 900; color: #1a202c; border-top: 2px solid #e2e8f0;">TOTAL</td>
                            <td style="padding: 15px 12px; text-align: right; font-size: 19px; font-weight: 900; color: #e53e3e; border-top: 2px solid #e2e8f0;">KSh ${order.totalPrice.toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>

                      <!-- CTA Button -->
                      <div style="text-align: center; margin-bottom: 32px;">
                        <a href="https://caseproz.co.ke/my-orders" class="cta-btn">View My Orders</a>
                      </div>

                      <!-- Ads / CTA -->
                      <div style="background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%); border-radius: 10px; padding: 25px; text-align: center; color: #fff; margin-bottom: 24px;">
                        <h3 style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">Join the CaseProz Community!</h3>
                        <p style="margin: 0 0 20px; font-size: 15px; color: #ccd0d5;">Get 10% off your next order when you refer a friend. Use code <strong style="color: #fff;">REFER10</strong></p>
                        <a href="https://caseproz.co.ke" style="display: inline-block; padding: 12px 25px; background: #fff; color: #1a202c; text-decoration: none; font-weight: 700; border-radius: 7px; font-size: 15px;">SHOP LATEST ARRIVALS</a>
                      </div>

                      <!-- Related Products -->
                      ${recommendedHtml}

                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8fafc; padding: 40px 30px; text-align: center; border-top: 1.5px solid #e2e8f0;">
                      <div style="margin-bottom: 20px;">
                        <a href="#" style="margin: 0 10px; display: inline-block;"><img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" width="24" height="24" alt="Facebook"></a>
                        <a href="#" style="margin: 0 10px; display: inline-block;"><img src="https://cdn-icons-png.flaticon.com/32/2111/2111463.png" width="24" height="24" alt="Instagram"></a>
                        <a href="#" style="margin: 0 10px; display: inline-block;"><img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" width="24" height="24" alt="Twitter"></a>
                      </div>
                      <p style="margin: 0 0 10px; font-size: 13px; color: #718096;">
                        &copy; ${new Date().getFullYear()} CASEPROZ KENYA. All rights reserved.
                      </p>
                      <p style="margin: 0; font-size: 13px; color: #a0aec0; line-height: 1.6;">
                        Kenya's premium electronics destination.<br>
                        Nairobi, Kenya | support@caseproz.co.ke<br>
                        <a href="https://caseproz.co.ke/unsubscribe" style="color: #a0aec0; text-decoration: underline;">Unsubscribe</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
}
const generateVerificationEmail = (user, verifyUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify your CaseProz Account</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; background-color: #f7fafc; color: #2d3748;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <tr>
                <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: 2px;">CASEPROZ</h1>
                  <p style="margin: 15px 0 0; color: #a0aec0; font-size: 14px; text-transform: uppercase;">Verify Your Email</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 30px; text-align: center;">
                  <h2 style="margin: 0 0 20px; font-size: 22px; color: #1a202c;">Welcome, ${user.name.split(' ')[0]}!</h2>
                  <p style="margin: 0 0 25px; line-height: 1.6; color: #4a5568;">
                    Thanks for registering with CaseProz. Please confirm your email address to activate your account and start shopping.
                  </p>
                  <a href="${verifyUrl}" style="display: inline-block; padding: 14px 30px; background-color: #e53e3e; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px;">VERIFY EMAIL</a>
                  <p style="margin: 25px 0 0; font-size: 13px; color: #718096;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${verifyUrl}" style="color: #3182ce; word-break: break-all;">${verifyUrl}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

const generatePasswordResetEmail = (user, resetUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset your CaseProz Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; background-color: #f7fafc; color: #2d3748;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <tr>
                <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: 2px;">CASEPROZ</h1>
                  <p style="margin: 15px 0 0; color: #a0aec0; font-size: 14px; text-transform: uppercase;">Password Reset Request</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 30px; text-align: center;">
                  <h2 style="margin: 0 0 20px; font-size: 22px; color: #1a202c;">Hello, ${user.name.split(' ')[0]}</h2>
                  <p style="margin: 0 0 25px; line-height: 1.6; color: #4a5568;">
                    We received a request to reset the password for your CaseProz account. Click the button below to choose a new password. This link is only valid for 1 hour.
                  </p>
                  <a href="${resetUrl}" style="display: inline-block; padding: 14px 30px; background-color: #3182ce; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px;">RESET PASSWORD</a>
                  <p style="margin: 25px 0 0; font-size: 13px; color: #718096;">
                    If you did not request this, please ignore this email. Your password will remain unchanged.<br><br>
                    Or copy and paste this link:<br>
                    <a href="${resetUrl}" style="color: #3182ce; word-break: break-all;">${resetUrl}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

module.exports = {
  generateOrderConfirmationEmail,
  generateVerificationEmail,
  generatePasswordResetEmail,
};
