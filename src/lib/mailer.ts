import "server-only";
import nodemailer from "nodemailer";
import { all, run } from "./db";
import { smtpConfigured } from "./settings";

/**
 * Sends through SMTP when SMTP_HOST is set (see .env.example). Without it, emails are only
 * written to the outbox log so you can see what would have gone out.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<{ delivered: boolean; error?: string }> {
  let delivered = false;
  let error: string | undefined;
  if (smtpConfigured()) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      await transport.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to, subject, text });
      delivered = true;
    } catch (e) {
      error = (e as Error).message;
      console.error("[mail]", error);
    }
  } else {
    error = "SMTP not configured — logged only";
    console.log(`[mail] (not sent) to=${to} subject=${subject}\n${text}`);
  }
  (await run("INSERT INTO email_log (to_addr, subject, body, delivered, error, created_at) VALUES (?, ?, ?, ?, ?, ?)", to, subject, text, delivered ? 1 : 0, error ?? null, new Date().toISOString()));
  return { delivered, error };
}

export async function recentEmails(limit = 20) {
  return (await all("SELECT id, to_addr AS toAddr, subject, body, delivered, error, created_at AS createdAt FROM email_log ORDER BY id DESC LIMIT ?", limit));
}
