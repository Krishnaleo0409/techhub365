"use strict";

const crypto = require("node:crypto");
const { mongoEnabled, connect } = require("./_mongo");
const { localAdminAllowed } = require("./_local-admin");
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const OTP_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

function appOrigin() {
  try {
    const url = new URL(process.env.PUBLIC_APP_URL);
    const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        !(url.protocol === "https:" || !production && url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

function authConfigured() {
  return Boolean(mongoEnabled() && process.env.MONGODB_URI && process.env.MONGODB_DATABASE &&
    (process.env.AUTH_OTP_SECRET || "").length >= 32 && process.env.RESEND_API_KEY &&
    EMAIL.test(process.env.AUTH_EMAIL_FROM || "") && appOrigin());
}

function sameOrigin(req) {
  const expected = appOrigin();
  if (!expected || req.headers["sec-fetch-site"] === "cross-site") return false;
  if (req.headers.origin === expected) return true;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL || process.env.RENDER || !expected.startsWith("http://") ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket?.remoteAddress) ||
      !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || "")) return false;
  // Local aliases must match the actual browser Host, never a forwarded host.
  try { return req.headers.origin === new URL(`http://${req.headers.host}`).origin; }
  catch { return false; }
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function keyedHash(value) {
  return crypto.createHmac("sha256", process.env.AUTH_OTP_SECRET).update(value).digest("hex");
}

function cookieName(kind) {
  return `${appOrigin()?.startsWith("https:") ? "__Host-" : ""}kr7_${kind}`;
}

function readCookie(req, kind) {
  const name = cookieName(kind);
  return (req.headers.cookie || "").split(";").map(item => item.trim())
    .find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}

function makeCookie(kind, token, maxAge) {
  return `${cookieName(kind)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${appOrigin()?.startsWith("https:") ? "; Secure" : ""}`;
}

function effectiveRole(user) {
  const admins = (process.env.MONGODB_ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (user.emailVerified !== false && admins.includes(user.email)) return "admin";
  return ["student", "expert", "admin"].includes(user.role) ? user.role : "student";
}

function publicUser(user) {
  return { id: user.id, email: user.emailVerified === false ? null : user.email, role: effectiveRole(user),
    hasPassword: Boolean(user.passwordHash),
    ...(user.username ? { username: user.username } : {}),
    ...(user.localAdmin === true ? { localOnly: true } : {}) };
}

async function issueSession(db, user, timestamp = new Date()) {
  const token = `kr7_${crypto.randomBytes(32).toString("base64url")}`;
  await db.collection("auth_sessions").insertOne({
    _id: hash(token), userId: user.id, createdAt: timestamp,
    expiresAt: new Date(timestamp.getTime() + SESSION_SECONDS * 1000),
    ...(user.credentialVersion ? { credentialVersion: user.credentialVersion } : {}),
  });
  return token;
}

async function authenticatedMongoUser(req) {
  const token = readCookie(req, "session");
  if (!/^kr7_[A-Za-z0-9_-]{43}$/.test(token || "")) return null;
  const { db } = await connect();
  const session = await db.collection("auth_sessions").findOne({
    _id: hash(token), expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  if (session.localOnly === true && !localAdminAllowed(req)) return null;
  const user = await db.collection("users").findOne({ id: session.userId, disabled: { $ne: true } });
  if (user?.credentialVersion && session.credentialVersion !== user.credentialVersion) return null;
  if (user?.localAdmin === true && (session.localOnly !== true ||
      session.localAdminVersion !== user.localAdminVersion)) return null;
  return user ? publicUser(user) : null;
}

async function revokeSession(req) {
  const token = readCookie(req, "session");
  if (token) {
    const { db } = await connect();
    await db.collection("auth_sessions").deleteOne({ _id: hash(token) });
  }
}

async function sendOtp(email, code, challengeId) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json", "Idempotency-Key": `kr7-otp/${challengeId}`,
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM, to: [email], subject: "Your KR7Tech sign-in code",
      text: `Your KR7Tech sign-in code is ${code}. It expires in 10 minutes and can be used once. Never share this code. If you did not request it, ignore this email.`,
    }),
    signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw new Error("The sign-in email could not be sent.");
}

function createOtpService({ db, deliver = sendOtp, now = () => new Date() }) {
  async function rateLimit(key, limit, seconds) {
    const timestamp = now();
    const slot = Math.floor(timestamp.getTime() / (seconds * 1000));
    const id = keyedHash(`rate:${key}:${slot}`);
    const row = await db.collection("auth_rate_limits").findOneAndUpdate(
      { _id: id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((slot + 1) * seconds * 1000) } },
      { upsert: true, returnDocument: "after" },
    );
    return row.count <= limit;
  }

  async function request(email, role, fingerprint) {
    if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email.trim())) {
      return { status: 400, error: "Enter a valid email address." };
    }
    email = email.trim().toLowerCase();
    if (role !== undefined && !["student", "expert"].includes(role)) {
      return { status: 400, error: "Choose Student or Expert. Administrator roles cannot be requested." };
    }
    if (!await rateLimit(`send-ip:${fingerprint}`, 10, 900) ||
        !await rateLimit(`send-email:${email}`, 5, 3600)) {
      return { status: 429, error: "Too many sign-in requests. Please try again later." };
    }
    const timestamp = now();
    const challengeId = crypto.randomUUID();
    const flow = crypto.randomBytes(32).toString("base64url");
    const code = String(crypto.randomInt(100000, 1000000));
    const id = keyedHash(`email:${email}`);
    try {
      await db.collection("otp_challenges").findOneAndUpdate(
        { _id: id, nextSendAt: { $lte: timestamp } },
        { $set: {
          challengeId, email, role: role || "student", flowHash: hash(flow),
          codeHash: keyedHash(`${challengeId}:${email}:${code}`),
          attempts: 0, used: false, expiresAt: new Date(timestamp.getTime() + OTP_SECONDS * 1000),
          nextSendAt: new Date(timestamp.getTime() + 60000),
        } }, { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      if (error.code === 11000) return { status: 429, error: "Wait 60 seconds before requesting another code." };
      throw error;
    }
    try {
      await deliver(email, code, challengeId);
    } catch {
      await db.collection("otp_challenges").updateOne({ _id: id, challengeId }, { $set: { used: true } });
      return { status: 503, error: "The sign-in email could not be sent. Please try again later." };
    }
    return { status: 202, flow, message: "Check your email for a six-digit code. It expires in 10 minutes." };
  }

  async function verify(email, code, flow, fingerprint) {
    if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email.trim()) ||
        typeof code !== "string" || !/^\d{6}$/.test(code) || !/^[A-Za-z0-9_-]{43}$/.test(flow || "")) {
      return { status: 400, error: "Enter the email and six-digit code in the browser that requested it." };
    }
    email = email.trim().toLowerCase();
    if (!await rateLimit(`verify:${fingerprint}`, 30, 900)) {
      return { status: 429, error: "Too many verification attempts. Please try again later." };
    }
    const timestamp = now();
    const challenge = await db.collection("otp_challenges").findOneAndUpdate(
      { _id: keyedHash(`email:${email}`), flowHash: hash(flow), used: false,
        expiresAt: { $gt: timestamp }, attempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { attempts: 1 } }, { returnDocument: "after" },
    );
    const invalid = { status: 401, error: "The code is incorrect, expired, or already used. Request a new code." };
    if (!challenge) return invalid;
    const codeHash = keyedHash(`${challenge.challengeId}:${email}:${code}`);
    if (!crypto.timingSafeEqual(Buffer.from(codeHash, "hex"), Buffer.from(challenge.codeHash, "hex"))) return invalid;
    const consumed = await db.collection("otp_challenges").findOneAndUpdate(
      { _id: challenge._id, challengeId: challenge.challengeId, codeHash, flowHash: hash(flow), used: false,
        expiresAt: { $gt: timestamp }, attempts: { $lte: MAX_ATTEMPTS } },
      { $set: { used: true } }, { returnDocument: "after" },
    );
    if (!consumed) return invalid;
    const user = await db.collection("users").findOneAndUpdate({ email }, {
      $setOnInsert: { id: crypto.randomUUID(), email, role: challenge.role, createdAt: timestamp, disabled: false },
      $set: { lastLoginAt: timestamp, emailVerified: true },
    }, { upsert: true, returnDocument: "after" });
    if (user.disabled) return { status: 403, error: "This account is disabled. Contact the site owner." };
    if (user.localAdmin === true) return { status: 403, error: "This test account requires local administrator sign-in." };
    const token = await issueSession(db, user, timestamp);
    return { status: 200, token, user: publicUser(user) };
  }
  return { request, verify };
}

module.exports = {
  appOrigin, authConfigured, sameOrigin, readCookie, makeCookie, effectiveRole,
  authenticatedMongoUser, revokeSession, createOtpService, SESSION_SECONDS, OTP_SECONDS,
  issueSession, publicUser,
};
