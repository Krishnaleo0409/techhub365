"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { deflateRawSync } = require("node:zlib");
const root = path.join(__dirname, "..");
const extensions = new Set([".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".woff2"]);

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function files() {
  const result = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(relative);
      else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) result.push(relative);
    }
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith(".") && !entry.name.startsWith("local-preview-") &&
        (extensions.has(path.extname(entry.name).toLowerCase()) ||
          ["package.json", "package-lock.json", "vercel.json"].includes(entry.name))) result.push(entry.name);
  }
  collect("api");
  collect("assets");
  result.push(path.join("scripts", "build-production.js"));
  return result.sort();
}

function build(output = path.join(root, ".godaddy", "kr7tech.zip")) {
  const chunks = [];
  const directory = [];
  let offset = 0;
  const entries = files();
  for (const relative of entries) {
    const name = Buffer.from(relative.split(path.sep).join("/"));
    const data = fs.readFileSync(path.join(root, relative));
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4, 28);
    central.writeUInt32LE(offset, 42);
    chunks.push(local, name, compressed);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  const zip = Buffer.concat([...chunks, central, end]);
  if (entries.length >= 65535 || zip.length >= 100 * 1024 * 1024) throw new Error("The GoDaddy upload exceeds its packaging limit.");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, zip);
  return output;
}

if (require.main === module) console.log(`GoDaddy source upload ready: ${build()}`);
module.exports = { build };
