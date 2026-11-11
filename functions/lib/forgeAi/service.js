/**
 * Forge AI Operations Copilot — orchestration and callables.
 *
 * Every entry point: authenticate -> resolve the department (membership is
 * verified server-side; the id in the request only selects) -> load the
 * department's Forge AI settings -> check the capability's permissions ->
 * retrieve through a read-only service -> grounded model request -> validate
 * -> persist with sources -> usage + audit log.
 *
 * Data (all under departments/{departmentId}/, written only here):
 *   forgeAiSettings/main, forgeAiConversations, forgeAiMessages,
 *   forgeAiMessageSources, forgeAiUsage/{YYYY-MM-DD}, forgeAiUsageLogs,
 *   forgeAiFeedback, forgeAiBriefings
 * Forge AI never writes to operational records.
 */
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { assertDepartmentAccess, isPlatformCreator, memberPermissions } = require("../access");
const { CAPABILITIES, CAPABILITY_IDS, PERMISSIONS, byId, capabilityAccess, capabilityOn } = require("./capabilities");
const { classify } = require("./router");
const { parseQuestion } = require("./query");
const { generate, generateWeb } = require("./model");
const { validateOutput } = require("./validate");
const { loadProfile } = require("./records");
const { safeTimeZone, localParts } = require("../heatZone/time");

const SERVICES = {
  incident: (ctx) => require("./services/incident").run(ctx),
  dispatch: (ctx) => require("./services/incident").runDispatch(ctx),
  heatZone: (ctx) => require("./services/heatZone").run(ctx),
  units: (ctx) => require("./services/units").run(ctx),
  briefing: (ctx) => require("./services/briefing").run(ctx),
  nerisQuality: (ctx) => require("./services/quality").runNerisQuality(ctx),
  supervisorQa: (ctx) => require("./services/quality").runSupervisorQa(ctx),
  knowledge: (ctx) => require("./services/knowledge").run(ctx),
  web: (ctx) => require("./services/web").run(ctx),
};
const DEFAULT_DAYS = { incident: 7, dispatch: 7, heatZone: 30, units: 7, briefing: 1, nerisQuality: 30, supervisorQa: 7, knowledge: 7 };
const DEFAULT_DAILY_LIMIT = 300;
const MAX_MESSAGE_CHARS = 2000;
const MAX_SOURCES_RETURNED = 80;
const MODULE = "Forge AI";

const text = (v, max = 300) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max));
const nowIso = () => new Date().toISOString();

const paths = {
  settings: (d) => `departments/${d}/forgeAiSettings/main`,
  conversations: (d) => `departments/${d}/forgeAiConversations`,
  messages: (d) => `departments/${d}/forgeAiMessages`,
  sources: (d) => `departments/${d}/forgeAiMessageSources`,
  usage: (d, day) => `departments/${d}/forgeAiUsage/${day}`,
  usageDays: (d) => `departments/${d}/forgeAiUsage`,
  usageLogs: (d) => `departments/${d}/forgeAiUsageLogs`,
  feedback: (d) => `departments/${d}/forgeAiFeedback`,
  briefings: (d) => `departments/${d}/forgeAiBriefings`,
  audit: (d) => `departments/${d}/auditLogs`,
};

function cleanId(value, label = "id") {
  const id = text(value, 200);
  if (!id || id.includes("/") || id === "." || id === "..") throw new HttpsError("invalid-argument", `${label} is required.`);
  return id;
}

// ------------------------------------------------------------------ caller

function normalizeSettings(raw = {}) {
  const capabilities = {};
  for (const cap of CAPABILITIES) {
    if (typeof raw?.capabilities?.[cap.id] === "boolean") capabilities[cap.id] = raw.capabilities[cap.id];
    // Off-by-default capabilities are always stored explicitly.
    else if (cap.defaultOff) capabilities[cap.id] = false;
  }
  const limit = Number(raw?.dailyLimit);
  return {
    enabled: raw?.enabled === true,
    capabilities,
    dailyLimit: Number.isInteger(limit) && limit >= 1 && limit <= 5000 ? limit : DEFAULT_DAILY_LIMIT,
    updatedAt: text(raw?.updatedAt, 40) || null,
    updatedBy: text(raw?.updatedBy, 120) || null,
  };
}

/**
 * Verify the caller and load what Forge AI needs to know about them.
 * Fails closed: no auth -> unauthenticated; not an active member of an active
 * department -> permission-denied / failed-precondition (from access.js).
 */
