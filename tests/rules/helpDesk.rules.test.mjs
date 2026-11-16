// Help Desk security rules (Firestore + Storage) against the local emulators.
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { getBytes, ref, uploadString } from "firebase/storage";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const STORAGE_RULES = readFileSync(new URL("../../storage.rules", import.meta.url), "utf8");
const A = "dept-a";
const B = "dept-b";

let env;
const as = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true });
const creator = () => as("creator-1", "creator@forge.test");
const adminA = () => as("admin-a", "chief@a.gov");
const memberA = () => as("member-a", "ff@a.gov");
const member2A = () => as("member2-a", "ff2@a.gov");
const adminB = () => as("admin-b", "chief@b.gov");
const memberB = () => as("member-b", "ff@b.gov");

const membership = (uid, departmentId, extra = {}) => ({
  uid, email: `${uid}@example.com`, role: "firefighter", roleIds: ["firefighter"], status: "active", departmentId, ...extra,
});
const ticket = (id, departmentId, requesterUid) => ({
  id, number: 1001, numberLabel: "HD-1001", subject: "Login broken", description: "x", category: "bug", priority: "normal",
  status: "open", departmentId, requesterUid, requesterEmail: `${requesterUid}@example.com`, createdAt: "2026-11-01T00:00:00.000Z",
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: FIRESTORE_RULES, host: "127.0.0.1", port: 8080 },
    storage: { rules: STORAGE_RULES, host: "127.0.0.1", port: 9199 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "platformCreators/creator-1"), { status: "active" });
    await setDoc(doc(db, `departments/${A}/users/admin-a`), membership("admin-a", A, { role: "department_admin", roleIds: ["fireChief"] }));
    await setDoc(doc(db, `departments/${A}/users/member-a`), membership("member-a", A));
    await setDoc(doc(db, `departments/${A}/users/member2-a`), membership("member2-a", A));
    await setDoc(doc(db, `departments/${B}/users/admin-b`), membership("admin-b", B, { roleIds: ["itAdmin"] }));
    await setDoc(doc(db, `departments/${B}/users/member-b`), membership("member-b", B));
    await setDoc(doc(db, "helpDeskTickets/t-a"), ticket("t-a", A, "member-a"));
    await setDoc(doc(db, "helpDeskTickets/t-b"), ticket("t-b", B, "member-b"));
    await setDoc(doc(db, "helpDeskTickets/t-a/messages/public-1"), { visibility: "public", kind: "reply", body: "Hi" });
    await setDoc(doc(db, "helpDeskTickets/t-a/messages/note-1"), { visibility: "internal", kind: "note", body: "Secret" });
    await setDoc(doc(db, "helpDeskTickets/t-a/notifications/new-ticket"), { to: ["support@forge.test"], status: "sent" });
    await setDoc(doc(db, "platformHelpDesk/settings"), { notifyEmails: ["support@forge.test"] });
    await setDoc(doc(db, "platformHelpDesk/counter"), { next: 1002 });
    await setDoc(doc(db, `helpDeskSettings/${A}`), { notifyEmails: ["it@a.gov"] });
    await uploadString(ref(ctx.storage(), `helpDesk/${A}/member-a/u1/shot.png`), "img", "raw", { contentType: "image/png" });
  });
});

