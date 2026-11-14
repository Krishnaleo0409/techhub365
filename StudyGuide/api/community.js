"use strict";

const crypto = require("node:crypto");
const { supabaseRest } = require("./_shared");
const { getCourse } = require("../learning-catalog");
const { databaseConfigured } = require("./_mongo");
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGES = {
  newsletter: "Your newsletter interest is saved. Email updates have not launched; this does not purchase Pro.",
  masterclass: "Your masterclass interest is saved. No seat or payment is booked; schedule and fees are not published yet.",
  feedback: "Thank you. Your feedback is saved privately. Only feedback with publication consent and owner approval can appear publicly.",
  enquiry: "Your contact request is saved for owner follow-up. No call time, booking, payment, or Pro access is confirmed.",
};

function configuration() {
  let origin = null;
  try {
    const url = new URL(process.env.PUBLIC_APP_URL);
    if (url.protocol === "https:" || process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production" &&
        url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) origin = url.origin;
  } catch {}
  const supportEmail = process.env.SUPPORT_EMAIL || "";
  const contact = supportEmail.length <= 254 && EMAIL.test(supportEmail) ? supportEmail : null;
  return {
    enabled: Boolean(origin && contact && databaseConfigured() &&
      (process.env.COMMUNITY_FORM_SECRET || "").length >= 32),
    origin, supportEmail: contact,
  };
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Object.hasOwn(MESSAGES, body.kind) || body.consent !== true) return null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length > 80) return null;
  if (body.kind === "feedback") {
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    if (!name || !getCourse(body.courseId) || !Number.isInteger(body.rating) ||
        body.rating < 1 || body.rating > 5 || feedback.length < 20 ||
        feedback.length > 2000 || !UUID.test(body.requestId || "")) return null;
    return {
      request_id: body.requestId, display_name: name, course_id: body.courseId,
      rating: body.rating, feedback, consent_public: body.publicConsent === true,
      approved: false,
    };
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) return null;
  if (body.kind === "enquiry") {
    const phone = typeof body.phone === "string" ? body.phone.replace(/[ ()-]/g, "") : "";
    if (!name || !UUID.test(body.requestId || "") || phone && !/^\+?\d{7,15}$/.test(phone)) return null;
    return { request_id: body.requestId, display_name: name, email, phone };
  }
  return { kind: body.kind, email, display_name: name, consent_version: "interest-v1" };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const config = configuration();
  if (req.method === "GET" && req.query?.action !== "feedback") {
    return res.status(200).json({ enabled: config.enabled, supportEmail: config.supportEmail });
  }
  if (!config.enabled) {
    if (req.method === "GET") return res.status(200).json({ feedback: [] });
    return res.status(503).json({ error: "Registration needs owner setup. Nothing has been submitted." });
  }
  if (req.method === "POST") {
    if (req.headers.origin !== config.origin || req.headers["sec-fetch-site"] === "cross-site") {
      return res.status(403).json({ error: "Submit this form from the KR7Tech website." });
    }
    const record = validate(req.body);
    if (!record) return res.status(400).json({ error: "Check the form fields and provide the required consent." });
    try {
      const ip = process.env.VERCEL ? req.headers["x-vercel-forwarded-for"]
        : process.env.RENDER ? req.headers["true-client-ip"] : req.socket?.remoteAddress;
      const fingerprint = crypto.createHmac("sha256", process.env.COMMUNITY_FORM_SECRET)
        .update(typeof ip === "string" ? ip.split(",")[0].trim() : "unknown").digest("hex");
      const permitted = await supabaseRest("rpc/kr7_take_community_slot", {
        method: "POST", body: JSON.stringify({ p_fingerprint: fingerprint }),
      });
      if (permitted !== true) {
        res.setHeader("Retry-After", "3600");
        return res.status(429).json({ error: "Too many submissions. Please try again in an hour." });
      }
      await supabaseRest(req.body.kind === "feedback"
        ? "kr7_learner_feedback?on_conflict=request_id"
        : req.body.kind === "enquiry" ? "kr7_contact_requests?on_conflict=request_id"
        : "kr7_community_interest?on_conflict=kind,email", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(record),
      });
      return res.status(202).json({ message: MESSAGES[req.body.kind] });
    } catch {
      return res.status(503).json({ error: "Could not confirm your submission. Please try again later." });
    }
  }
  try {
    const rows = await supabaseRest("kr7_learner_feedback?approved=eq.true&consent_public=eq.true&select=display_name,course_id,rating,feedback&order=created_at.desc&limit=12");
    return res.status(200).json({
      feedback: rows.map(row => ({
        name: row.display_name, courseId: row.course_id, rating: row.rating, feedback: row.feedback,
      })),
    });
  } catch {
    return res.status(503).json({ error: "Feedback is temporarily unavailable." });
  }
};