async function resolveCaller(db, request) {
  if (!request?.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  const departmentId = cleanId(request.data?.departmentId, "departmentId");
  await assertDepartmentAccess(db, departmentId, request.auth);
  const [permissions, creator, entitlements, settingsSnap, profile] = await Promise.all([
    memberPermissions(db, departmentId, request.auth),
    isPlatformCreator(db, request.auth),
    db.doc(`platformEntitlements/${departmentId}`).get(),
    db.doc(paths.settings(departmentId)).get(),
    loadProfile(db, departmentId),
  ]);
  const modules = Array.isArray(entitlements.data()?.modules) ? entitlements.data().modules : null;
  const settings = normalizeSettings(settingsSnap.data());
  const has = (key) => creator || permissions[key] === true;
  return {
    departmentId,
    uid: request.auth.uid,
    auth: request.auth,
    actorName: text(request.auth.token?.email, 200) || request.auth.uid,
    permissions,
    isCreator: creator,
    modules,
    settings,
    profile: { ...profile, timeZone: safeTimeZone(profile.timezone) },
    can: { use: has(PERMISSIONS.use), manage: has(PERMISSIONS.manage), usage: has(PERMISSIONS.usage) || has(PERMISSIONS.manage) },
  };
}

function accessInput(caller) {
  return { permissions: caller.permissions, isCreator: caller.isCreator, modules: caller.modules, settings: caller.settings };
}

function capabilityList(caller) {
  return CAPABILITIES.map((cap) => {
    const access = capabilityAccess(cap, accessInput(caller));
    return { id: cap.id, label: cap.label, description: cap.description, allowed: access.allowed, reason: access.reason, suggestions: access.allowed ? cap.suggestions : [] };
  });
}

async function audit(db, caller, action, summary, details = {}) {
  await db.collection(paths.audit(caller.departmentId)).add({
    action,
    module: MODULE,
    recordId: details.recordId || "forge-ai",
    summary,
    details,
    actorUid: caller.uid,
    actorName: caller.actorName,
    created_at: nowIso(),
  }).catch((error) => console.error("forge ai audit write failed", caller.departmentId, error?.message));
}

// ------------------------------------------------------------------ usage

function dayKey(timeZone, now = Date.now()) {
  return localParts(now, timeZone).date;
}

async function reserveUse(db, caller, now) {
  const ref = db.doc(paths.usage(caller.departmentId, dayKey(caller.profile.timeZone, now)));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.requests || 0);
    if (count >= caller.settings.dailyLimit) {
      throw new HttpsError("resource-exhausted", "Your department has reached today's Forge AI limit. Try again tomorrow, or ask an administrator to raise it.");
    }
    tx.set(ref, { departmentId: caller.departmentId, day: ref.id, requests: count + 1, updatedAt: nowIso() }, { merge: true });
  });
  return ref;
}

async function recordUsage(db, caller, usageRef, entry) {
  const inc = FieldValue.increment;
  await Promise.all([
    usageRef.set({
      [entry.generatedBy === "model" ? "modelAnswers" : entry.generatedBy === "policy" ? "policyAnswers" : "ruleAnswers"]: inc(1),
      ...(entry.outcome === "error" ? { errors: inc(1) } : {}),
      byCapability: { [entry.capability]: inc(1) },
      inputTokens: inc(entry.inputTokens || 0),
      outputTokens: inc(entry.outputTokens || 0),
      ...(entry.webSearches ? { webSearches: inc(entry.webSearches) } : {}),
      updatedAt: nowIso(),
    }, { merge: true }),
    db.collection(paths.usageLogs(caller.departmentId)).add({
      departmentId: caller.departmentId,
      uid: caller.uid,
      actorName: caller.actorName,
      capability: entry.capability,
      generatedBy: entry.generatedBy,
      model: entry.model || "",
      outcome: entry.outcome,
      fallbackReason: entry.fallbackReason || "",
      latencyMs: entry.latencyMs,
      inputTokens: entry.inputTokens || 0,
      outputTokens: entry.outputTokens || 0,
      webSearches: entry.webSearches || 0,
      sourceCount: entry.sourceCount || 0,
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      createdAt: nowIso(),
    }),
  ]).catch((error) => console.error("forge ai usage write failed", caller.departmentId, error?.message));
}

