"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { build } = require("../scripts/build-vercel");

const names = [
  "NODE_ENV", "VERCEL_ENV", "PUBLIC_APP_URL", "SUPABASE_URL",
  "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PRO_ACCESS_PIN",
  "PRO_ACCESS_SECRET", "STRIPE_WEBHOOK_SECRET", "LOCAL_PRO_ACCESS_ENABLED",
  "LOCAL_PRO_ACCESS_PIN", "LOCAL_PRO_ACCESS_SECRET",
];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
let directory, output, app, server, baseUrl;
const pin = crypto.randomBytes(16).toString("hex");

test.before(async () => {
  for (const name of names) delete process.env[name];
  process.env.NODE_ENV = "production";
  process.env.VERCEL_ENV = "production";
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.STRIPE_WEBHOOK_SECRET = crypto.randomBytes(32).toString("hex");
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "kr7-vercel-"));
  output = build(path.join(directory, "output"));
  app = path.join(output, "functions", "index.func", "app");
  const handler = require(path.join(output, "functions", "index.func", "index.js"));
  server = http.createServer((req, res) => {
    handler(req, res).catch(error => {
      res.statusCode = 500;
      res.end(error.message);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_APP_URL = baseUrl;
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

test("build packages one standalone function without public premium files or development inputs", () => {
  const config = JSON.parse(fs.readFileSync(path.join(output, "config.json"), "utf8"));
  assert.equal(config.version, 3);
  assert.deepEqual(config.routes, [{ src: "/(.*)", dest: "/index" }]);
  assert.deepEqual(fs.readdirSync(path.join(output, "functions")), ["index.func"]);
  assert.equal(fs.existsSync(path.join(output, "static")), false);
  for (const file of [
    ".env", ".env.local", ".env.example", "tests", "scripts", "supabase",
    "README.md", "DEPLOYMENT.md", "experience-questions-seed.sql",
    "react-machine-coding-seed.sql", "node_modules/playwright",
  ]) assert.equal(fs.existsSync(path.join(app, file)), false, file);
  assert.equal(fs.existsSync(path.join(app, "api", "_project-questions.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_interview-practice.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_interview-core.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_concept-lessons.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_concept-advanced.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_concept-deep-dives.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_concept-guided.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_concept-enterprise.js")), true);
  assert.equal(fs.existsSync(path.join(app, "api", "_site-layout.js")), true);
  assert.equal(fs.existsSync(path.join(app, "node_modules", "acorn")), true);
  assert.equal(fs.existsSync(path.join(app, "node_modules", "mongodb")), true);
  assert.equal(typeof require(path.join(app, "node_modules", "mongodb")).MongoClient, "function");
  assert.equal(fs.existsSync(path.join(app, "node_modules", "parse5", "node_modules", "entities")), true);
});

test("build refuses to replace an unrelated output directory", () => {
  const unrelated = path.join(directory, "unrelated");
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(unrelated, "keep.txt"), "preserve");
  assert.throws(() => build(unrelated), /Refusing to replace/);
  assert.equal(fs.readFileSync(path.join(unrelated, "keep.txt"), "utf8"), "preserve");
});

test("packaged function serves website assets and keeps private deployment inputs inaccessible", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), { status: "ok" });
  for (const route of ["/", "/Subjects.html", "/Subject-QA.html?topic=EF%20Core",
    "/Courses.html", "/Newsletter.html", "/Masterclass.html", "/Feedback.html", "/Privacy.html",
    "/site.css", "/google-auth.js", "/community.js", "/support-chat.js", "/support-chat.css",
    "/Concepts.html", "/concepts.js", "/concepts.css", "/courses.js", "/learning-sections.js", "/concept-paths.js",
    "/site-navigation.js", "/site-navigation.css", "/Account.html", "/account.js", "/account.css", "/api/email-auth"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    await response.arrayBuffer();
  }
  for (const route of [
    "/.env.local", "/server.js", "/package.json", "/scripts/build-vercel.js",
    "/api/_project-questions.js", "/api/_csharp-practice.js", "/api/_interview-practice.js", "/%61pi/_project-questions.js",
    "/api/_interview-core.js", "/api/_concept-lessons.js", "/api/_concept-advanced.js", "/api/_concept-deep-dives.js", "/api/_concept-guided.js",
    "/api/_concept-enterprise.js",
    "/api/_ai-sessions.js", "/api/_site-layout.js", "/api/_mongo.js", "/api/_mongo-auth.js", "/api/_mongo-data.js",
    "/supabase/membership-plans.sql",
    "/node_modules/acorn/dist/acorn.js", "/supabase/schema.sql",
    "/tests/vercel-deployment.test.js", "/.vercel/output/config.json",
  ]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 404, route);
    await response.text();
  }
  const community = await fetch(`${baseUrl}/api/community`);
  assert.equal(community.status, 200);
  assert.equal((await community.json()).enabled, false);
  const catalog = await (await fetch(`${baseUrl}/api/concepts`)).json();
  assert.ok(catalog.lessons.length > 0);
  assert.ok(catalog.lessons.every(item => !("what" in item) && !("example" in item)));
  const locked = await fetch(`${baseUrl}/api/concepts?id=${catalog.lessons[0].id}`);
  assert.equal(locked.status, 403);
  await locked.text();
});

