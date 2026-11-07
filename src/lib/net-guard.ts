import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function privateV6(ip: string) {
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return privateV4(x.slice(7));
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80");
}

export class UnsafeUrlError extends Error {}

/**
 * Refuse URLs that point at this server's own network (SSRF). Customer-supplied
 * webhook URLs must be public https. Plain http and localhost are allowed in dev only.
 */
export async function assertPublicUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That isn't a valid URL.");
  }
  const dev = process.env.NODE_ENV !== "production";
  if (u.protocol !== "https:" && !(dev && u.protocol === "http:")) throw new UnsafeUrlError("Use an https:// URL.");
  if (u.username || u.password) throw new UnsafeUrlError("Don't put credentials in the URL.");
  if (dev) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new UnsafeUrlError("That host doesn't resolve.");
  for (const a of addrs) {
    if (a.family === 4 ? privateV4(a.address) : privateV6(a.address)) throw new UnsafeUrlError("That URL points to a private network address.");
  }
  return u;
}