// ------------------------------------------------------------------ answers

function windowFor(capability, message, caller, now) {
  const q = parseQuestion(message, { timeZone: caller.profile.timeZone, now, defaultDays: DEFAULT_DAYS[capability] || 7 });
  if (capability === "briefing" && !q.window.explicit) {
    if (/\bcommand\b|\bweek(ly)?\b/i.test(message)) {
      q.window = parseQuestion("last 7 days", { timeZone: caller.profile.timeZone, now }).window;
    } else {
      q.window = parseQuestion("last 24 hours", { timeZone: caller.profile.timeZone, now }).window;
    }
  }
  return q;
}

/** Final answer from validated model output, or from the records alone. */
function composeAnswer(retrieval, validated) {
  const fromModel = Boolean(validated?.ok);
  const notes = new Map((validated?.sectionNotes || []).map((n) => [n.sectionId, n.text]));
  const observations = fromModel ? validated.observations : [];
  const sections = (retrieval.sections || [])
    .map((s) => {
      let body = notes.get(s.id) || (s.ai && s.id !== "executiveSummary" ? "" : s.fallback || "");
      if (s.id === "dataLimitations") body = retrieval.limitations.map((l) => `- ${l}`).join("\n");
      if ((s.id === "notableObservations" || s.id === "observations") && observations.length) body = observations.map((o) => `- ${o}`).join("\n");
      return { id: s.id, title: s.title, text: body, ai: Boolean(s.ai) && (notes.has(s.id) || s.id === "notableObservations" || s.id === "observations") };
    })
    .filter((s) => s.text);
  const text = fromModel && validated.answer ? validated.answer : retrieval.fallbackAnswer;
  return {
    text,
    // Don't repeat the answer as its own summary section.
    sections: sections.filter((s) => !(s.id === "executiveSummary" && s.text.trim() === String(text || "").trim())),
    observations: retrieval.capability === "supervisorQa" || retrieval.capability === "briefing" ? [] : observations,
    tables: retrieval.tables || [],
    limitations: retrieval.limitations || [],
    followUps: fromModel ? validated.followUps : [],
    citedSourceIds: fromModel ? validated.citedSourceIds : [...new Set([...(retrieval.fallbackAnswer || "").matchAll(/\[(S\d+)\]/g)].map((m) => m[1]))],
  };
}

// Firestore can't store arrays inside arrays, so table rows are saved as
// { cells: [...] } and turned back into arrays when read.
function storableTables(tables = []) {
  return tables.map((t) => ({ ...t, rows: (t.rows || []).map((row) => ({ cells: row })) }));
}

function readableMessage(message) {
  const tables = message.answer?.tables;
  if (!Array.isArray(tables)) return message;
  return {
    ...message,
    answer: { ...message.answer, tables: tables.map((t) => ({ ...t, rows: (t.rows || []).map((row) => (Array.isArray(row) ? row : row?.cells || [])) })) },
  };
}

function policyAnswer(reason) {
  return { text: `I can't answer that here: ${reason}`, sections: [], observations: [], tables: [], limitations: [], followUps: [], citedSourceIds: [] };
}

async function loadOwnConversation(db, caller, conversationId) {
  const ref = db.doc(`${paths.conversations(caller.departmentId)}/${cleanId(conversationId, "conversationId")}`);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || data.departmentId !== caller.departmentId || data.ownerUid !== caller.uid || data.archived === true) {
    throw new HttpsError("not-found", "That conversation isn't available.");
  }
  return { ref, data };
}

/**
 * forgeAiAsk. options.getClient() returns an Anthropic client or null (no key /
 * offline); options.now is for tests.
 */