describe("help desk tickets", () => {
  it("a requester reads their own ticket and lists their own tickets", async () => {
    const db = memberA().firestore();
    await assertSucceeds(getDoc(doc(db, "helpDeskTickets/t-a")));
    await assertSucceeds(getDocs(query(collection(db, "helpDeskTickets"), where("requesterUid", "==", "member-a"))));
  });

  it("another member of the same department can't read it", async () => {
    const db = member2A().firestore();
    await assertFails(getDoc(doc(db, "helpDeskTickets/t-a")));
    await assertFails(getDocs(query(collection(db, "helpDeskTickets"), where("requesterUid", "==", "member-a"))));
    await assertFails(getDocs(query(collection(db, "helpDeskTickets"), where("departmentId", "==", A))));
  });

  it("department admins see their own department's queue only", async () => {
    const db = adminA().firestore();
    await assertSucceeds(getDoc(doc(db, "helpDeskTickets/t-a")));
    await assertSucceeds(getDocs(query(collection(db, "helpDeskTickets"), where("departmentId", "==", A))));
    await assertFails(getDoc(doc(db, "helpDeskTickets/t-b")));
    await assertFails(getDocs(query(collection(db, "helpDeskTickets"), where("departmentId", "==", B))));
    await assertFails(getDocs(collection(db, "helpDeskTickets")));
  });

  it("platform creators see every department's tickets", async () => {
    const db = creator().firestore();
    await assertSucceeds(getDocs(collection(db, "helpDeskTickets")));
    await assertSucceeds(getDoc(doc(db, "helpDeskTickets/t-b")));
  });

  it("nobody writes tickets from the app (the functions do)", async () => {
    await assertFails(setDoc(doc(memberA().firestore(), "helpDeskTickets/new"), ticket("new", A, "member-a")));
    await assertFails(updateDoc(doc(memberA().firestore(), "helpDeskTickets/t-a"), { status: "closed" }));
    await assertFails(updateDoc(doc(adminA().firestore(), "helpDeskTickets/t-a"), { status: "resolved" }));
    await assertFails(updateDoc(doc(creator().firestore(), "helpDeskTickets/t-a"), { status: "resolved" }));
    await assertFails(setDoc(doc(memberA().firestore(), "helpDeskTickets/t-a/messages/m2"), { visibility: "public", body: "x" }));
  });
});

describe("help desk messages and notifications", () => {
  it("the requester reads public replies but never internal notes", async () => {
    const db = memberA().firestore();
    await assertSucceeds(getDoc(doc(db, "helpDeskTickets/t-a/messages/public-1")));
    await assertSucceeds(getDocs(query(collection(db, "helpDeskTickets/t-a/messages"), where("visibility", "==", "public"))));
    await assertFails(getDoc(doc(db, "helpDeskTickets/t-a/messages/note-1")));
    await assertFails(getDocs(collection(db, "helpDeskTickets/t-a/messages")));
  });

  it("staff read the whole thread; other departments read none of it", async () => {
    await assertSucceeds(getDocs(collection(adminA().firestore(), "helpDeskTickets/t-a/messages")));
    await assertSucceeds(getDocs(collection(creator().firestore(), "helpDeskTickets/t-a/messages")));
    await assertFails(getDocs(query(collection(adminB().firestore(), "helpDeskTickets/t-a/messages"), where("visibility", "==", "public"))));
    await assertFails(getDoc(doc(memberB().firestore(), "helpDeskTickets/t-a/messages/public-1")));
  });

  it("only staff read the notification log", async () => {
    await assertSucceeds(getDocs(collection(adminA().firestore(), "helpDeskTickets/t-a/notifications")));
    await assertSucceeds(getDocs(collection(creator().firestore(), "helpDeskTickets/t-a/notifications")));
    await assertFails(getDocs(collection(memberA().firestore(), "helpDeskTickets/t-a/notifications")));
    await assertFails(getDocs(collection(adminB().firestore(), "helpDeskTickets/t-a/notifications")));
  });
});

describe("help desk settings", () => {
  it("the platform list is creators-only and server-written", async () => {
    await assertSucceeds(getDoc(doc(creator().firestore(), "platformHelpDesk/settings")));
    await assertFails(getDoc(doc(adminA().firestore(), "platformHelpDesk/settings")));
    await assertFails(getDoc(doc(memberA().firestore(), "platformHelpDesk/settings")));
    await assertFails(getDoc(doc(creator().firestore(), "platformHelpDesk/counter")));
    await assertFails(setDoc(doc(creator().firestore(), "platformHelpDesk/settings"), { notifyEmails: [] }));
  });

  it("a department's list is readable by its admins only", async () => {
    await assertSucceeds(getDoc(doc(adminA().firestore(), `helpDeskSettings/${A}`)));
    await assertSucceeds(getDoc(doc(creator().firestore(), `helpDeskSettings/${A}`)));
    await assertFails(getDoc(doc(memberA().firestore(), `helpDeskSettings/${A}`)));
    await assertFails(getDoc(doc(adminB().firestore(), `helpDeskSettings/${A}`)));
    await assertFails(setDoc(doc(adminA().firestore(), `helpDeskSettings/${A}`), { notifyEmails: ["x@y.z"] }));
  });

  it("rate-limit records are closed to the app", async () => {
    await assertFails(getDoc(doc(memberA().firestore(), "helpDeskRate/member-a")));
    await assertFails(setDoc(doc(memberA().firestore(), "helpDeskRate/member-a"), { count: 0 }));
  });
});

