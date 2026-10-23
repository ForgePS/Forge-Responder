const { formatAnswerValue, pickSubmitter, buildTitle } = require("./jotformDamageStore");
const { buildPublicPdfUrls } = require("./jotformDamagePdf");

async function jotformRequest(path, apiKey, options = {}) {
  const response = await fetch(`https://api.jotform.com${path}`, {
    ...options,
    headers: {
      APIKEY: apiKey,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { response, json, text };
}

function parseApiAnswers(content = {}) {
  const skipTypes = new Set([
    "control_head",
    "control_button",
    "control_pagebreak",
    "control_divider",
    "control_collapse",
    "control_text",
  ]);
  const answersObject = content.answers || {};
  return Object.entries(answersObject)
    .map(([questionId, question]) => {
      if (!question || typeof question !== "object") return null;
      if (skipTypes.has(String(question.type || ""))) return null;
      const label = String(question.text || question.name || `Question ${questionId}`).trim();
      const value = formatAnswerValue(question.prettyFormat ?? question.answer);
      if (!value) return null;
      return {
        field: question.name || `q${questionId}`,
        label,
        value,
        order: Number(question.order || questionId) || 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order)
    .map(({ field, label, value }) => ({ field, label, value }));
}

function buildRecordFromApiSubmission(content = {}, settings = {}, existing = {}) {
  const submissionId = String(content.id || existing.submissionId || "").trim();
  const formId = String(content.form_id || existing.formId || settings.formId || "").trim();
  const answers = parseApiAnswers(content);
  const { submitterName, submitterEmail } = pickSubmitter(answers);
  const title = buildTitle(answers, submissionId) || existing.title || settings.formTitle || "Damage Form";
  const summary = answers.find((item) => /what is damaged|description of the damage|damage description/i.test(item.label))?.value
    || existing.summary
    || answers[0]?.value
    || "";
  const pdfLinks = buildPublicPdfUrls(formId, submissionId);
  const createdAt = content.created_at || content.createdAt || existing.submittedAt;

  return {
    source: "jotform",
    submissionId,
    formId,
    formUrl: settings.formUrl || existing.formUrl || (formId ? `https://form.jotform.com/${formId}` : ""),
    formTitle: settings.formTitle || existing.formTitle || "Report of Property or Equipment Lost or Damaged",
    title,
    summary,
    submittedAt: createdAt ? new Date(createdAt).toISOString() : existing.submittedAt || new Date().toISOString(),
    submitterName: submitterName || existing.submitterName || "",
    submitterEmail: submitterEmail || existing.submitterEmail || "",
    answers,
    viewUrl: submissionId ? `https://www.jotform.com/submission/${submissionId}` : existing.viewUrl || "",
    pdfUrl: pdfLinks.pdfUrl || existing.pdfUrl || "",
    publicPdfUrl: pdfLinks.publicPdfUrl || existing.publicPdfUrl || "",
    receivedAt: existing.receivedAt || new Date().toISOString(),
    enrichedFromApi: true,
    enrichedAt: new Date().toISOString(),
  };
}

async function fetchSubmissionFromApi(submissionId, apiKey) {
  const { response, json } = await jotformRequest(`/submission/${encodeURIComponent(submissionId)}`, apiKey);
  if (!response.ok || (json?.responseCode && Number(json.responseCode) >= 400)) {
    throw new Error(json?.message || "Could not load the JotForm submission.");
  }
  return json?.content || {};
}

async function fetchRecentFormSubmissions(formId, apiKey, limit = 25) {
  const { response, json } = await jotformRequest(
    `/form/${encodeURIComponent(formId)}/submissions?limit=${limit}&orderby=created_at&direction=DESC`,
    apiKey
  );
  if (!response.ok || (json?.responseCode && Number(json.responseCode) >= 400)) {
    throw new Error(json?.message || "Could not load JotForm submissions.");
  }
  if (Array.isArray(json?.content)) return json.content;
  if (json?.content && typeof json.content === "object") return Object.values(json.content);
  return [];
}

async function enrichDamageFormRecord(record = {}, settings = {}, apiKey = "") {
  if (!apiKey || !record.submissionId) return record;

  const content = await fetchSubmissionFromApi(record.submissionId, apiKey);
  const enriched = buildRecordFromApiSubmission(content, settings, record);
  return { ...record, ...enriched };
}

async function syncFormSubmissions(db, departmentId, settings = {}, apiKey = "", limit = 25) {
  const formId = String(settings.formId || "").trim();
  if (!formId || !apiKey) {
    throw new Error("JotForm sync requires a saved form URL and API key.");
  }

  const submissions = await fetchRecentFormSubmissions(formId, apiKey, limit);
  const saved = [];

  for (const submission of submissions) {
    const submissionId = String(submission?.id || "").trim();
    if (!submissionId) continue;

    const parsed = buildRecordFromApiSubmission(submission, settings);
    const recordId = `jf-${submissionId}`;
    await db.doc(`departments/${departmentId}/damageForms/${recordId}`).set(parsed, { merge: true });
    saved.push({ id: recordId, ...parsed });
  }

  return { count: saved.length, records: saved };
}

module.exports = {
  buildRecordFromApiSubmission,
  enrichDamageFormRecord,
  fetchRecentFormSubmissions,
  fetchSubmissionFromApi,
  syncFormSubmissions,
};
