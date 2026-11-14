"use strict";

const { authenticatedUser } = require("../_shared");
const { mongoEnabled, connect } = require("../_mongo");
const { sameOrigin } = require("../_mongo-auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!mongoEnabled()) return res.status(503).json({ error: "MongoDB accounts are not enabled." });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Use the KR7Tech account page." });
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required." });
    if (user.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
    const { userId, role } = req.body || {};
    if (typeof userId !== "string" || !/^[\da-f-]{36}$/i.test(userId) || !["student", "expert"].includes(role)) {
      return res.status(400).json({ error: "Provide an account ID and Student or Expert role. Admins are configured by the site owner." });
    }
    const { db } = await connect();
    const result = await db.collection("users").updateOne({ id: userId }, {
      $set: { role, roleUpdatedAt: new Date(), roleUpdatedBy: user.id },
    });
    if (!result.matchedCount) return res.status(404).json({ error: "Account not found." });
    return res.status(200).json({ userId, role });
  } catch {
    return res.status(503).json({ error: "The role could not be updated." });
  }
};
