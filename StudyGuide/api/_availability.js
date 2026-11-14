"use strict";

const fs = require("node:fs");
const path = require("node:path");

const UNAVAILABLE_MESSAGE = "This service is temporarily unavailable. We're working on it. Please try again shortly.";

function sendUnavailable(res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Retry-After", "60");
  let html;
  try {
    html = fs.readFileSync(path.join(__dirname, "..", "Unavailable.html"), "utf8");
  } catch {
    html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Temporarily unavailable | KR7Tech</title><h1>We're working on it</h1><p>${UNAVAILABLE_MESSAGE}</p><a href="">Try again</a></html>`;
  }
  return res.status(503).send(html);
}

module.exports = { UNAVAILABLE_MESSAGE, sendUnavailable };