async function ask(db, request, options = {}) {
  const started = Date.now();
  const now = options.now ?? Date.now();
  const caller = await resolveCaller(db, request);
  if (!caller.can.use) throw new HttpsError("permission-denied", "You don't have access to Forge AI.");
  if (!caller.settings.enabled) {
    throw new HttpsError("failed-precondition", "Forge AI is turned off for your department. An administrator can turn it on under Forge AI → Admin.");
  }
  const message = text(request.data?.message, MAX_MESSAGE_CHARS);
  if (!message) throw new HttpsError("invalid-argument", "Type a question first.");
  const requested = text(request.data?.capability, 40);
  if (requested && !CAPABILITY_IDS.includes(requested)) throw new HttpsError("invalid-argument", "Unknown capability.");
  const list = capabilityList(caller);
  const allowedIds = list.filter((c) => c.allowed).map((c) => c.id);
  const capability = requested || classify(message, allowedIds).capability;
  const access = capabilityAccess(capability, accessInput(caller));
  const context = { reportId: text(request.data?.context?.reportId, 300).replace(/\//g, "") };

  // Conversation (the caller's own, or a new one).
  let conversation;
  if (request.data?.conversationId) {
    conversation = await loadOwnConversation(db, caller, request.data.conversationId);
  } else {
    const ref = db.collection(paths.conversations(caller.departmentId)).doc();
    const data = { departmentId: caller.departmentId, ownerUid: caller.uid, title: message.replace(/\s+/g, " ").slice(0, 70), capability, messageCount: 0, archived: false, createdAt: nowIso(), updatedAt: nowIso() };
    conversation = { ref, data, isNew: true };
  }

  const usageRef = await reserveUse(db, caller, now);
  let retrieval = null;
  let answer;
  let generatedBy = "rules";
  let model = "";
  let fallbackReason = "";
  let usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
  let outcome = "ok";

  if (!access.allowed) {
    answer = policyAnswer(access.reason);
    generatedBy = "policy";
    outcome = "denied";
  } else {
    const ctx = {
      db,
      departmentId: caller.departmentId,
      auth: caller.auth,
      message,
      query: windowFor(capability, message, caller, now),
      context,
      timeZone: caller.profile.timeZone,
      now,
      accessInput: accessInput(caller),
    };
    try {
      retrieval = await SERVICES[capability](ctx);
    } catch (error) {
      if (error instanceof HttpsError && ["permission-denied", "not-found", "invalid-argument"].includes(error.code)) {
        answer = policyAnswer(error.message);
        generatedBy = "policy";
        outcome = "denied";
      } else {
        console.error("forge ai retrieval failed", capability, error);
        await recordUsage(db, caller, usageRef, { capability, generatedBy: "rules", outcome: "error", latencyMs: Date.now() - started, conversationId: conversation.ref.id, messageId: "" });
        throw new HttpsError("internal", "Forge AI couldn't read the records just now. Try again.");
      }
    }
    if (retrieval?.webSearch) {
      // Web Research: only the question goes out; no department records.
      const web = require("./services/web");
      let validated = null;
      const client = options.getClient?.();
      if (!client) {
        fallbackReason = "model-not-configured";
      } else {
        try {
          const result = await generateWeb(client, {
            question: message,
            department: { name: caller.profile.name, timeZone: caller.profile.timeZone, now: `${localParts(now, caller.profile.timeZone).date}` },
          });
          usage = { ...result.usage, webSearches: result.searches };
          validated = validateOutput(web.toOutput(retrieval, result), { knownSourceIds: retrieval.book.ids(), sectionIds: [], capability });
          if (validated.ok) {
            generatedBy = "model";
            model = result.model;
          } else {
            fallbackReason = "invalid-output";
            validated = null;
          }
        } catch (error) {
          if (error?.usage) usage = error.usage;
          // A 400 here usually means web search is turned off for the API organization.
          fallbackReason = error?.reason || (error?.status === 400 ? "web-search-unavailable" : "model-error");
          console.warn("forge ai web research unavailable", fallbackReason, error?.status || "");
        }
        if (!validated) retrieval.fallbackAnswer = web.UNAVAILABLE;
      }
      answer = composeAnswer(retrieval, validated);
    } else if (retrieval) {
      let validated = null;
      const client = retrieval.empty ? null : options.getClient?.();
      if (!client) {
        fallbackReason = retrieval.empty ? "no-data" : "model-not-configured";
      } else {
        try {
          const result = await generate(client, {
            question: message,
            retrieval,
            department: { name: caller.profile.name, timeZone: caller.profile.timeZone, now: `${localParts(now, caller.profile.timeZone).date}` },
          });
          usage = result.usage;
          validated = validateOutput(result.output, {
            knownSourceIds: retrieval.book.ids(),
            sectionIds: (retrieval.sections || []).map((s) => s.id),
            capability,
          });
          if (validated.ok) {
            generatedBy = "model";
            model = result.model;
          } else {
            fallbackReason = "invalid-output";
            validated = null;
          }
        } catch (error) {
          fallbackReason = error?.reason || error?.constructor?.name || "model-error";
          console.warn("forge ai model unavailable; answering from records", capability, fallbackReason, error?.status || "");
        }
      }
      answer = composeAnswer(retrieval, validated);
    }
  }

  // Persist: conversation, both messages, sources.
  const createdAt = nowIso();
  const messages = db.collection(paths.messages(caller.departmentId));
  const userRef = messages.doc();
  const assistantRef = messages.doc();
  const sources = retrieval ? retrieval.book.items.slice(0, MAX_SOURCES_RETURNED) : [];
  const cited = new Set(answer.citedSourceIds);
  const sourceView = sources.map((s) => ({ ...s, cited: cited.has(s.id) }));
  const assistant = {
    departmentId: caller.departmentId,
    conversationId: conversation.ref.id,
    ownerUid: caller.uid,
    role: "assistant",
    capability,
    title: retrieval?.title || byId(capability)?.label || "Forge AI",
    text: answer.text,
    answer: { sections: answer.sections, observations: answer.observations, tables: answer.tables, limitations: answer.limitations, followUps: answer.followUps },
    sources: sourceView,
    sourceIds: sourceView.map((s) => s.id),
    generatedBy,
    model,
    fallbackReason,
    liveness: retrieval?.liveness || "none",
    dataAsOf: createdAt,
    window: retrieval && capability !== "knowledge" && capability !== "web" ? (() => { const w = windowFor(capability, message, caller, now).window; return { from: w.from, to: w.to, label: w.label }; })() : null,
    createdAt,
  };
  const batch = db.batch();
  batch.set(conversation.ref, conversation.isNew
    ? { ...conversation.data, messageCount: 2, updatedAt: createdAt }
    : { updatedAt: createdAt, capability, messageCount: FieldValue.increment(2) }, { merge: true });
  batch.set(userRef, { departmentId: caller.departmentId, conversationId: conversation.ref.id, ownerUid: caller.uid, role: "user", capability, text: message, context, createdAt });
  batch.set(assistantRef, { ...assistant, answer: { ...assistant.answer, tables: storableTables(assistant.answer.tables) } });
  for (const s of sourceView.slice(0, 200)) {
    batch.set(db.collection(paths.sources(caller.departmentId)).doc(), { ...s, sourceId: s.id, departmentId: caller.departmentId, conversationId: conversation.ref.id, messageId: assistantRef.id, ownerUid: caller.uid, createdAt });
  }
  await batch.commit();

  if (capability === "briefing" && retrieval && outcome === "ok") {
    await db.collection(paths.briefings(caller.departmentId)).add({
      departmentId: caller.departmentId,
      kind: retrieval.briefingKind || "shift",
      title: assistant.title,
      window: assistant.window,
      summary: answer.text,
      sections: answer.sections,
      sourceCount: sourceView.length,
      generatedBy,
      model,
      messageId: assistantRef.id,
      conversationId: conversation.ref.id,
      createdBy: caller.uid,
      createdByName: caller.actorName,
      createdAt,
    }).catch((error) => console.error("forge ai briefing save failed", error?.message));
  }

  await recordUsage(db, caller, usageRef, {
    capability, generatedBy, model, outcome, fallbackReason,
    latencyMs: Date.now() - started, ...usage, sourceCount: sourceView.length,
    conversationId: conversation.ref.id, messageId: assistantRef.id,
  });
  await audit(db, caller, "forge_ai.ask", `Forge AI ${byId(capability)?.label || capability} answer (${generatedBy})`, {
    recordId: assistantRef.id, capability, generatedBy, outcome, conversationId: conversation.ref.id, sourceCount: sourceView.length,
  });

  return {
    conversation: { id: conversation.ref.id, title: conversation.data.title || "" },
    userMessage: { id: userRef.id, role: "user", text: message, capability, createdAt },
    message: { id: assistantRef.id, ...assistant },
  };
}

// ------------------------------------------------------------------ bootstrap / history

async function bootstrap(db, request, options = {}) {
  const caller = await resolveCaller(db, request);
  if (!caller.can.use && !caller.can.manage && !caller.can.usage) throw new HttpsError("permission-denied", "You don't have access to Forge AI.");
  const capabilities = capabilityList(caller);
  const suggestions = capabilities.filter((c) => c.allowed).flatMap((c) => c.suggestions.slice(0, 2).map((s) => ({ capability: c.id, text: s }))).slice(0, 8);
  return {
    department: { id: caller.departmentId, name: caller.profile.name, timeZone: caller.profile.timeZone },
    enabled: caller.settings.enabled,
    canUse: caller.can.use,
    capabilities: capabilities.map(({ suggestions: s, ...rest }) => rest),
    suggestions: caller.settings.enabled && caller.can.use ? suggestions : [],
    admin: { manage: caller.can.manage, usage: caller.can.usage },
    modelConfigured: options.modelConfigured === true,
  };
}

async function listConversations(db, request) {
  const caller = await resolveCaller(db, request);
  if (!caller.can.use) throw new HttpsError("permission-denied", "You don't have access to Forge AI.");
  const snap = await db.collection(paths.conversations(caller.departmentId)).where("ownerUid", "==", caller.uid).limit(300).get();
  return {
    conversations: snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((c) => c.departmentId === caller.departmentId && c.archived !== true)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 100)
      .map(({ id, title, capability, updatedAt, createdAt, messageCount }) => ({ id, title, capability, updatedAt, createdAt, messageCount })),
  };
}

async function getConversation(db, request) {
  const caller = await resolveCaller(db, request);
  if (!caller.can.use) throw new HttpsError("permission-denied", "You don't have access to Forge AI.");
  const { ref, data } = await loadOwnConversation(db, caller, request.data?.conversationId);
  const snap = await db.collection(paths.messages(caller.departmentId)).where("conversationId", "==", ref.id).limit(500).get();
  const messages = snap.docs
    .map((doc) => readableMessage({ id: doc.id, ...doc.data() }))
    .filter((m) => m.ownerUid === caller.uid && m.departmentId === caller.departmentId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || (a.role === "user" ? -1 : 1));
  return { conversation: { id: ref.id, title: data.title, capability: data.capability, updatedAt: data.updatedAt }, messages };
}

async function renameConversation(db, request) {
  const caller = await resolveCaller(db, request);
  if (!caller.can.use) throw new HttpsError("permission-denied", "You don't have access to Forge AI.");
  const title = text(request.data?.title, 80);
  if (!title) throw new HttpsError("invalid-argument", "Enter a title.");
  const { ref } = await loadOwnConversation(db, caller, request.data?.conversationId);
  await ref.set({ title, updatedAt: nowIso() }, { merge: true });
  return { ok: true, title };
}

async function archiveConversation(db, request) {
  const caller = await resolveCaller(db, request);
  if (!caller.can.use) throw new HttpsError("permission-denied", "You don't have access to Forge AI.");
  const { ref } = await loadOwnConversation(db, caller, request.data?.conversationId);
  await ref.set({ archived: true, archivedAt: nowIso() }, { merge: true });
  return { ok: true };
}

async function feedback(db, request) {
  const caller = await resolveCaller(db, request);
  if (!caller.can.use) throw new HttpsError("permission-denied", "You don't have access to Forge AI.");
  const rating = request.data?.rating;
  if (!["up", "down"].includes(rating)) throw new HttpsError("invalid-argument", "Rating must be up or down.");
  const messageId = cleanId(request.data?.messageId, "messageId");
  const ref = db.doc(`${paths.messages(caller.departmentId)}/${messageId}`);
  const snap = await ref.get();
  const m = snap.data();
  if (!snap.exists || m.ownerUid !== caller.uid || m.departmentId !== caller.departmentId || m.role !== "assistant") {
    throw new HttpsError("not-found", "That answer isn't available.");
  }
  const comment = text(request.data?.comment, 1000);
  await Promise.all([
    db.doc(`${paths.feedback(caller.departmentId)}/${messageId}_${caller.uid}`).set({
      departmentId: caller.departmentId, messageId, conversationId: m.conversationId, uid: caller.uid, actorName: caller.actorName,
      rating, comment, capability: m.capability, generatedBy: m.generatedBy, createdAt: nowIso(),
    }),
    ref.set({ feedback: rating }, { merge: true }),
  ]);
  return { ok: true };
}

// ------------------------------------------------------------------ admin

async function requireAdmin(db, request, kind) {
  const caller = await resolveCaller(db, request);
  const allowed = kind === "manage" ? caller.can.manage : kind === "settings" ? caller.can.manage || caller.can.usage : caller.can.usage;
  if (!allowed) {
    throw new HttpsError("permission-denied", kind === "manage" ? "You don't have permission to manage Forge AI." : "You don't have permission to view Forge AI usage.");
  }
  return caller;
}

async function getSettings(db, request) {
  const caller = await requireAdmin(db, request, "settings");
  return { settings: caller.settings, capabilities: CAPABILITIES.map((cap) => ({ id: cap.id, label: cap.label, description: cap.description, defaultOff: Boolean(cap.defaultOff), enabled: capabilityOn(cap, caller.settings) })), canManage: caller.can.manage };
}

async function saveSettings(db, request) {
  const caller = await requireAdmin(db, request, "manage");
  const input = request.data?.settings || {};
  const next = normalizeSettings({
    enabled: input.enabled === true,
    capabilities: input.capabilities,
    dailyLimit: input.dailyLimit === undefined ? caller.settings.dailyLimit : Number(input.dailyLimit),
  });
  if (input.dailyLimit !== undefined && next.dailyLimit !== Number(input.dailyLimit)) {
    throw new HttpsError("invalid-argument", "The daily limit must be a whole number from 1 to 5000.");
  }
  const doc = { enabled: next.enabled, capabilities: next.capabilities, dailyLimit: next.dailyLimit, updatedAt: nowIso(), updatedBy: caller.actorName };
  await db.doc(paths.settings(caller.departmentId)).set(doc);
  const changes = [];
  if (caller.settings.enabled !== next.enabled) changes.push(next.enabled ? "turned on" : "turned off");
  for (const cap of CAPABILITIES) {
    const after = capabilityOn(cap, next);
    if (capabilityOn(cap, caller.settings) !== after) changes.push(`${cap.label} ${after ? "on" : "off"}`);
  }
  if (caller.settings.dailyLimit !== next.dailyLimit) changes.push(`daily limit ${next.dailyLimit}`);
  await audit(db, caller, "forge_ai.settings", `Forge AI settings: ${changes.join(", ") || "saved"}`, { recordId: "forgeAiSettings", before: caller.settings, after: doc });
  return { settings: normalizeSettings(doc) };
}

async function usageReport(db, request) {
  const caller = await requireAdmin(db, request, "usage");
  const d = caller.departmentId;
  const [daysSnap, logsSnap, feedbackSnap, auditSnap] = await Promise.all([
    db.collection(paths.usageDays(d)).limit(400).get(),
    db.collection(paths.usageLogs(d)).orderBy("createdAt", "desc").limit(100).get(),
    db.collection(paths.feedback(d)).orderBy("createdAt", "desc").limit(50).get(),
    db.collection(paths.audit(d)).where("module", "==", MODULE).limit(300).get(),
  ]);
  const days = daysSnap.docs.map((doc) => ({ day: doc.id, ...doc.data() }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 30)
    .map((x) => ({ day: x.day, requests: x.requests || 0, modelAnswers: x.modelAnswers || 0, ruleAnswers: x.ruleAnswers || 0, policyAnswers: x.policyAnswers || 0, errors: x.errors || 0, inputTokens: x.inputTokens || 0, outputTokens: x.outputTokens || 0, webSearches: x.webSearches || 0, byCapability: x.byCapability || {} }));
  return {
    dailyLimit: caller.settings.dailyLimit,
    days,
    logs: logsSnap.docs.map((doc) => {
      const x = doc.data();
      return { id: doc.id, createdAt: x.createdAt, actorName: x.actorName, capability: x.capability, generatedBy: x.generatedBy, outcome: x.outcome, fallbackReason: x.fallbackReason, latencyMs: x.latencyMs, inputTokens: x.inputTokens, outputTokens: x.outputTokens, webSearches: x.webSearches || 0, sourceCount: x.sourceCount };
    }),
    feedback: feedbackSnap.docs.map((doc) => {
      const x = doc.data();
      return { id: doc.id, createdAt: x.createdAt, actorName: x.actorName, rating: x.rating, comment: x.comment, capability: x.capability, generatedBy: x.generatedBy };
    }),
    audit: auditSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .map((x) => ({ id: x.id, createdAt: x.created_at || x.createdAt || "", action: x.action, summary: x.summary, actorName: x.actorName }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100),
  };
}

module.exports = {
  DEFAULT_DAILY_LIMIT,
  archiveConversation,
  ask,
  bootstrap,
  composeAnswer,
  feedback,
  getConversation,
  getSettings,
  listConversations,
  normalizeSettings,
  renameConversation,
  resolveCaller,
  saveSettings,
  usageReport,
};
