"use strict";

const { authenticatedUser, getEntitlements, supabaseRest, sendError } = require("./_shared");
const { membershipTier } = require("./_pro-policy");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: "Log in to view your purchases." });
    const [entitlements, purchases] = await Promise.all([
      getEntitlements(user.id),
      supabaseRest(`payments?user_id=eq.${encodeURIComponent(user.id)}&select=id,tier,status,provider,amount_minor,currency,created_at,paid_at&order=created_at.desc&limit=20`),
    ]);
    return res.status(200).json({
      plan: membershipTier(entitlements),
      purchases: purchases.filter(item => ["Go", "Pro"].includes(item.tier)).map(item => ({
        id: item.id, plan: item.tier, status: item.status,
        provider: item.provider, amountMinor: item.amount_minor, currency: item.currency,
        createdAt: item.created_at, paidAt: item.paid_at || null,
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
};
