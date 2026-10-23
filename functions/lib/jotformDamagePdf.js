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

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer.slice(0, 4).toString() === "%PDF";
}

async function tryDownloadPdf(url, apiKey, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { APIKEY: apiKey },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isPdfBuffer(buffer)) return null;
    return buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeReports(content) {
  if (!content) return [];
  if (Array.isArray(content)) return content;
  if (typeof content === "object") return Object.values(content);
  return [];
}

async function resolveReportId(formId, apiKey, preferredReportId = "") {
  if (preferredReportId) return String(preferredReportId).trim();

  const { response, json } = await jotformRequest(`/form/${formId}/reports`, apiKey);
  if (!response.ok || json?.responseCode && Number(json.responseCode) >= 400) {
    return "";
  }

  const reports = normalizeReports(json?.content);
  if (!reports.length) return "";

  const pdfReport = reports.find((report) => String(report.type || "").toUpperCase() === "PDF")
    || reports.find((report) => /pdf/i.test(String(report.type || report.title || "")))
    || reports[0];
  return String(pdfReport?.id || "").trim();
}

function buildPdfAttemptUrls(formId, submissionId, reportId = "") {
  const attempts = [];
  if (reportId) {
    attempts.push(
      `https://api.jotform.com/generatePDF?formid=${encodeURIComponent(formId)}&submissionid=${encodeURIComponent(submissionId)}&reportid=${encodeURIComponent(reportId)}&download=1`,
      `https://api.jotform.com/generatePDF?formid=${encodeURIComponent(formId)}&submissionID=${encodeURIComponent(submissionId)}&reportid=${encodeURIComponent(reportId)}&download=1`,
    );
  }
  attempts.push(
    `https://api.jotform.com/pdf-converter/${encodeURIComponent(formId)}/fill-pdf?download=1&submissionID=${encodeURIComponent(submissionId)}`,
    `https://api.jotform.com/generatePDF?formid=${encodeURIComponent(formId)}&submissionid=${encodeURIComponent(submissionId)}&download=1`,
  );
  return attempts;
}

async function fetchJotformSubmissionPdf(formId, submissionId, apiKey, reportId = "") {
  if (!formId || !submissionId || !apiKey) {
    throw new Error("JotForm PDF requires form ID, submission ID, and API key.");
  }

  const resolvedReportId = reportId || await resolveReportId(formId, apiKey, "");
  const attempts = buildPdfAttemptUrls(formId, submissionId, resolvedReportId);
  const results = await Promise.all(attempts.map((url) => tryDownloadPdf(url, apiKey)));
  const buffer = results.find(Boolean);
  if (buffer) {
    return { buffer, reportId: resolvedReportId };
  }

  throw new Error("JotForm could not generate the PDF for this submission.");
}

async function fetchReportOptions(formId, apiKey) {
  const { response, json } = await jotformRequest(`/form/${formId}/reports`, apiKey);
  if (!response.ok) return [];
  return normalizeReports(json?.content).map((report) => ({
    id: String(report.id || ""),
    title: String(report.title || report.name || "PDF report"),
    type: String(report.type || ""),
  })).filter((report) => report.id);
}

function buildPublicPdfUrls(formId, submissionId) {
  if (!submissionId) return { pdfUrl: "", publicPdfUrl: "", viewerUrl: "" };
  const publicPdfUrl = `https://www.jotform.com/pdf-submission/${submissionId}`;
  const pdfUrl = formId
    ? `https://www.jotform.com/server.php?action=getSubmissionPDF&sid=${submissionId}&formID=${formId}`
    : publicPdfUrl;
  return { pdfUrl, publicPdfUrl, viewerUrl: publicPdfUrl };
}

module.exports = {
  buildPublicPdfUrls,
  buildPdfAttemptUrls,
  fetchJotformSubmissionPdf,
  fetchReportOptions,
  resolveReportId,
};
