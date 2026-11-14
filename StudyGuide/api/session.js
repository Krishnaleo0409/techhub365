const { authenticatedUser, getEntitlements, sendError } = require("./_shared");
const { mongoEnabled, databaseConfigured } = require("./_mongo");
const { sameOrigin, makeCookie, revokeSession } = require("./_mongo-auth");
const { membershipTier } = require("./_pro-policy");

function cookie(req, name) {
  const raw = req.headers.cookie || "";
  const match = raw.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (mongoEnabled()) {
    if (!["GET", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Use account signup/login or email OTP to sign in." });
    if (req.method === "DELETE" && !sameOrigin(req)) return res.status(403).json({ error: "Sign out from the KR7Tech website." });
    try {
      if (req.method === "DELETE") {
        await revokeSession(req);
        res.setHeader("Set-Cookie", [makeCookie("session", "", 0), makeCookie("otp", "", 0)]);
        return res.status(200).json({ provider: "mongodb", signedIn: false });
      }
      const user = databaseConfigured() ? await authenticatedUser(req) : null;
      const entitlements = user ? await getEntitlements(user.id) : [];
      return res.status(200).json({
        provider: "mongodb", signedIn: Boolean(user),
        ...(user ? { user, plan: membershipTier(entitlements) } : {}),
      });
    } catch {
      return res.status(503).json({ error: "Account access is temporarily unavailable." });
    }
  }
  if (req.method === "GET") return res.status(200).json({ provider: "supabase", signedIn: false });
  if (req.method === "POST") {
    try {
      const accessToken = req.body?.accessToken;
      if (!accessToken) return res.status(400).json({ error: "Access token is required." });
      req.headers.authorization = `Bearer ${accessToken}`;
      const user = await authenticatedUser(req);
      if (!user) return res.status(401).json({ error: "Invalid or expired session." });
      const secure = process.env.PUBLIC_APP_URL?.startsWith("https://") ? "; Secure" : "";
      res.setHeader("Set-Cookie", `visual_pro_session=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=3600`);
      return res.status(200).json({ signedIn: true, userId: user.id });
    } catch (error) {
      return sendError(res, error);
    }
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", "visual_pro_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return res.status(200).json({ signedIn: false });
  }

  return res.status(405).json({ error: "Method not allowed." });
};

module.exports.readSessionCookie = cookie;
