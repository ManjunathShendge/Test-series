import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Transactional email over SMTP (EMAIL_SMTP_URL). Amazon SES, Postmark, Mailgun and others
 * all offer SMTP, so switching provider is a configuration change.
 */
export class SmtpEmail {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    const u = new URL(url);
    u.searchParams.set('connectionTimeout', '15000');
    u.searchParams.set('socketTimeout', '20000');
    this.transport = nodemailer.createTransport(u.toString());
  }

  /** Returns the provider's message id. Throws on rejection so the job can retry. */
  async send(message: EmailMessage): Promise<string> {
    const info = await this.transport.sendMail({ from: this.from, ...message });
    return String(info.messageId ?? '');
  }

  /** Startup check: connects and authenticates without sending anything. */
  async verify(): Promise<void> {
    await this.transport.verify();
  }
}
