const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const https = require('https');

const smtpHost = process.env.SMTP_HOST;
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
const replyToEmail = process.env.REPLY_TO_EMAIL;

// nodemailer resolves both A and AAAA records and picks a random address,
// ignoring Node's IPv4-first DNS setting. Render has no outbound IPv6 route,
// so we pre-resolve to an IPv4 address ourselves and connect directly to it,
// keeping the original hostname as the TLS servername for certificate checks.
let transporterPromise = null;

const buildTransporter = async () => {
  if (!smtpHost) {
    throw new Error('SMTP_HOST is not configured');
  }

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

// Kick off SMTP verification at boot only when SMTP is the active provider.
if (!resendApiKey && smtpHost) {
  getTransporter();
}

const sendWithResend = ({ to, subject, text, html, replyTo }) => new Promise((resolve, reject) => {
  const payload = JSON.stringify({
    from: fromEmail,
    to,
    subject,
    text,
    html,
    reply_to: replyTo || replyToEmail || undefined,
  });

  const req = https.request(
    {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let data = null;
        try {
          data = body ? JSON.parse(body) : null;
        } catch (parseError) {
          data = { raw: body };
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data || {});
          return;
        }

        const error = new Error(data && data.message ? data.message : `Resend API returned ${res.statusCode}`);
        error.statusCode = res.statusCode;
        error.response = data || body;
        reject(error);
      });
    }
  );

  req.on('error', reject);
  req.write(payload);
  req.end();
});

const sendEmail = async ({ to, subject, text, html, replyTo }) => {
  if (!to) {
    console.error('sendEmail called without "to" address');
    return;
  }

  const recipients = Array.isArray(to) ? to : [to];

  const mailOptions = {
    from: fromEmail,
    to: recipients.filter(Boolean).join(','),
    subject,
    text,
    html,
    replyTo: replyTo || replyToEmail || undefined,
  };

  try {
    if (resendApiKey) {
      const info = await sendWithResend({
        to: recipients.filter(Boolean),
        subject,
        text,
        html,
        replyTo,
      });
      console.log('Email sent via Resend:', { messageId: info.id, to: mailOptions.to, subject });
      return { success: true, messageId: info.id };
    }

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

