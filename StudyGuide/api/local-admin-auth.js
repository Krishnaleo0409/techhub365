"use strict";

const crypto = require("node:crypto");
const { connect } = require("./_mongo");
const { localAdminAllowed, verifyPassword } = require("./_local-admin");
const { makeCookie, sameOrigin } = require("./_mongo-auth");
const SESSION_SECONDS = 3600;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  const enabled = localAdminAllowed(req);
  if (req.method === "GET") return res.status(200).json({ enabled });
  if (!enabled) return res.status(404).json({ error: "Local administrator sign-in is unavailable." });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Use the local KR7Tech account page." });
  const { username, password } = req.body || {};
  if (typeof username !== "string" || !/^[a-z][a-z0-9_]{2,31}$/i.test(username) ||
      typeof password !== "string" || !password || password.length > 256) {
    return res.status(400).json({ error: "Enter the administrator username and password." });
  }
  try {
    const { db } = await connect();
    const now = new Date();
    const slot = Math.floor(now.getTime() / 900000);
    const fingerprint = crypto.createHmac("sha256", process.env.AUTH_OTP_SECRET)
      .update(req.socket.remoteAddress).digest("hex");
    const limit = await db.collection("auth_rate_limits").findOneAndUpdate({
      _id: `local-admin:${fingerprint}:${slot}`,
    }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((slot + 1) * 900000) } },
    { upsert: true, returnDocument: "after" });
    if (limit.count > 10) {
      res.setHeader("Retry-After", "900");
      return res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
    }
    const user = await db.collection("users").findOne({
      loginName: username.toLowerCase(), localAdmin: true, disabled: { $ne: true },
    });
    const correct = await verifyPassword(password, user?.passwordHash);
    if (!user || !correct || user.role !== "admin") {
      return res.status(401).json({ error: "Incorrect administrator username or password." });
    }
    const token = `kr7_${crypto.randomBytes(32).toString("base64url")}`;
    await db.collection("auth_sessions").insertOne({
      _id: crypto.createHash("sha256").update(token).digest("hex"),
      userId: user.id, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
      localOnly: true, localAdminVersion: user.localAdminVersion,
    });
    res.setHeader("Set-Cookie", makeCookie("session", token, SESSION_SECONDS));
    return res.status(200).json({ signedIn: true, localOnly: true });
  } catch {
    return res.status(503).json({ error: "Local administrator sign-in could not be completed. Check the private database setup." });
  }
};
