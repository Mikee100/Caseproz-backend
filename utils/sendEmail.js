const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    console.error('sendEmail called without "to" address');
    return;
  }

  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      text,
      html,
    });

    if (error) {
      console.error('Error sending email:', { ...error, to: recipients.join(','), subject });
      return { success: false, message: error.message, code: error.name };
    }

    console.log('Email sent:', { messageId: data.id, to: recipients.join(','), subject });
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Error sending email:', {
      message: error.message,
      to: recipients.join(','),
      subject,
    });
    return { success: false, message: error.message };
  }
};

module.exports = sendEmail;

