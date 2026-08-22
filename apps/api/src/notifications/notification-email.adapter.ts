import { randomUUID } from 'node:crypto';

export interface NotificationEmailMessage {
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  notificationId: string;
  type: string;
}

export interface NotificationEmailTransporter {
  send(message: NotificationEmailMessage): Promise<void>;
}

export class ConsoleEmailTransporter implements NotificationEmailTransporter {
  async send(message: NotificationEmailMessage): Promise<void> {
    console.info(
      JSON.stringify({
        channel: 'notification-email',
        transporter: 'console',
        to: message.to,
        subject: message.subject,
        notificationId: message.notificationId,
        type: message.type,
        textBody: message.textBody,
      }),
    );
  }
}

export class SmtpEmailTransporter implements NotificationEmailTransporter {
  constructor(
    private readonly endpoint: string,
    private readonly authToken: string,
  ) {}

  async send(message: NotificationEmailMessage): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`SMTP provider rejected email (${response.status})`);
  }
}

export class SesEmailTransporter implements NotificationEmailTransporter {
  constructor(
    private readonly endpoint: string,
    private readonly authToken: string,
  ) {}

  async send(message: NotificationEmailMessage): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
        'X-Email-Provider': 'ses',
      },
      body: JSON.stringify({
        ...message,
        messageId: randomUUID(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`SES provider rejected email (${response.status})`);
  }
}

export function createNotificationEmailTransporter(
  env: NodeJS.ProcessEnv = process.env,
): NotificationEmailTransporter {
  const mode = (env.NOTIFICATION_EMAIL_MODE ?? 'console').toLowerCase();
  if (mode === 'smtp') {
    const endpoint = env.NOTIFICATION_SMTP_WEBHOOK_URL;
    const token = env.NOTIFICATION_SMTP_WEBHOOK_SECRET;
    if (!endpoint || !token) throw new Error('SMTP notification email configuration is incomplete');
    return new SmtpEmailTransporter(endpoint, token);
  }
  if (mode === 'ses') {
    const endpoint = env.NOTIFICATION_SES_WEBHOOK_URL;
    const token = env.NOTIFICATION_SES_WEBHOOK_SECRET;
    if (!endpoint || !token) throw new Error('SES notification email configuration is incomplete');
    return new SesEmailTransporter(endpoint, token);
  }
  return new ConsoleEmailTransporter();
}

export function compileNotificationEmail(input: {
  title: string;
  body: string;
  targetUrl: string;
  displayName: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const subject = input.title;
  const appBase = process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:3000';
  const absoluteTarget = input.targetUrl.startsWith('http')
    ? input.targetUrl
    : `${appBase.replace(/\/$/, '')}${input.targetUrl.startsWith('/') ? '' : '/'}${input.targetUrl}`;
  const textBody = [
    `Xin chào ${input.displayName},`,
    '',
    input.body,
    '',
    `Xem chi tiết: ${absoluteTarget}`,
    '',
    '— Shopee Clone',
  ].join('\n');
  const htmlBody = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="background:#ee4d2d;color:#fff;padding:16px 20px;font-size:18px;font-weight:700">Shopee Clone</td></tr>
        <tr><td style="padding:24px 20px">
          <p style="margin:0 0 12px">Xin chào <strong>${escapeHtml(input.displayName)}</strong>,</p>
          <h1 style="margin:0 0 12px;font-size:20px;color:#222">${escapeHtml(input.title)}</h1>
          <p style="margin:0 0 20px;line-height:1.5;color:#444">${escapeHtml(input.body)}</p>
          <p style="margin:0"><a href="${escapeHtml(absoluteTarget)}" style="display:inline-block;background:#ee4d2d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:4px;font-weight:600">Xem chi tiết</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, htmlBody, textBody };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
