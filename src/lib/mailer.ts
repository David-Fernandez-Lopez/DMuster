import nodemailer, { type Transporter } from "nodemailer";

import { env, isMailConfigured } from "@/lib/env";

let transporter: Transporter | null = null;

/**
 * Lazily builds the shared SMTP transport from the validated environment.
 *
 * @returns {Transporter} The reusable transport.
 * @throws {Error} If mail is not configured (callers must check `isMailConfigured`).
 */
function getTransporter(): Transporter {
  if (!isMailConfigured) {
    throw new Error("[MAIL/CONFIG] SMTP is not configured.");
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE ?? false,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // Fail fast: the request handler awaits this, and a hung relay must not
    // hold a form submission open.
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

/**
 * Sends one email through the configured SMTP relay.
 *
 * @param {{ to: string; subject: string; text: string; html: string }} message - Recipient and content.
 * @returns {Promise<void>} Resolves once the relay accepted the message.
 * @throws {Error} If mail is unconfigured or the relay rejects/fails.
 */
export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  await getTransporter().sendMail({ from: env.SMTP_FROM, ...message });
}
