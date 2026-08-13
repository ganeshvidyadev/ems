import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AppConfig, Configuration } from '../../config/configuration';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transactional email.
 *
 * Sends are **fire-and-forget from the caller's perspective**: `send` never throws.
 * A registration that fails because SMTP is briefly down is a worse outcome than an
 * account that exists with an unsent verification email — the user can request another,
 * but they cannot recover a failed signup. The failure is logged and, in Phase 3, will
 * be handed to the `notification` queue for retry.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: Transporter;
  private readonly app: AppConfig;
  private readonly mail: Configuration['mail'];

  constructor(configService: ConfigService) {
    this.app = configService.getOrThrow<AppConfig>('app');
    this.mail = configService.getOrThrow<Configuration['mail']>('mail');
  }

  onModuleInit(): void {
    this.transporter = nodemailer.createTransport({
      host: this.mail.host,
      port: this.mail.port,
      secure: this.mail.secure,
      auth: this.mail.user ? { user: this.mail.user, pass: this.mail.password } : undefined,
      // MailHog presents a self-signed certificate; production uses a real one.
      tls: { rejectUnauthorized: this.app.isProduction },
      pool: true,
      maxConnections: 5,
    });
  }

  async send(message: MailMessage): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.mail.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      this.logger.debug(`Sent "${message.subject}" to ${message.to}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send "${message.subject}" to ${message.to}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  async sendEmailVerification(to: string, firstName: string, token: string): Promise<void> {
    const url = `${this.app.consoleUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.send({
      to,
      subject: `Verify your ${this.app.name} account`,
      text: `Hi ${firstName},\n\nVerify your email address:\n${url}\n\nThis link expires in 24 hours.`,
      html: layout(
        `Verify your email`,
        `<p>Hi ${escapeHtml(firstName)},</p>
         <p>Confirm your email address to finish setting up your ${escapeHtml(this.app.name)} account.</p>
         ${button(url, 'Verify email address')}
         <p class="muted">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>`,
      ),
    });
  }

  async sendPasswordReset(to: string, firstName: string, token: string): Promise<void> {
    const url = `${this.app.consoleUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.send({
      to,
      subject: `Reset your ${this.app.name} password`,
      text: `Hi ${firstName},\n\nReset your password:\n${url}\n\nThis link expires in 1 hour.`,
      html: layout(
        `Reset your password`,
        `<p>Hi ${escapeHtml(firstName)},</p>
         <p>Use the link below to choose a new password.</p>
         ${button(url, 'Reset password')}
         <p class="muted">This link expires in 1 hour and can be used once.
         If you did not request this, no action is needed — your password has not changed.</p>`,
      ),
    });
  }

  /**
   * Notifies the account owner that their password changed.
   *
   * Sent *after* the change, unconditionally. If an attacker changed it, this is the
   * only signal the real owner gets — which is why it is not optional and not
   * suppressible.
   */
  async sendPasswordChangedNotice(to: string, firstName: string): Promise<void> {
    await this.send({
      to,
      subject: `Your ${this.app.name} password was changed`,
      text: `Hi ${firstName},\n\nYour password was just changed and all other sessions were signed out.\n\nIf this wasn't you, reset your password immediately: ${this.app.consoleUrl}/forgot-password`,
      html: layout(
        `Your password was changed`,
        `<p>Hi ${escapeHtml(firstName)},</p>
         <p>Your password was just changed, and every other signed-in device was signed out.</p>
         <p><strong>If this wasn't you</strong>, reset your password immediately and contact support.</p>
         ${button(`${this.app.consoleUrl}/forgot-password`, 'Reset password')}`,
      ),
    });
  }

  async sendOtp(to: string, code: string, purpose: string): Promise<void> {
    await this.send({
      to,
      subject: `Your ${this.app.name} verification code`,
      text: `Your verification code is ${code}. It expires in 5 minutes.`,
      html: layout(
        `Your verification code`,
        `<p>Use this code to ${escapeHtml(purpose.toLowerCase().replace(/_/g, ' '))}:</p>
         <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;font-family:monospace">${escapeHtml(code)}</p>
         <p class="muted">Expires in 5 minutes. Never share this code — we will never ask you for it.</p>`,
      ),
    });
  }

  async sendStaffInvitation(
    to: string,
    inviterName: string,
    storeName: string,
    token: string,
  ): Promise<void> {
    const url = `${this.app.consoleUrl}/accept-invite?token=${encodeURIComponent(token)}`;

    await this.send({
      to,
      subject: `${inviterName} invited you to ${storeName}`,
      text: `${inviterName} invited you to join ${storeName} on ${this.app.name}.\n\nAccept: ${url}\n\nThis invitation expires in 7 days.`,
      html: layout(
        `You've been invited`,
        `<p><strong>${escapeHtml(inviterName)}</strong> invited you to join
         <strong>${escapeHtml(storeName)}</strong> on ${escapeHtml(this.app.name)}.</p>
         ${button(url, 'Accept invitation')}
         <p class="muted">This invitation expires in 7 days.</p>`,
      ),
    });
  }
}

// ---------------------------------------------------------------------------
// Minimal inline-CSS layout
// ---------------------------------------------------------------------------

/**
 * Table-based layout with inline styles.
 *
 * Not a stylistic choice: Outlook and several webmail clients strip `<style>` blocks
 * and ignore modern layout properties, so anything else renders as unstyled text for a
 * meaningful share of recipients.
 */
function layout(heading: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:8px;padding:32px;text-align:left">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:20px;color:#111827">${escapeHtml(heading)}</h1>
          <div style="font-size:15px;line-height:1.6;color:#374151">${body}</div>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#9ca3af;text-align:center">
        Sent by EMS. Please do not reply to this message.
      </p>
    </td></tr>
  </table>
  <style>.muted{color:#6b7280;font-size:13px}</style>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
    <tr><td style="border-radius:6px;background:#2563eb">
      <a href="${escapeHtml(url)}"
         style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;
                color:#ffffff;text-decoration:none">${escapeHtml(label)}</a>
    </td></tr>
  </table>
  <p class="muted">Or paste this link into your browser:<br>
    <span style="word-break:break-all">${escapeHtml(url)}</span></p>`;
}

/** Escapes interpolated values — a merchant-supplied store name reaches these templates. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
