"use strict";

function salesReady() {
  if (process.env.NODE_ENV !== "production") return true;
  const contact = process.env.SUPPORT_EMAIL || "";
  return process.env.SALES_ENABLED === "true" &&
    contact.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact);
}

function purchaseReturn(tier, id, status = "pending") {
  const origin = new URL(process.env.PUBLIC_APP_URL);
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
      !(origin.protocol === "https:" || process.env.NODE_ENV !== "production" &&
        origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) {
    throw new Error("The checkout return address is not configured correctly.");
  }
  const url = new URL("/Purchase.html", origin);
  url.search = new URLSearchParams({ payment: status, tier, purchase: id }).toString();
  return url.href;
}

module.exports = { salesReady, purchaseReturn };
