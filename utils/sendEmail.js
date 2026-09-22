const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  // Render has no outbound IPv6 route; force IPv4 to avoid ENETUNREACH.
  family: 4,
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

// Verify SMTP connectivity/auth once at boot so misconfiguration shows up in
// deploy logs immediately instead of silently failing on the first order.
transporter.verify((error) => {
  if (error) {
    console.error('SMTP transporter verification failed:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
    });
  } else {
    console.log('SMTP transporter verified: ready to send emails.');
  }
});

const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    console.error('sendEmail called without "to" address');
    return;
  }

  const recipients = Array.isArray(to) ? to : [to];

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: recipients.filter(Boolean).join(','),
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', { messageId: info.messageId, to: mailOptions.to, subject });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      to: mailOptions.to,
      subject,
    });
    return { success: false, message: error.message, code: error.code };
  }
};

module.exports = sendEmail;

