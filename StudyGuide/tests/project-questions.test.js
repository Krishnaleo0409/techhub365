"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { COURSES } = require("../learning-catalog");
const { buildBank, generatedSource } = require("../scripts/build-subject-questions");
const bank = require("../api/_project-questions");
const questions = require("../api/questions");
const { questionKey, mergeQuestions } = require("../api/_question-bank");
const { importGuideQuestions, itemContent, topicsFor } = require("../scripts/import-guide-questions");
const interviewPractice = require("../api/_interview-practice");
const subjects = COURSES.filter(course => course.kind === "Interview Q&A");
const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;

function response() {
  return {
    statusCode: 200, headers: {},
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

test("the private bank matches the project seeds and guides, with free and Pro practice for every subject", () => {
  assert.deepEqual(bank, buildBank());
  assert.equal(fs.readFileSync(path.join(__dirname, "..", "api", "_project-questions.js"), "utf8"), generatedSource(bank));
  assert.equal(new Set([...bank.subjects, ...bank.companies].map(item => item.id)).size, bank.subjects.length + bank.companies.length);
  for (const subject of subjects) {
    const items = bank.subjects.filter(item => item.topic === subject.topic);
    assert.ok(items.length > 10, subject.topic);
    assert.equal(new Set(items.map(questionKey)).size, items.length);
    assert.ok(items.every(item => item.question && item.answer));
    assert.ok(items.slice(0, 10).every(item => item.example && !item.source_page));
    assert.equal(new Set(items.slice(0, 10).map(item => item.experience_band)).size, 4);
    assert.ok(items.every(item => item.company === "Subject practice"));
  }
});

test("all subjects return ten real Q&A without a database, including with an unverifiable saved token", async () => {
  for (const name of names) delete process.env[name];
  global.fetch = async () => { throw new Error("Bundled questions must not request an external service."); };
  for (const subject of subjects) {
    const res = response();
    await questions({
      method: "GET", headers: { authorization: "Bearer unverified-session" }, query: { topic: subject.topic },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Cache-Control"], "private, no-store, max-age=0");
    assert.equal(res.body.questions.length, 10);
    assert.equal(res.body.access.premium, false);
    assert.equal(res.body.access.isAdmin, false);
    assert.equal(res.body.access.signedIn, false);
    assert.deepEqual(res.body.questions, bank.subjects.filter(item => item.topic === subject.topic).slice(0, 10));
    assert.ok(res.body.locked.length > 0);
    for (const locked of res.body.locked) {
      assert.deepEqual(Object.keys(locked).sort(), ["company", "id", "topic"]);
      const original = bank.subjects.find(item => item.id === locked.id);
      assert.ok(original);
    }
    assert.deepEqual(Object.keys(res.body).sort(), ["access", "locked", "questions"]);
  }
});

test("empty or undersized database subjects are supplemented without duplicate questions or unrelated subjects", async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  const project = bank.subjects.filter(item => item.topic === "EF Core");
  for (const count of [0, 6, 10]) {
    const remote = project.slice(0, count).map((item, index) => ({ ...item, id: `database-${index}` }));
    global.fetch = async () => ({ ok: true, text: async () => JSON.stringify([
      ...remote, { id: "unrelated", topic: "SQL", question: "Wrong subject" },
    ]) });
    const res = response();
    await questions({ method: "GET", headers: {}, query: { topic: "EF Core" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.questions.length, 10);
    assert.equal(res.body.locked.length, project.length - 10);
    assert.equal(new Set(res.body.questions.map(item => item.question)).size, 10);
    assert.ok([...res.body.questions, ...res.body.locked].every(item => item.topic === "EF Core"));
    assert.deepEqual(res.body.questions.slice(0, count), remote);
  }
});

test("the no-database company view uses only its separate company seed bank", async () => {
  for (const name of names) delete process.env[name];
  const res = response();
  await questions({ method: "GET", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.questions, bank.companies.slice(0, 10));
  assert.equal(res.body.locked.length, bank.companies.length - 10);
  assert.ok(res.body.questions.every(item => item.company !== "Subject practice"));
  const premium = bank.companies[10];
  assert.ok(res.body.locked.every(item => !("question" in item) && !("answer" in item) && !("example" in item)));
  const selected = response();
  await questions({ method: "GET", headers: {}, query: { questionId: premium.id } }, selected);
  assert.equal(selected.statusCode, 403);
});

test("all reusable guide entries are imported without inventing a hundred questions for unsupported subjects", () => {
  const imported = importGuideQuestions(path.join(__dirname, ".."));
  const keys = new Set(bank.subjects.map(questionKey));
  assert.ok(imported.every(item => keys.has(questionKey(item))));
  for (const topic of ["C# / .NET", "System Design"]) {
    assert.ok(bank.subjects.filter(item => item.topic === topic).length > 100, topic);
  }
  assert.ok(bank.subjects.filter(item => item.topic === "Angular").every(item => !item.source_title));
  assert.ok(bank.subjects.filter(item => item.topic === "JavaScript / TypeScript").every(item => !item.source_title));
  const deep = bank.subjects.find(item => item.topic === "ASP.NET Core" &&
    item.source_title === "2. What happens when HTTP reaches ASP.NET Core?");
  assert.ok(deep.answer.includes("Kestrel accepts network traffic"));
  assert.ok(deep.answer.includes("Middleware order"));
  assert.ok(deep.example.includes('app.UseExceptionHandler("/error");'));
  const dsa = bank.subjects.find(item => item.topic === "Data Structures & Algorithms" && item.question === "Solve: Two Sum");
  assert.equal(dsa.practice_type, "Coding problem");
  for (const language of ["csharp solution", "python solution", "java solution"]) assert.ok(dsa.example.includes(language));
  assert.ok(bank.subjects.some(item => item.practice_type === "Concept review" && item.source_page === "System-Design.html"));
});

test("the twenty original C# scenarios have substantive answers and examples and remain beyond the free preview", async () => {
  for (const name of names) delete process.env[name];
  const authored = bank.subjects.filter(item => item.practice_type === "Original C# interview practice");
  assert.equal(authored.length, 20);
  assert.equal(new Set(authored.map(item => item.question)).size, 20);
  assert.ok(authored.every(item => item.topic === "C# / .NET" && item.answer.length > 200 && item.example.length > 70));
  const res = response();
  await questions({ method: "GET", headers: {}, query: { topic: "C# / .NET" } }, res);
  assert.equal(res.body.questions.length, 10);
  assert.ok(authored.every(item => res.body.locked.some(locked => locked.id === item.id)));
  const selected = response();
  await questions({ method: "GET", headers: {}, query: { topic: "C# / .NET", questionId: authored[0].id } }, selected);
  assert.equal(selected.statusCode, 403);
});

test("expanded practice covers every subject without replacing existing entries or exposing new Pro content", async () => {
  for (const name of names) delete process.env[name];
  const authored = bank.subjects.filter(item => item.id.startsWith("kr7-interview-"));
  assert.equal(authored.length, interviewPractice.length);
  assert.equal(authored.length, 368);
  const existing = bank.subjects.filter(item => !item.id.startsWith("kr7-interview-"));
  assert.deepEqual(bank.subjects.slice(0, existing.length), existing);
  for (const subject of subjects) {
    const additions = authored.filter(item => item.topic === subject.topic);
    assert.ok(additions.length > 0, subject.topic);
    const res = response();
    await questions({ method: "GET", headers: {}, query: { topic: subject.topic } }, res);
    assert.equal(res.body.questions.length, 10);
    for (const entry of additions) {
      assert.ok(entry.concept && entry.answer && entry.example);
      assert.ok(res.body.locked.some(item => item.id === entry.id));
      assert.ok(!JSON.stringify(res.body).includes(entry.question));
      const selected = response();
      await questions({ method: "GET", headers: {}, query: { topic: subject.topic, questionId: entry.id } }, selected);
      assert.equal(selected.statusCode, 403, entry.question);
    }
  }
});

test("verified paid Pro can read all newly authored questions including concepts and worked examples", async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  global.fetch = async url => {
    if (url.endsWith("/auth/v1/user")) return { ok: true, json: async () => ({ id: "paid-user" }) };
    const data = url.includes("/entitlements?") ? [{ tier: "Pro", active: true }] : [];
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  for (const subject of subjects) {
    const res = response();
    await questions({
      method: "GET", headers: { authorization: "Bearer paid-session" }, query: { topic: subject.topic },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.access.premium, true);
    const visible = res.body.questions.filter(item => item.id.startsWith("kr7-interview-"));
    assert.equal(visible.length, interviewPractice.filter(item => item.topic === subject.topic).length);
    assert.ok(visible.every(item => item.concept && item.answer && item.example));
    assert.equal(res.body.locked.length, 0);
  }
});

test("guide extraction preserves explanation paragraphs and code without treating markup or controls as answers", () => {
  const result = itemContent({ html: '<article><h3>Question?</h3><p>First <code>C#</code> explanation.</p><p>Second paragraph.</p><pre>if (ready) {\n  Run();\n}</pre><script>hiddenAnswer()</script><button>Next</button></article>' });
  assert.equal(result.answer, "First C# explanation.\n\nSecond paragraph.");
  assert.equal(result.example, "if (ready) {\n  Run();\n}");
  assert.equal(itemContent({ html: "<article><h3>Empty</h3></article>" }), null);
  assert.deepEqual(topicsFor("C#Dotnet.html", "Tracking vs AsNoTracking?", "Entity Framework Core", "C# / .NET").sort(),
    ["C# / .NET", "EF Core"].sort());
  assert.ok(!topicsFor("C#Dotnet.html", "What does async/await do?", "Threading", "C# / .NET").includes("JavaScript / TypeScript"));
});

test("question merging preserves previews, canonicalizes duplicate prompts, and does not collapse different subjects or C++ into C#", () => {
  const first = { id: "original", topic: "C# / .NET", question: "1. What is C#?" };
  const duplicate = { id: "import", topic: "C# / .NET", question: "what   is C#" };
  const other = { id: "other", topic: "C# / .NET", question: "What is C++?" };
  const topic = { id: "topic", topic: "Behavioral", question: "What is C#?" };
  assert.deepEqual(mergeQuestions([first], [duplicate, other, topic]), [first, other, topic]);
});
