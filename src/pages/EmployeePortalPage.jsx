import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  CirclePlus,
  Clock3,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Mail,
  Truck,
  UserRound,
  UserPlus,
  Wrench,
  X
} from "lucide-react";
import InternalEmailBoard from "../components/InternalEmailBoard.jsx";
import LeaveRequestForm from "../components/employee/LeaveRequestForm.jsx";
import LeaveRequestsPanel from "../components/scheduling/LeaveRequestsPanel.jsx";
import VacancyPickupPanel from "../components/employee/VacancyPickupPanel.jsx";
import MaintenanceIssueForm from "../components/employee/MaintenanceIssueForm.jsx";
import DamageFormEmbed from "../components/employee/DamageFormEmbed.jsx";
import EmployeeTimeCard from "../components/employee/EmployeeTimeCard.jsx";
import ShiftTradeForm from "../components/employee/ShiftTradeForm.jsx";
import DailyLogPage from "./DailyLogPage.jsx";
import PersonnelActivityLogView from "../components/personnel/PersonnelActivityLogView.jsx";
import { createNotification, createPersonnelNotification } from "../lib/notificationService.js";
import { sendInternalEmail } from "../lib/internalEmailService.js";
import {
  buildBattalionChiefRecipientTokens,
  buildMaintenanceIssueMessageBody,
  buildMaintenanceWorkOrderRecord,
  defaultMaintenanceIssueForm,
  resolveAllBattalionChiefs,
  validateMaintenanceIssueForm,
} from "../lib/maintenanceIssueWorkflow.js";
import { createPortalDamageFormRecord, loadDamageFormSettings } from "../lib/damageFormService.js";
import { writeAuditLog } from "../lib/auditService.js";
import { findPersonnelForLeaveRequest } from "../lib/leaveAccrualIntegration.js";
import {
  appendActivityLogToPersonnel,
  buildShiftTradeActivityEntry,
  personHasActivityLogEntry,
} from "../lib/personnelActivityLog.js";
import {
  recordBelongsToEmployee,
  resolveEmployeeApparatus,
  resolveEmployeePerson,
  resolveEmployeeScheduleContext,
  tradeInvolvesEmployee,
  trainingBelongsToEmployee
} from "../lib/employeePortalUtils.js";
import { listMyAcademyTraining } from "../lib/academyIntegrations.js";
import {
  advanceShiftTradeApproval,
  buildLeaveApprovalMeta,
  buildShiftTradeApprovalHint,
  buildShiftTradeApprovalMeta,
  buildShiftTradeDateWindow,
  leaveStatusDetail,
  buildVacationDateWindow,
  calculateEndTime,
  formatSelectableDateRange,
  formatTimeLabel,
  isDayWithinRange,
  isVacationLeaveType,
  resolveShiftTradeActionRole,
  shiftTradeStatusDetail,
  validateSelectedDatesInRange,
} from "../lib/employeePortalWorkflow.js";
import { resolveShiftRotation, formatDayId, parseDayId } from "../lib/shiftCalendar.js";
import { buildWeekScheduleSnapshots } from "../lib/schedulingRoster.js";
import { buildSchedulingUnitOptions } from "../lib/schedulingSettings.js";
import { buildEmployeeDayDecorators } from "../lib/scheduleCalendarView.js";
import EmployeeScheduleHub from "../components/employee/EmployeeScheduleHub.jsx";
import EmployeeDailyRoster from "../components/employee/EmployeeDailyRoster.jsx";
import { resolveEmployeeVacancyDays, formatVacancyPickupSummary, buildVacancyPickupNotificationMessage } from "../lib/vacancyPickupWorkflow.js";
import { hasPermission } from "../lib/permissions.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { acknowledgementKeys, pendingForPerson, withAcknowledgement } from "../lib/documentAcknowledgement.js";
import { loadDepartmentMembership } from "../lib/departmentMembership.js";
import CallShiftOffers from "../components/employee/CallShiftOffers.jsx";
import EmployeeApparatusCheck from "../components/employee/EmployeeApparatusCheck.jsx";

const defaultLeaveForm = {
  type: "Vacation",
  selectedDates: [],
  dates: "",
  startTime: "0700",
  totalHours: "12",
  finishTime: "1900",
  finishTimeLabel: "19:00",
};

const defaultTradeForm = {
  give: "",
  receive: "",
  giveDayId: "",
  receiveDayId: "",
  giveShift: "",
  receiveShift: "",
  coverage: "",
};

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="panel">
      <header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function buildLeaveApprovalHint(person, personnel, leaveType) {
  const meta = buildLeaveApprovalMeta(person, personnel, leaveType);
  if (meta.approvalRoute === "officer-then-battalion") {
    return `Vacation requests are sent to ${meta.assignedOfficer} for approval, then to ${meta.assignedBattalionChief} for final approval.`;
  }
  if (meta.approvalRoute === "direct-battalion" || meta.approvalRoute === "battalion") {
    return `${leaveType} requests go directly to ${meta.assignedBattalionChief} for approval.`;
  }
  return `This request will be sent to ${meta.assignedBattalionChief} for approval.`;
}

function shiftTradeActionLabel(role = "") {
  if (role === "coverageMember") return "coverage member";
  if (role === "battalionChief") return "Battalion Chief";
  return "approver";
}