describe("help desk attachments (Storage)", () => {
  const png = { contentType: "image/png" };

  it("members upload to their own folder in their own department", async () => {
    await assertSucceeds(uploadString(ref(memberA().storage(), `helpDesk/${A}/member-a/u2/error.png`), "img", "raw", png));
    await assertSucceeds(uploadString(ref(memberA().storage(), `helpDesk/${A}/member-a/u3/log.txt`), "log", "raw", { contentType: "text/plain" }));
  });

  it("no uploads into someone else's folder, another department, or of other file types", async () => {
    await assertFails(uploadString(ref(memberA().storage(), `helpDesk/${A}/member2-a/u2/x.png`), "img", "raw", png));
    await assertFails(uploadString(ref(memberA().storage(), `helpDesk/${B}/member-a/u2/x.png`), "img", "raw", png));
    await assertFails(uploadString(ref(memberA().storage(), `helpDesk/${A}/member-a/u2/run.exe`), "MZ", "raw", { contentType: "application/x-msdownload" }));
    await assertFails(uploadString(ref(memberA().storage(), `helpDesk/${A}/member-a/u1/shot.png`), "replaced", "raw", png));
  });

  it("reply files: the requester reads staff files on public replies, never internal ones", async () => {
    await assertSucceeds(uploadString(ref(adminA().storage(), "helpDeskReplies/t-a/public/admin-a/r1/fix.png"), "img", "raw", png));
    await assertSucceeds(uploadString(ref(creator().storage(), "helpDeskReplies/t-a/internal/creator-1/r2/trace.txt"), "t", "raw", { contentType: "text/plain" }));
    await assertSucceeds(uploadString(ref(memberA().storage(), "helpDeskReplies/t-a/public/member-a/r3/more.png"), "img", "raw", png));
    await assertSucceeds(getBytes(ref(memberA().storage(), "helpDeskReplies/t-a/public/admin-a/r1/fix.png")));
    await assertFails(getBytes(ref(memberA().storage(), "helpDeskReplies/t-a/internal/creator-1/r2/trace.txt")));
    await assertSucceeds(getBytes(ref(adminA().storage(), "helpDeskReplies/t-a/internal/creator-1/r2/trace.txt")));
    await assertFails(getBytes(ref(member2A().storage(), "helpDeskReplies/t-a/public/admin-a/r1/fix.png")));
    await assertFails(getBytes(ref(adminB().storage(), "helpDeskReplies/t-a/public/admin-a/r1/fix.png")));
  });

  it("reply files: only the requester and staff upload, requesters never to internal", async () => {
    await assertFails(uploadString(ref(memberA().storage(), "helpDeskReplies/t-a/internal/member-a/r4/x.png"), "img", "raw", png));
    await assertFails(uploadString(ref(member2A().storage(), "helpDeskReplies/t-a/public/member2-a/r4/x.png"), "img", "raw", png));
    await assertFails(uploadString(ref(adminB().storage(), "helpDeskReplies/t-a/public/admin-b/r4/x.png"), "img", "raw", png));
    await assertFails(uploadString(ref(adminA().storage(), "helpDeskReplies/t-a/public/member-a/r4/x.png"), "img", "raw", png));
    await assertFails(uploadString(ref(adminA().storage(), "helpDeskReplies/missing/public/admin-a/r4/x.png"), "img", "raw", png));
  });

  it("the uploader, FORGE staff and that department's admins can read a file", async () => {
    const path = `helpDesk/${A}/member-a/u1/shot.png`;
    await assertSucceeds(getBytes(ref(memberA().storage(), path)));
    await assertSucceeds(getBytes(ref(adminA().storage(), path)));
    await assertSucceeds(getBytes(ref(creator().storage(), path)));
    await assertFails(getBytes(ref(member2A().storage(), path)));
    await assertFails(getBytes(ref(adminB().storage(), path)));
    await assertFails(getBytes(ref(memberB().storage(), path)));
  });
});
