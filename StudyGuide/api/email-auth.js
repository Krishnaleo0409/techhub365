"use strict";

const crypto = require("node:crypto");
const { connect } = require("./_mongo");
const {
  authConfigured, sameOrigin, readCookie, makeCookie, createOtpService, SESSION_SECONDS, OTP_SECONDS,
} = require("./_mongo-auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method === "GET") return res.status(200).json({ enabled: authConfigured(), provider: "mongodb" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!authConfigured()) return res.status(503).json({ error: "Email OTP sign-in needs owner setup. Free browsing is still available." });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Sign in from the KR7Tech website." });
  const body = req.body || {};
  if (!["request", "verify"].includes(body.action)) return res.status(400).json({ error: "Choose a sign-in action." });
  try {
    const ip = process.env.VERCEL ? req.headers["x-vercel-forwarded-for"]
      : process.env.RENDER ? req.headers["true-client-ip"] : req.socket?.remoteAddress;
    const fingerprint = crypto.createHmac("sha256", process.env.AUTH_OTP_SECRET)
      .update(typeof ip === "string" ? ip.split(",")[0].trim() : "unknown").digest("hex");
    const { db } = await connect();
    const service = createOtpService({ db });
    const result = body.action === "request"
      ? await service.request(body.email, body.role, fingerprint)
      : await service.verify(body.email, body.code, readCookie(req, "otp"), fingerprint);
    if (result.flow) res.setHeader("Set-Cookie", makeCookie("otp", result.flow, OTP_SECONDS));
    if (result.token) {
      res.setHeader("Set-Cookie", [
        makeCookie("session", result.token, SESSION_SECONDS), makeCookie("otp", "", 0),
      ]);
    }
    if (result.status === 429) res.setHeader("Retry-After", "60");
    return res.status(result.status).json({
      ...(result.error ? { error: result.error } : {}),
      ...(result.message ? { message: result.message } : {}),
      ...(result.user ? { signedIn: true, user: result.user } : {}),
    });
  } catch {
    return res.status(503).json({ error: "Account sign-in is temporarily unavailable. Please try again later." });
  }
};
