"use strict";

const crypto = require("node:crypto");
const { mongoEnabled } = require("./_mongo");

const FLOW_TTL = 300;
const DEFAULT_RETURN = "/Company-Interviews.html#access-heading";
const RETURNS = new Set([DEFAULT_RETURN, "/Membership.html"]);
const RANDOM_VALUE = /^[A-Za-z0-9_-]{43}$/;

function configuration() {
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  function origin(value) {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        !(url.protocol === "https:" || !production && local && url.protocol === "http:")) {
      throw new Error("Invalid authentication origin.");
    }
    return url.origin;
  }
  return {
    app: origin(process.env.PUBLIC_APP_URL),
    auth: origin(process.env.SUPABASE_URL),
    key: process.env.SUPABASE_ANON_KEY,
  };
}

function flowCookie(config, value, maxAge) {
  const secure = config.app.startsWith("https:");
  const name = secure ? "__Host-kr7_google_flow" : "kr7_google_flow";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function readFlow(req, config) {
  const name = config.app.startsWith("https:") ? "__Host-kr7_google_flow" : "kr7_google_flow";
  const value = (req.headers.cookie || "").split(";").map(item => item.trim())
    .find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value || value.length > 1600 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const flow = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return typeof flow.state === "string" && typeof flow.verifier === "string" &&
      RANDOM_VALUE.test(flow.state) && RANDOM_VALUE.test(flow.verifier) &&
      Number.isSafeInteger(flow.expires) && flow.expires > now && flow.expires <= now + FLOW_TTL &&
      RETURNS.has(flow.returnTo) ? flow : null;
  } catch { return null; }
}

async function providerEnabled(config) {
  const response = await fetch(`${config.auth}/auth/v1/settings`, {
    headers: { apikey: config.key },
    redirect: "error", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Authentication settings unavailable.");
  return (await response.json()).external?.google === true;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (mongoEnabled()) return res.status(req.method === "GET" ? 200 : 503)
    .json({ enabled: false, error: "Google sign-in is disabled. Use email OTP on the Account page." });
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  let config;
  try { config = configuration(); } catch { /* Missing setup must not break free browsing. */ }
  if (!config?.key) {
    const message = "Google sign-in needs owner setup: configure Supabase and the website URL, then enable the Google provider.";
    return res.status(req.method === "GET" ? 200 : 503).json({ enabled: false, error: message });
  }
  if (req.method === "POST" && (req.headers.origin !== config.app || req.headers["sec-fetch-site"] === "cross-site")) {
    return res.status(403).json({ error: "Start Google sign-in from this website." });
  }

  try {
    if (req.method === "GET" || req.body?.action === "start") {
      const enabled = await providerEnabled(config);
      if (req.method === "GET") return res.status(200).json({
        enabled, authorizationOrigin: config.auth,
        error: enabled ? null : "Google sign-in is not enabled in the site's Supabase project yet.",
      });
      if (!enabled) return res.status(503).json({ error: "The site owner must enable Google sign-in in Supabase first." });
      const returnTo = req.body.returnTo ?? DEFAULT_RETURN;
      if (!RETURNS.has(returnTo)) return res.status(400).json({ error: "Choose a supported account page." });
      const verifier = crypto.randomBytes(32).toString("base64url");
      const state = crypto.randomBytes(32).toString("base64url");
      const flow = { verifier, state, returnTo, expires: Math.floor(Date.now() / 1000) + FLOW_TTL };
      res.setHeader("Set-Cookie", flowCookie(config, Buffer.from(JSON.stringify(flow)).toString("base64url"), FLOW_TTL));
      const callback = new URL("/Auth-Callback.html", config.app);
      callback.searchParams.set("state", state);
      const url = new URL("/auth/v1/authorize", config.auth);
      url.search = new URLSearchParams({
        provider: "google", redirect_to: callback.href,
        code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "s256", scopes: "openid email profile", prompt: "select_account",
      }).toString();
      return res.status(200).json({ url: url.href });
    }

    if (!["exchange", "cancel"].includes(req.body?.action)) {
      return res.status(400).json({ error: "Choose a supported sign-in action." });
    }
    const flow = readFlow(req, config);
    const state = req.body.state;
    if (!flow || typeof state !== "string" || !RANDOM_VALUE.test(state) ||
        !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))) {
      return res.status(403).json({ error: "This sign-in attempt expired or belongs to another browser. Start Google sign-in again." });
    }
    if (req.body.action === "cancel") {
      res.setHeader("Set-Cookie", flowCookie(config, "", 0));
      return res.status(200).json({ cancelled: true });
    }
    const code = req.body.code;
    if (typeof code !== "string" || !code || code.length > 2048 || /[\u0000-\u0020\u007f]/.test(code)) {
      return res.status(400).json({ error: "A valid Google sign-in response is required." });
    }
    res.setHeader("Set-Cookie", flowCookie(config, "", 0));
    const response = await fetch(`${config.auth}/auth/v1/token?grant_type=pkce`, {
      method: "POST", headers: { apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify({ auth_code: code, code_verifier: flow.verifier }),
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return res.status(401).json({ error: "Google sign-in could not be completed. Please start sign-in again." });
    const result = await response.json();
    if (typeof result.access_token !== "string" || !result.access_token || result.access_token.length > 16384 ||
        typeof result.refresh_token !== "string" || !result.refresh_token ||
        !Number.isFinite(result.expires_in) || result.expires_in <= 0 ||
        typeof result.user?.id !== "string" || !result.user.id) {
      return res.status(502).json({ error: "The authentication service returned an incomplete session. Please try again." });
    }
    return res.status(200).json({
      session: {
        access_token: result.access_token, refresh_token: result.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + Math.min(result.expires_in, 3600),
        user: { id: result.user.id, email: result.user.email },
      },
      returnTo: flow.returnTo,
    });
  } catch {
    return res.status(503).json({ error: "Google sign-in is temporarily unavailable. Please try again later." });
  }
};
