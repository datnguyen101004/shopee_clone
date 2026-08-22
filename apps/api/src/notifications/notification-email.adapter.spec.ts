import {
  compileNotificationEmail,
  ConsoleEmailTransporter,
  createNotificationEmailTransporter,
} from './notification-email.adapter';

describe('notification email adapter', () => {
  it('compiles branded html and plaintext templates', () => {
    const compiled = compileNotificationEmail({
      title: 'Đơn hàng đã giao',
      body: 'Đơn của bạn đã được giao thành công.',
      targetUrl: '/account/orders/abc',
      displayName: 'An',
    });
    expect(compiled.subject).toBe('Đơn hàng đã giao');
    expect(compiled.textBody).toContain('Xin chào An');
    expect(compiled.textBody).toContain('/account/orders/abc');
    expect(compiled.htmlBody).toContain('Shopee Clone');
    expect(compiled.htmlBody).toContain('Đơn hàng đã giao');
  });

  it('defaults to console transporter and escapes html', async () => {
    const transporter = createNotificationEmailTransporter({
      NOTIFICATION_EMAIL_MODE: 'console',
    });
    expect(transporter).toBeInstanceOf(ConsoleEmailTransporter);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await transporter.send({
      to: 'a@example.test',
      toName: 'A',
      subject: 'Hi',
      htmlBody: '<b>x</b>',
      textBody: 'x',
      notificationId: '00000000-0000-4000-8000-000000000001',
      type: 'ORDER_DELIVERED',
    });
    expect(info).toHaveBeenCalled();
    info.mockRestore();

    const compiled = compileNotificationEmail({
      title: 'A <B>',
      body: 'C & D',
      targetUrl: '/x',
      displayName: 'E',
    });
    expect(compiled.htmlBody).toContain('A &lt;B&gt;');
    expect(compiled.htmlBody).toContain('C &amp; D');
  });
});
