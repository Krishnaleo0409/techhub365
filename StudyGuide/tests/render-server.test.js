const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const { createServer, resolveStaticFile, loadLocalEnvironment } = require("../server");

const root = path.join(__dirname, "..");

test("Render manifest starts the Node server from the project directory", () => {
  const manifest = fs.readFileSync(path.join(root, "..", "render.yaml"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(manifest, /rootDir:\s*StudyGuide/);
  assert.match(manifest, /buildCommand:\s*npm ci --omit=dev/);
  assert.match(manifest, /startCommand:\s*npm start/);
  assert.match(manifest, /healthCheckPath:\s*\/api\/health/);
  assert.equal(packageJson.scripts.start, "node server.js");
});

test("static resolver does not expose server or private source directories", () => {
  assert.equal(resolveStaticFile("/server.js"), null);
  assert.equal(resolveStaticFile("/api/questions.js"), null);
  assert.equal(resolveStaticFile("/tests/access.test.js"), null);
  assert.equal(resolveStaticFile("/scripts/build-vercel.js"), null);
  assert.equal(resolveStaticFile("/supabase/seed.sql"), null);
  assert.equal(resolveStaticFile("/package.json"), null);
  assert.equal(resolveStaticFile("/.env"), null);
  assert.equal(resolveStaticFile("/.env.local"), null);
  assert.equal(resolveStaticFile("/.env.example"), null);
  assert.equal(resolveStaticFile("/index.html"), path.join(root, "index.html"));
});

function environmentFixture(t) {
  const names = ["NODE_ENV", "VERCEL_ENV", "SUPABASE_URL"];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kr7-env-"));
  const file = path.join(directory, ".env.local");
  fs.writeFileSync(file, "SUPABASE_URL=https://fixture.supabase.test\n");
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;
  delete process.env.SUPABASE_URL;
  t.after(() => {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  });
  return { directory, file };
}

test("development loads local project settings without overriding existing environment variables", t => {
  const { file } = environmentFixture(t);
  loadLocalEnvironment(file);
  assert.equal(process.env.SUPABASE_URL, "https://fixture.supabase.test");
  process.env.SUPABASE_URL = "https://existing.supabase.test";
  loadLocalEnvironment(file);
  assert.equal(process.env.SUPABASE_URL, "https://existing.supabase.test");
});

test("production ignores local project settings and missing optional files do not prevent development startup", t => {
  const { directory, file } = environmentFixture(t);
  process.env.NODE_ENV = "production";
  loadLocalEnvironment(file);
  assert.equal(process.env.SUPABASE_URL, undefined);
  process.env.NODE_ENV = "development";
  process.env.VERCEL_ENV = "production";
  loadLocalEnvironment(file);
  assert.equal(process.env.SUPABASE_URL, undefined);
  delete process.env.VERCEL_ENV;
  assert.doesNotThrow(() => loadLocalEnvironment(path.join(directory, "not-present.env")));
});

test("Render server serves health, static assets, and protected page previews", async t => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /KR7Tech/);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");

  const protectedPage = await fetch(`${baseUrl}/Dotnet-Roadmap.html`);
  assert.equal(protectedPage.status, 200);
  const preview = await protectedPage.text();
  assert.match(preview, /The 365-day C#\/\.NET roadmap/);
  assert.match(preview, /local-pro-access\.js/);

  const privateFile = await fetch(`${baseUrl}/api/questions.js`);
  assert.equal(privateFile.status, 404);
});
