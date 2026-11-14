"use strict";

const { handleRequest } = require("../server");
if (typeof handleRequest !== "function") throw new Error("The production server is not available.");
console.log("KR7Tech Node.js application ready. Start with npm start.");
