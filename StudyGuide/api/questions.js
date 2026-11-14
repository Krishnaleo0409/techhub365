const { sendError } = require("./_shared");
const { learningAccess, learningData } = require("./_learning-content");
const { consumeGrant } = require("./_pin-grants");
const { COURSES } = require("../learning-catalog");
const projectBank = require("./_project-questions");
const { mergeQuestions } = require("./_question-bank");
const { freePreviewIds, hasInterviewAccess } = require("./_pro-policy");
const { mongoEnabled } = require("./_mongo");

const TOPICS = new Set(COURSES.filter(course => course.kind === "Interview Q&A").map(course => course.topic));

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const topic = req.query?.topic;
  const questionId = req.query?.questionId;
  if (topic !== undefined && (typeof topic !== "string" || !TOPICS.has(topic))) {
    return res.status(400).json({ error: "Choose a supported interview subject." });
  }
  if (questionId !== undefined && (typeof questionId !== "string" || !questionId || questionId.length > 200)) {
    return res.status(400).json({ error: "Choose a valid question." });
  }
  try {
    const cookieAccess = questionId ? consumeGrant(req, topic ? `subject:${topic}:${questionId}` : `company:${questionId}`) : false;
    const topicFilter = topic ? `topic=eq.${encodeURIComponent(topic)}&` : "";
    const projectQuestions = topic ? projectBank.subjects.filter(item => item.topic === topic) : projectBank.companies;
    const [{ user, entitlements, verificationUnavailable }, results] = await Promise.all([
      learningAccess(req, { skip: cookieAccess }),
      learningData(`questions?${topicFilter}select=id,company,topic,question,answer,example,access_level,is_free&order=topic.asc,company.asc,id.asc`,
        projectQuestions),
    ]);
    const grantedTiers = new Set(entitlements.filter(item => item.active !== false).map(item => item.tier));
    const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
    const profile = user
      ? await learningData(`profiles?id=eq.${encodeURIComponent(user.id)}&select=is_admin`, [])
      : [];
    const result = topic
      ? mergeQuestions(results.filter(item => item.topic === topic), projectQuestions)
      : results;
    const hasPro = hasInterviewAccess(entitlements);
    const freeIds = freePreviewIds(result);
    const selected = questionId ? result.filter(item => String(item.id) === questionId) : result;
    if (questionId && !selected.length) return res.status(404).json({ error: "Question not found." });
    if (questionId && !hasPro && !cookieAccess && !freeIds.has(selected[0].id)) {
      return res.status(403).json({ error: "Enter the PIN for this Pro question." });
    }
    const visible = selected.filter(item =>
      hasPro || cookieAccess || freeIds.has(item.id),
    );
    const locked = selected
      .filter(item => !visible.includes(item))
      .map(({ id, company, topic }) => ({ id, company, topic }));

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).json({
      questions: visible.map(({ access_level, is_free, ...question }) => question),
      locked,
      access: {
        signedIn: Boolean(user),
        tiers: [...grantedTiers],
        premium: hasPro,
        pinActive: cookieAccess,
        isAdmin: adminIds.includes(user?.id) || profile?.[0]?.is_admin === true,
        ...(verificationUnavailable ? { verificationUnavailable: true } : {}),
        ...(mongoEnabled() && user ? { role: user.role } : {}),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};