export default function EmployeePortalPage({
  current,
  onNavigate,
  membership,
  user,
  permissions = {},
  showInternalEmail = true,
  personnel = [],
  certifications = [],
  training = [],
  documents = [],
  setDocuments,
  leaveRequests = [],
  setLeaveRequests,
  shiftTrades = [],
  setShiftTrades,
  vacancyPickups = [],
  setVacancyPickups,
  callShifts = [],
  setCallShifts,
  scheduleDays = [],
  roster = [],
  apparatus = [],
  schedulingSettings = {},
  dailyLogs = [],
  setDailyLogs,
  shiftChangeTime,
  isCreator = false,
  workOrders = [],
  setWorkOrders,
  setPersonnel,
  shiftRotation,
  profileShifts = [],
  payPeriod = null,
  portalRules = null,
  payRules = null,
  departmentTitle = "",
  departmentLogoUrl = "",
  stationNames = [],
  timeCards = [],
  setTimeCards,
  previewPerson = null,
  onClearPreviewPerson,
}) {
  const { departmentId } = useTenant();
  const { patchMembership } = useAuth();
  const [message, setMessage] = useState("");
  const [academyTraining, setAcademyTraining] = useState([]);
  const [leaveForm, setLeaveForm] = useState(defaultLeaveForm);
  const [tradeForm, setTradeForm] = useState(defaultTradeForm);
  const [maintenanceForm, setMaintenanceForm] = useState(defaultMaintenanceIssueForm);
  const [submittingMaintenance, setSubmittingMaintenance] = useState(false);
  const [damageFormSettings, setDamageFormSettings] = useState(null);
  const calendarToday = new Date();
  const [scheduleCalendarYear, setScheduleCalendarYear] = useState(calendarToday.getFullYear());
  const [scheduleCalendarMonth, setScheduleCalendarMonth] = useState(calendarToday.getMonth());
  const [scheduleCalendarDayId, setScheduleCalendarDayId] = useState(formatDayId(calendarToday));
  const [scheduleHubTab, setScheduleHubTab] = useState("daily");
  const [weekRosterStartId, setWeekRosterStartId] = useState(formatDayId(calendarToday));

  const isScheduleSection = current === "My Schedule" || current === "Leave Requests" || current === "Shift Trades";

  useEffect(() => {
    if (current === "Leave Requests") {
      setScheduleHubTab("leave");
      onNavigate?.("My Schedule");
    } else if (current === "Shift Trades") {
      setScheduleHubTab("trades");
      onNavigate?.("My Schedule");
    }
  }, [current, onNavigate]);

  useEffect(() => {
    if (scheduleHubTab === "week") {
      setWeekRosterStartId(formatDayId(new Date()));
    }
  }, [scheduleHubTab]);

  const rotation = useMemo(
    () => resolveShiftRotation(shiftRotation, profileShifts),
    [shiftRotation, profileShifts]
  );

  const myPerson = useMemo(
    () => previewPerson || resolveEmployeePerson(personnel, membership, user),
    [previewPerson, personnel, membership, user]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAcademyCourses() {
      if (!departmentId || !myPerson?.forgePersonId) {
        setAcademyTraining([]);
        return;
      }
      try {
        const result = await listMyAcademyTraining(departmentId, {
          personnelId: myPerson.id,
          forgePersonId: myPerson.forgePersonId,
        });
        if (!cancelled) {
          setAcademyTraining(Array.isArray(result.training) ? result.training : []);
        }
      } catch {
        if (!cancelled) setAcademyTraining([]);
      }
    }

    loadAcademyCourses();
    return () => {
      cancelled = true;
    };
  }, [departmentId, myPerson?.id, myPerson?.forgePersonId, current]);

  useEffect(() => {
    let cancelled = false;
    if (!departmentId) {
      setDamageFormSettings(null);
      return undefined;
    }

    loadDamageFormSettings(departmentId)
      .then((settings) => {
        if (!cancelled) setDamageFormSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setDamageFormSettings(null);
      });

    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  useEffect(() => {
    let cancelled = false;

    async function syncPersonnelLink() {
      if (!departmentId || !user?.uid || previewPerson) return;

      const remoteMembership = await loadDepartmentMembership(departmentId, user.uid);
      if (cancelled || !remoteMembership?.personnelId) return;
      if (remoteMembership.personnelId === membership?.personnelId) return;

      patchMembership({ personnelId: remoteMembership.personnelId });
    }

    syncPersonnelLink();
    return () => { cancelled = true; };
  }, [
    departmentId,
    user?.uid,
    membership?.personnelId,
    patchMembership,
    previewPerson,
  ]);

  const leaveApprovalHint = useMemo(
    () => (myPerson ? buildLeaveApprovalHint(myPerson, personnel, leaveForm.type) : ""),
    [myPerson, personnel, leaveForm.type]
  );

  const coverageOptions = useMemo(() => {
    if (!myPerson?.shift) return [];
    const shift = String(myPerson.shift).trim().toLowerCase();
    return personnel
      .filter(Boolean)
      .filter((person) => (
        person.id !== myPerson.id
        && String(person.shift || "").trim().toLowerCase() === shift
        && String(person.status || "").toLowerCase() !== "inactive"
      ))
      .map((person) => person.name)
      .sort((a, b) => a.localeCompare(b));
  }, [personnel, myPerson]);

  const scheduleContext = useMemo(
    () => resolveEmployeeScheduleContext(scheduleDays, myPerson, membership, rotation),
    [scheduleDays, myPerson, membership, rotation]
  );
  const myShift = scheduleContext.nextWorkDay;

  const myCerts = useMemo(
    () => certifications.filter((item) => recordBelongsToEmployee(item, membership, myPerson)),
    [certifications, membership, myPerson]
  );

  const myTraining = useMemo(() => {
    const fromList = training.filter((item) => trainingBelongsToEmployee(item, membership, myPerson));
    const merged = [...fromList];
    for (const row of academyTraining) {
      const already = merged.some(
        (item) =>
          item.id === row.id
          || (row.registrationId && item.registrationId === row.registrationId)
      );
      if (!already) merged.push(row);
    }
    return merged.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [training, academyTraining, membership, myPerson]);

  const myAckIdentity = useMemo(() => ({
    personnelId: myPerson?.id || membership?.personnelId || "",
    uid: user?.uid || "",
    name: myPerson?.name || membership?.displayName || user?.displayName || user?.email || "",
  }), [myPerson, membership, user]);
  const myDocs = useMemo(
    () => pendingForPerson(documents, acknowledgementKeys(myAckIdentity)),
    [documents, myAckIdentity]
  );

  const myLeave = useMemo(
    () => leaveRequests.filter((item) => recordBelongsToEmployee(item, membership, myPerson)),
    [leaveRequests, membership, myPerson]
  );

  const myTrades = useMemo(
    () => shiftTrades.filter((item) => tradeInvolvesEmployee(item, membership, myPerson)),
    [shiftTrades, membership, myPerson]
  );

  const pendingTradeActions = useMemo(
    () => shiftTrades
      .filter((trade) => resolveShiftTradeActionRole(trade, myPerson, membership))
      .map((trade) => ({
        trade,
        role: resolveShiftTradeActionRole(trade, myPerson, membership),
      })),
    [shiftTrades, myPerson, membership]
  );

  const tradeApprovalHint = useMemo(
    () => buildShiftTradeApprovalHint(tradeForm),
    [tradeForm]
  );

  const myPendingLeave = useMemo(
    () => myLeave.filter((item) => /pending/i.test(item.status || "")),
    [myLeave]
  );

  const apparatusUnitOptions = useMemo(
    () => [...new Set((apparatus || []).map((item) => item?.unit).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
    [apparatus]
  );

  const submittedByName = myPerson?.name || membership?.displayName || "Employee";

  const myUnit = useMemo(
    () => resolveEmployeeApparatus(apparatus, myPerson, membership),
    [apparatus, myPerson, membership]
  );

  useEffect(() => {
    if (!myUnit?.unit) return;
    setMaintenanceForm((current) => (
      current.location ? current : { ...current, location: myUnit.unit }
    ));
  }, [myUnit?.unit]);

  const trainingDue = myTraining.filter((item) => item.status !== "Complete").length;
  const pendingTrades = myTrades.filter((item) => /pending|awaiting/i.test(item.status || "")).length;
  const certAlerts = myCerts.filter((item) => /due|expired|overdue/i.test(item.status || "")).length;

  const canSubmitLeave = hasPermission(permissions, "submitLeaveRequests") || hasPermission(permissions, "accessAdminRms");
  const canSubmitTrades = hasPermission(permissions, "submitShiftTrades") || hasPermission(permissions, "accessAdminRms");
  const canSubmitMaintenance = hasPermission(permissions, "submitMaintenanceIssues") || hasPermission(permissions, "accessAdminRms");
  const canSubmitVacancyPickups = hasPermission(permissions, "submitVacancyPickups")
    || hasPermission(permissions, "submitLeaveRequests")
    || hasPermission(permissions, "accessAdminRms");
  const canViewInternalEmail = showInternalEmail && hasPermission(permissions, "viewInternalEmail");
  const canViewDailyLog = hasPermission(permissions, "viewDailyLog");
  const canEditDailyLog = hasPermission(permissions, "editDailyLog")
    || hasPermission(permissions, "editSchedule")
    || hasPermission(permissions, "accessAdminRms");
  const canUnlockDailyLog = isCreator || hasPermission(permissions, "manageSystemSettings");

  const vacancyDays = useMemo(
    () => {
      if (!myPerson?.shift) return [];
      return resolveEmployeeVacancyDays({
        personnel,
        person: myPerson,
        rotation,
        leaveRequests,
        roster,
        schedulingSettings,
        apparatus,
        scheduleDays,
      });
    },
    [personnel, myPerson, rotation, leaveRequests, roster, schedulingSettings, apparatus, scheduleDays]
  );

  const scheduleUnitOptions = useMemo(
    () => buildSchedulingUnitOptions(apparatus, schedulingSettings),
    [apparatus, schedulingSettings]
  );

  const employeeCalendarDecorators = useMemo(
    () => buildEmployeeDayDecorators({
      myPerson,
      membership,
      rotation,
      roster,
      personnel,
      leaveRequests,
      knownUnits: scheduleUnitOptions,
      shiftChangeTime,
      vacancyDays,
    }),
    [
      myPerson,
      membership,
      rotation,
      roster,
      personnel,
      leaveRequests,
      scheduleUnitOptions,
      shiftChangeTime,
      vacancyDays,
    ]
  );

  const rosterSnapshotOptions = useMemo(() => ({
    scheduleDays,
    rotation,
    roster,
    personnel,
    leaveRequests,
    schedulingSettings,
    apparatus,
  }), [scheduleDays, rotation, roster, personnel, leaveRequests, schedulingSettings, apparatus]);

  const weekSnapshots = useMemo(
    () => buildWeekScheduleSnapshots({
      ...rosterSnapshotOptions,
      referenceDayId: weekRosterStartId,
    }),
    [rosterSnapshotOptions, weekRosterStartId]
  );

  function shiftSelectedWeek(delta) {
    const date = parseDayId(weekRosterStartId);
    date.setDate(date.getDate() + (delta * 7));
    const nextId = formatDayId(date);
    setWeekRosterStartId(nextId);
    setScheduleCalendarDayId(nextId);
    setScheduleCalendarYear(date.getFullYear());
    setScheduleCalendarMonth(date.getMonth());
  }

  async function submitVacancyPickup(record) {
    if (!setVacancyPickups) return;
    setVacancyPickups((current) => [record, ...current]);
    await writeAuditLog(departmentId, {
      action: "create",
      module: "Scheduling",
      recordId: record.id,
      summary: formatVacancyPickupSummary(record),
      actorUid: user?.uid,
      actorName: membership?.displayName,
    });

    const notificationMessage = buildVacancyPickupNotificationMessage(record);
    if (record.assignedBattalionChiefId) {
      await createPersonnelNotification(departmentId, record.assignedBattalionChiefId, {
        title: "Vacancy pickup request",
        message: notificationMessage,
        module: "Scheduling",
        recordId: record.id,
      });
    } else {
      await createNotification(departmentId, {
        userId: "all",
        title: "Vacancy pickup request",
        message: notificationMessage,
        module: "Scheduling",
        recordId: record.id,
      });
    }
  }

  async function logAction(action, module, summary, recordId = "") {
    await writeAuditLog(departmentId, {
      action,
      module,
      recordId,
      summary,
      actorUid: user?.uid,
      actorName: membership?.displayName
    });
    await createNotification(departmentId, {
      userId: "all",
      title: `${module} update`,
      message: summary,
      module,
      recordId
    });
  }

  async function submitLeave() {
    if (!canSubmitLeave) {
      setMessage("Your role cannot submit leave requests.");
      return;
    }
    if (!leaveForm.selectedDates?.length) {
      setMessage("Select at least one day on the calendar for your leave request.");
      return;
    }

    const totalHours = parseFloat(leaveForm.totalHours);
    if (!totalHours || totalHours <= 0) {
      setMessage("Enter the total hours for your leave request.");
      return;
    }

    if (isVacationLeaveType(leaveForm.type)) {
      const vacationWindow = buildVacationDateWindow(new Date(), portalRules);
      const dateCheck = validateSelectedDatesInRange(
        leaveForm.selectedDates,
        vacationWindow.minDate,
        vacationWindow.maxDate
      );
      if (!dateCheck.valid) {
        setMessage(
          `Vacation requests can only include dates through ${formatSelectableDateRange(vacationWindow.minDate, vacationWindow.maxDate)} (${vacationWindow.maxAdvanceDays} days out).`
        );
        return;
      }
    }

    const endTime = calculateEndTime(leaveForm.startTime, totalHours);
    const approvalMeta = buildLeaveApprovalMeta(myPerson || {}, personnel, leaveForm.type);
    const id = `L-${300 + leaveRequests.length}`;
    const record = {
      id,
      person: myPerson?.name || membership?.displayName || "Employee",
      personnelId: myPerson?.id || membership?.personnelId || "",
      type: leaveForm.type,
      dates: leaveForm.dates,
      selectedDates: leaveForm.selectedDates,
      startTime: leaveForm.startTime,
      totalHours: String(totalHours),
      finishTime: endTime.time,
      finishTimeLabel: endTime.label,
      hours: `${totalHours} hrs`,
      submittedAt: new Date().toISOString(),
      ...approvalMeta,
    };

    setLeaveRequests((current) => [record, ...current]);
    await logAction("create", "Employee Portal", `Leave request submitted by ${record.person}`, id);
    setMessage(`Leave request submitted — ${record.status}`);
    setLeaveForm(defaultLeaveForm);
  }

  async function submitTrade() {
    if (!canSubmitTrades) {
      setMessage("Your role cannot submit shift trades.");
      return;
    }
    if (!tradeForm.coverage?.trim()) {
      setMessage("Select the member you are trading with.");
      return;
    }
    if (!tradeForm.giveDayId || !tradeForm.receiveDayId) {
      setMessage("Select both the shift you are giving and the shift you want to receive on the calendars.");
      return;
    }

    const tradeWindow = buildShiftTradeDateWindow(myPerson || {}, rotation, new Date(), portalRules);
    const tradeDatesValid = [tradeForm.giveDayId, tradeForm.receiveDayId].every(
      (dayId) => isDayWithinRange(dayId, tradeWindow.minDate, tradeWindow.maxDate)
    );
    if (!tradeDatesValid) {
      setMessage(
        `Shift trades can only be scheduled from your earliest work date through ${formatSelectableDateRange(tradeWindow.minDate, tradeWindow.maxDate)}.`
      );
      return;
    }

    const approvalMeta = buildShiftTradeApprovalMeta(personnel, tradeForm, rotation);
    const id = `TR-${500 + shiftTrades.length}`;
    const record = {
      id,
      requestedBy: myPerson?.name || membership?.displayName || "Employee",
      personnelId: myPerson?.id || membership?.personnelId || "",
      give: tradeForm.give,
      receive: tradeForm.receive,
      giveDayId: tradeForm.giveDayId,
      receiveDayId: tradeForm.receiveDayId,
      giveShift: tradeForm.giveShift,
      receiveShift: tradeForm.receiveShift,
      coverage: tradeForm.coverage,
      submitted: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      submittedAt: new Date().toISOString(),
      ...approvalMeta,
    };
    setShiftTrades((current) => [record, ...current]);
    await logAction(
      "create",
      "Employee Portal",
      `Shift trade submitted by ${record.requestedBy} — awaiting ${record.assignedCoverageMember}`,
      id
    );
    setMessage(`Shift trade submitted — awaiting ${record.assignedCoverageMember}'s approval`);
    setTradeForm(defaultTradeForm);
  }

  async function decideTradeApproval(tradeId, decision) {
    const trade = shiftTrades.find((item) => item.id === tradeId);
    if (!trade) return;

    const role = resolveShiftTradeActionRole(trade, myPerson, membership);
    if (!role) {
      setMessage("You cannot act on this shift trade.");
      return;
    }

    const approver = {
      personnelId: myPerson?.id || membership?.personnelId || "",
      name: myPerson?.name || membership?.displayName || "",
      shift: myPerson?.shift || membership?.assignedShift || "",
    };
    const step = advanceShiftTradeApproval(trade, decision, approver);
    const mergedTrade = { ...trade, ...step.tradePatch };

    setShiftTrades((current) => current.map((item) => (
      item.id === tradeId ? mergedTrade : item
    )));

    if (step.isFinal && decision === "Approved" && setPersonnel) {
      const entry = buildShiftTradeActivityEntry(mergedTrade);
      const person = findPersonnelForLeaveRequest(personnel, {
        personnelId: trade.personnelId,
        person: trade.requestedBy,
      });
      if (person && entry && !personHasActivityLogEntry(person, entry.id)) {
        setPersonnel((current) => appendActivityLogToPersonnel(current, person.id, entry));
      }
    }

    await logAction(
      decision === "Approved" ? "approve" : "deny",
      "Employee Portal",
      `Shift trade ${decision.toLowerCase()} by ${approver.name} (${shiftTradeActionLabel(role)})`,
      tradeId
    );
    setMessage(step.message);
  }

  async function submitMaintenanceIssue() {
    if (!canSubmitMaintenance) {
      setMessage("Your role cannot submit maintenance issues.");
      return;
    }

    const validationError = validateMaintenanceIssueForm(maintenanceForm);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSubmittingMaintenance(true);
    try {
      const record = buildMaintenanceWorkOrderRecord(
        maintenanceForm,
        submittedByName,
        workOrders.length
      );
      setWorkOrders((current) => [record, ...current]);

      const chiefs = resolveAllBattalionChiefs(personnel);
      const recipients = buildBattalionChiefRecipientTokens(personnel);
      const chiefLabel = chiefs.length
        ? chiefs.map((chief) => chief.name).join(", ")
        : "command staff";
      const subject = `Damage report — ${maintenanceForm.location}${
        maintenanceForm.equipment ? `: ${maintenanceForm.equipment}` : ""
      }`;

      await sendInternalEmail(departmentId, {
        subject,
        body: buildMaintenanceIssueMessageBody(maintenanceForm, submittedByName),
        category: "maintenance",
        priority: "high",
        recipients,
        recipientLabel: chiefLabel,
        fromUid: user?.uid || "",
        fromName: submittedByName,
        fromEmail: membership?.email || user?.email || "",
      });

      await writeAuditLog(departmentId, {
        action: "create",
        module: "Maintenance",
        recordId: record.id,
        summary: `Damage report submitted by ${submittedByName} for ${maintenanceForm.location}`,
        actorUid: user?.uid,
        actorName: membership?.displayName,
      });

      await createPortalDamageFormRecord(departmentId, maintenanceForm, record, submittedByName);

      setMessage(`Damage report submitted and sent to ${chiefLabel}.`);
      setMaintenanceForm(defaultMaintenanceIssueForm());
    } catch (error) {
      console.error("Failed to submit maintenance issue", error);
      setMessage("Could not send the damage report. Try again or contact command staff.");
    } finally {
      setSubmittingMaintenance(false);
    }
  }

  async function acknowledgeDocument(docId) {
    const doc = documents.find((item) => item.id === docId);
    if (!doc || !setDocuments) return;
    setDocuments((current) =>
      current.map((item) => item.id === docId ? withAcknowledgement(item, myAckIdentity) : item)
    );
    await logAction("approve", "Documents", `Document acknowledged: ${doc.title}`, docId);
    setMessage(`Acknowledged ${doc.title}`);
  }

  return (
    <div className="employee-portal">
      <section className="module-heading employee-portal-heading">
        <div>
          <span className="module-icon"><UserRound size={22} /></span>
          <div>
            <h1>Employee Portal</h1>
            <p>
              {myPerson?.name || membership?.displayName || "Member"}
              {myPerson?.rank ? ` · ${myPerson.rank}` : ""}
              {myPerson?.shift ? ` · ${myPerson.shift}` : ""}
            </p>
          </div>
        </div>
      </section>

      {previewPerson ? (
        <div className="employee-preview-banner">
          <span>
            Viewing employee portal profile for <strong>{previewPerson.name || previewPerson.id}</strong>
          </span>
          {onClearPreviewPerson ? (
            <button type="button" className="secondary-button" onClick={onClearPreviewPerson}>
              Back to admin
            </button>
          ) : null}
        </div>
      ) : null}

      {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}>×</button></div>}

      {current === "My Dashboard" && (
        <>
          <section className="training-summary">
            {[["Next Shift", myShift ? `${myShift.date} · ${myShift.shift}` : "—", "info"], ["Certification Alerts", certAlerts, certAlerts ? "warning" : "success"], ["Training Due", trainingDue, trainingDue ? "warning" : "success"], ["Documents", myDocs.length, myDocs.length ? "warning" : "success"], ["Pending Trades", pendingTrades, pendingTrades ? "warning" : "info"]].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>
            ))}
          </section>
          <section className="dashboard-grid">
            <div className="dashboard-column">
              <Panel title="Certification Alerts" icon={FileCheck2}>
                <div className="operational-notes">
                  {myCerts.map((item) => <p key={item.id}><time>{item.expires}</time><b>{item.type}</b><span>{item.status}</span></p>)}
                  {!myCerts.length && <p><b>All clear</b><span>No certification alerts</span></p>}
                </div>
              </Panel>
            </div>
            <div className="dashboard-column">
              <Panel title="Pending Requests" icon={CalendarDays}>
                <div className="operational-notes employee-leave-history">
                  {myPendingLeave.map((item) => (
                    <p key={item.id}>
                      <time>{item.dates}</time>
                      <b>{item.type}</b>
                      <span>{leaveStatusDetail(item)}</span>
                    </p>
                  ))}
                  {myTrades.filter((item) => /pending|awaiting/i.test(item.status || "")).map((item) => (
                    <p key={item.id}><time>{item.submitted}</time><b>Shift trade</b><span>{shiftTradeStatusDetail(item)}</span></p>
                  ))}
                  {!myPendingLeave.length && !pendingTrades && <p><b>No pending requests</b><span>Leave and trades will appear here</span></p>}
                </div>
              </Panel>
            </div>
            <div className="dashboard-column">
              <Panel title="Documents to Acknowledge" icon={FileText}>
                <div className="operational-notes employee-doc-ack-list">
                  {myDocs.map((item) => <p key={item.id}><time>{item.effectiveDate}</time><b>{item.title}</b><span>{item.category}</span></p>)}
                  {!myDocs.length && <p><b>All caught up</b><span>No pending acknowledgements</span></p>}
                </div>
              </Panel>
            </div>
          </section>
        </>
      )}

      {current === "My Profile" && (
        <Panel title="My Profile" icon={UserRound}>
          {myPerson ? (
            <>
              <div className="cert-detail-grid">
                {[["Name", myPerson.name], ["ID", myPerson.id], ["Rank", myPerson.rank], ["Shift", myPerson.shift], ["Station", myPerson.station], ["Assignment", myPerson.assignment], ["Supervisor", myPerson.supervisor], ["EMS", myPerson.ems], ["Email", myPerson.email], ["Phone", myPerson.phone]].map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong>{value || "—"}</strong></div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 8 }}>Leave & Shift History</h3>
                <p className="auth-help">Approved vacation, sick, military leave, and shift trades appear here automatically.</p>
                <PersonnelActivityLogView entries={myPerson.activityLog || []} />
              </div>
            </>
          ) : (
            <p className="auth-help">No personnel profile linked. Ask an admin to link your user to a personnel record in System Admin → Users.</p>
          )}
        </Panel>
      )}

      {isScheduleSection && (
        <Panel title="My Schedule" icon={CalendarDays}>
          <EmployeeScheduleHub
            activeTab={scheduleHubTab}
            onTabChange={setScheduleHubTab}
            calendarProps={{
              year: scheduleCalendarYear,
              month: scheduleCalendarMonth,
              onMonthChange: (year, month) => {
                setScheduleCalendarYear(year);
                setScheduleCalendarMonth(month);
              },
              referenceDayId: scheduleCalendarDayId,
              scheduleDays,
              rotation,
              profileShifts,
              selectedId: scheduleCalendarDayId,
              selectionMode: "single",
              onSelectDay: (cell) => setScheduleCalendarDayId(cell.id),
              decorateDay: employeeCalendarDecorators,
              leaveRequests,
              personnel,
              roster,
              showFilter: true,
              showLegend: true,
              showTodayButton: true,
            }}
            weekRosterProps={{
              weekSnapshots,
              selectedId: weekRosterStartId,
              onSelectDay: (cell) => setScheduleCalendarDayId(cell.id),
              rotation,
              onWeekChange: shiftSelectedWeek,
              apparatus,
              stationNames,
              departmentName: departmentTitle || "Fire and EMS",
              shiftChangeTime,
              personnel,
              schedulingSettings,
            }}
            summaryPanel={(
              <>
                <div className="cert-detail-grid employee-schedule-summary">
                  <div><span>Status</span><strong>{scheduleContext.isWorkDayToday ? "On duty today" : scheduleContext.offUntilLabel || "—"}</strong></div>
                  <div><span>Your Shift</span><strong>{myPerson?.shift || membership?.assignedShift || "—"}</strong></div>
                </div>
                {vacancyDays.length > 0 && (
                  <div className="employee-schedule-vacancies">
                    <h3>Open shifts on opposite platoons</h3>
                    <div className="operational-notes">
                      {vacancyDays.slice(0, 5).map((day) => (
                        <p key={day.id}>
                          <time>{day.weekday} {day.date}</time>
                          <b>{day.vacancies.length} open slot{day.vacancies.length === 1 ? "" : "s"}</b>
                          <span>{day.vacancies.map((vacancy) => vacancy.label).join(" · ")}</span>
                        </p>
                      ))}
                    </div>
                    <button type="button" className="secondary-button" style={{ marginTop: 8 }} onClick={() => onNavigate?.("Open Vacancies")}>
                      Request vacancy pickup
                    </button>
                  </div>
                )}
              </>
            )}
            dailyRosterPanel={(
              <EmployeeDailyRoster
                scheduleDays={scheduleDays}
                rotation={rotation}
                roster={roster}
                personnel={personnel}
                leaveRequests={leaveRequests}
                shiftTrades={shiftTrades}
                schedulingSettings={schedulingSettings}
                apparatus={apparatus}
                stationNames={stationNames}
                departmentTitle={departmentTitle}
                shiftChangeTime={shiftChangeTime}
              />
            )}
            leavePanel={(
              <>
                {canSubmitLeave ? (
                  <>
                    <LeaveRequestForm
                      value={leaveForm}
                      onChange={setLeaveForm}
                      myPerson={myPerson}
                      scheduleDays={scheduleDays}
                      rotation={rotation}
                      approvalHint={leaveApprovalHint}
                      payPeriod={payPeriod}
                      portalRules={portalRules}
                      leaveRequests={leaveRequests}
                      personnel={personnel}
                      roster={roster}
                    />
                    <button className="primary-button" style={{ marginTop: 12 }} onClick={submitLeave}>
                      <CirclePlus size={14} /> Submit Leave Request
                    </button>
                  </>
                ) : (
                  <p className="auth-help">Your role can view leave history but cannot submit new requests.</p>
                )}
                <LeaveRequestsPanel
                  showEmbedded
                  leaveRequests={myLeave}
                  setLeaveRequests={setLeaveRequests}
                  personnel={personnel}
                  setPersonnel={setPersonnel}
                  canManage={hasPermission(permissions, "accessAdminRms") || hasPermission(permissions, "editSchedule")}
                  allowSelfDeletePending={canSubmitLeave}
                  selfPersonnelId={myPerson?.id || membership?.personnelId || ""}
                  title="My Leave Requests"
                />
              </>
            )}
            tradesPanel={(
              <>
                {canSubmitTrades ? (
                  <>
                    <ShiftTradeForm
                      value={tradeForm}
                      onChange={setTradeForm}
                      myPerson={myPerson}
                      scheduleDays={scheduleDays}
                      rotation={rotation}
                      coverageOptions={coverageOptions}
                      payPeriod={payPeriod}
                      portalRules={portalRules}
                      leaveRequests={leaveRequests}
                      personnel={personnel}
                      roster={roster}
                      approvalHint={tradeApprovalHint}
                    />
                    <button className="primary-button" style={{ marginTop: 12 }} onClick={submitTrade}>
                      <CirclePlus size={14} /> Submit Trade
                    </button>
                  </>
                ) : (
                  <p className="auth-help">Your role can view trades but cannot submit new requests.</p>
                )}
                {pendingTradeActions.length ? (
                  <div className="operational-notes employee-trade-approvals" style={{ marginTop: 16 }}>
                    <p><b>Pending your approval</b><span>Review shift trades that need your sign-off</span></p>
                    {pendingTradeActions.map(({ trade, role }) => (
                      <div className="employee-trade-approval-row" key={trade.id}>
                        <p>
                          <time>{trade.submitted}</time>
                          <b>{trade.requestedBy}: {trade.give} → {trade.receive}</b>
                          <span>Awaiting your approval as {shiftTradeActionLabel(role)}</span>
                        </p>
                        <div className="inline-actions">
                          <button type="button" onClick={() => decideTradeApproval(trade.id, "Approved")}>
                            <Check size={13} /> Approve
                          </button>
                          <button type="button" onClick={() => decideTradeApproval(trade.id, "Denied")}>
                            <X size={13} /> Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="operational-notes employee-trade-history" style={{ marginTop: 16 }}>
                  {myTrades.map((item) => (
                    <p key={item.id}>
                      <time>{item.submitted}</time>
                      <b>{item.give} → {item.receive}</b>
                      <span>{shiftTradeStatusDetail(item)}</span>
                    </p>
                  ))}
                  {!myTrades.length && <p><b>No shift trades</b><span>Submitted trades will appear here</span></p>}
                </div>
              </>
            )}
          />
        </Panel>
      )}

      {current === "Time Card" && (
        <Panel title="Time Card" icon={Clock3}>
          <EmployeeTimeCard
            myPerson={myPerson}
            membership={membership}
            payPeriod={payPeriod}
            payRules={payRules}
            scheduleDays={scheduleDays}
            leaveRequests={leaveRequests}
            roster={roster}
            personnel={personnel}
            schedulingSettings={schedulingSettings}
            apparatus={apparatus}
            shiftRotation={shiftRotation}
            shiftTrades={shiftTrades}
            departmentTitle={departmentTitle || "Fire and EMS"}
            departmentLogoUrl={departmentLogoUrl}
            shiftChangeTime={shiftChangeTime}
            timeCards={timeCards}
            setTimeCards={setTimeCards}
          />
        </Panel>
      )}

      {current === "Daily Log" && canViewDailyLog && (
        <DailyLogPage
          records={dailyLogs}
          setRecords={setDailyLogs}
          personnel={personnel}
          apparatus={apparatus}
          roster={roster}
          leaveRequests={leaveRequests}
          shiftTrades={shiftTrades}
          scheduleDays={scheduleDays}
          schedulingSettings={schedulingSettings}
          profileShifts={profileShifts}
          shiftRotation={shiftRotation}
          shiftChangeTime={shiftChangeTime}
          actingPerson={myPerson}
          canEdit={canEditDailyLog}
          canUnlock={canUnlockDailyLog}
        />
      )}

      {current === "My Certifications" && (
        <Panel title="My Certifications" icon={FileCheck2}>
          <div className="cert-table">
            <div className="cert-row cert-head"><span>Type</span><span>Expires</span><span>Renewal</span><span>Status</span></div>
            {myCerts.map((item) => <div className="cert-row" key={item.id}><span>{item.type}</span><span>{item.expires}</span><span>{item.renewal}</span><span>{item.status}</span></div>)}
            {!myCerts.length && <p className="empty-table">No certifications on file for your profile.</p>}
          </div>
          <p className="auth-help">Upload renewal documents through the admin Certifications module or request admin assistance.</p>
        </Panel>
      )}

      {current === "My Training" && (
        <Panel title="My Training" icon={Activity}>
          <div className="training-table">
            <div className="training-row training-head"><span>Course</span><span>Date</span><span>Completion</span><span>Status</span></div>
            {myTraining.map((item) => (
              <div className="training-row" key={item.id}>
                <span>
                  {item.course}
                  {item.source === "forge_academy" ? <small className="muted"> · Academy</small> : null}
                </span>
                <span>{item.date}</span>
                <span>{item.completion}%</span>
                <span>{item.status}</span>
              </div>
            ))}
            {!myTraining.length && <p className="empty-table">No training assigned to your shift or profile yet.</p>}
          </div>
        </Panel>
      )}

      {current === "My Documents" && (
        <Panel title="My Documents" icon={FileText}>
          <div className="document-library">
            {myDocs.map((item) => (
              <div className="doc-row" key={item.id}>
                <span><strong>{item.title}</strong><small>{item.category}</small></span>
                <button className="row-action" onClick={() => acknowledgeDocument(item.id)}>Acknowledge</button>
              </div>
            ))}
            {!myDocs.length && <p className="empty-table">No pending document acknowledgements.</p>}
          </div>
        </Panel>
      )}

      {current === "Open Vacancies" && (
        <CallShiftOffers
          callShifts={callShifts}
          setCallShifts={setCallShifts}
          person={myPerson}
          onResponded={(record, response) => {
            logAction("update", "Scheduling", `${myPerson?.name || "A member"} ${response} the shift broadcast for ${record.dateLabel || record.dayId}`, record.id);
            setMessage(response === "accepted" ? "Thanks — your supervisor will confirm." : "Got it — you declined this shift.");
          }}
        />
      )}
      {current === "Open Vacancies" && (
        <Panel title="Opposite-Shift Vacancies & Pickup Requests" icon={UserPlus}>
          <VacancyPickupPanel
            person={myPerson}
            personnel={personnel}
            vacancyDays={vacancyDays}
            pickupRequests={vacancyPickups}
            onSubmitPickup={submitVacancyPickup}
            canSubmit={canSubmitVacancyPickups}
            rotation={rotation}
          />
        </Panel>
      )}

      {current === "Apparatus Checks" && (
        <Panel title="Apparatus Checks" icon={Truck}>
          <EmployeeApparatusCheck
            departmentId={departmentId}
            myUnit={myUnit}
            actor={{ actorUid: user?.uid || "", actorName: myPerson?.name || membership?.displayName || user?.email || "" }}
            permissions={permissions}
            isCreator={isCreator}
            onMessage={setMessage}
          />
        </Panel>
      )}

      {current === "Messages" && canViewInternalEmail && (
        <Panel title="Messages" icon={Mail}>
          <InternalEmailBoard compact onMessage={setMessage} personnelRecords={personnel} />
        </Panel>
      )}

      {current === "Maintenance Issues" && (
        <Panel title="Report Maintenance Issue" icon={Wrench}>
          {damageFormSettings?.formUrl ? (
            <DamageFormEmbed
              formUrl={damageFormSettings.formUrl}
              formTitle={damageFormSettings.formTitle || "Damage Form"}
            />
          ) : canSubmitMaintenance ? (
            <MaintenanceIssueForm
              value={maintenanceForm}
              onChange={setMaintenanceForm}
              apparatusOptions={apparatusUnitOptions}
              submittedByName={submittedByName}
              onSubmit={submitMaintenanceIssue}
              submitting={submittingMaintenance}
            />
          ) : (
            <p className="auth-help">Your role cannot submit maintenance issues.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
