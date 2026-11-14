"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const handler = require("../api/pro-access");
const { hasPinProAccess, pinCookie } = require("../api/_pin-access");
const servePage = require("../api/serve-page");
const questions = require("../api/questions");
const experience = require("../api/experience-questions");
const reactQuestions = require("../api/react-machine-coding");
const compile = require("../api/compile");
const aiInterview = require("../api/ai-interview");
const projectBank = require("../api/_project-questions");
const { mergeQuestions } = require("../api/_question-bank");
const { createGrant, consumeGrant } = require("../api/_pin-grants");
const { guidePracticeItems, guideTopics } = require("../api/_guide-preview");

const names = ["PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV",
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JUDGE0_API_URL", "GEMINI_API_KEY", "AI_INTERVIEW_ALLOW_ANONYMOUS"];
const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;
let pin;

function configure() {
  pin = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.PUBLIC_APP_URL = "https://kr7tech.test";
  process.env.NODE_ENV = "production";
}

function response() {
  return {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

function request(method, body, ip = crypto.randomUUID()) {
  return { method, body, headers: { host: "kr7tech.test", origin: "https://kr7tech.test" }, socket: { remoteAddress: ip } };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of names) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test("PIN unlock requires configured server secrets and never accepts a default value", async () => {
  process.env.PUBLIC_APP_URL = "https://kr7tech.test";
  delete process.env.PRO_ACCESS_PIN;
  delete process.env.PRO_ACCESS_SECRET;
  const res = response();
  await handler(request("POST", { pin: "12345678" }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers["Set-Cookie"], undefined);
  assert.equal(hasPinProAccess({ headers: { cookie: "kr7_pro=anything" } }), false);
});

test("correct PIN creates an eight-hour signed HttpOnly Secure Pro session and can be locked", async () => {
  configure();
  const res = response();
  await handler(request("POST", { pin }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Set-Cookie"], /^kr7_pro=\d+\.[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  const cookie = res.headers["Set-Cookie"].split(";")[0];
  assert.equal(hasPinProAccess({ headers: { cookie } }), true);
  assert.ok(!JSON.stringify(res.body).includes(pin));
  const lock = response();
  await handler(request("DELETE"), lock);
  assert.equal(lock.statusCode, 200);
  assert.match(lock.headers["Set-Cookie"], /Max-Age=0; Secure/);
});

test("wrong PIN, cross-site requests, and repeated guesses cannot create a Pro cookie", async () => {
  configure();
  const ip = crypto.randomUUID();
  for (let count = 0; count < 6; count++) {
    const res = response();
    await handler(request("POST", { pin: "wrong-pin" }, ip), res);
    assert.equal(res.statusCode, count < 5 ? 401 : 429);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
  for (const origin of ["https://other.test", "not-a-url", "http://kr7tech.test"]) {
    const req = request("POST", { pin });
    req.headers.origin = origin;
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
});

test("tampering, expiration, and PIN rotation invalidate Pro cookies", () => {
  configure();
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const value = pinCookie(expires);
  assert.equal(hasPinProAccess({ headers: { cookie: `kr7_pro=${value}` } }), true);
  for (const cookie of [`kr7_pro=${value}x`, `kr7_pro=${expires}.${"0".repeat(64)}`, `kr7_pro=${pinCookie(1)}`]) {
    assert.equal(hasPinProAccess({ headers: { cookie } }), false);
  }
  process.env.PRO_ACCESS_PIN = crypto.randomBytes(16).toString("hex");
  assert.equal(hasPinProAccess({ headers: { cookie: `kr7_pro=${value}` } }), false);
});

test("legacy PIN cookies do not unlock full guides or protected data scripts", async () => {
  configure();
  const cookie = `kr7_pro=${pinCookie(Math.floor(Date.now() / 1000) + 3600)}`;
  global.fetch = async () => { throw new Error("PIN guide access must not call Supabase."); };
  for (const query of [{ page: "C#Dotnet.html" }, { asset: "dotnet-roadmap.js" }]) {
    const res = response();
    await servePage({ method: "GET", headers: { cookie }, query }, res);
    assert.equal(res.statusCode, query.asset ? 403 : 200);
    if (!query.asset) {
      assert.equal((res.body.match(/data-free-item/g) || []).length, 10);
      assert.ok(res.body.includes("data-pro-item"));
      assert.equal(res.body.includes("Liskov Substitution Principle"), false);
    }
    assert.equal(res.headers["Cache-Control"], "private, no-store, max-age=0");
  }
});

test("legacy PIN cookies keep all question banks at ten free entries without administrator access", async () => {
  configure();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  const cookie = `kr7_pro=${pinCookie(Math.floor(Date.now() / 1000) + 3600)}`;
  const bank = Array.from({ length: 12 }, (_, index) => ({
    id: `question-${index}`, company: "React", topic: "C# / .NET",
    experience_band: "0-2 years", question: `Question ${index}`,
    answer: `Answer ${index}`, example: `Example ${index}`, is_free: false,
  }));
  global.fetch = async url => {
    assert.match(url, /\/rest\/v1\/(?:questions|experience_questions)\?/);
    return { ok: true, text: async () => JSON.stringify(bank) };
  };
  for (const api of [questions, experience, reactQuestions]) {
    const res = response();
    await api({ method: "GET", headers: { cookie }, query: { topic: "C# / .NET", level: "0-2 years" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.access.premium, false);
    const expected = api === questions
      ? mergeQuestions(bank, projectBank.subjects.filter(item => item.topic === "C# / .NET"))
      : bank;
    assert.equal(res.body.questions.length, 10);
    assert.equal(res.body.locked.length, expected.length - 10);
    assert.notEqual(res.body.access.isAdmin, true);
  }
});

test("a scoped PIN opens one question in each bank, not another item or the whole bank, and cannot be replayed", async () => {
  configure();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  const bank = Array.from({ length: 12 }, (_, index) => ({
    id: `question-${index}`, company: "React", topic: "C# / .NET",
    experience_band: "0-2 years", question: `Question ${String(index).padStart(2, "0")}`,
    answer: `Answer ${index}`, example: `Example ${index}`, is_free: false,
  }));
  global.fetch = async () => ({ ok: true, text: async () => JSON.stringify(bank) });
  const ip = crypto.randomUUID();
  for (const [api, resource, query] of [
    [questions, "subject:C# / .NET:question-10", { topic: "C# / .NET" }],
    [questions, "company:question-10", {}],
    [experience, "experience:question-10", { topic: "C# / .NET", level: "0-2 years" }],
    [reactQuestions, "react:question-10", {}],
  ]) {
    const grant = response();
    await handler(request("POST", { pin, resource }, ip), grant);
    assert.equal(grant.statusCode, 200);
    assert.equal(grant.headers["Set-Cookie"], undefined);
    const headers = { "x-pro-grant": grant.body.grant };
    const other = response();
    await api({ method: "GET", headers, query: { ...query, questionId: "question-11" } }, other);
    assert.equal(other.statusCode, 403);
    const wholeBank = response();
    await api({ method: "GET", headers, query }, wholeBank);
    assert.equal(wholeBank.body.questions.length, 10);
    assert.equal(wholeBank.body.access.premium, false);
    const selected = response();
    await api({ method: "GET", headers, query: { ...query, questionId: "question-10" } }, selected);
    assert.equal(selected.statusCode, 200);
    assert.deepEqual(selected.body.questions.map(item => item.id), ["question-10"]);
    assert.equal(selected.body.questions[0].answer, "Answer 10");
    assert.equal(selected.body.access.premium, false);
    assert.notEqual(selected.body.access.isAdmin, true);
    const replay = response();
    await api({ method: "GET", headers, query: { ...query, questionId: "question-10" } }, replay);
    assert.equal(replay.statusCode, 403);
  }
});

test("a guide grant returns only one sanitized lesson and cannot authorize another lesson, guide, or data script", async () => {
  configure();
  const req = request("POST", { pin, resource: "guide:C#Dotnet.html:10" });
  const grant = response();
  await handler(req, grant);
  assert.equal(grant.statusCode, 200);
  assert.equal(grant.headers["Set-Cookie"], undefined);
  const headers = { "x-pro-grant": grant.body.grant };
  for (const query of [
    { page: "C#Dotnet.html", item: "11" },
    { page: "System-Design.html", item: "10" },
    { asset: "dotnet-roadmap.js" },
  ]) {
    const res = response();
    await servePage({ method: "GET", headers, query }, res);
    assert.equal(res.statusCode, 403);
  }
  const res = response();
  await servePage({ method: "GET", headers, query: { page: "C#Dotnet.html", item: "10" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body), ["html"]);
  assert.match(res.body.html, /Liskov Substitution Principle/);
  assert.equal((res.body.html.match(/<h3\b/g) || []).length, 1);
  assert.doesNotMatch(res.body.html, /<script\b|<html\b|<button\b|\bonclick=/i);
  const replay = response();
  await servePage({ method: "GET", headers, query: { page: "C#Dotnet.html", item: "10" } }, replay);
  assert.equal(replay.statusCode, 403);
});

test("a newly appended concept needs a fresh guide grant and reveals only that exercise", async () => {
  configure();
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const page = "C#Dotnet.html";
  const start = guideTopics(page, fs.readFileSync(path.join(root, page), "utf8"), root, page)[0].items.length;
  const item = String(start);
  const request = { method: "GET", headers: {}, query: { page, item } };
  const denied = response();
  await servePage(request, denied);
  assert.equal(denied.statusCode, 403);
  const grant = response();
  await handler({
    method: "POST", body: { pin, resource: `guide:${page}:${item}` },
    headers: { host: "kr7tech.test", origin: "https://kr7tech.test" },
    socket: { remoteAddress: crypto.randomUUID() },
  }, grant);
  assert.equal(grant.statusCode, 200);
  const headers = { "x-pro-grant": grant.body.grant };
  const neighbor = response();
  await servePage({ ...request, headers, query: { page, item: String(start + 1) } }, neighbor);
  assert.equal(neighbor.statusCode, 403);
  const selected = response();
  await servePage({ ...request, headers }, selected);
  assert.equal(selected.statusCode, 200);
  assert.equal(selected.body.html, guidePracticeItems(page)[0].html);
  assert.doesNotMatch(selected.body.html, /<script\b|<html\b|<button\b|\bonclick=/i);
  const replay = response();
  await servePage({ ...request, headers }, replay);
  assert.equal(replay.statusCode, 403);
});

test("scoped grants reject tampering, expiration, and PIN rotation", () => {
  configure();
  const resource = "subject:EF Core:question-11";
  const req = request("GET");
  const grant = createGrant(req, resource);
  assert.equal(consumeGrant({ headers: { "x-pro-grant": grant + "x" } }, resource), false);
  assert.equal(consumeGrant({ headers: { "x-pro-grant": grant } }, "subject:SQL:question-11"), false);
  assert.equal(consumeGrant({ headers: { "x-pro-grant": grant } }, resource), true);
  const now = Date.now;
  let expired;
  try {
    Date.now = () => now() - 121000;
    expired = createGrant(req, resource);
  } finally { Date.now = now; }
  assert.equal(consumeGrant({ headers: { "x-pro-grant": expired } }, resource), false);
  const old = createGrant(req, resource);
  process.env.PRO_ACCESS_PIN = crypto.randomBytes(16).toString("hex");
  assert.equal(consumeGrant({ headers: { "x-pro-grant": old } }, resource), false);
});

test("repeated correct per-item confirmations do not exhaust the failed-PIN allowance", async () => {
  configure();
  const ip = crypto.randomUUID();
  for (let index = 0; index < 8; index++) {
    const res = response();
    await handler(request("POST", { pin, resource: `subject:EF Core:question-${index}` }, ip), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.verified, true);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
});

test("legacy PIN utility access does not bypass paid AI membership and daily usage checks", async () => {
  configure();
  process.env.JUDGE0_API_URL = "https://judge.test";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.AI_INTERVIEW_ALLOW_ANONYMOUS = "false";
  const cookie = `kr7_pro=${pinCookie(Math.floor(Date.now() / 1000) + 3600)}`;
  global.fetch = async url => {
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"question":"Introduce your experience."}' }] } }] }) };
  };
  const ai = response();
  await aiInterview({ method: "POST", headers: { cookie }, body: { action: "start", topic: "Azure", experience: "0-2 years", role: "" } }, ai);
  assert.equal(ai.statusCode, 401);
  const compiler = response();
  await compile({ method: "POST", headers: { cookie }, body: {} }, compiler);
  assert.equal(compiler.statusCode, 400);
});
