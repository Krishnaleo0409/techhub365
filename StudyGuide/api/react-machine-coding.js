const { sendError, supabaseUrl, authenticatedUser } = require("./_shared");
const { learningAccess, learningData } = require("./_learning-content");
const projectBank = require("./_project-questions");
const { mongoEnabled } = require("./_mongo");
const { consumeGrant } = require("./_pin-grants");
const { FREE_PREVIEW_LIMIT, hasInterviewAccess } = require("./_pro-policy");

const COMPANY = "React";
const TOPIC = "React Machine Coding";

function sessionCookie(req) {
  const raw = req.headers.cookie || "";
  const value = raw.split(";").map(item => item.trim())
    .find(item => item.startsWith("visual_pro_session="))
    ?.slice("visual_pro_session=".length);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function userFromCookie(req) {
  if (mongoEnabled()) return authenticatedUser(req);
  const token = sessionCookie(req);
  if (!token) return null;
  const response = await fetch(supabaseUrl("/auth/v1/user"), {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user.id === "string" ? user : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const questionId = req.query?.questionId;
    if (questionId !== undefined && (typeof questionId !== "string" || !questionId || questionId.length > 200)) {
      return res.status(400).json({ error: "Choose a valid question." });
    }
    const cookieAccess = questionId ? consumeGrant(req, `react:${questionId}`) : false;
    const [{ user, entitlements, verificationUnavailable }, questions] = await Promise.all([
      learningAccess(req, { skip: cookieAccess, authenticate: userFromCookie }),
      learningData(
        `questions?company=eq.${encodeURIComponent(COMPANY)}&topic=eq.${encodeURIComponent(TOPIC)}&select=id,company,topic,question,answer,example,is_free&order=question.asc`,
        projectBank.react),
    ]);
    const isPro = hasInterviewAccess(entitlements);
    const freeQuestions = questions.slice(0, FREE_PREVIEW_LIMIT);
    const freeIds = new Set(freeQuestions.map(question => question.id));
    const premiumQuestions = questions.filter(question => !freeIds.has(question.id));
    let visibleQuestions = isPro ? [...freeQuestions, ...premiumQuestions] : freeQuestions;
    if (questionId) {
      const selected = questions.find(question => String(question.id) === questionId);
      if (!selected) return res.status(404).json({ error: "Question not found." });
      if (!isPro && !cookieAccess && !freeIds.has(selected.id)) {
        return res.status(403).json({ error: "Enter the PIN for this Pro challenge." });
      }
      visibleQuestions = [selected];
    }
    const locked = isPro || questionId ? [] : premiumQuestions.map(({ id }) => ({ id }));

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).json({
      questions: visibleQuestions,
      locked,
      total: questions.length,
      freeCount: freeQuestions.length,
      access: { signedIn: Boolean(user), premium: isPro,
        ...(verificationUnavailable ? { verificationUnavailable: true } : {}) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};
