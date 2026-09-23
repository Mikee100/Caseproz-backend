const nodemailer = require('nodemailer');
const dns = require('dns').promises;

const smtpHost = process.env.SMTP_HOST;

// nodemailer resolves both A and AAAA records and picks a random address,
// ignoring Node's IPv4-first DNS setting. Render has no outbound IPv6 route,
// so we pre-resolve to an IPv4 address ourselves and connect directly to it,
// keeping the original hostname as the TLS servername for certificate checks.
let transporterPromise = null;

const buildTransporter = async () => {
  let host = smtpHost;
  try {
    const addresses = await dns.resolve4(smtpHost);
    if (addresses.length > 0) {
      host = addresses[Math.floor(Math.random() * addresses.length)];
    }
  } catch (err) {
    console.error(`Failed to resolve IPv4 address for ${smtpHost}, falling back to hostname:`, err.message);
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    tls: { servername: smtpHost },
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });

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

  return transporter;
};

const getTransporter = () => {
  if (!transporterPromise) {
    transporterPromise = buildTransporter();
  }
  return transporterPromise;
};

// Kick off resolution/verification at boot so failures show up in deploy logs.
getTransporter();

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
    const transporter = await getTransporter();
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

