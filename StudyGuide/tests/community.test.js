"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const handler = require("../api/community");
const { answerFor } = require("../support-chat");
const names = ["NODE_ENV", "VERCEL_ENV", "VERCEL", "RENDER", "PUBLIC_APP_URL",
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPPORT_EMAIL", "COMMUNITY_FORM_SECRET"];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;
const origin = "https://kr7tech.test";
let calls;

function response() {
  return {
    statusCode: 200, headers: {},
    status(value) { this.statusCode = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
  };
}
function request(body, extra = {}) {
  return { method: "POST", body, headers: { origin }, socket: { remoteAddress: "127.0.0.1" }, ...extra };
}
function signup(kind = "newsletter") {
  return { kind, name: "Learner", email: "Learner@Example.test", consent: true };
}

test.beforeEach(() => {
  for (const name of names) delete process.env[name];
  process.env.NODE_ENV = "production";
  process.env.PUBLIC_APP_URL = origin;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.SUPPORT_EMAIL = "support@example.test";
  process.env.COMMUNITY_FORM_SECRET = crypto.randomBytes(32).toString("hex");
  calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const body = String(url).includes("/rpc/") ? "true" : "";
    return { ok: true, text: async () => body };
  };
});
test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

test("community forms stay closed without private storage, a secret, and a support contact", async () => {
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "COMMUNITY_FORM_SECRET", "SUPPORT_EMAIL"]) {
    const saved = process.env[name];
    delete process.env[name];
    const state = response();
    await handler({ method: "GET", query: {}, headers: {} }, state);
    assert.equal(state.body.enabled, false);
    const result = response();
    await handler(request(signup()), result);
    assert.equal(result.statusCode, 503);
    process.env[name] = saved;
  }
  assert.equal(calls.length, 0);
});

test("cross-site requests, missing consent, unsupported kinds, and invalid input cannot write records", async () => {
  for (const req of [
    request(signup(), { headers: { origin: "https://other.test" } }),
    request(signup(), { headers: {} }),
    request({ ...signup(), consent: false }),
    request({ ...signup(), kind: "__proto__" }),
    request({ ...signup(), email: "invalid" }),
    request({ ...signup(), name: "x".repeat(81) }),
    request({ kind: "feedback", consent: true, name: "Learner", courseId: "unknown", rating: 5, feedback: "An invalid course should not be stored.", requestId: crypto.randomUUID() }),
    request({ ...signup("enquiry"), phone: "<script>", requestId: crypto.randomUUID() }),
  ]) {
    const result = response();
    await handler(req, result);
    assert.ok([400, 403].includes(result.statusCode));
  }
  assert.equal(calls.length, 0);
});

test("newsletter and masterclass opt-ins are normalized, separate, private, and idempotent", async () => {
  for (const kind of ["newsletter", "masterclass"]) {
    calls.length = 0;
    const result = response();
    await handler(request(signup(kind)), result);
    assert.equal(result.statusCode, 202);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /rpc\/kr7_take_community_slot$/);
    const fingerprint = JSON.parse(calls[0].options.body).p_fingerprint;
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
    assert.notEqual(fingerprint, "127.0.0.1");
    assert.match(calls[1].url, /kr7_community_interest\?on_conflict=kind,email$/);
    assert.equal(calls[1].options.headers.Prefer, "resolution=ignore-duplicates,return=minimal");
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      kind, email: "learner@example.test", display_name: "Learner", consent_version: "interest-v1",
    });
    assert.equal(JSON.stringify(result.body).includes("learner@example.test"), false);
    assert.equal(result.headers["Cache-Control"], "private, no-store, max-age=0");
  }
});

test("feedback cannot approve itself or publish without explicit consent", async () => {
  const result = response();
  await handler(request({
    kind: "feedback", consent: true, name: "A learner", courseId: "dotnet",
    rating: 3, feedback: "Useful examples, but I would like clearer prerequisite notes.",
    requestId: crypto.randomUUID(), approved: true, publicConsent: false,
  }), result);
  assert.equal(result.statusCode, 202);
  const saved = JSON.parse(calls[1].options.body);
  assert.equal(saved.approved, false);
  assert.equal(saved.consent_public, false);
  assert.equal(saved.rating, 3);
  assert.match(calls[1].url, /kr7_learner_feedback\?on_conflict=request_id$/);
});

test("public feedback uses a consent-and-approval filter and exposes only display fields", async () => {
  global.fetch = async url => {
    assert.match(String(url), /approved=eq.true&consent_public=eq.true/);
    assert.match(String(url), /limit=12$/);
    return { ok: true, text: async () => JSON.stringify([{
      display_name: "Learner", course_id: "dotnet", rating: 4, feedback: "Useful practice.",
      email: "private@example.test", phone: "private", request_id: "private",
    }]) };
  };
  const result = response();
  await handler({ method: "GET", query: { action: "feedback" }, headers: {} }, result);
  assert.deepEqual(result.body, { feedback: [
    { name: "Learner", courseId: "dotnet", rating: 4, feedback: "Useful practice." },
  ] });
});

test("the persistent submission limiter blocks writes and storage failures never report success or leak details", async () => {
  global.fetch = async () => ({ ok: true, text: async () => "false" });
  const limited = response();
  await handler(request(signup()), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["Retry-After"], "3600");
  global.fetch = async () => { throw new Error("private provider details"); };
  const failed = response();
  await handler(request(signup()), failed);
  assert.equal(failed.statusCode, 503);
  assert.equal(JSON.stringify(failed.body).includes("private provider"), false);
});

test("optional guided-chat contact details are normalized and never returned publicly", async () => {
  const result = response();
  await handler(request({
    ...signup("enquiry"), phone: "+91 (98765) 43210", requestId: crypto.randomUUID(),
  }), result);
  assert.equal(result.statusCode, 202);
  assert.match(calls[1].url, /kr7_contact_requests\?on_conflict=request_id$/);
  const saved = JSON.parse(calls[1].options.body);
  assert.equal(saved.phone, "+919876543210");
  assert.equal(saved.email, "learner@example.test");
  assert.equal(JSON.stringify(result.body).includes(saved.phone), false);
});

test("guided answers accept only supported suggestions and use configured pricing rather than invented packages", () => {
  assert.equal(answerFor("arbitrary free text", {}), null);
  assert.equal(answerFor("__proto__", {}), null);
  assert.match(answerFor("price", { plans: { Pro: 2345 }, providers: {} }), /2,345/);
  assert.match(answerFor("price", { plans: { Pro: 2345 }, providers: {} }), /not enabled/);
  assert.match(answerFor("masterclass", {}), /does not book/);
  assert.match(answerFor("pin", {}), /only that item/);
  assert.match(answerFor("free", {}), /ten free questions in total/i);
});

test("Pro benefit answers distinguish included services from pending setup and item-only PIN access", () => {
  const answer = answerFor("benefits", { compilerConfigured: false });
  assert.match(answer, /Pro includes.*remote code runner.*live 1:1 coaching.*completion certificates/);
  assert.match(answer, /configured compiler service/);
  assert.match(answer, /details are pending/);
  assert.match(answer, /checkout does not book a session or issue a certificate/);
  assert.match(answer, /Individual item PIN access is not a Pro membership/);
  assert.match(answerFor("courses", {}), /not interview question banks/);
});
