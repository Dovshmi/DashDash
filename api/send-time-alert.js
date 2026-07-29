import nodemailer from 'nodemailer';
import { isAllowedRequestOrigin } from './request-origin.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAllowedRequestOrigin(request.headers, process.env)) {
    return response.status(403).json({ error: 'Origin not allowed' });
  }

  const { recipientEmail, thresholdSeconds, thresholdMinutes } = request.body ?? {};
  const recipient = typeof recipientEmail === 'string' ? recipientEmail.trim() : '';
  const seconds = Number(thresholdSeconds) || Number(thresholdMinutes) * 60;

  if (!emailPattern.test(recipient) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86_400) {
    return response.status(400).json({ error: 'Invalid alert request' });
  }

  const threshold = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!user || !pass) {
    return response.status(503).json({ error: 'Email alerts are not configured yet' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || `DashDash <${user}>`,
      to: recipient,
      subject: `DashDash — עברו ${threshold} של זמן אישי`,
      text: `עברו ${threshold} מאז שהתחלת זמן אישי ב-DashDash.`,
    });
    return response.status(200).json({ sent: true });
  } catch (error) {
    console.error('Time alert email failed', error);
    return response.status(502).json({ error: 'Unable to send the email alert' });
  }
}
