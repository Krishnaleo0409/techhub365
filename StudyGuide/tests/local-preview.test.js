"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const test = require("node:test");
const { passwordHash } = require("../api/_local-admin");
const { createPreview } = require("../scripts/local-preview");

async function invoke(preview, path, { method = "GET", cookie = "", body, origin = preview.origin,
  host = "127.0.0.1:10000", address = "127.0.0.1" } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = path;
  req.headers = { host, origin, cookie, "content-type": "application/json" };
  req.socket = { remoteAddress: address };
  const chunks = [];
  const headers = {};
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.statusCode = 200;
  res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  res.getHeader = name => headers[name.toLowerCase()];
  res.hasHeader = name => Object.hasOwn(headers, name.toLowerCase());
  const finished = once(res, "finish");
  await preview.handle(req, res);
  await finished;
  const text = Buffer.concat(chunks).toString("utf8");
  return { status: res.statusCode, headers, text,
    json: String(headers["content-type"]).startsWith("application/json") ? JSON.parse(text) : null };
}

test("offline Version 1 preview authenticates locally, preserves content gates, and never contacts a service", async t => {
  const names = ["NODE_ENV", "VERCEL_ENV", "VERCEL", "RENDER"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.NODE_ENV = "development";
  for (const name of names.slice(1)) delete process.env[name];
  const originalFetch = global.fetch;
  let externalRequests = 0;
  global.fetch = async () => { externalRequests++; throw new Error("No external requests are allowed."); };
  const mongodb = require("mongodb");
  const descriptor = Object.getOwnPropertyDescriptor(mongodb, "MongoClient");
  let connections = 0;
  Object.defineProperty(mongodb, "MongoClient", { configurable: true, value: class {
    constructor() { connections++; throw new Error("No MongoDB connection is allowed."); }
  } });
  const password = crypto.randomBytes(16).toString("base64url");
  const preview = createPreview({ username: "Admin", credential: await passwordHash(password) });
  t.after(() => {
    preview.restore();
    global.fetch = originalFetch;
    Object.defineProperty(mongodb, "MongoClient", descriptor);
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });
  const lesson = require("../api/_concept-lessons")[0];
  let cookie;
  let user;

  await t.test("anonymous visitors keep free previews and cannot open paid lessons", async () => {
    const account = await invoke(preview, "/Account.html");
    assert.equal(account.status, 200);
    assert.match(account.text, /LOCAL PREVIEW/);
    assert.match(account.text, /password-signup-form/);
    assert.doesNotMatch(account.text, /local-admin-form|otp-request-form|preview-registration-form/);
    assert.doesNotMatch(account.text, /src="\/local-preview-account.js"/);
    assert.equal((await invoke(preview, "/local-preview-account.js")).status, 404);
    const availability = await invoke(preview, "/api/local-admin-auth");
    assert.equal(availability.json.enabled, true);
    const questions = await invoke(preview, "/api/questions?topic=SQL");
    assert.equal(questions.json.questions.length, 10);
    assert.ok(questions.json.locked.length > 0);
    assert.equal((await invoke(preview, `/api/concepts?id=${lesson.id}`)).status, 403);
  });
  await t.test("invalid credentials and cross-site or remote login requests fail", async () => {
    const invalid = await invoke(preview, "/api/local-admin-auth", {
      method: "POST", body: { username: "Admin", password: "incorrect" },
    });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.headers["set-cookie"], undefined);
    assert.equal((await invoke(preview, "/api/local-admin-auth", { method: "POST",
      origin: "https://attacker.test", body: { username: "Admin", password } })).status, 403);
    assert.equal((await invoke(preview, "/", { host: "public.example" })).status, 403);
    assert.equal((await invoke(preview, "/", { address: "192.0.2.1" })).status, 403);
  });
  await t.test("Admin login issues an HTTP-only cookie and opens real local lesson and guide content", async () => {
    const login = await invoke(preview, "/api/local-admin-auth", {
      method: "POST", body: { username: "Admin", password },
    });
    assert.equal(login.status, 200);
    assert.match(login.headers["set-cookie"], /HttpOnly; SameSite=Strict; Max-Age=3600/);
    assert.equal(login.json.token, undefined);
    cookie = login.headers["set-cookie"].split(";")[0];
    const session = await invoke(preview, "/api/session", { cookie });
    user = session.json.user;
    assert.equal(session.json.signedIn, true);
    assert.equal(session.json.plan, "Pro");
    assert.equal(user.role, "admin");
    assert.equal(user.username, "Admin");
    assert.equal(user.passwordHash, undefined);
    const concept = await invoke(preview, `/api/concepts?id=${lesson.id}`, { cookie });
    assert.equal(concept.status, 200);
    assert.equal(concept.json.lesson.what, lesson.what);
    const guide = await invoke(preview, "/C%23Dotnet.html", { cookie });
    assert.equal(guide.status, 200);
    assert.match(guide.text, /data-guide-access="pro"/);
    assert.match(guide.text, /LOCAL PREVIEW/);
    const questions = await invoke(preview, "/api/questions?topic=SQL", { cookie });
    assert.ok(questions.json.questions.length > 10);
    assert.equal(questions.json.access.isAdmin, true);
  });
  await t.test("preview plan grant and revoke controls use only in-memory entitlements", async () => {
    const revoke = await invoke(preview, "/api/admin/entitlements", { cookie, method: "POST",
      body: { userId: user.id, tier: "Pro", active: false } });
    assert.equal(revoke.status, 200);
    assert.equal((await invoke(preview, `/api/concepts?id=${lesson.id}`, { cookie })).status, 403);
    const grant = await invoke(preview, "/api/admin/entitlements", { cookie, method: "POST",
      body: { userId: user.id, tier: "Pro", active: true } });
    assert.equal(grant.status, 200);
    assert.equal((await invoke(preview, `/api/concepts?id=${lesson.id}`, { cookie })).status, 200);
  });
  await t.test("payments, emails, database role writes, AI and compiler calls are explicitly disabled", async () => {
    for (const path of ["/api/checkout", "/api/paypal/capture", "/api/ai-interview", "/api/compile",
      "/api/admin/roles", "/api/webhooks/stripe", "/api/email-auth", "/api/google-auth"]) {
      const result = await invoke(preview, path, { method: "POST", cookie, body: {} });
      assert.equal(result.status, 503, path);
    }
    const config = await invoke(preview, "/api/config");
    assert.deepEqual(config.json.providers, { razorpay: false, stripe: false, paypal: false });
    assert.equal(config.json.plans.Go, 750);
    assert.equal(config.json.plans.Pro, 2500);
    assert.equal(externalRequests, 0);
    assert.equal(connections, 0);
  });
  await t.test("sign-out revokes the cookie, and preview code and secrets are not public assets", async () => {
    const logout = await invoke(preview, "/api/session", { method: "DELETE", cookie });
    assert.equal(logout.json.signedIn, false);
    assert.equal((await invoke(preview, "/api/session", { cookie })).json.signedIn, false);
    assert.equal((await invoke(preview, `/api/concepts?id=${lesson.id}`, { cookie })).status, 403);
    for (const path of ["/.env.local", "/scripts/local-preview.js", "/scripts/setup-local-preview.js",
      "/.local-preview/accounts.json", "/scripts/local-preview-accounts.js"]) {
      assert.equal((await invoke(preview, path)).status, 404);
    }
  });
  let ownerCookie;
  await t.test("creating the first local account makes the owner Admin and disables bootstrap login", async () => {
    assert.equal((await invoke(preview, "/api/local-preview-accounts")).json.firstAdminAvailable, true);
    assert.equal((await invoke(preview, "/api/local-preview-accounts", {
      method: "POST", origin: "https://attacker.test",
      body: { username: "Owner", email: "owner@example.test", password },
    })).status, 403);
    const signup = await invoke(preview, "/api/local-preview-accounts", { method: "POST",
      body: { username: "Owner", email: "owner@example.test", password, role: "student" } });
    assert.equal(signup.status, 201);
    assert.equal(signup.json.user.role, "admin");
    assert.equal(signup.json.user.passwordHash, undefined);
    ownerCookie = signup.headers["set-cookie"].split(";")[0];
    assert.equal((await invoke(preview, "/api/session", { cookie: ownerCookie })).json.plan, "Pro");
    assert.equal((await invoke(preview, `/api/concepts?id=${lesson.id}`, { cookie: ownerCookie })).status, 200);
    assert.equal((await invoke(preview, "/api/local-preview-accounts")).json.firstAdminAvailable, false);
    assert.equal((await invoke(preview, "/api/local-admin-auth", { method: "POST",
      body: { username: "Admin", password } })).status, 401);
  });
  await t.test("later users cannot register themselves as Admin or unlock paid access", async () => {
    const promoted = await invoke(preview, "/api/local-preview-accounts", { method: "POST",
      body: { username: "FakeAdmin", email: "fake@example.test", password, role: "admin" } });
    assert.equal(promoted.status, 400);
    const duplicate = await invoke(preview, "/api/local-preview-accounts", { method: "POST",
      body: { username: "OWNER", email: "another@example.test", password } });
    assert.equal(duplicate.status, 409);
    const signup = await invoke(preview, "/api/local-preview-accounts", { method: "POST",
      body: { username: "Learner", email: "learner@example.test", password, role: "expert", plan: "Pro", is_admin: true } });
    assert.equal(signup.status, 201);
    assert.equal(signup.json.user.role, "expert");
    const learnerCookie = signup.headers["set-cookie"].split(";")[0];
    const session = await invoke(preview, "/api/session", { cookie: learnerCookie });
    assert.equal(session.json.plan, "Free");
    assert.equal((await invoke(preview, `/api/concepts?id=${lesson.id}`, { cookie: learnerCookie })).status, 403);
    const grant = await invoke(preview, "/api/admin/entitlements", { method: "POST", cookie: learnerCookie,
      body: { userId: session.json.user.id, tier: "Pro", active: true } });
    assert.equal(grant.status, 403);
  });
  await t.test("the created owner can sign out, log in with email, and rotate the previous cookie", async () => {
    assert.equal((await invoke(preview, "/api/session", { method: "DELETE", cookie: ownerCookie })).status, 200);
    assert.equal((await invoke(preview, "/api/session", { cookie: ownerCookie })).json.signedIn, false);
    const wrong = await invoke(preview, "/api/local-admin-auth", { method: "POST",
      body: { username: "owner@example.test", password: "incorrect" } });
    assert.equal(wrong.status, 401);
    const login = await invoke(preview, "/api/local-admin-auth", { method: "POST",
      body: { username: "OWNER@EXAMPLE.TEST", password } });
    assert.equal(login.status, 200);
    const firstCookie = login.headers["set-cookie"].split(";")[0];
    assert.equal((await invoke(preview, "/api/session", { cookie: firstCookie })).json.user.username, "Owner");
    const second = await invoke(preview, "/api/local-admin-auth", { method: "POST", cookie: firstCookie,
      body: { username: "Owner", password } });
    assert.equal(second.status, 200);
    assert.equal((await invoke(preview, "/api/session", { cookie: firstCookie })).json.signedIn, false);
    assert.equal(externalRequests, 0);
    assert.equal(connections, 0);
  });
  await t.test("the launcher refuses production and hosted execution even with valid credentials", () => {
    process.env.NODE_ENV = "production";
    assert.throws(() => createPreview({ username: "Admin", credential: "unused" }), /production/);
    process.env.NODE_ENV = "development";
    process.env.VERCEL = "1";
    assert.throws(() => createPreview({ username: "Admin", credential: "unused" }), /production/);
    delete process.env.VERCEL;
  });
  await t.test("the shared Account page creates and reuses a username/password account with no email or Admin requirement", async () => {
    const signup = await invoke(preview, "/api/account-auth", { method: "POST",
      body: { action: "signup", username: "SimpleUser", password } });
    assert.equal(signup.status, 201);
    assert.equal(signup.json.user.role, "student");
    const savedId = signup.json.user.id;
    const savedCookie = signup.headers["set-cookie"].split(";")[0];
    assert.equal((await invoke(preview, "/api/session", { cookie: savedCookie })).json.plan, "Free");
    await invoke(preview, "/api/session", { method: "DELETE", cookie: savedCookie });
    const login = await invoke(preview, "/api/account-auth", { method: "POST",
      body: { action: "login", username: "SIMPLEUSER", password } });
    assert.equal(login.status, 200);
    const loginCookie = login.headers["set-cookie"].split(";")[0];
    assert.equal((await invoke(preview, "/api/session", { cookie: loginCookie })).json.user.id, savedId);
    assert.equal(externalRequests, 0);
    assert.equal(connections, 0);
  });
});
