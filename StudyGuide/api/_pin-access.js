"use strict";

const crypto = require("node:crypto");

const TTL_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = "kr7_pro";

function pinEnabled() {
  const pin = process.env.PRO_ACCESS_PIN || "";
  return pin.length >= 8 && pin.length <= 128 && (process.env.PRO_ACCESS_SECRET || "").length >= 32;
}

function signature(expiresAt) {
  return crypto.createHmac("sha256", process.env.PRO_ACCESS_SECRET)
    .update(`kr7-pro:${expiresAt}:${process.env.PRO_ACCESS_PIN}`).digest("hex");
}

function pinCookie(expiresAt) {
  return `${expiresAt}.${signature(expiresAt)}`;
}

function hasPinProAccess(req) {
  if (!pinEnabled()) return false;
  const value = (req.headers.cookie || "").split(";").map(item => item.trim())
    .find(item => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  const match = value?.match(/^(\d+)\.([a-f0-9]{64})$/);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + TTL_SECONDS) return false;
  return crypto.timingSafeEqual(Buffer.from(match[2], "hex"), Buffer.from(signature(expiresAt), "hex"));
}

module.exports = { COOKIE_NAME, hasPinProAccess, pinCookie, pinEnabled, TTL_SECONDS };
