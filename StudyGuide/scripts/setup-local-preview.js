"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { passwordHash } = require("../api/_local-admin");
const { localSettings } = require("./setup-local-admin");

async function setup() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL || process.env.RENDER) throw new Error("Local preview setup is not allowed on hosted deployments.");
  const root = path.join(__dirname, "..");
  execFileSync("git", ["--no-pager", "check-ignore", "--quiet", ".env.local"], { cwd: root, stdio: "ignore" });
  require("../server").loadLocalEnvironment();
  const password = process.env.LOCAL_PREVIEW_PASSWORD;
  const username = process.env.LOCAL_PREVIEW_USERNAME || "Admin";
  if (!password || !/^[a-z][a-z0-9_]{2,31}$/i.test(username)) throw new Error("Supply valid private preview credentials.");
  const settings = {
    LOCAL_PREVIEW_ENABLED: "true",
    LOCAL_PREVIEW_USERNAME: username,
    LOCAL_PREVIEW_PASSWORD_HASH: await passwordHash(password),
    LOCAL_PREVIEW_ADMIN_ID: process.env.LOCAL_PREVIEW_ADMIN_ID || crypto.randomUUID(),
  };
  delete process.env.LOCAL_PREVIEW_PASSWORD;
  const file = path.join(root, ".env.local");
  fs.writeFileSync(file, localSettings(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", settings), { mode: 0o600 });
  console.log("Offline preview credentials are ready in ignored local configuration. No database connection was made.");
}

if (require.main === module) {
  setup().catch(() => {
    console.error("Offline preview setup did not finish. Check the private local setup inputs.");
    process.exitCode = 1;
  });
}

module.exports = { setup };
