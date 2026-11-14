"use strict";

const { authenticatedUser, getEntitlements, supabaseRest } = require("./_shared");
const { databaseConfigured } = require("./_mongo");

async function learningAccess(req, { skip = false, authenticate = authenticatedUser } = {}) {
  if (skip || !databaseConfigured()) return { user: null, entitlements: [], verificationUnavailable: false };
  try {
    const user = await authenticate(req);
    const entitlements = user ? await getEntitlements(user.id) : [];
    if (!Array.isArray(entitlements)) throw new Error("Invalid account access response.");
    return { user, entitlements, verificationUnavailable: false };
  } catch {
    console.warn("Learning account verification unavailable; paid access remains locked.");
    return { user: null, entitlements: [], verificationUnavailable: true };
  }
}

async function learningData(query, fallback) {
  if (!databaseConfigured()) return fallback;
  try {
    const rows = await supabaseRest(query);
    if (!Array.isArray(rows)) throw new Error("Invalid learning content response.");
    return rows.length ? rows : fallback;
  } catch {
    console.warn("Learning content storage unavailable; using the private bundled question bank.");
    return fallback;
  }
}

module.exports = { learningAccess, learningData };
