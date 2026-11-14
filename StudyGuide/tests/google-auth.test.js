"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const handler = require("../api/google-auth");
const configHandler = require("../api/config");
const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV"];
const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;

function configure() {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.PUBLIC_APP_URL = "https://kr7tech.test";
  process.env.NODE_ENV = "production";
  delete process.env.VERCEL_ENV;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://supabase.test/auth/v1/settings");
    assert.equal(options.headers.apikey, "test-anon-key");
    return { ok: true, json: async () => ({ external: { google: true } }) };
  };
}

function request(method, body, headers = {}) {
  return { method, body, headers: { origin: process.env.PUBLIC_APP_URL, ...headers } };
}

function response() {
  return {
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
  };
}

async function start(returnTo = "/Membership.html") {
  const res = response();
  await handler(request("POST", { action: "start", returnTo }), res);
  assert.equal(res.statusCode, 200);
  const cookie = res.headers["Set-Cookie"].split(";")[0];
  const flow = JSON.parse(Buffer.from(cookie.slice(cookie.indexOf("=") + 1), "base64url").toString("utf8"));
  return { res, cookie, flow, url: new URL(res.body.url) };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of names) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test("missing Google setup is reported without breaking public configuration or sending requests", async () => {
  for (const name of names) delete process.env[name];
  global.fetch = async () => { throw new Error("Missing configuration must not contact a provider."); };
  const status = response();
  await handler(request("GET"), status);
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.enabled, false);
  assert.match(status.body.error, /owner setup/);
  const begin = response();
  await handler(request("POST", { action: "start" }), begin);
  assert.equal(begin.statusCode, 503);
  assert.equal(begin.headers["Set-Cookie"], undefined);
  const config = response();
  await configHandler(request("GET"), config);
  assert.equal(config.statusCode, 200);
  assert.equal(config.body.supabaseUrl, null);
  assert.equal(config.body.supabaseAnonKey, null);
});

test("Google buttons are enabled only when the configured Supabase provider is enabled", async () => {
  configure();
  for (const enabled of [false, true]) {
    global.fetch = async () => ({ ok: true, json: async () => ({ external: { google: enabled } }) });
    const res = response();
    await handler(request("GET"), res);
    assert.equal(res.body.enabled, enabled);
    assert.equal(res.body.authorizationOrigin, "https://supabase.test");
    assert.equal(res.headers["Set-Cookie"], undefined);
    if (!enabled) {
      const begin = response();
      await handler(request("POST", { action: "start" }), begin);
      assert.equal(begin.statusCode, 503);
      assert.equal(begin.headers["Set-Cookie"], undefined);
    }
  }
});

test("Google OAuth starts with fresh browser-bound state, S256 PKCE, and minimum identity scopes", async () => {
  configure();
  const first = await start();
  const second = await start();
  assert.match(first.res.headers["Set-Cookie"], /^__Host-kr7_google_flow=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=300; Secure$/);
  assert.equal(first.url.origin, "https://supabase.test");
  assert.equal(first.url.pathname, "/auth/v1/authorize");
  assert.equal(first.url.searchParams.get("provider"), "google");
  assert.equal(first.url.searchParams.get("code_challenge_method"), "s256");
  assert.equal(first.url.searchParams.get("code_challenge"),
    crypto.createHash("sha256").update(first.flow.verifier).digest("base64url"));
  assert.deepEqual(first.url.searchParams.get("scopes").split(" "), ["openid", "email", "profile"]);
  const callback = new URL(first.url.searchParams.get("redirect_to"));
  assert.equal(callback.origin, "https://kr7tech.test");
  assert.equal(callback.pathname, "/Auth-Callback.html");
  assert.equal(callback.searchParams.get("state"), first.flow.state);
  assert.equal(first.res.body.url.includes(first.flow.verifier), false);
  assert.notEqual(first.flow.verifier, second.flow.verifier);
  assert.notEqual(first.flow.state, second.flow.state);
});

