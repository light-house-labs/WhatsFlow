/**
 * Transactional email. Uses Resend's HTTP API when RESEND_API_KEY is set,
 * otherwise prints the message to the server log (development).
 */
export async function sendMail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "WhatsFlow <no-reply@localhost>";
  if (!key) {
    if (process.env.NODE_ENV === "production") return { ok: false, error: "RESEND_API_KEY is not set" };
    console.info(`\n[mail] to=${to}\n[mail] subject=${subject}\n${text}\n`);
    return { ok: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
  return { ok: true };
}
