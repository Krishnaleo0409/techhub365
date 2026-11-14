"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, ".vercel", "output");
const MARKER = ".kr7tech-build";
const ASSET_EXTENSIONS = new Set([
  ".css", ".gif", ".html", ".ico", ".jpeg", ".jpg",
  ".js", ".png", ".svg", ".webp", ".woff2",
]);

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function copyDependency(name, from, destination) {
  const resolve = createRequire(path.join(from, "package.json")).resolve;
  let directory;
  try {
    directory = path.dirname(resolve(`${name}/package.json`));
  } catch {
    try { directory = path.dirname(resolve(name)); }
    catch {
      directory = resolve.paths(name).map(base => path.join(base, name))
        .find(candidate => fs.existsSync(path.join(candidate, "package.json")));
      if (!directory) throw new Error(`Cannot locate runtime dependency ${name}. Run npm ci first.`);
    }
  }
  let manifest;
  for (;;) {
    const file = path.join(directory, "package.json");
    if (fs.existsSync(file)) {
      const candidate = JSON.parse(fs.readFileSync(file, "utf8"));
      if (candidate.name === name) {
        manifest = candidate;
        break;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate runtime dependency ${name}. Run npm ci first.`);
    directory = parent;
  }
  const target = path.join(destination, "node_modules", name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(directory, target, {
    recursive: true,
    filter: source => path.basename(source) !== "node_modules" && !path.basename(source).startsWith(".env"),
  });
  for (const dependency of Object.keys(manifest.dependencies || {})) {
    copyDependency(dependency, directory, target);
  }
}

function build(output = OUTPUT) {
  if (fs.existsSync(output)) {
    if (!fs.existsSync(path.join(output, MARKER))) {
      throw new Error("Refusing to replace an unrecognized build directory. Use a clean .vercel/output directory.");
    }
    // Only the reproducible output of this builder can be replaced.
    fs.rmSync(output, { recursive: true });
  }
  const functionDirectory = path.join(output, "functions", "index.func");
  const app = path.join(functionDirectory, "app");
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(output, MARKER), "KR7Tech generated deployment output\n");

  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith(".") &&
        (ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ||
         ["package.json", "vercel.json"].includes(entry.name))) {
      fs.copyFileSync(path.join(ROOT, entry.name), path.join(app, entry.name));
    }
  }
  fs.cpSync(path.join(ROOT, "api"), path.join(app, "api"), {
    recursive: true,
    filter: source => fs.statSync(source).isDirectory() || path.extname(source) === ".js",
  });
  fs.cpSync(path.join(ROOT, "assets"), path.join(app, "assets"), {
    recursive: true,
    filter: source => fs.statSync(source).isDirectory() ||
      ASSET_EXTENSIONS.has(path.extname(source).toLowerCase()),
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  for (const name of Object.keys(manifest.dependencies || {})) copyDependency(name, ROOT, app);

  fs.writeFileSync(path.join(functionDirectory, "index.js"),
    '"use strict";\nmodule.exports = require("./app/server").handleRequest;\n');
  writeJson(path.join(functionDirectory, ".vc-config.json"), {
    runtime: "nodejs24.x",
    handler: "index.js",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
    maxDuration: 60,
  });
  writeJson(path.join(output, "config.json"), {
    version: 3,
    routes: [{ src: "/(.*)", dest: "/index" }],
  });
  return output;
}

if (require.main === module) {
  build();
  console.log("Vercel deployment ready in .vercel/output (one private Node.js function).");
}

module.exports = { build };
