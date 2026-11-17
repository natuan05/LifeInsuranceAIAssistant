import { Injectable, Logger } from '@nestjs/common';
import { SmtpClient, type SmtpConfig } from './smtp-client';

export interface TicketCreatedEmailData {
  to: string;
  customerName: string;
  ticketCode: string;
  ticketTitle: string;
  ticketId: string;
  createdAt: Date;
}

export interface TicketAcceptedEmailData {
  to: string;
  customerName: string;
  ticketCode: string;
  ticketTitle: string;
  ticketId: string;
  staffName?: string;
}

export interface TicketFailedEmailData {
  to: string;
  customerName: string;
  reason?: string;
}

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);
  private client: SmtpClient;
  private readonly portalBaseUrl: string;

  constructor() {
    const host = process.env.SMTP_HOST || '127.0.0.1';
    const port = Number.parseInt(process.env.SMTP_PORT || '1025', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER || undefined;
    const pass = process.env.SMTP_PASS || undefined;
    const from = process.env.EMAIL_FROM || 'Life Insurance Assistant <no-reply@life-assistant.local>';

    this.portalBaseUrl = (process.env.PORTAL_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

    const config: SmtpConfig = {
      host,
      port,
      secure,
      user,
      pass,
      from,
      timeoutMs: 10000,
    };

    this.client = new SmtpClient(config);
  }

  // Allow overriding client in tests
  setClient(client: SmtpClient) {
    this.client = client;
  }

  async sendTicketCreated(data: TicketCreatedEmailData): Promise<void> {
    const subject = `[Life Insurance] Tiếp nhận Phiếu hỗ trợ #${data.ticketCode}`;
    const safeTitle = this.escapeHtml(data.ticketTitle);
    const safeName = this.escapeHtml(data.customerName || 'Quý khách');
    const ticketUrl = `${this.portalBaseUrl}/tickets`;
    const formattedDate = data.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    const text = [
      `Kính chào ${safeName},`,
      '',
      `Yêu cầu hỗ trợ của bạn đã được ghi nhận thành công trên hệ thống:`,
      `- Mã phiếu hỗ trợ: #${data.ticketCode}`,
      `- Tiêu đề yêu cầu: ${data.ticketTitle}`,
      `- Trạng thái: Đang mở (OPEN)`,
      `- Thời gian tạo: ${formattedDate}`,
      '',
      `Để theo dõi tiến độ xử lý và cập nhật thông tin, bạn vui lòng đăng nhập Customer Portal tại:`,
      ticketUrl,
      '',
      'Trân trọng,',
      'Đội ngũ Chăm sóc Khách hàng Life Insurance',
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 20px; background-color: #f8fafc; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; }
    .header h2 { margin: 0; color: #0f172a; font-size: 20px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; background: #e0f2fe; color: #0369a1; }
    .info-box { background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0; }
    .info-row { margin-bottom: 8px; font-size: 14px; }
    .info-row:last-child { margin-bottom: 0; }
    .label { font-weight: 600; color: #64748b; width: 140px; display: inline-block; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 16px; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>Life Insurance Customer Service</h2>
    </div>
    <p>Kính chào <strong>${safeName}</strong>,</p>
    <p>Yêu cầu hỗ trợ của bạn đã được khởi tạo thành công trên hệ thống:</p>
    
    <div class="info-box">
      <div class="info-row"><span class="label">Mã phiếu:</span> <span class="badge">#${data.ticketCode}</span></div>
      <div class="info-row"><span class="label">Tiêu đề:</span> <strong>${safeTitle}</strong></div>
      <div class="info-row"><span class="label">Trạng thái:</span> <span style="color: #0284c7; font-weight: 600;">Đang mở (OPEN)</span></div>
      <div class="info-row"><span class="label">Thời gian tạo:</span> ${formattedDate}</div>
    </div>

    <p>Chuyên viên chăm sóc khách hàng phụ trách hợp đồng của bạn sẽ sớm tiếp nhận và phản hồi phiếu hỗ trợ này.</p>
    
    <center>
      <a href="${ticketUrl}" class="btn">Mở xem Phiếu hỗ trợ</a>
    </center>

    <div class="footer">
      <p>Thông báo này được gửi tự động từ hệ thống trợ lý bảo hiểm nhân thọ. Vui lòng không trả lời trực tiếp email này.</p>
      <p>Bảo mật: Email này không chứa các thông tin nhạy cảm về y tế hay số thẻ căn cước của bạn.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    await this.sendWithRetry({ to: data.to, subject, text, html });
  }

  async sendTicketAccepted(data: TicketAcceptedEmailData): Promise<void> {
    const subject = `[Life Insurance] Chuyên viên đã tiếp nhận Phiếu hỗ trợ #${data.ticketCode}`;
    const safeTitle = this.escapeHtml(data.ticketTitle);
    const safeName = this.escapeHtml(data.customerName || 'Quý khách');
    const safeStaffName = this.escapeHtml(data.staffName || 'Chuyên viên phụ trách');
    const ticketUrl = `${this.portalBaseUrl}/tickets`;

    const text = [
      `Kính chào ${safeName},`,
      '',
      `Phiếu hỗ trợ #${data.ticketCode} của bạn đã được chuyên viên tiếp nhận:`,
      `- Mã phiếu: #${data.ticketCode}`,
      `- Tiêu đề: ${data.ticketTitle}`,
      `- Trạng thái: Đang xử lý (IN_PROGRESS)`,
      `- Chuyên viên tiếp nhận: ${safeStaffName}`,
      '',
      `Để theo dõi cập nhật chi tiết hoặc trao đổi thêm, bạn vui lòng truy cập:`,
      ticketUrl,
      '',
      'Trân trọng,',
      'Đội ngũ Chăm sóc Khách hàng Life Insurance',
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 20px; background-color: #f8fafc; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { border-bottom: 2px solid #16a34a; padding-bottom: 16px; margin-bottom: 24px; }
    .header h2 { margin: 0; color: #0f172a; font-size: 20px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; background: #dcfce7; color: #15803d; }
    .info-box { background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0; }
    .info-row { margin-bottom: 8px; font-size: 14px; }
    .info-row:last-child { margin-bottom: 0; }
    .label { font-weight: 600; color: #64748b; width: 140px; display: inline-block; }
    .btn { display: inline-block; background-color: #16a34a; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 16px; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>Life Insurance Customer Service</h2>
    </div>
    <p>Kính chào <strong>${safeName}</strong>,</p>
    <p>Chuyên viên chăm sóc khách hàng đã chính thức tiếp nhận và đang xử lý yêu cầu của bạn:</p>
    
    <div class="info-box">
      <div class="info-row"><span class="label">Mã phiếu:</span> <span class="badge">#${data.ticketCode}</span></div>
      <div class="info-row"><span class="label">Tiêu đề:</span> <strong>${safeTitle}</strong></div>
      <div class="info-row"><span class="label">Trạng thái:</span> <span style="color: #16a34a; font-weight: 600;">Đang xử lý (IN_PROGRESS)</span></div>
      <div class="info-row"><span class="label">Chuyên viên:</span> <strong>${safeStaffName}</strong></div>
    </div>

    <p>Chúng tôi sẽ nhanh chóng xem xét hồ sơ và thông báo kết quả sớm nhất.</p>
    
    <center>
      <a href="${ticketUrl}" class="btn">Xem chi tiết Phiếu hỗ trợ</a>
    </center>

    <div class="footer">
      <p>Thông báo này được gửi tự động từ hệ thống trợ lý bảo hiểm nhân thọ. Vui lòng không trả lời trực tiếp email này.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    await this.sendWithRetry({ to: data.to, subject, text, html });
  }

  async sendTicketCreationFailed(data: TicketFailedEmailData): Promise<void> {
    const subject = '[Life Insurance] Thông báo về yêu cầu tạo phiếu hỗ trợ';
    const safeName = this.escapeHtml(data.customerName || 'Quý khách');
    const safeReason = this.escapeHtml(data.reason || 'Bản thảo yêu cầu đã hết hạn hoặc có sự thay đổi dữ liệu.');
    const ticketUrl = `${this.portalBaseUrl}/tickets`;

    const text = [
      `Kính chào ${safeName},`,
      '',
      `Yêu cầu tạo phiếu hỗ trợ của bạn chưa thể hoàn tất.`,
      `Lý do: ${data.reason || 'Bản thảo yêu cầu đã hết hạn hoặc có sự thay đổi dữ liệu.'}`,
      '',
      `Bạn vui lòng đăng nhập Customer Portal để tạo lại yêu cầu mới hoặc liên hệ chuyên viên phụ trách:`,
      ticketUrl,
      '',
      'Trân trọng,',
      'Đội ngũ Chăm sóc Khách hàng Life Insurance',
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 20px; background-color: #f8fafc; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { border-bottom: 2px solid #ef4444; padding-bottom: 16px; margin-bottom: 24px; }
    .header h2 { margin: 0; color: #0f172a; font-size: 20px; }
    .info-box { background: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 16px; margin: 20px 0; color: #991b1b; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 16px; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>Life Insurance Customer Service</h2>
    </div>
    <p>Kính chào <strong>${safeName}</strong>,</p>
    <p>Hệ thống không thể hoàn tất việc khởi tạo phiếu hỗ trợ của bạn.</p>
    
    <div class="info-box">
      <strong>Lý do ghi nhận:</strong> ${safeReason}
    </div>

    <p>Bạn vui lòng đăng nhập Customer Portal để tạo lại phiếu hỗ trợ mới hoặc nhắn tin trực tiếp với chuyên viên chăm sóc.</p>
    
    <center>
      <a href="${ticketUrl}" class="btn">Truy cập Customer Portal</a>
    </center>

    <div class="footer">
      <p>Thông báo này được gửi tự động từ hệ thống trợ lý bảo hiểm nhân thọ.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    await this.sendWithRetry({ to: data.to, subject, text, html });
  }

  private async sendWithRetry(options: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    try {
      const res = await this.client.sendMail(options);
      this.logger.log(`Email dispatched to ${options.to}: ${res.messageId}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${options.to}: ${(err as Error).message}`);
      throw err;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
