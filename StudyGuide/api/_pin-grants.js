"use strict";

const crypto = require("node:crypto");
const { pinEnabled } = require("./_pin-access");
const { isLocalDevelopmentRequest } = require("./_shared");
const used = new Map();
const TTL_SECONDS = 120;

function secret(req) {
  if (pinEnabled()) return `${process.env.PRO_ACCESS_SECRET}:${process.env.PRO_ACCESS_PIN}`;
  if (isLocalDevelopmentRequest(req) && process.env.LOCAL_PRO_ACCESS_PIN &&
      (process.env.LOCAL_PRO_ACCESS_SECRET || "").length >= 32) {
    return `${process.env.LOCAL_PRO_ACCESS_SECRET}:${process.env.LOCAL_PRO_ACCESS_PIN}`;
  }
  return null;
}

function createGrant(req, resource) {
  if (typeof resource !== "string" || resource.length > 600 ||
      !/^(check$|subject:|company:|experience:|react:|guide:|concept:)/.test(resource)) {
    throw new Error("Choose a supported Pro question or lesson.");
  }
  const key = secret(req);
  if (!key) throw new Error("PIN access is not configured.");
  const payload = Buffer.from(JSON.stringify({
    resource, expires: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    nonce: crypto.randomBytes(24).toString("hex"),
  })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", key).update(payload).digest("hex")}`;
}

function consumeGrant(req, resource) {
  const token = req.headers["x-pro-grant"];
  const key = secret(req);
  if (!key || typeof token !== "string" || token.length > 2000) return false;
  const match = token.match(/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/);
  if (!match) return false;
  const signature = crypto.createHmac("sha256", key).update(match[1]).digest();
  if (!crypto.timingSafeEqual(Buffer.from(match[2], "hex"), signature)) return false;
  let grant;
  try { grant = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")); } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  for (const [nonce, expires] of used) if (expires <= now) used.delete(nonce);
  if (grant.resource !== resource || !Number.isSafeInteger(grant.expires) ||
      grant.expires <= now || grant.expires > now + TTL_SECONDS ||
      typeof grant.nonce !== "string" || !/^[a-f0-9]{48}$/.test(grant.nonce) ||
      used.has(grant.nonce) || used.size >= 10000) return false;
  used.set(grant.nonce, grant.expires);
  return true;
}

module.exports = { createGrant, consumeGrant };