test("packaged guides render actual protected previews without relying on the source checkout", async () => {
  for (const route of ["/C%23Dotnet.html", "/dotnet-roadmap.HTML"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal((html.match(/data-free-item/g) || []).length, 10);
    assert.match(html, /data-pro-item/);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  }
  const protectedScript = await fetch(`${baseUrl}/dotnet-roadmap.js`);
  assert.equal(protectedScript.status, 403);
  await protectedScript.text();
});

test("packaged subject APIs preserve query strings, JSON requests and per-item production PIN access", async () => {
  const route = `${baseUrl}/api/questions?topic=${encodeURIComponent("C# / .NET")}`;
  const initial = await (await fetch(route)).json();
  assert.equal(initial.questions.length, 10);
  assert.ok(initial.questions.every(item => item.topic === "C# / .NET"));
  assert.ok(initial.locked.length > 100);
  const selected = initial.locked[0];
  const unlock = await fetch(`${baseUrl}/api/pro-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ pin, resource: `subject:C# / .NET:${selected.id}` }),
  });
  assert.equal(unlock.status, 200);
  const { grant } = await unlock.json();
  assert.equal(typeof grant, "string");
  const headers = { "X-Pro-Grant": grant };
  const bank = await (await fetch(route, { headers })).json();
  assert.equal(bank.questions.length, 10);
  assert.equal(bank.access.premium, false);
  const question = `${route}&questionId=${encodeURIComponent(selected.id)}`;
  const response = await fetch(question, { headers });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).questions.map(item => item.id), [selected.id]);
  const replay = await fetch(question, { headers });
  assert.equal(replay.status, 403);
  await replay.text();
  const malformed = await fetch(`${baseUrl}/api/pro-access`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /valid JSON/);
});

test("packaged webhook handling verifies original request bytes, not reserialized JSON", async () => {
  const body = '{\n  "type": "deployment.smoke",\n  "data": { "object": {} }\n}\n';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    body,
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
});

test("packaged company API keeps all but ten entries locked independently of subject previews", async () => {
  const response = await fetch(`${baseUrl}/api/questions`);
  assert.equal(response.status, 200);
  const company = await response.json();
  assert.equal(company.questions.length, 10);
  assert.equal(company.locked.length, 86);
  assert.ok(company.locked.every(item => !("question" in item) && !("answer" in item)));
  const protectedQuestion = await fetch(`${baseUrl}/api/questions?questionId=${encodeURIComponent(company.locked[0].id)}`);
  assert.equal(protectedQuestion.status, 403);
  await protectedQuestion.text();
});
