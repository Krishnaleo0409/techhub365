"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { connect } = require("../api/_mongo");
const { localAdminEnvironment, provisionLocalAdmin } = require("../api/_local-admin");
const { contentRecords, seed } = require("./seed-mongodb");

function localSettings(source, settings) {
  const lines = source.split(/\r?\n/);
  for (const [name, value] of Object.entries(settings)) {
    const encoded = `${name}=${JSON.stringify(value)}`;
    const indices = lines.map((line, index) => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1] === name ? index : -1)
      .filter(index => index >= 0);
    if (!indices.length) lines.push(encoded);
    else {
      lines[indices[0]] = encoded;
      for (const index of indices.slice(1).reverse()) lines.splice(index, 1);
    }
  }
  return `${lines.filter((line, index) => line || index < lines.length - 1).join("\n")}\n`;
}

async function setup() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL || process.env.RENDER) throw new Error("Run local administrator setup only on your development machine.");
  const root = path.join(__dirname, "..");
  const file = path.join(root, ".env.local");
  execFileSync("git", ["check-ignore", "--quiet", ".env.local"], { cwd: root, stdio: "ignore" });
  require("../server").loadLocalEnvironment(file);
  const uri = process.env.MONGODB_URI;
  const password = process.env.LOCAL_ADMIN_BOOTSTRAP_PASSWORD;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri) || !password) throw new Error("Provide private MongoDB and local administrator setup inputs.");
  const settings = {
    AUTH_PROVIDER: "mongodb", MONGODB_URI: uri, MONGODB_DATABASE: process.env.MONGODB_DATABASE || "kr7tech",
    PUBLIC_APP_URL: process.env.LOCAL_ADMIN_APP_URL || "http://127.0.0.1:10000",
    LOCAL_ADMIN_LOGIN_ENABLED: "true",
    AUTH_OTP_SECRET: process.env.AUTH_OTP_SECRET || crypto.randomBytes(48).toString("hex"),
  };
  Object.assign(process.env, settings);
  if (!localAdminEnvironment()) throw new Error("The local administrator URL or settings are not permitted.");
  fs.writeFileSync(file, localSettings(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", settings), { mode: 0o600 });
  const { db, client } = await connect();
  try {
    const account = await provisionLocalAdmin(db, process.env.LOCAL_ADMIN_USERNAME || "Admin", password);
    delete process.env.LOCAL_ADMIN_BOOTSTRAP_PASSWORD;
    await db.collection("entitlements").updateOne({ user_id: account.id, tier: "Pro" }, {
      $set: { active: true, localOnly: true, granted_at: new Date().toISOString(), revoked_at: null },
      $setOnInsert: { id: crypto.randomUUID(), user_id: account.id, tier: "Pro" },
    }, { upsert: true });
    await seed(db, contentRecords(root));
    console.log(`Local administrator ${account.username} is ready with Pro test access. Existing content was preserved. Open ${settings.PUBLIC_APP_URL}/Account.html after starting the server.`);
  } finally { await client.close(); }
}

if (require.main === module) {
  setup().catch(error => {
    const code = /^[A-Za-z0-9_]{1,60}$/.test(String(error.code || "")) ? ` (${error.code})` : "";
    console.error(`Local administrator setup did not finish${code}. Credentials were not printed. Check MongoDB connectivity, database permissions, and your private local configuration.`);
    process.exitCode = 1;
  });
}

module.exports = { localSettings, setup };
