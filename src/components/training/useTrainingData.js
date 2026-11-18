import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { getFirestoreDb } from "../../lib/firebaseClient.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTenant } from "../../context/TenantContext.jsx";
import { hasPermission } from "../../lib/permissions.js";
import { resolveEmployeePerson } from "../../lib/employeePortalUtils.js";
import { TRAINING_COLLECTIONS as C, subscribeTraining } from "../../lib/training/trainingService.js";

export const TrainingContext = createContext(null);

export function useTraining() {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error("useTraining must be used inside the Training module.");
  return ctx;
}

/** Collections everyone with training access may list in full. */
const OPEN = ["records", "templates", "courses", "sessions", "skills", "taskBooks", "requirements", "ceRuleSets", "resources", "reservations", "standards", "settings"];

/**
 * Collections with private rows. Reviewers list them in full; everyone else lists
 * only their own rows (the rules refuse a query that could return someone else's).
 */
const PRIVATE = [
  { key: "evaluations", field: "personId", reviewer: (f) => f.canReview },
  { key: "taskBookAssignments", field: "personId", reviewer: (f) => f.canReview },
  { key: "ceAwards", field: "personId", reviewer: (f) => f.canApproveCe || f.canApprove || f.canConfigure },
  { key: "requests", field: "requesterUid", reviewer: (f) => f.canApprove || f.canConfigure, mine: "uid" },
  { key: "exemptions", field: "personId", reviewer: (f) => f.canView },
];

function subscribeMine(departmentId, name, field, value, onData, onError) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !value) { onData([]); return () => {}; }
  return onSnapshot(query(collection(db, "departments", departmentId, name), where(field, "==", value)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Permission flags the module uses everywhere. */
export function trainingFlags(permissions, isCreator) {
  // Only training permissions count (the rules check the same keys); managing department settings or IT does not open training records.
  const has = (k) => isCreator || hasPermission(permissions, k);
  const canConfigure = has("manageTrainingConfig");
  const canApprove = has("approveTraining");
  const canEdit = has("editTraining") || canApprove || canConfigure;
  const canEvaluate = has("evaluateSkills") || canApprove;
  const canApproveCe = has("approveCeCredits");
  return {
    canView: has("viewTraining") || canEdit || canEvaluate || canApproveCe,
    canEdit,
    canApprove,
    canEvaluate,
    canConfigure,
    canApproveCe,
    canReview: canApprove || canEvaluate || canConfigure || canApproveCe,
  };
}

export function useTrainingData({ personnel = [], certifications = [], legacyTraining = [] } = {}) {
  const { departmentId, profile } = useTenant();
  const { user, membership, permissions, isCreator } = useAuth();
  const flags = useMemo(() => trainingFlags(permissions, isCreator), [permissions, isCreator]);
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loaded, setLoaded] = useState({});

  const me = useMemo(() => resolveEmployeePerson(personnel, membership, user) || null, [personnel, membership, user]);
  const myPersonId = membership?.personnelId || me?.id || "";

  useEffect(() => {
    if (!departmentId || !flags.canView) return undefined;
    const unsubs = [];
    const put = (key) => (rows) => {
      setData((prev) => ({ ...prev, [key]: rows }));
      setLoaded((prev) => ({ ...prev, [key]: true }));
    };
    const fail = (key) => (error) => {
      console.warn(`Training: couldn't load ${key}`, error);
      setErrors((prev) => ({ ...prev, [key]: error }));
      setLoaded((prev) => ({ ...prev, [key]: true }));
    };
    for (const key of OPEN) unsubs.push(subscribeTraining(departmentId, C[key], put(key), fail(key)));
    for (const p of PRIVATE) {
      if (p.reviewer(flags)) unsubs.push(subscribeTraining(departmentId, C[p.key], put(p.key), fail(p.key)));
      else unsubs.push(subscribeMine(departmentId, C[p.key], p.field, p.mine === "uid" ? user?.uid : myPersonId, put(p.key), fail(p.key)));
    }
    return () => unsubs.forEach((u) => u && u());
  }, [departmentId, flags, user?.uid, myPersonId]);

  const actor = useMemo(() => ({
    uid: user?.uid || "",
    name: me?.name || membership?.displayName || user?.displayName || user?.email || "",
    personId: myPersonId,
    canEdit: flags.canEdit,
    canApprove: flags.canApprove,
    canEvaluate: flags.canEvaluate,
    qualifications: [...(me?.qualifiers || []), ...certifications.filter((c) => String(c.personnelId || "") === String(myPersonId)).map((c) => c.type)].filter(Boolean),
  }), [user, me, membership, myPersonId, flags, certifications]);

  const activePersonnel = useMemo(
    () => personnel.filter((p) => p && p.id && !["Inactive", "Retired"].includes(p.status)).sort((a, b) => String(a.lastName || a.name).localeCompare(String(b.lastName || b.name))),
    [personnel],
  );

  // The member's own enrollment in each upcoming session (enrollments live under each session).
  const [myEnrollments, setMyEnrollments] = useState({});
  const upcomingIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (data.sessions || []).filter((s) => s.status !== "cancelled" && String(s.date) >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 60).map((s) => s.id).join("|");
  }, [data.sessions]);
  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !departmentId || !myPersonId || !upcomingIds) { setMyEnrollments({}); return undefined; }
    const unsubs = upcomingIds.split("|").map((sid) => onSnapshot(
      doc(db, "departments", departmentId, C.sessions, sid, "enrollments", String(myPersonId)),
      (snap) => setMyEnrollments((prev) => ({ ...prev, [sid]: snap.exists() ? snap.data() : null })),
      () => {},
    ));
    return () => unsubs.forEach((u) => u());
  }, [departmentId, myPersonId, upcomingIds]);

  const get = (key) => data[key] || [];
  return {
    departmentId,
    departmentName: profile?.name || profile?.departmentName || "",
    timezone: profile?.timezone || "",
    flags,
    actor,
    me,
    myPersonId,
    personnel: activePersonnel,
    allPersonnel: personnel,
    certifications,
    legacyTraining,
    records: get("records"),
    templates: get("templates"),
    courses: get("courses"),
    sessions: get("sessions"),
    skills: get("skills"),
    evaluations: get("evaluations"),
    taskBooks: get("taskBooks"),
    taskBookAssignments: get("taskBookAssignments"),
    requirements: get("requirements"),
    exemptions: get("exemptions"),
    ceRuleSets: get("ceRuleSets"),
    ceAwards: get("ceAwards"),
    requests: get("requests"),
    resources: get("resources"),
    reservations: get("reservations"),
    standards: get("standards"),
    settings: (get("settings").find((s) => s.id === "main")) || {},
    myEnrollments,
    loaded,
    errors,
    ready: Boolean(loaded.records),
  };
}
