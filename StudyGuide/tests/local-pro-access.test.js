const assert = require("node:assert/strict");
const test = require("node:test");
const localProAccess = require("../api/local-pro-access");
const questionHandler = require("../api/questions");
const { hasLocalProAccess, localProCookieValue } = require("../api/_shared");
const { consumeGrant } = require("../api/_pin-grants");

const names = [
  "NODE_ENV",
  "VERCEL_ENV",
  "LOCAL_PRO_ACCESS_ENABLED",
  "LOCAL_PRO_ACCESS_PIN",
  "LOCAL_PRO_ACCESS_SECRET",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;

function configure() {
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;
  process.env.LOCAL_PRO_ACCESS_ENABLED = "true";
  process.env.LOCAL_PRO_ACCESS_PIN = "local-test-pin";
  process.env.LOCAL_PRO_ACCESS_SECRET = "test-secret-with-at-least-thirty-two-characters";
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
  };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of names) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test("legacy local testing cookies cannot unlock all premium questions", async () => {
  configure();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  global.fetch = async () => {
    const data = Array.from({ length: 12 }, (_, index) => ({
      id: `question-${index}`,
      company: "Example",
      topic: "Testing",
      question: `Question ${index}`,
      answer: `Answer ${index}`,
      example: `Example ${index}`,
      access_level: null,
      is_free: index < 10,
    }));
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  const res = {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  await questionHandler({
    method: "GET",
    headers: {
      host: "localhost:3000",
      cookie: `kr7_local_pro=${localProCookieValue(expiresAt)}`,
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.questions.length, 10);
  assert.equal(res.body.locked.length, 2);
  assert.equal(res.body.access.premium, false);
  assert.deepEqual(res.body.access.tiers, []);
});

test("the configured local PIN creates a signed HttpOnly testing cookie", async () => {
  configure();
  const res = mockResponse();
  await localProAccess({ method: "POST", headers: { host: "localhost:3000" }, body: { pin: "local-test-pin" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.enabled, true);
  assert.match(res.headers["Set-Cookie"], /^kr7_local_pro=\d+\.[\da-f]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800$/);
  assert.equal(hasLocalProAccess({
    headers: { host: "localhost:3000", cookie: res.headers["Set-Cookie"].split(";")[0] },
  }), true);
});

test("incorrect PINs do not create a testing cookie", async () => {
  configure();
  const res = mockResponse();
  await localProAccess({ method: "POST", headers: { host: "localhost:3000" }, body: { pin: "0000" } }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["Set-Cookie"], undefined);
});

test("local test Pro access is unavailable outside development on loopback", async () => {
  configure();
  for (const request of [
    { method: "POST", headers: { host: "example.com" }, body: { pin: "local-test-pin" } },
    { method: "POST", headers: { host: "localhost:3000" }, body: { pin: "local-test-pin" }, production: true },
  ]) {
    if (request.production) process.env.NODE_ENV = "production";
    else process.env.NODE_ENV = "development";
    const res = mockResponse();
    await localProAccess(request, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
});

test("local test access rejects expired and tampered cookies", () => {
  configure();
  assert.equal(hasLocalProAccess({
    headers: { host: "localhost:3000", cookie: "kr7_local_pro=1.invalid" },
  }), false);
  assert.equal(hasLocalProAccess({
    headers: { host: "127.0.0.1:3000", cookie: "kr7_local_pro=1." + "0".repeat(64) },
  }), false);
});

test("a short localhost PIN grants only the selected resource without creating a session", async () => {
  configure();
  const pin = String(require("node:crypto").randomInt(1000, 10000));
  process.env.LOCAL_PRO_ACCESS_PIN = pin;
  const req = { method: "POST", headers: { host: "localhost:3000" },
    body: { pin, resource: "subject:EF Core:question-11" } };
  const res = mockResponse();
  await localProAccess(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.verified, true);
  assert.equal(res.headers["Set-Cookie"], undefined);
  const granted = { headers: { host: "localhost:3000", "x-pro-grant": res.body.grant } };
  assert.equal(consumeGrant(granted, "subject:EF Core:question-12"), false);
  assert.equal(consumeGrant(granted, req.body.resource), true);
  assert.equal(consumeGrant(granted, req.body.resource), false);
});
