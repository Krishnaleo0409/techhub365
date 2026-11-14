"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const mongodb = require("mongodb");
const { createDatabase } = require("./helpers/mongo-fixture");
const data = createDatabase();
let outage = true;
let contentOutage = false;
let entitlementOutage = false;
const descriptor = Object.getOwnPropertyDescriptor(mongodb, "MongoClient");
Object.defineProperty(mongodb, "MongoClient", { configurable: true, value: class {
  async connect() { if (outage) throw new Error("Simulated database outage."); }
  db() { return { collection(name) {
    if (outage || contentOutage && ["questions", "experience_questions"].includes(name) ||
        entitlementOutage && name === "entitlements") throw new Error("Simulated database outage.");
    return data.collection(name);
  } }; }
  async close() {}
} });
const handlers = {
  questions: require("../api/questions"), concepts: require("../api/concepts"),
  experience: require("../api/experience-questions"), react: require("../api/react-machine-coding"),
  guide: require("../api/serve-page"),
};
const bank = require("../api/_project-questions");
const lessons = require("../api/_concept-lessons");
const { COURSES } = require("../learning-catalog");
const { connect } = require("../api/_mongo");
const { createGrant } = require("../api/_pin-grants");
const names = ["AUTH_PROVIDER", "MONGODB_URI", "MONGODB_DATABASE", "PUBLIC_APP_URL", "AUTH_OTP_SECRET",
  "NODE_ENV", "PRO_ACCESS_PIN", "PRO_ACCESS_SECRET"];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const token = `kr7_${"a".repeat(43)}`;
const cookie = `__Host-kr7_session=${token}`;
test.beforeEach(t => {
  data.reset();
  outage = true;
  contentOutage = entitlementOutage = false;
  Object.assign(process.env, { AUTH_PROVIDER: "mongodb", MONGODB_URI: "mongodb://fixture.invalid",
    MONGODB_DATABASE: "fixture", AUTH_OTP_SECRET: "a".repeat(64), NODE_ENV: "production",
    PUBLIC_APP_URL: "https://kr7tech.test", PRO_ACCESS_PIN: "test-lesson-pin", PRO_ACCESS_SECRET: "b".repeat(64) });
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
});
test.after(() => {
  Object.defineProperty(mongodb, "MongoClient", descriptor);
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});
async function get(name, query = {}, headers = {}) {
  const res = { statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  await handlers[name]({ method: "GET", headers, query }, res);
  return res;
}

test("configured but unreachable MongoDB cannot prevent any subject or company free preview from loading", async () => {
  for (const course of COURSES.filter(item => item.kind === "Interview Q&A")) {
    const res = await get("questions", { topic: course.topic });
    assert.equal(res.statusCode, 200, `${course.topic}: ${res.body.error}`);
    assert.equal(res.body.questions.length, 10);
    assert.ok([...res.body.questions, ...res.body.locked].every(item => item.topic === course.topic));
    assert.equal(res.body.access.premium, false);
    assert.ok(res.body.locked.every(item => !("question" in item) && !("answer" in item)));
    assert.match(res.headers["cache-control"], /no-store/);
  }
  const companies = await get("questions");
  assert.equal(companies.statusCode, 200);
  assert.deepEqual(companies.body.questions, bank.companies.slice(0, 10));
});

test("an unverifiable saved cookie cannot break Concepts or guides, or reveal paid lesson bodies", async () => {
  const catalog = await get("concepts", {}, { cookie });
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.body.lessons.length, lessons.length);
  assert.equal(catalog.body.access.premium, false);
  assert.equal(catalog.body.access.verificationUnavailable, true);
  assert.ok(catalog.body.lessons.every(item => !("what" in item) && !("example" in item)));
  assert.equal((await get("concepts", { id: lessons[0].id }, { cookie })).statusCode, 403);
  const preview = await get("guide", { page: "C#Dotnet.html" }, { cookie });
  assert.equal(preview.statusCode, 200);
  assert.match(preview.body, /Learning guide preview/);
  assert.doesNotMatch(preview.body, /data-guide-access="pro"/);
  assert.equal((await get("guide", { page: "C#Dotnet.html", item: "10" }, { cookie })).statusCode, 403);
  assert.equal((await get("guide", { asset: "interview-studio.js" }, { cookie })).statusCode, 403);
});

test("experience and React practice use their own bundled banks during a database outage", async () => {
  const experience = await get("experience", { topic: "C# / .NET", level: "6-10 years" }, { cookie });
  assert.equal(experience.statusCode, 200);
  assert.ok(experience.body.questions.length > 0);
  assert.ok(experience.body.questions.every(item => item.topic === "C# / .NET" && item.experience_band === "6-10 years"));
  assert.equal(experience.body.access.premium, false);
  assert.ok(experience.body.locked.every(item => !("answer" in item)));
  const react = await get("react", {}, { cookie });
  assert.equal(react.statusCode, 200);
  assert.equal(react.body.questions.length, 10);
  assert.equal(react.body.locked.length, 20);
  assert.ok(react.body.questions.every(item => item.topic === "React Machine Coding"));
  assert.equal(react.body.access.premium, false);
});

test("paid access requires a successful entitlement check even when question storage falls back", async () => {
  outage = false;
  await connect();
  const id = "39d598a5-98b2-4372-9e90-d5e95bdb38ab";
  data.collection("users").rows.push({ id, role: "student", username: "Learner", emailVerified: false });
  data.collection("auth_sessions").rows.push({ _id: crypto.createHash("sha256").update(token).digest("hex"),
    userId: id, expiresAt: new Date(Date.now() + 3600000) });
  data.collection("entitlements").rows.push({ user_id: id, tier: "Pro", active: true });
  contentOutage = true;
  const pro = await get("questions", { topic: "C# / .NET" }, { cookie });
  assert.equal(pro.statusCode, 200);
  assert.equal(pro.body.access.premium, true);
  assert.equal(pro.body.questions.length, bank.subjects.filter(item => item.topic === "C# / .NET").length);
  entitlementOutage = true;
  const unverified = await get("questions", { topic: "C# / .NET" }, { cookie });
  assert.equal(unverified.statusCode, 200);
  assert.equal(unverified.body.questions.length, 10);
  assert.equal(unverified.body.access.premium, false);
  assert.equal(unverified.body.access.isAdmin, false);
  assert.equal(unverified.body.access.verificationUnavailable, true);
});

test("a database outage does not broaden or disable a valid single-lesson PIN grant", async () => {
  const question = bank.subjects.filter(item => item.topic === "C# / .NET")[10];
  const headers = { cookie };
  headers["x-pro-grant"] = createGrant({ headers }, `subject:${question.topic}:${question.id}`);
  const opened = await get("questions", { topic: question.topic, questionId: question.id }, headers);
  assert.equal(opened.statusCode, 200);
  assert.deepEqual(opened.body.questions, [question]);
  assert.equal((await get("questions", { topic: question.topic, questionId: question.id }, headers)).statusCode, 403);
  const grant = { cookie };
  grant["x-pro-grant"] = createGrant({ headers: grant }, `concept:${lessons[0].id}`);
  const lesson = await get("concepts", { id: lessons[0].id }, grant);
  assert.equal(lesson.statusCode, 200);
  assert.deepEqual(lesson.body.lesson, lessons[0]);
  assert.equal((await get("concepts", { id: lessons[1].id }, grant)).statusCode, 403);
});