test("cross-site sign-in and unapproved return destinations cannot start OAuth", async () => {
  configure();
  global.fetch = async () => { throw new Error("Cross-site requests must be rejected before provider access."); };
  for (const headers of [{ origin: "https://attacker.test" }, { origin: undefined }, { "sec-fetch-site": "cross-site" }]) {
    const res = response();
    await handler(request("POST", { action: "start" }, headers), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
  configure();
  for (const returnTo of ["https://attacker.test", "//attacker.test", "/Membership.html?next=https://attacker.test", "/Auth-Callback.html"]) {
    const res = response();
    await handler(request("POST", { action: "start", returnTo }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
});

test("missing, mismatched, expired, and malformed browser state cannot exchange a code", async () => {
  configure();
  const { cookie, flow } = await start();
  const expired = { ...flow, expires: Math.floor(Date.now() / 1000) - 1 };
  const malformed = { ...flow, verifier: [flow.verifier] };
  const encode = value => `__Host-kr7_google_flow=${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
  global.fetch = async () => { throw new Error("Invalid browser state must not exchange a code."); };
  for (const [headers, state] of [
    [{}, flow.state],
    [{ cookie }, crypto.randomBytes(32).toString("base64url")],
    [{ cookie: encode(expired) }, flow.state],
    [{ cookie: encode(malformed) }, flow.state],
    [{ cookie: "__Host-kr7_google_flow=not-json" }, flow.state],
    [{ cookie }, [flow.state]],
  ]) {
    const res = response();
    await handler(request("POST", { action: "exchange", code: "test-code", state }, headers), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.session, undefined);
  }
});

test("the callback exchanges with the original verifier and exposes only the existing app session", async () => {
  configure();
  const { cookie, flow } = await start();
  global.fetch = async (url, options) => {
    assert.equal(url, "https://supabase.test/auth/v1/token?grant_type=pkce");
    assert.deepEqual(JSON.parse(options.body), { auth_code: "test-code", code_verifier: flow.verifier });
    assert.equal(options.headers.apikey, "test-anon-key");
    return { ok: true, json: async () => ({
      access_token: "app-access", refresh_token: "app-refresh", expires_in: 3600,
      provider_token: "private-google-token", provider_refresh_token: "private-google-refresh",
      user: { id: "test-user", email: "student@example.test", app_metadata: { provider: "google" } },
    }) };
  };
  const res = response();
  await handler(request("POST", { action: "exchange", code: "test-code", state: flow.state }, { cookie }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.returnTo, "/Membership.html");
  assert.equal(res.body.session.access_token, "app-access");
  assert.equal(res.body.session.refresh_token, "app-refresh");
  assert.deepEqual(res.body.session.user, { id: "test-user", email: "student@example.test" });
  assert.equal(JSON.stringify(res.body).includes("private-google"), false);
  assert.deepEqual(Object.keys(res.body.session).sort(), ["access_token", "expires_at", "refresh_token", "user"]);
  assert.match(res.headers["Set-Cookie"], /Max-Age=0; Secure/);
  assert.match(res.headers["Cache-Control"], /no-store/);
});

test("cancelled and rejected callbacks do not create an app session or expose provider errors", async () => {
  configure();
  const { cookie, flow } = await start();
  global.fetch = async () => { throw new Error("Cancellation must not exchange a code."); };
  const cancelled = response();
  await handler(request("POST", { action: "cancel", state: flow.state }, { cookie }), cancelled);
  assert.deepEqual(cancelled.body, { cancelled: true });
  assert.match(cancelled.headers["Set-Cookie"], /Max-Age=0/);
  global.fetch = async () => ({ ok: false, json: async () => ({ error: "private-provider-details" }) });
  const rejected = response();
  await handler(request("POST", { action: "exchange", code: "used-code", state: flow.state }, { cookie }), rejected);
  assert.equal(rejected.statusCode, 401);
  assert.equal(rejected.body.session, undefined);
  assert.equal(JSON.stringify(rejected.body).includes("private-provider-details"), false);
});

test("only loopback development may use HTTP and unsupported methods cannot set cookies", async () => {
  configure();
  process.env.PUBLIC_APP_URL = "http://127.0.0.1:10000";
  const production = response();
  await handler(request("GET"), production);
  assert.equal(production.body.enabled, false);
  process.env.NODE_ENV = "development";
  const local = await start();
  assert.match(local.res.headers["Set-Cookie"], /^kr7_google_flow=/);
  assert.doesNotMatch(local.res.headers["Set-Cookie"], /; Secure/);
  process.env.PUBLIC_APP_URL = "http://public-site.test";
  const remote = response();
  await handler(request("GET"), remote);
  assert.equal(remote.body.enabled, false);
  const unsupported = response();
  await handler(request("DELETE"), unsupported);
  assert.equal(unsupported.statusCode, 405);
  assert.equal(unsupported.headers["Set-Cookie"], undefined);
});
