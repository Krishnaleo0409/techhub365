"use strict";

const crypto = require("node:crypto");
const { COOKIE_NAME, hasPinProAccess, pinCookie, pinEnabled, TTL_SECONDS } = require("./_pin-access");
const { createGrant } = require("./_pin-grants");

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

function setCookie(req, res, value, maxAge) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" || req.socket?.encrypted;
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (req.method === "GET") return res.status(200).json({ enabled: pinEnabled(), active: hasPinProAccess(req) });

  const origin = req.headers.origin;
  const fetchSite = req.headers["sec-fetch-site"];
  let validOrigin = !origin;
  try {
    const scheme = process.env.NODE_ENV === "production" || req.socket?.encrypted ? "https" : "http";
    const expectedOrigin = new URL(process.env.PUBLIC_APP_URL || `${scheme}://${req.headers.host}`).origin;
    validOrigin = !origin || origin === expectedOrigin;
  } catch {
    validOrigin = false;
  }
  if (fetchSite === "cross-site" || !validOrigin) {
    return res.status(403).json({ error: "Use the Pro unlock form on this website." });
  }
  if (req.method === "DELETE") {
    setCookie(req, res, "", 0);
    return res.status(200).json({ active: false });
  }
  if (!pinEnabled()) return res.status(503).json({ error: "Pro PIN access is not configured yet. Contact the site owner for access." });

  const now = Date.now();
  for (const [key, state] of attempts) {
    if (now >= state.until) attempts.delete(key);
  }
  // Only trust platform-provided IP headers on their respective hosting platforms.
  const clientIp = process.env.VERCEL
    ? req.headers["x-vercel-forwarded-for"]
    : process.env.RENDER
      ? req.headers["true-client-ip"]
      : req.socket?.remoteAddress;
  const key = typeof clientIp === "string" ? clientIp.split(",")[0].trim() : "unknown";
  const state = attempts.get(key) || { count: 0, until: now + WINDOW_MS };
  if (state.count >= 5 || attempts.size >= 10000 && !attempts.has(key)) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((state.until - now) / 1000))));
    return res.status(429).json({ error: "Too many PIN attempts. Please try again in 15 minutes." });
  }
  const pin = req.body?.pin;
  const hash = value => crypto.createHash("sha256").update(value).digest();
  if (typeof pin !== "string" || pin.length > 128 ||
      !crypto.timingSafeEqual(hash(pin), hash(process.env.PRO_ACCESS_PIN))) {
    state.count++;
    attempts.set(key, state);
    return res.status(401).json({ error: "Incorrect PIN. Please check the PIN provided by the site owner." });
  }
  attempts.delete(key);
  if (req.body?.resource !== undefined) {
    try { return res.status(200).json({ verified: true, grant: createGrant(req, req.body.resource) }); }
    catch { return res.status(400).json({ error: "Choose a supported Pro question or lesson." }); }
  }
  const expiresAt = Math.floor(now / 1000) + TTL_SECONDS;
  setCookie(req, res, pinCookie(expiresAt), TTL_SECONDS);
  return res.status(200).json({ active: true, expiresAt });
};
