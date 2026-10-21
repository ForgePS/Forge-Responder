import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lazyPage } from "./lib/lazyPage.js";
import { normalizeTableRows } from "./lib/tableRows.js";
import { useAuth } from "./context/AuthContext.jsx";
const AdminControlCenterPage = lazyPage(() => import("./pages/AdminControlCenterPage.jsx"));
const TimeSheetsPage = lazyPage(() => import("./pages/TimeSheetsPage.jsx"));
const ShiftTradesPanel = lazyPage(() => import("./components/scheduling/ShiftTradesPanel.jsx"));
const LeaveRequestsPanel = lazyPage(() => import("./components/scheduling/LeaveRequestsPanel.jsx"));
const CallShiftPanel = lazyPage(() => import("./components/scheduling/CallShiftPanel.jsx"));
import { normalizeCallShiftRules } from "./lib/callShiftRules.js";
const EmployeePortalPage = lazyPage(() => import("./pages/EmployeePortalPage.jsx"));
import {
  canAccessAdminRms,
  canAccessEmployeePortal,
  canAccessSystemAdmin,
  canEditNerisReports,
  canEditApparatus,
  canEditAssets,
  canEditPersonnel,
  canEditScheduleRoster,
  canViewPersonnelPrivateInfo,
  filterNavGroups,
  hasPermission
} from "./lib/permissions.js";
import ThemeToggle from "./components/ThemeToggle.jsx";
import { useTenant } from "./context/TenantContext.jsx";
import { isPlatformScope } from "./lib/tenantPaths.js";
import { useTenantPersistentState } from "./hooks/useTenantPersistentState.js";
import { formatRoleLabel, membershipInitials } from "./lib/departmentMembership.js";
import AccessDeniedPage from "./pages/AccessDeniedPage.jsx";
import DemoEntryPage from "./pages/DemoEntryPage.jsx";
import DemoModeBanner from "./components/DemoModeBanner.jsx";
import GatewayNotFoundPage from "./pages/GatewayNotFoundPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { isDemoEntryPath, isDemoModeActive } from "./lib/demoMode.js";
import {
  CREATOR_CONSOLE_MODULE,
  CREATOR_CONSOLE_PATH,
  isAlertDashboardPath,
  isCreatorConsolePath,
  parseAppDeepLink
} from "./lib/gatewayRouting.js";
import { PLATFORM_SCOPE_ID } from "./lib/tenantPaths.js";
import { FORGE_ACADEMY_CLASS_SCHEDULE_URL } from "./lib/platformUrls.js";
import {
  Activity, AlertTriangle, Ambulance, Archive, BarChart3, Bell, BookOpen, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, DollarSign, Droplets, Edit3, ExternalLink, FileBarChart2, FileCheck2, FileText, Gauge,
  GraduationCap, HardHat, Home, Landmark, LayoutList, Lock, Mail, Map, MapPin, Menu, MonitorPlay, PackageSearch, Phone, Save, Search,
  Settings, Settings2, ShieldCheck, Store, Trash2, Truck, Upload, UploadCloud, UserRound, Users, Wifi, Wrench, X, CirclePlus, Gavel, Flame, Zap
} from "lucide-react";
const InternalEmailBoardPage = lazyPage(() => import("./pages/InternalEmailBoardPage.jsx"));
const DigitalDashboardPage = lazyPage(() => import("./pages/DigitalDashboardPage.jsx"));
import { filterNavByEnabledModules, filterNavByCodeLibraryAccess } from "./lib/navFilter.js";
import {
  filterNavGroupsByPreplanFeatures,
  getDepartmentPreplanFeatures,
  resolveEffectivePreplanFeatures,
} from "./lib/inspections/index.js";
import { getDepartmentCodeLibraryAccess } from "./lib/codeLibrary/accessService.js";
import {
  PREVENTION_NAV_TREE,
  findActiveNavBranchIds,
  isNavBranch,
  navNodeKey,
  navNodeLabel,
} from "./data/preventionNav.js";
import { groupContainsRoute, groupHasNavTree, groupNavLeavesAsItems } from "./lib/navTree.js";
import { buildPageIndex, depthFromHistoryState, pageFromLocation, pageHistoryState, pageSlug, slugFromHistoryState, urlWithPage } from "./lib/pageUrl.js";
import { employeePortalNavGroups, filterEmployeePortalNav } from "./data/employeePortalNav.js";
import CommandDashboard from "./components/CommandDashboard.jsx";
const DailyLogPage = lazyPage(() => import("./pages/DailyLogPage.jsx"));
const PersonnelPage = lazyPage(() => import("./pages/PersonnelPage.jsx"));
import DepartmentSwitcher from "./components/DepartmentSwitcher.jsx";
import PlatformFooter from "./components/PlatformFooter.jsx";
const ShiftCalendar = lazyPage(() => import("./components/ShiftCalendar.jsx"));
const WeekRosterView = lazyPage(() => import("./components/WeekRosterView.jsx"));
const AdminDailyRoster = lazyPage(() => import("./components/admin/AdminDailyRoster.jsx"));
import {
  buildMonthCalendar,
  formatDayId,
  parseDayId,
  resolveShiftRotation,
  shiftShortLabel,
} from "./lib/shiftCalendar.js";
import {
  buildDayRoster,
  buildDayScheduleSnapshot,
  buildDayScopedRosterId,
  buildOvertimeRosterId,
  buildPartialSlotRosterId,
  buildLiveScheduleDayMetrics,
  buildWeekScheduleSnapshots,
  buildDefaultShiftTimes,
  calculateShiftDurationHours,
  DEFAULT_SHIFT_DURATION_HOURS,
  formatDurationLabel,
  normalizeShiftTime,
  resolveDayCoverageMetrics,
  resolveRosterPersonnelId,
} from "./lib/schedulingRoster.js";
import { getPersonDisplayName } from "./lib/personnelSchema.js";
import { canonicalApparatusUnitName } from "./lib/apparatusSchema.js";
import { buildSchedulingUnitOptions, resolveSchedulingDisplayUnits } from "./lib/schedulingSettings.js";
import { normalizeShiftRotation } from "./data/defaultShiftRotation.js";
import { normalizePayPeriod } from "./lib/payPeriods.js";
import { normalizeSchedulingSettings } from "./lib/schedulingSettings.js";
import { normalizeEmployeePortalRules } from "./lib/employeePortalRules.js";
import { normalizePayRules } from "./lib/payRules.js";
import { normalizeDailyLogSettings } from "./lib/dailyLogSettings.js";
const CreatorConsolePage = lazyPage(() => import("./pages/CreatorConsolePage.jsx"));
const DepartmentSetupWizard = lazyPage(() => import("./components/onboarding/DepartmentSetupWizard.jsx"));
import ManagedSelect from "./components/ManagedSelect.jsx";
import FleetRecordEditModal, { APPARATUS_EDIT_FIELDS } from "./components/FleetRecordEditModal.jsx";
import { useDropdowns } from "./context/DropdownContext.jsx";
import { groupApparatusByStation, APPARATUS_UNASSIGNED_STATION } from "./lib/apparatusGrouping.js";
import { defaultDepartmentSettings } from "./data/defaultDepartment.js";
import { defaultPlatformConfig } from "./data/platformBrand.js";
import { getTenantListFallback } from "./data/tenants/index.js";
import { LIST_KEYS } from "./lib/tenantListKeys.js";
import { resolveDepartmentLogoUrl, resolvePlatformLogoUrl } from "./lib/brandAssets.js";
import { uploadFirebaseFile, deleteFirebaseFile } from "./lib/firebaseClient.js";
import { buildCertificationDocPath } from "./lib/storagePaths.js";
import {
  archiveObject,
  isObjectArchived,
  isObjectDeleted,
  isObjectVisibleInActiveList,
  isObjectVisibleInArchivedList,
  restoreObject,
  softDeleteObject,
} from "./lib/objectLifecycle.js";
import ObjectLifecycleActions from "./components/ObjectLifecycleActions.jsx";
import { listUserNotifications, markNotificationRead } from "./lib/notificationService.js";
import { vacancyPickupStatusDetail } from "./lib/vacancyPickupWorkflow.js";
const HydrantTestingPage = lazyPage(() => import("./pages/HydrantTestingPage.jsx"));
const HydrantDamageReportsPage = lazyPage(() => import("./pages/HydrantDamageReportsPage.jsx"));
const WaterCompanyDirectoryPage = lazyPage(() => import("./pages/WaterCompanyDirectoryPage.jsx"));
const WaterDistrictsPage = lazyPage(() => import("./pages/WaterDistrictsPage.jsx"));
const HydrantDamageAnalyticsPage = lazyPage(() => import("./pages/HydrantDamageAnalyticsPage.jsx"));
const NerisFireReportsPage = lazyPage(() => import("./pages/NerisFireReportsPage.jsx"));
const NerisAnalyticsPage = lazyPage(() => import("./pages/NerisAnalyticsPage.jsx"));
import { resolveInitialHydrantTab, resolveInitialAppModule, shouldOpenHydrantsModule } from "./lib/hydrantAppRouting.js";
import {
  AnalyticsPage,
  AssetsPageConnected,
  DocumentsPage,
  HoseTestingPage,
  InspectionsPage,
} from "./pages/SprintModulePages.jsx";
import {
  AllInspectionsPage,
  InspectionsDashboardPage,
  InspectionsWorkQueuePage,
  MyInspectionsPage,
} from "./pages/InspectionsModulePages.jsx";
import {
  AllPreplansPage,
  NewPreplanPage,
  PreplansPage,
  PreplansWorkQueuePage,
} from "./pages/PreplansModulePages.jsx";
const PreplanOperationalPage = lazyPage(() => import("./pages/PreplanOperationalPage.jsx"));
const OccupanciesMasterPage = lazyPage(() => import("./pages/OccupanciesMasterPage.jsx"));
const InspectionConfigStudioPage = lazyPage(() => import("./pages/InspectionConfigStudioPage.jsx"));
const ViolationsPage = lazyPage(() => import("./pages/ViolationsPage.jsx"));
const InspectionNoticesPage = lazyPage(() => import("./pages/InspectionNoticesPage.jsx"));
const InspectionEnforcementPage = lazyPage(() => import("./pages/InspectionEnforcementPage.jsx"));
const FireProtectionSystemsPage = lazyPage(() => import("./pages/FireProtectionSystemsPage.jsx"));
const InspectionFeesPage = lazyPage(() => import("./pages/InspectionFeesPage.jsx"));
const InspectionReportsPage = lazyPage(() => import("./pages/InspectionReportsPage.jsx"));
const InspectionOfflinePage = lazyPage(() => import("./pages/InspectionOfflinePage.jsx"));
const InspectionAutomationPage = lazyPage(() => import("./pages/InspectionAutomationPage.jsx"));
const InspectionHardeningPage = lazyPage(() => import("./pages/InspectionHardeningPage.jsx"));
import {
  AdoptedCodesPage,
  CodeAdministrationPage,
  CodeLibraryBrowsePage,
  CodeLibrarySavedPage,
  LocalAmendmentsLibraryPage,
} from "./pages/CodeLibraryPages.jsx";
const FleetDashboardPage = lazyPage(() => import("./pages/FleetDashboardPage.jsx"));
const FleetAssetsMasterPage = lazyPage(() => import("./pages/FleetAssetsMasterPage.jsx"));
const FleetConfigStudioPage = lazyPage(() => import("./pages/FleetConfigStudioPage.jsx"));
const FleetReadinessBoardPage = lazyPage(() => import("./pages/FleetReadinessBoardPage.jsx"));
const FleetDefectsPage = lazyPage(() => import("./pages/FleetDefectsPage.jsx"));
const FleetWorkOrdersPage = lazyPage(() => import("./pages/FleetWorkOrdersPage.jsx"));
const FleetPmForecastPage = lazyPage(() => import("./pages/FleetPmForecastPage.jsx"));
const FleetTestsPage = lazyPage(() => import("./pages/FleetTestsPage.jsx"));
const FleetFuelEnergyPage = lazyPage(() => import("./pages/FleetFuelEnergyPage.jsx"));
const FleetComponentsWarrantyPage = lazyPage(() => import("./pages/FleetComponentsWarrantyPage.jsx"));
const FleetOperationsPage = lazyPage(() => import("./pages/FleetOperationsPage.jsx"));
const FleetAccidentRiskPage = lazyPage(() => import("./pages/FleetAccidentRiskPage.jsx"));
const FleetProcurementPage = lazyPage(() => import("./pages/FleetProcurementPage.jsx"));
const FleetCostReplacementPage = lazyPage(() => import("./pages/FleetCostReplacementPage.jsx"));
const FleetReportingPage = lazyPage(() => import("./pages/FleetReportingPage.jsx"));
const FleetHardeningPage = lazyPage(() => import("./pages/FleetHardeningPage.jsx"));
const FleetVendorPortalPage = lazyPage(() => import("./pages/FleetVendorPortalPage.jsx"));
import { loadFleetSettings } from "./lib/fleet/index.js";

const navGroups = [
  { label: "", items: [["Dashboard", Home]] },
  { label: "RMS", items: [["Personnel", Users], ["Certifications", FileCheck2], ["Training", BookOpen], ["Academy Class Schedule", GraduationCap, FORGE_ACADEMY_CLASS_SCHEDULE_URL], ["Scheduling", CalendarDays], ["Time Sheets", Clock3], ["Daily Log", ClipboardCheck]] },
  { label: "Fleet", items: [
    ["Fleet Dashboard", Truck],
    ["Readiness Board", ClipboardCheck],
    ["Fleet Defects", AlertTriangle],
    ["Fleet Work Orders", Wrench],
    ["PM Forecast", CalendarDays],
    ["Fleet Tests", Gauge],
    ["Fuel & Energy", Activity],
    ["Components & Warranty", ShieldCheck],
    ["Fleet Operations", MapPin],
    ["Accident & Risk", AlertTriangle],
    ["Fleet Procurement", Landmark],
    ["Cost & Replacement", DollarSign],
    ["Reporting & Automation", FileBarChart2],
    ["Vendor Portal", Store],
    ["Fleet Hardening", ShieldCheck],
    ["All Fleet Assets", LayoutList],
    ["Fleet Configuration Studio", Settings2],
    ["Apparatus", Truck],
    ["Assets", PackageSearch],
    ["Maintenance", Wrench],
    ["Hose Testing", Gauge],
  ] },
  {
    label: "Prevention",
    tree: PREVENTION_NAV_TREE,
    items: [],
  },
  { label: "Reporting", items: [["NERIS Fire Reports", FileText], ["NERIS Analytics", BarChart3]] },
  { label: "Documents", items: [["SOGs / Policies", FileText], ["EMS Protocols", Ambulance], ["Forms", FileText], ["Uploads", Upload]] },
  { label: "Communications", items: [["Messages", Mail], ["Digital Dashboard", MonitorPlay]] },
  { label: "", items: [["Analytics", BarChart3], ["Creator Console", ShieldCheck], ["System Admin", Settings]] },
  { label: "Future / Later", items: [["Incidents", AlertTriangle], ["EMS Reports", Ambulance], ["Compliance Export", Upload]] }
];

// Every in-app page reachable from the menu, keyed by its URL slug (?page=...).
const PAGE_INDEX = buildPageIndex(
  navGroups
    .flatMap((group) => groupNavLeavesAsItems(group))
    .filter(([, , externalUrl]) => !externalUrl)
    .map(([name]) => name)
);

const kpis = [
  ["Personnel On Duty", "42", "of 56 Assigned", "info", Users, "Scheduling"],
  ["Staffing Deficit", "14", "25% Below Target", "critical", Users, "Scheduling"],
  ["Certifications Expiring", "18", "Next 30 Days", "warning", FileCheck2, "Certifications"],
  ["Training Compliance", "87%", "↑ 6% vs Last Month", "success", GraduationCap, "Training"],
  ["Units Available", "12", "of 18 Total", "info", Truck, "Apparatus"],
  ["Units Out of Service", "6", "33% of Fleet", "critical", Wrench, "Maintenance"],
  ["Inspections Due", "27", "Next 30 Days", "warning", ClipboardCheck, "Inspections Dashboard"],
  ["Open Tasks", "64", "Across All Areas", "info", FileCheck2, "Dashboard"]
];

const moduleData = {
  Personnel: { icon: Users, description: "Roster, assignments, contact information, documents, and employment status.", columns: ["Name", "Rank", "Assignment", "EMS Level", "Status"], rows: [["Jeremy Powell", "Fire Chief", "Administration", "Paramedic", "Active"], ["Stephen White", "Deputy Chief", "Administration", "Paramedic", "Active"], ["Gregory Scruggs", "Battalion Chief", "A Shift", "AEMT", "Active"], ["Mike Mallett", "Battalion Chief", "B Shift", "Paramedic", "Active"], ["Adam Tutor", "Captain", "C Shift", "EMT", "Active"], ["Cole Casey", "Firefighter", "A Shift", "Paramedic", "Leave"]] },
  Certifications: { icon: FileCheck2, description: "Renewal tracking and 30/60/90-day expiration alerts.", columns: ["Personnel", "Certification", "Expires", "Renewal", "Status"], rows: [["Cole Casey", "Paramedic", "Jun 24, 2026", "Submitted", "Due Soon"], ["Adam Tutor", "Firefighter II", "Jul 12, 2026", "Not Started", "Due Soon"], ["Mike Mallett", "Instructor I", "Aug 08, 2026", "In Progress", "Active"], ["Gregory Scruggs", "AEMT", "May 31, 2026", "Overdue", "Expired"]] },
  Training: { icon: BookOpen, description: "Events, attendance, hours, categories, and compliance tracking.", columns: ["Training Event", "Category", "Date", "Attendees", "Status"], rows: [["Live Fire Evolution", "Fire", "Jun 10", "18 / 24", "Scheduled"], ["Pediatric Airway", "EMS CE", "Jun 14", "12 / 18", "Scheduled"], ["Driver Operations", "Driver", "Jun 20", "9 / 12", "Scheduled"], ["HazMat Refresher", "Fire", "May 28", "21 / 24", "Complete"]] },
  Scheduling: { icon: CalendarDays, description: "A/B/C shift calendar, daily roster, apparatus assignments, leave, and overtime.", columns: ["Date", "Shift", "Staffed", "Minimum", "Coverage"], rows: [["Jun 7", "A Shift", "21", "21", "Complete"], ["Jun 8", "B Shift", "20", "21", "Deficit"], ["Jun 9", "C Shift", "22", "21", "Complete"], ["Jun 10", "A Shift", "21", "21", "Complete"]] },
  Apparatus: { icon: Truck, description: "Unit readiness, mileage, engine hours, pump hours, and repair history.", columns: ["Unit", "Type", "Mileage", "PM Due", "Status"], rows: [["Engine 1", "Pumper", "31,820", "Aug 2026", "In Service"], ["Engine 2", "Pumper", "44,091", "Jul 2026", "In Service"], ["Truck 3", "Ladder", "26,445", "Jun 2026", "PM Due"], ["Rescue 1", "Rescue", "19,230", "Sep 2026", "In Service"]] },
  Inspections: { icon: ClipboardCheck, description: "Inspection queue, violations, reinspection dates, and occupancy history.", columns: ["Occupancy", "Inspection", "Due", "Inspector", "Status"], rows: [["Central High School", "Annual", "Jun 12", "J. Mitchell", "Scheduled"], ["Logan's Roadhouse", "Reinspection", "Jun 8", "J. Mitchell", "Overdue"], ["Amazon Distribution", "Annual", "Jun 21", "J. Wade", "Scheduled"], ["Comfort Inn", "Reinspection", "Jun 15", "J. Wade", "Pending Review"]] },
  Hydrants: { icon: Activity, description: "Hydrant records, flow tests, inspections, district assignments, and readiness.", columns: ["Hydrant", "District", "Last Tested", "Flow Class", "Status"], rows: [["HL-1042", "1", "May 14, 2026", "Class AA", "Complete"], ["HL-1178", "2", "Apr 30, 2026", "Class A", "Complete"], ["HL-1281", "3", "Not tested", "Unknown", "Due Soon"], ["HL-1307P", "2", "Private", "Private", "Active"]] }
};

function toneFromStatus(value, fallback = "neutral") {
  const text = String(value).toLowerCase();
  if (/active|complete|approved|in service|scheduled|compliant|upcoming/.test(text)) return "success";
  if (/overdue|expired|deficit|out of service|high/.test(text)) return "critical";
  if (/due|pending|leave|pm|medium/.test(text)) return "warning";
  if (/review|submitted|progress/.test(text)) return "info";
  return fallback;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${toneFromStatus(children, tone)}`}>{children}</span>;
}

const NAV_SECTIONS_STORAGE_KEY = "rms-nav-sections-collapsed";
const NAV_NESTED_STORAGE_KEY = "rms-nav-nested-collapsed";

function navSectionKey(group, index) {
  return group.label ? group.label : `section-${index}`;
}

function navSectionTitle(group, index) {
  if (group.label) return group.label;
  if (groupHasNavTree(group) && group.tree?.length === 1) return group.tree[0].label || "Section";
  if (group.items?.length === 1) return group.items[0][0];
  return index === 0 ? "Home" : "System";
}

function readCollapsedNavSections() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NAV_SECTIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readCollapsedNestedNav() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NAV_NESTED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

function SideNav({ current, collapsed, setCollapsed, onNavigate, groups = navGroups }) {
  const [collapsedSections, setCollapsedSections] = useState(readCollapsedNavSections);
  const [collapsedNested, setCollapsedNested] = useState(readCollapsedNestedNav);

  useEffect(() => {
    const activeIndex = groups.findIndex((group) => groupContainsRoute(group, current));
    if (activeIndex < 0) return;
    const key = navSectionKey(groups[activeIndex], activeIndex);
    setCollapsedSections((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev, [key]: false };
      persistJson(NAV_SECTIONS_STORAGE_KEY, next);
      return next;
    });

    const activeGroup = groups[activeIndex];
    if (groupHasNavTree(activeGroup)) {
      const branchIds = findActiveNavBranchIds(activeGroup.tree, current);
      if (!branchIds.length) return;
      setCollapsedNested((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of branchIds) {
          if (next[id]) {
            next[id] = false;
            changed = true;
          }
        }
        if (!changed) return prev;
        persistJson(NAV_NESTED_STORAGE_KEY, next);
        return next;
      });
    }
  }, [current, groups]);

  function toggleSection(key) {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persistJson(NAV_SECTIONS_STORAGE_KEY, next);
      return next;
    });
  }

  function toggleNested(id) {
    setCollapsedNested((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persistJson(NAV_NESTED_STORAGE_KEY, next);
      return next;
    });
  }

  function handleNavClick(name, externalUrl) {
    const url = typeof externalUrl === "string" ? externalUrl.trim() : "";
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (name === "Academy Class Schedule") {
      window.open(FORGE_ACADEMY_CLASS_SCHEDULE_URL, "_blank", "noopener,noreferrer");
      return;
    }
    onNavigate(name);
  }

  function renderNavTree(nodes, depth = 0) {
    return (nodes || []).map((node) => {
      if (isNavBranch(node)) {
        const branchId = node.id || node.label;
        const isBranchCollapsed = collapsedNested[branchId] === undefined
          ? true
          : Boolean(collapsedNested[branchId]);
        const hasActive = branchContainsRoute(node, current);
        const BranchIcon = typeof node.icon === "function" ? node.icon : ShieldCheck;
        return (
          <div
            key={navNodeKey(node)}
            className={`nav-branch depth-${depth}${hasActive ? " has-active" : ""}`}
            style={{ "--nav-depth": depth }}
          >
            {!collapsed ? (
              <button
                type="button"
                className={`nav-item nav-branch-toggle${hasActive ? " has-active" : ""}`}
                aria-expanded={!isBranchCollapsed}
                aria-controls={`nav-branch-${branchId}`}
                id={`nav-branch-btn-${branchId}`}
                onClick={() => toggleNested(branchId)}
              >
                <BranchIcon size={15} aria-hidden />
                <span>{navNodeLabel(node)}</span>
                <ChevronDown size={14} className="nav-branch-chevron" aria-hidden />
              </button>
            ) : null}
            <div
              id={`nav-branch-${branchId}`}
              className="nav-branch-items"
              role="group"
              aria-labelledby={!collapsed ? `nav-branch-btn-${branchId}` : undefined}
              hidden={isBranchCollapsed && !collapsed}
            >
              {renderNavTree(node.children, depth + 1)}
            </div>
          </div>
        );
      }

      const NavIcon = typeof node.icon === "function" ? node.icon : ShieldCheck;
      const isExternal =
        (typeof node.externalUrl === "string" && /^https?:\/\//i.test(node.externalUrl))
        || node.name === "Academy Class Schedule";
      const display = navNodeLabel(node);
      return (
        <button
          key={navNodeKey(node)}
          type="button"
          className={!isExternal && current === node.name ? "nav-item active" : "nav-item"}
          style={{ "--nav-depth": depth }}
          onClick={() => handleNavClick(node.name, node.externalUrl)}
          title={isExternal ? `${display} (opens Academy)` : display}
          aria-current={!isExternal && current === node.name ? "page" : undefined}
        >
          <NavIcon size={15} aria-hidden />
          <span>{display}</span>
          {isExternal && !collapsed ? (
            <ExternalLink size={12} className="nav-external-icon" aria-hidden />
          ) : null}
        </button>
      );
    });
  }

  function branchContainsRoute(branch, routeName) {
    if (!routeName || !branch) return false;
    if (!isNavBranch(branch)) return branch.name === routeName;
    return (branch.children || []).some((child) => branchContainsRoute(child, routeName));
  }

  return (
    <aside className={`side-nav ${collapsed ? "collapsed" : ""}`}>
      <nav aria-label="Primary">
        {groups.map((group, index) => {
          const key = navSectionKey(group, index);
          const title = navSectionTitle(group, index);
          const isSectionCollapsed = Boolean(collapsedSections[key]);
          const showHeader = Boolean(group.label) || groupHasNavTree(group) || (group.items?.length || 0) > 1;
          const sectionHasActive = groupContainsRoute(group, current);

          return (
            <section
              key={key}
              className={[
                isSectionCollapsed && !collapsed ? "is-collapsed" : "",
                sectionHasActive ? "has-active" : "",
              ].filter(Boolean).join(" ") || undefined}
            >
              {!collapsed && showHeader ? (
                <button
                  type="button"
                  className={`nav-section-toggle${sectionHasActive ? " has-active" : ""}`}
                  aria-expanded={!isSectionCollapsed}
                  onClick={() => toggleSection(key)}
                >
                  <span className="nav-label">{title}</span>
                  <ChevronDown size={14} aria-hidden />
                </button>
              ) : null}
              <div className="nav-section-items" hidden={isSectionCollapsed && !collapsed}>
                {groupHasNavTree(group)
                  ? renderNavTree(group.tree, 0)
                  : group.items.map(([name, Icon, externalUrl]) => {
                      const NavIcon = typeof Icon === "function" ? Icon : ShieldCheck;
                      const isExternal =
                        (typeof externalUrl === "string" && /^https?:\/\//i.test(externalUrl))
                        || name === "Academy Class Schedule";
                      return (
                        <button
                          key={name}
                          className={!isExternal && current === name ? "nav-item active" : "nav-item"}
                          onClick={() => handleNavClick(name, externalUrl)}
                          title={isExternal ? `${name} (opens Academy)` : name}
                          type="button"
                          aria-current={!isExternal && current === name ? "page" : undefined}
                        >
                          <NavIcon size={15} aria-hidden />
                          <span>{name}</span>
                          {isExternal && !collapsed ? (
                            <ExternalLink size={12} className="nav-external-icon" aria-hidden />
                          ) : null}
                        </button>
                      );
                    })}
              </div>
            </section>
          );
        })}
      </nav>
      <button className="nav-collapse" type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>
    </aside>
  );
}

function NotificationBell({ departmentId, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((item) => item.status === "unread").length;

  useEffect(() => {
    if (!departmentId) return undefined;
    let cancelled = false;
    listUserNotifications(departmentId, userId).then((items) => {
      if (!cancelled) setNotifications(items.slice(0, 20));
    });
    return () => { cancelled = true; };
  }, [departmentId, userId]);

  async function handleRead(notificationId) {
    await markNotificationRead(departmentId, notificationId);
    setNotifications((current) =>
      current.map((item) => item.id === notificationId ? { ...item, status: "read" } : item)
    );
  }

  return <div className="notification-wrap">
    <button className="icon-button notification-button" onClick={() => setOpen(!open)} type="button">
      <Bell size={17} />
      {unread > 0 && <i>{unread}</i>}
    </button>
    {open && (
      <section className="notification-panel">
        <header><strong>Notifications</strong><button onClick={() => setOpen(false)}><X size={14} /></button></header>
        <div className="notification-list">
          {notifications.map((item) => (
            <button key={item.id} className={item.status === "unread" ? "notification-item unread" : "notification-item"} onClick={() => handleRead(item.id)}>
              <strong>{item.title}</strong>
              <span>{item.message}</span>
              <small>{String(item.created_at || "").slice(0, 16)}</small>
            </button>
          ))}
          {!notifications.length && <p className="empty-table">No notifications yet.</p>}
        </div>
      </section>
    )}
  </div>;
}

function useLiveClock(timezone = "America/Chicago") {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(now);

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(now);

  return { dateLabel, timeLabel };
}

function TopBar({
  query,
  setQuery,
  toggleMobileNav,
  profile,
  membership,
  user,
  onSignOut,
  appView,
  onSelectAdminView,
  onSelectEmployeeView,
  showAdminToggle,
  showEmployeeToggle,
  departmentId,
  isCreator,
  wideBrandLogo = false,
  tagline = "",
  hideSearch = false
}) {
  const initials = membershipInitials(membership, user);
  const displayName = membership?.displayName || user?.displayName || user?.email || "User";
  const roleLabel = formatRoleLabel(membership?.role || "member", membership);
  const { dateLabel, timeLabel } = useLiveClock(profile.timezone || "America/Chicago");
  const brandTitle = profile.displayTitle || profile.name || defaultPlatformConfig.platformTitle;
  const brandSubtitle = profile.shortName || profile.name;

  return <header className="top-bar">
    <button className="icon-button mobile-menu" type="button" aria-label="Menu" onClick={toggleMobileNav}><Menu size={19} /></button>
    <div className="top-bar-lead">
      <div className="top-bar-lead-row">
        <div className={`top-brand ${wideBrandLogo ? "top-brand-wide" : ""}`}>
          <div className={wideBrandLogo ? "top-brand-logo-wrap" : undefined}>
            <img src={resolveDepartmentLogoUrl(profile.logoUrl)} alt={profile.name} />
          </div>
          {!wideBrandLogo && (
            <div className="top-brand-text">
              <strong>{brandTitle}</strong>
              {brandSubtitle && brandSubtitle !== brandTitle && <span>{brandSubtitle}</span>}
            </div>
          )}
        </div>
        <DepartmentSwitcher isCreator={isCreator} />
        {(showAdminToggle || showEmployeeToggle) && (
          <div className="segmented-control view-toggle">
            {showAdminToggle && (
              <button
                type="button"
                className={appView === "admin" ? "active" : ""}
                title="Open command center with sidebar modules"
                onClick={onSelectAdminView}
              >
                Admin RMS
              </button>
            )}
            {showEmployeeToggle && (
              <button
                type="button"
                className={appView === "employee" ? "active" : ""}
                title="Open self-service member portal"
                onClick={onSelectEmployeeView}
              >
                Employee Portal
              </button>
            )}
          </div>
        )}
      </div>
      {tagline && <p className="top-bar-tagline">{tagline}</p>}
    </div>
    <div className="top-bar-utilities">
      <div className="command-time"><span><CalendarDays size={15} /> {dateLabel}</span><span><Clock3 size={15} /> {timeLabel}</span></div>
      {!hideSearch && <label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search personnel, apparatus, occupancies, training, inspections..." /></label>}
      <NotificationBell departmentId={departmentId} userId={user?.uid} />
      <button className="profile-button" type="button" onClick={onSignOut} title="Sign out">
        <span>{initials}</span>
        <div><strong>{displayName}</strong><small>{roleLabel}</small></div>
        <ChevronRight size={13} />
      </button>
    </div>
  </header>;
}

/** Shown in the page area while a module's code downloads the first time. */
function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="page-loading-spinner" aria-hidden="true" />
      <span>Loading...</span>
    </div>
  );
}

function LoadingScreen({ message = "Loading..." }) {
  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle />
      </div>
      <section className="auth-card auth-loading"><p>{message}</p></section>
    </div>
  );
}

const DEEP_LINK_SESSION_KEY = "rms-deep-link-applied";

function wasDeepLinkApplied() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEEP_LINK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markDeepLinkApplied() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEEP_LINK_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

function Panel({ title, icon: Icon, action, children, className = "" }) {
  return <section className={`panel ${className}`}><header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header><div className="panel-body">{children}</div></section>;
}

function MiniTable({ columns, rows }) {
  const safeRows = normalizeTableRows(rows);
  return <div className="mini-table"><div className="mini-row mini-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>{columns.map((column) => <span key={column}>{column}</span>)}</div>{safeRows.map((row, rowIndex) => <div className="mini-row" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }} key={`${row.join("-")}-${rowIndex}`}>{row.map((cell, index) => <span key={`${cell}-${index}`} className={index === row.length - 1 ? `cell-${toneFromStatus(cell)}` : ""}>{cell}</span>)}</div>)}</div>;
}

function trainingCompliancePercent(records = []) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + Number(record.completion || 0), 0) / records.length);
}

function DataTable({ columns, rows, query }) {
  const filtered = useMemo(() => rows.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase())), [rows, query]);
  return <div className="data-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th /></tr></thead><tbody>{filtered.map((row) => <tr key={row.join("-")}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{index === row.length - 1 ? <Badge>{cell}</Badge> : cell}</td>)}<td><button className="row-action">Open</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-table">No records match the current search.</div>}</div>;
}

function CertificationsPage({ query, records = [], setRecords, canEdit = false, departmentId = "" }) {
  const [filter, setFilter] = useState("All");
  const [lifecycleView, setLifecycleView] = useState("active");
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [uploadDraft, setUploadDraft] = useState({ issue: "", expires: "", file: null });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");

  const scoped = records.filter((record) => !isObjectDeleted(record)).filter((record) => (
    lifecycleView === "archived" ? isObjectVisibleInArchivedList(record) : isObjectVisibleInActiveList(record)
  ));
  const filtered = scoped.filter((record) => (
    (filter === "All" || record.status === filter || record.category === filter)
    && Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase())
  ));
  const activeRecords = records.filter((record) => isObjectVisibleInActiveList(record));
  const archivedCount = records.filter((record) => isObjectArchived(record)).length;

  function openUpload(record) {
    if (!canEdit || !record || isObjectArchived(record)) return;
    setUploading(record);
    setUploadDraft({
      issue: record.issue || "",
      expires: record.expires || "",
      file: null,
    });
  }

  function updateRenewal(id, renewal) {
    if (!canEdit) return;
    setRecords((current) => current.map((record) => record.id === id ? { ...record, renewal, status: renewal === "Approved" ? "Active" : record.status } : record));
    setMessage(`Renewal status updated to ${renewal}`);
  }

  async function completeUpload() {
    if (!canEdit || !uploading || !departmentId) return;
    if (!uploadDraft.file) {
      setMessage("Choose a credential file before uploading");
      return;
    }
    setBusy(true);
    try {
      const storagePath = buildCertificationDocPath(departmentId, uploading.id, uploadDraft.file.name);
      const uploaded = await uploadFirebaseFile(storagePath, uploadDraft.file);
      if (!uploaded?.downloadUrl) throw new Error("Upload failed");
      const issue = uploadDraft.issue || uploading.issue;
      const expires = uploadDraft.expires || uploading.expires;
      const days = expires
        ? Math.ceil((new Date(`${expires}T12:00:00`) - new Date()) / (1000 * 60 * 60 * 24))
        : uploading.days;
      setRecords((current) => current.map((record) => (
        record.id === uploading.id
          ? {
              ...record,
              issue,
              expires,
              days,
              document: uploadDraft.file.name,
              documentUrl: uploaded.downloadUrl,
              documentStoragePath: uploaded.storagePath,
              renewal: "Submitted",
              status: days < 0 ? "Expired" : record.status === "Expired" && days >= 0 ? "Active" : record.status,
            }
          : record
      )));
      setMessage("Certification document uploaded and renewal submitted");
      setUploading(null);
      setUploadDraft({ issue: "", expires: "", file: null });
    } catch (error) {
      console.error("Certification upload failed", error);
      setMessage("Certification upload failed — try again");
    } finally {
      setBusy(false);
    }
  }

  async function runLifecycle(record, action) {
    if (!canEdit || !record) return;
    setBusyId(record.id);
    try {
      if (action === "archive") {
        setRecords((current) => current.map((item) => item.id === record.id ? archiveObject(item) : item));
        if (selected?.id === record.id) setSelected(null);
        setMessage("Certification archived.");
      } else if (action === "restore") {
        setRecords((current) => current.map((item) => item.id === record.id ? restoreObject(item) : item));
        setLifecycleView("active");
        setMessage("Certification restored.");
      } else if (action === "delete") {
        if (record.documentStoragePath) await deleteFirebaseFile(record.documentStoragePath);
        setRecords((current) => current.map((item) => item.id === record.id ? softDeleteObject(item) : item));
        if (selected?.id === record.id) setSelected(null);
        if (uploading?.id === record.id) setUploading(null);
        setMessage(`Deleted ${record.person} · ${record.type}`);
      }
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="module-page certifications-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><FileCheck2 size={22} /></span>
          <div>
            <h1>Certifications</h1>
            <p>Expiration alerts, renewal status, uploaded credentials, and compliance review.</p>
          </div>
        </div>
        <div className="heading-actions">
          <button className="secondary-button">Export Compliance</button>
          {canEdit ? (
            <button className="primary-button" onClick={() => openUpload(activeRecords[0])} disabled={!activeRecords[0]}>
              <UploadCloud size={14} /> Upload Certification
            </button>
          ) : null}
        </div>
      </section>
      <section className="cert-summary">
        {[
          ["Expired", activeRecords.filter((r) => r.status === "Expired").length, "critical"],
          ["Due in 30 Days", activeRecords.filter((r) => r.days >= 0 && r.days <= 30).length, "critical"],
          ["Due in 60 Days", activeRecords.filter((r) => r.days > 30 && r.days <= 60).length, "warning"],
          ["Due in 90 Days", activeRecords.filter((r) => r.days > 60 && r.days <= 90).length, "info"],
          ["Active", activeRecords.filter((r) => r.status === "Active").length, "success"],
        ].map(([label, value, tone]) => (
          <button
            key={label}
            className={`cert-stat stat-${tone}`}
            onClick={() => {
              setLifecycleView("active");
              setFilter(label === "Expired" ? "Expired" : label === "Active" ? "Active" : "All");
            }}
          >
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </section>
      {message ? (
        <div className="success-banner">
          {message}
          <button onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      ) : null}
      <section className="cert-toolbar">
        <div className="segmented-control">
          <button className={lifecycleView === "active" ? "active" : ""} onClick={() => setLifecycleView("active")}>Active</button>
          <button className={lifecycleView === "archived" ? "active" : ""} onClick={() => setLifecycleView("archived")}>
            Archived{archivedCount ? ` (${archivedCount})` : ""}
          </button>
        </div>
        <div className="segmented-control">
          {["All", "EMS", "Fire", "Due Soon", "Expired"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <span>{filtered.length} certifications shown</span>
      </section>
      <Panel title="Certification Compliance Records" icon={FileCheck2} action={<button className="text-button">Configure columns</button>}>
        <div className="cert-table">
          <div className="cert-row cert-head">
            <span>Personnel</span><span>Certification</span><span>Category</span><span>Issue Date</span>
            <span>Expiration</span><span>Days</span><span>Renewal</span><span>Status</span><span />
          </div>
          {filtered.map((record) => (
            <div className="cert-row" key={record.id}>
              <button className="link-button" onClick={() => setSelected(record)}>{record.person}</button>
              <span>{record.type}</span>
              <span>{record.category}</span>
              <span>{record.issue}</span>
              <span>{record.expires}</span>
              <strong className={`days-${record.days < 0 ? "critical" : record.days <= 30 ? "critical" : record.days <= 90 ? "warning" : "neutral"}`}>
                {record.days < 0 ? `${Math.abs(record.days)} overdue` : record.days}
              </strong>
              {canEdit && !isObjectArchived(record) ? (
                <ManagedSelect dropdownId="certRenewalStatus" value={record.renewal} onChange={(value) => updateRenewal(record.id, value)} />
              ) : (
                <span>{record.renewal}</span>
              )}
              <Badge>{isObjectArchived(record) ? "Archived" : record.status}</Badge>
              <div className="inline-actions">
                {canEdit && !isObjectArchived(record) ? (
                  <button className="row-action" onClick={() => openUpload(record)}>
                    {record.document || record.documentUrl ? "Replace" : "Upload"}
                  </button>
                ) : null}
                <ObjectLifecycleActions
                  record={record}
                  canEdit={canEdit}
                  busy={busyId === record.id}
                  compact
                  onArchive={() => runLifecycle(record, "archive")}
                  onRestore={() => runLifecycle(record, "restore")}
                  onDelete={() => runLifecycle(record, "delete")}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      {selected ? (
        <Modal title={`${selected.person} · ${selected.type}`} onClose={() => setSelected(null)}>
          <div className="cert-detail-grid">
            {[
              ["Certification ID", selected.id],
              ["Category", selected.category],
              ["Issue Date", selected.issue],
              ["Expiration Date", selected.expires],
              ["Renewal Status", selected.renewal],
              ["Lifecycle", isObjectArchived(selected) ? "Archived" : "Active"],
              ["Document", selected.document || "No document uploaded"],
            ].map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
          {selected.documentUrl ? (
            <a className="primary-button" href={selected.documentUrl} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: "inline-flex" }}>
              Open Document
            </a>
          ) : null}
          <div className="modal-actions" style={{ flexWrap: "wrap", gap: 8 }}>
            <button className="secondary-button" onClick={() => setSelected(null)}>Close</button>
            <ObjectLifecycleActions
              record={selected}
              canEdit={canEdit}
              busy={busyId === selected.id}
              onArchive={() => runLifecycle(selected, "archive")}
              onRestore={() => runLifecycle(selected, "restore")}
              onDelete={() => runLifecycle(selected, "delete")}
            />
            {canEdit && !isObjectArchived(selected) ? (
              <button className="primary-button" onClick={() => { openUpload(selected); setSelected(null); }}>
                <UploadCloud size={14} /> Upload Renewal
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {uploading && canEdit ? (
        <Modal title="Upload Certification Document" onClose={() => !busy && setUploading(null)}>
          <div className="upload-zone">
            <UploadCloud size={28} />
            <strong>{uploading.person} · {uploading.type}</strong>
            <span>
              {uploadDraft.file
                ? `Selected: ${uploadDraft.file.name}`
                : "Drop a PDF or image credential here, or select a file."}
            </span>
            <input
              type="file"
              accept="image/*,.pdf,.png,.jpg,.jpeg,.webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setUploadDraft((current) => ({ ...current, file }));
              }}
            />
          </div>
          <div className="upload-form">
            <label>
              <span>Issue Date</span>
              <input
                type="date"
                value={uploadDraft.issue}
                disabled={busy}
                onChange={(event) => setUploadDraft((current) => ({ ...current, issue: event.target.value }))}
              />
            </label>
            <label>
              <span>Expiration Date</span>
              <input
                type="date"
                value={uploadDraft.expires}
                disabled={busy}
                onChange={(event) => setUploadDraft((current) => ({ ...current, expires: event.target.value }))}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setUploading(null)}>Cancel</button>
            <button className="primary-button" disabled={busy || !uploadDraft.file || !departmentId} onClick={completeUpload}>
              <UploadCloud size={14} /> {busy ? "Uploading…" : "Upload & Submit"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

const ADMIN_SCHEDULE_TABS = [
  { id: "daily", label: "Daily Roster" },
  { id: "requests", label: "Requests & Coverage" },
  { id: "trades", label: "Shift Trades" },
  { id: "callshift", label: "Shift Broadcast" },
];

const ADMIN_SCHEDULE_RANGE_TABS = [
  { id: "week", label: "7-Day Schedule" },
  { id: "calendar", label: "30 Day Calendar" },
];

function SchedulingPage({
  days = [],
  setDays,
  roster = [],
  setRoster,
  personnel = [],
  setPersonnel,
  apparatus = [],
  leaveRequests = [],
  setLeaveRequests,
  overtimeOffers = [],
  setOvertimeOffers,
  vacancyPickups = [],
  setVacancyPickups,
  shiftTrades = [],
  setShiftTrades,
  callShifts = [],
  setCallShifts,
  shiftRotation,
  profileShifts = [],
  schedulingSettings = {},
  departmentName = "",
  departmentId = "",
  stationNames = [],
  shiftChangeTime = "07:00",
  canEditRoster = false,
  canManageCallShifts = false,
  callShiftRules = [],
  rosterLoaded = true,
  initialTab = null,
  onInitialTabConsumed,
}) {
  const rotation = useMemo(
    () => resolveShiftRotation(shiftRotation, profileShifts),
    [shiftRotation, profileShifts]
  );
  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [selectedId, setSelectedId] = useState(formatDayId(today));
  const [message, setMessage] = useState("");
  const [rosterTab, setRosterTab] = useState("daily");
  const [weekRosterStartId, setWeekRosterStartId] = useState(() => formatDayId(today));

  useEffect(() => {
    if (!initialTab) return;
    setRosterTab(initialTab);
    onInitialTabConsumed?.();
  }, [initialTab, onInitialTabConsumed]);

  useEffect(() => {
    if (rosterTab === "week") {
      setWeekRosterStartId(formatDayId(new Date()));
    }
  }, [rosterTab]);

  const selectedDay = useMemo(() => {
    const monthCells = buildMonthCalendar(calendarYear, calendarMonth, days, rotation);
    const now = new Date();
    const fallback = {
      id: formatDayId(now),
      shift: "A Shift",
      staffed: 21,
      minimum: 21,
      leave: 0,
      status: "Complete",
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    return monthCells.find((cell) => cell.kind === "day" && cell.id === selectedId)
      || monthCells.find((cell) => cell.kind === "day")
      || (Array.isArray(days) ? days.find(Boolean) : null)
      || fallback;
  }, [calendarYear, calendarMonth, days, rotation, selectedId]);

  const displayUnits = useMemo(
    () => resolveSchedulingDisplayUnits(schedulingSettings, apparatus),
    [schedulingSettings, apparatus]
  );
  const unitOptions = useMemo(
    () => buildSchedulingUnitOptions(apparatus, schedulingSettings),
    [apparatus, schedulingSettings]
  );
  const dayRoster = useMemo(
    () => buildDayRoster({
      roster,
      personnel,
      selectedShift: selectedDay?.shift || "",
      selectedDayId: selectedId,
      leaveRequests,
      shiftTrades,
      knownUnits: unitOptions,
    }),
    [roster, personnel, selectedDay?.shift, selectedId, leaveRequests, shiftTrades, unitOptions]
  );
  const dayCoverage = useMemo(
    () => resolveDayCoverageMetrics({ dayRoster, personnel }),
    [dayRoster, personnel]
  );
  const rosterSnapshotOptions = useMemo(() => ({
    scheduleDays: days,
    rotation,
    roster,
    personnel,
    leaveRequests,
    shiftTrades,
    schedulingSettings,
    apparatus,
    shiftChangeTime,
  }), [days, rotation, roster, personnel, leaveRequests, shiftTrades, schedulingSettings, apparatus, shiftChangeTime]);
  const selectedDaySnapshot = useMemo(
    () => {
      try {
        return buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: selectedId });
      } catch (error) {
        console.error("Failed to build day schedule snapshot", error);
        return {
          id: selectedId,
          shift: selectedDay?.shift || "A Shift",
          weekday: "",
          date: "",
          staffed: 0,
          minimum: 0,
          leave: 0,
          status: "Deficit",
          roster: [],
          coverage: { staffed: 0, minimum: 0, leave: 0, status: "Deficit", vacancies: 0 },
          displayUnits: [],
          apparatusVacancies: [],
          apparatusGroups: { grouped: [] },
          openVacancies: [],
        };
      }
    },
    [rosterSnapshotOptions, selectedId, selectedDay?.shift]
  );
  const weekSnapshots = useMemo(
    () => {
      try {
        return buildWeekScheduleSnapshots({ ...rosterSnapshotOptions, referenceDayId: weekRosterStartId });
      } catch (error) {
        console.error("Failed to build week schedule snapshots", error);
        return [];
      }
    },
    [rosterSnapshotOptions, weekRosterStartId]
  );
  const liveMonthMetrics = useMemo(() => {
    const monthCells = buildMonthCalendar(calendarYear, calendarMonth, days, rotation)
      .filter((cell) => cell.kind === "day");
    return Object.fromEntries(monthCells.map((cell) => {
      try {
        const snapshot = buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: cell.id });
        return [cell.id, {
          staffed: snapshot.staffed,
          minimum: snapshot.minimum,
          leave: snapshot.leave,
          status: snapshot.status,
        }];
      } catch (error) {
        console.error("Failed to build month metrics for", cell.id, error);
        return [cell.id, { staffed: 0, minimum: 0, leave: 0, status: "Deficit" }];
      }
    }));
  }, [calendarYear, calendarMonth, days, rotation, rosterSnapshotOptions]);
  const vacancies = selectedDaySnapshot?.openVacancies?.length ?? dayCoverage.vacancies ?? 0;
  const scheduleStats = [
    { label: "Selected Shift", value: shiftShortLabel(selectedDaySnapshot?.shift || selectedDay?.shift || ""), tone: "info", icon: CalendarDays },
    { label: "Staffed Today", value: selectedDaySnapshot?.coverage?.staffed ?? dayCoverage.staffed, tone: "success", icon: Users },
    { label: "Daily Staffing", value: selectedDaySnapshot?.coverage?.minimum ?? dayCoverage.minimum, tone: "neutral", icon: ShieldCheck },
    { label: "Open Vacancies", value: vacancies, tone: vacancies > 0 ? "critical" : "success", icon: AlertTriangle },
    { label: "Leave Today", value: selectedDaySnapshot?.coverage?.leave ?? dayCoverage.leave, tone: (selectedDaySnapshot?.coverage?.leave ?? dayCoverage.leave) > 0 ? "warning" : "neutral", icon: Clock3 },
  ];

  function selectDay(day) {
    const snapshot = buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: day.id });
    setSelectedId(day.id);
    if (!setDays) return;
    setDays((current) => {
      const nextEntry = {
        id: day.id,
        weekday: snapshot.weekday || day.weekday,
        date: snapshot.date || day.date,
        shift: snapshot.shift || day.shift,
        staffed: snapshot.staffed,
        minimum: snapshot.minimum,
        leave: snapshot.leave,
        status: snapshot.status,
      };
      if (current.some((entry) => entry.id === day.id)) {
        return current.map((entry) => (entry.id === day.id ? { ...entry, ...nextEntry } : entry));
      }
      return [...current, nextEntry];
    });
  }

  function shiftSelectedWeek(delta) {
    const date = parseDayId(weekRosterStartId);
    date.setDate(date.getDate() + (delta * 7));
    const nextId = formatDayId(date);
    setWeekRosterStartId(nextId);
    setSelectedId(nextId);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  }

  function shiftSelectedDay(delta) {
    const date = parseDayId(selectedId);
    date.setDate(date.getDate() + delta);
    const nextId = formatDayId(date);
    const snapshot = buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: nextId });
    selectDay({
      id: nextId,
      kind: "day",
      weekday: snapshot.weekday,
      date: snapshot.date,
      shift: snapshot.shift,
    });
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  }

  function updateApparatus(id, nextApparatus, explicitPersonnelId = "") {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }

    const personId = resolveRosterPersonnelId(id, explicitPersonnelId);
    if (!personId) {
      setMessage("Could not identify personnel for that assignment");
      return;
    }

    const person = personnel.find((entry) => entry.id === personId);
    if (!person) {
      setMessage(`Personnel record not found for ${personId}`);
      return;
    }

    const dayId = selectedId;
    const rosterId = String(id || "").includes(":S")
      ? String(id)
      : buildDayScopedRosterId(personId, dayId);
    const isLeave = nextApparatus === "Vacation" || nextApparatus === "Sick" || nextApparatus === "Leave";

    setRoster((current) => {
      const existing = current.find((member) => member.id === rosterId);
      const nextMember = {
        id: rosterId,
        personnelId: personId,
        dayId,
        name: getPersonDisplayName(person),
        rank: person.rank,
        shift: person.shift,
        apparatus: isLeave ? nextApparatus : nextApparatus,
        leaveType: nextApparatus === "Vacation" ? "Vacation" : nextApparatus === "Sick" ? "Sick" : "",
        position: person.position || (person.driver === "Approved" ? "Driver" : person.ems || "Firefighter"),
        status: isLeave ? "Leave" : "On Duty",
        durationHours: existing?.durationHours ?? DEFAULT_SHIFT_DURATION_HOURS,
        shiftStartTime: existing?.shiftStartTime ?? null,
        shiftEndTime: existing?.shiftEndTime ?? null,
        shiftEndDayOffset: Number.isInteger(existing?.shiftEndDayOffset) ? existing.shiftEndDayOffset : null,
        slotRole: existing?.slotRole ?? null,
        slotIndex: Number.isInteger(existing?.slotIndex) ? existing.slotIndex : null,
      };

      if (existing) {
        return current.map((member) => (member.id === rosterId ? { ...member, ...nextMember } : member));
      }

      return [...current, nextMember];
    });

    if (!isLeave && nextApparatus !== "Unassigned" && setPersonnel) {
      const unit = canonicalApparatusUnitName(nextApparatus);
      setPersonnel((current) => current.map((entry) => (
        entry.id === personId ? { ...entry, unit, assignment: unit } : entry
      )));
    }

    setMessage(
      isLeave
        ? `${getPersonDisplayName(person)} marked ${nextApparatus} for ${selectedDaySnapshot.date}`
        : "Apparatus assignment updated"
    );
  }

  function updateMemberShiftTime(rosterEntryId, shiftTimes = {}, slotOptions = {}) {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }
    if (!rosterEntryId) return;

    const shiftStartTime = normalizeShiftTime(shiftTimes.shiftStartTime, shiftChangeTime);
    const shiftEndTime = normalizeShiftTime(shiftTimes.shiftEndTime, shiftChangeTime);
    const shiftEndDayOffset = shiftTimes.shiftEndDayOffset ? 1 : 0;
    const durationHours = calculateShiftDurationHours(shiftStartTime, shiftEndTime, shiftEndDayOffset);
    const { slotRole = null, slotIndex = null } = slotOptions;

    setRoster((current) => current.map((member) => (
      member.id === rosterEntryId
        ? {
          ...member,
          shiftStartTime,
          shiftEndTime,
          shiftEndDayOffset,
          durationHours,
          slotRole: slotRole ?? member.slotRole ?? null,
          slotIndex: Number.isInteger(slotIndex) ? slotIndex : (member.slotIndex ?? null),
        }
        : member
    )));
    setMessage(`Shift time updated · ${formatDurationLabel(durationHours)}`);
  }

  function assignPersonToUnit(personnelId, unit, slotOptions = {}) {
    if (!personnelId || !unit) return;

    const {
      slotRole = null,
      slotIndex = null,
      isPartial = false,
      shiftStartTime = null,
      shiftEndTime = null,
      shiftEndDayOffset = null,
    } = slotOptions;

    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }

    const person = personnel.find((entry) => entry.id === personnelId);
    if (!person) {
      setMessage("Personnel record not found");
      return;
    }

    const dayId = selectedId;
    const normalizedUnit = canonicalApparatusUnitName(unit);
    const defaultTimes = buildDefaultShiftTimes(shiftChangeTime);
    const resolvedStart = normalizeShiftTime(shiftStartTime || defaultTimes.shiftStartTime, shiftChangeTime);
    const resolvedEnd = normalizeShiftTime(shiftEndTime || defaultTimes.shiftEndTime, shiftChangeTime);
    const resolvedEndDayOffset = shiftEndDayOffset != null
      ? (shiftEndDayOffset ? 1 : 0)
      : defaultTimes.shiftEndDayOffset;
    const parsedDuration = calculateShiftDurationHours(resolvedStart, resolvedEnd, resolvedEndDayOffset);

    let rosterId = buildDayScopedRosterId(personnelId, dayId);
    if (isPartial && Number.isInteger(slotIndex)) {
      rosterId = buildPartialSlotRosterId(personnelId, dayId, normalizedUnit, slotIndex);
    }

    setRoster((current) => {
      const existing = current.find((member) => member.id === rosterId);
      const nextMember = {
        id: rosterId,
        personnelId,
        dayId,
        name: getPersonDisplayName(person),
        rank: person.rank,
        shift: person.shift,
        apparatus: normalizedUnit,
        position: person.position || (person.driver === "Approved" ? "Driver" : person.ems || "Firefighter"),
        status: "On Duty",
        shiftStartTime: resolvedStart,
        shiftEndTime: resolvedEnd,
        shiftEndDayOffset: resolvedEndDayOffset,
        durationHours: parsedDuration,
        slotRole: slotRole ?? null,
        slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      };

      if (existing) {
        return current.map((member) => (member.id === rosterId ? { ...member, ...nextMember } : member));
      }

      return [...current, nextMember];
    });

    if (!isPartial && setPersonnel) {
      setPersonnel((current) => current.map((entry) => (
        entry.id === personnelId
          ? { ...entry, unit: normalizedUnit, assignment: normalizedUnit }
          : entry
      )));
    }

    setMessage(
      isPartial
        ? `${getPersonDisplayName(person)} assigned ${formatDurationLabel(parsedDuration)} on ${normalizedUnit}`
        : "Apparatus assignment updated"
    );
  }

  function addOvertimeToUnit(personnelId, unit) {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }
    if (!personnelId || !unit) return;

    const person = personnel.find((entry) => entry.id === personnelId);
    if (!person) {
      setMessage("Personnel record not found");
      return;
    }

    const dayId = selectedId;
    const normalizedUnit = canonicalApparatusUnitName(unit);
    const dutyShift = String(selectedDaySnapshot.shift || "").trim();
    const homeShift = String(person.shift || "").trim();

    if (homeShift && dutyShift && homeShift === dutyShift) {
      setMessage(`${getPersonDisplayName(person)} is already on ${dutyShift} Shift`);
      return;
    }

    const rosterId = buildOvertimeRosterId(personnelId, dayId, normalizedUnit);

    setRoster((current) => {
      if (current.some((member) => member.id === rosterId)) {
        return current;
      }

      const nextMember = {
        id: rosterId,
        personnelId,
        dayId,
        name: getPersonDisplayName(person),
        rank: person.rank,
        shift: person.shift,
        apparatus: normalizedUnit,
        position: person.position || (person.driver === "Approved" ? "Driver" : person.ems || "Firefighter"),
        status: "On Duty",
        isOvertime: true,
      };

      return [...current, nextMember];
    });

    setMessage(`${getPersonDisplayName(person)} added to ${normalizedUnit} for overtime (${homeShift || "other"} shift)`);
  }

  function removeOvertimeFromUnit(personnelId, unit) {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!personnelId || !unit) return;

    const rosterId = buildOvertimeRosterId(personnelId, selectedId, unit);
    const person = personnel.find((entry) => entry.id === personnelId);

    setRoster((current) => current.filter((member) => member.id !== rosterId));
    setMessage(
      person
        ? `${getPersonDisplayName(person)} removed from ${canonicalApparatusUnitName(unit)} overtime`
        : "Overtime assignment removed"
    );
  }

  function assignOvertime(id) {
    const offer = overtimeOffers.find((item) => item.id === id);
    if (!offer) return;
    setOvertimeOffers((current) => current.map((item) => item.id === id ? { ...item, status: "Assigned" } : item));
    setDays((current) => current.map((day) => day.date === offer.date && day.shift === offer.shift ? { ...day, staffed: day.staffed + 1, status: day.staffed + 1 >= day.minimum ? "Complete" : "Deficit" } : day));
    setMessage(`${offer.position} overtime assigned for ${offer.date}`);
  }

  function decideVacancyPickup(id, status) {
    if (!setVacancyPickups) return;
    setVacancyPickups((current) => current.map((item) => (
      item.id === id
        ? {
          ...item,
          status,
          approvalStage: "complete",
          decidedAt: new Date().toISOString(),
        }
        : item
    )));
    setMessage(`Vacancy pickup request ${status.toLowerCase()}.`);
  }

  const pendingVacancyCount = vacancyPickups.filter((item) => /pending/i.test(item.status || "")).length;

  const leaveRequestsPanel = (
    <LeaveRequestsPanel
      leaveRequests={leaveRequests}
      setLeaveRequests={setLeaveRequests}
      personnel={personnel}
      setPersonnel={setPersonnel}
      canManage={canEditRoster}
    />
  );

  const vacancyPickupsPanel = (
    <Panel title="Vacancy Pickup Requests" icon={Users} action={<span className="panel-count">{pendingVacancyCount} pending</span>}>
      <div className="request-list">
        {vacancyPickups.length ? vacancyPickups.map((request) => {
          const actionable = /pending/i.test(request.status || "");
          return (
            <div className="request-row" key={request.id}>
              <div>
                <strong>{request.person}</strong>
                <span>{request.vacancyLabel} · {request.date} · {request.shift}</span>
                {request.message ? <small>{request.message}</small> : null}
                <small>{vacancyPickupStatusDetail(request)}</small>
              </div>
              <Badge>{request.status}</Badge>
              {actionable && canEditRoster && (
                <div className="inline-actions">
                  <button onClick={() => decideVacancyPickup(request.id, "Approved")}><Check size={13} /> Approve</button>
                  <button onClick={() => decideVacancyPickup(request.id, "Denied")}><X size={13} /> Deny</button>
                </div>
              )}
            </div>
          );
        }) : <p className="auth-help">No vacancy pickup requests yet.</p>}
      </div>
    </Panel>
  );

  const staffingPanel = (
    <Panel title="Daily Staffing" icon={ShieldCheck}>
      <div className="staffing-card">
        <div>
          <strong>{dayCoverage.staffed} / {dayCoverage.minimum}</strong>
          <span>{vacancies ? `${vacancies} position needs coverage` : "Daily staffing met"}</span>
        </div>
        <div className="staffing-meter">
          <i style={{ width: `${Math.min(100, dayCoverage.minimum ? (dayCoverage.staffed / dayCoverage.minimum) * 100 : 100)}%` }} />
        </div>
        <div className="staffing-requirements">
          <span>Command</span><b>{dayCoverage.command}</b>
          <span>Company Officers</span><b>{dayCoverage.officers}</b>
          <span>Drivers</span><b>{dayCoverage.drivers}</b>
          <span>Paramedics</span><b>{dayCoverage.paramedics}</b>
          <span>EMT</span><b>{dayCoverage.emt}</b>
        </div>
      </div>
    </Panel>
  );

  const overtimePanel = (
    <Panel title="Overtime Coverage" icon={Clock3} action={<button className="text-button">Create vacancy</button>}>
      <div className="overtime-grid">{overtimeOffers.map((offer) => <div key={offer.id} className="overtime-card"><div><strong>{offer.date} - {offer.shift}</strong><span>{offer.position}</span></div><Badge>{offer.status}</Badge><small>{offer.applicants} available members</small><button className="row-action" disabled={offer.status === "Assigned"} onClick={() => assignOvertime(offer.id)}>{offer.status === "Assigned" ? "Assigned" : "Assign"}</button></div>)}</div>
    </Panel>
  );

  return <div className="module-page scheduling-page">
    <section className="module-heading"><div><span className="module-icon"><CalendarDays size={22} /></span><div><h1>Scheduling</h1><p>Visual shift calendar, daily apparatus roster, leave, overtime, shift trades, and daily staffing.</p></div></div><div className="heading-actions"><button className="secondary-button">Print Roster</button><button className="primary-button"><CirclePlus size={14} /> Add Shift Note</button></div></section>
    <section className="schedule-summary">
      {scheduleStats.map(({ label, value, tone, icon: Icon }) => (
        <div key={label} className={`schedule-stat stat-${tone}`}>
          <Icon size={15} className="schedule-stat-icon" />
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </section>
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}

    <section className="schedule-view-toggle">
      <div className="segmented-control schedule-view-tabs" role="tablist" aria-label="Scheduling views">
        {ADMIN_SCHEDULE_TABS.slice(0, 1).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={rosterTab === tab.id}
            className={rosterTab === tab.id ? "active" : ""}
            onClick={() => setRosterTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}

        <div className="schedule-range-group" role="presentation">
          {ADMIN_SCHEDULE_RANGE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={rosterTab === tab.id}
              className={rosterTab === tab.id ? "active" : ""}
              onClick={() => setRosterTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {ADMIN_SCHEDULE_TABS.slice(1).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={rosterTab === tab.id}
            className={rosterTab === tab.id ? "active" : ""}
            onClick={() => setRosterTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <span className="schedule-roster-count">
        {rosterTab === "trades"
          ? `${shiftTrades.length} shift trade requests`
          : rosterTab === "callshift"
            ? `${callShifts.length} shift broadcast${callShifts.length === 1 ? "" : "s"}`
            : rosterTab === "calendar"
              ? `${selectedDaySnapshot.weekday}, ${selectedDaySnapshot.date} selected`
              : rosterTab === "week"
                ? "7-day apparatus roster"
                : `${dayRoster.length} members on ${selectedDay.shift}`}
      </span>
    </section>

    <section className={`schedule-workspace${rosterTab === "requests" ? " is-requests" : ""}${rosterTab === "week" ? " is-week-roster" : ""}${rosterTab === "calendar" ? " is-calendar" : ""}${rosterTab === "trades" ? " is-trades" : ""}${rosterTab === "callshift" ? " is-callshift" : ""}`}>
      <div className="schedule-main" role="tabpanel">
        {rosterTab === "calendar" ? (
          <ShiftCalendar
            year={calendarYear}
            month={calendarMonth}
            onMonthChange={(year, month) => {
              setCalendarYear(year);
              setCalendarMonth(month);
              const nextMonthDays = buildMonthCalendar(year, month, days, rotation).filter((cell) => cell.kind === "day");
              if (!nextMonthDays.some((cell) => cell.id === selectedId) && nextMonthDays[0]) {
                setSelectedId(nextMonthDays[0].id);
              }
            }}
            existingDays={days}
            selectedId={selectedId}
            onSelectDay={selectDay}
            rotation={rotation}
            profileShifts={profileShifts}
            liveDayMetrics={liveMonthMetrics}
            viewMode="month"
            showViewToggle={false}
            leaveRequests={leaveRequests}
            personnel={personnel}
            roster={roster}
          />
        ) : null}

        {rosterTab === "daily" ? (
          <Panel
            title={`Daily Roster · ${selectedDaySnapshot.weekday}, ${selectedDaySnapshot.date}`}
            icon={Truck}
            action={(
              <div className="schedule-day-nav">
                <button type="button" className="secondary-button" onClick={() => shiftSelectedDay(-1)} aria-label="Previous day">
                  <ChevronLeft size={14} />
                </button>
                <button type="button" className="secondary-button" onClick={() => setRosterTab("calendar")}>
                  Calendar
                </button>
                <button type="button" className="secondary-button" onClick={() => shiftSelectedDay(1)} aria-label="Next day">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          >
            <AdminDailyRoster
              dayId={selectedId}
              scheduleDays={days}
              rotation={rotation}
              roster={roster}
              personnel={personnel}
              leaveRequests={leaveRequests}
              shiftTrades={shiftTrades}
              schedulingSettings={schedulingSettings}
              apparatus={apparatus}
              stationNames={stationNames}
              departmentTitle={departmentName}
              shiftChangeTime={shiftChangeTime}
              canEdit={canEditRoster && rosterLoaded}
              unitOptions={unitOptions}
              onUpdateApparatus={updateApparatus}
              onAssignToUnit={assignPersonToUnit}
              onUpdateMemberShiftTime={updateMemberShiftTime}
              onAddOvertimeToUnit={addOvertimeToUnit}
              onRemoveOvertimeFromUnit={removeOvertimeFromUnit}
              rosterLoaded={rosterLoaded}
            />
          </Panel>
        ) : null}

        {rosterTab === "week" ? (
          <WeekRosterView
            weekSnapshots={weekSnapshots}
            selectedId={weekRosterStartId}
            onSelectDay={selectDay}
            rotation={rotation}
            onWeekChange={shiftSelectedWeek}
            apparatus={apparatus}
            stationNames={stationNames}
            departmentName={departmentName}
            shiftChangeTime={shiftChangeTime}
            personnel={personnel}
            schedulingSettings={schedulingSettings}
          />
        ) : null}

        {rosterTab === "trades" ? (
          <ShiftTradesPanel
            trades={shiftTrades}
            setTrades={setShiftTrades}
            personnel={personnel}
            setPersonnel={setPersonnel}
          />
        ) : null}

        {rosterTab === "callshift" ? (
          <CallShiftPanel
            callShifts={callShifts}
            setCallShifts={setCallShifts}
            personnel={personnel}
            roster={roster}
            leaveRequests={leaveRequests}
            shiftTrades={shiftTrades}
            scheduleDays={days}
            schedulingSettings={schedulingSettings}
            apparatus={apparatus}
            shiftRotation={shiftRotation}
            profileShifts={profileShifts}
            departmentId={departmentId}
            callShiftRules={callShiftRules}
            canManage={canManageCallShifts || canEditRoster}
          />
        ) : null}

        {rosterTab === "requests" ? (
          <div className="schedule-requests-stack">
            {staffingPanel}
            {leaveRequestsPanel}
            {vacancyPickupsPanel}
            {overtimePanel}
          </div>
        ) : null}
      </div>

      {rosterTab !== "requests" && rosterTab !== "trades" && rosterTab !== "callshift" && rosterTab !== "week" && rosterTab !== "calendar" ? (
        <div className="schedule-side">
          {staffingPanel}
          {leaveRequestsPanel}
          {vacancyPickupsPanel}
        </div>
      ) : null}
    </section>
  </div>;
}

function TrainingPage({ query, records = [], setRecords, canEdit = false }) {
  const safeRecords = Array.isArray(records) ? records : [];
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState("");
  const visibleRecords = safeRecords.filter((record) => {
    const matchesFilter = filter === "All" || record.category === filter || record.status === filter;
    const matchesQuery = Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });
  const averageCompletion = trainingCompliancePercent(safeRecords);
  const completedHours = safeRecords.filter((record) => record.status === "Complete").reduce((sum, record) => sum + Number(record.hours || 0), 0);
  const upcoming = safeRecords.filter((record) => ["Scheduled", "In Progress"].includes(record.status)).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 6);
  const complianceQueue = safeRecords.filter((record) => ["Overdue", "Needs Documentation", "Expired"].includes(record.status));

  function updateRecord(id, patch) {
    if (!canEdit || !setRecords) return;
    setRecords((current) => current.map((record) => record.id === id ? { ...record, ...patch, updated_at: new Date().toISOString() } : record));
  }

  function addTraining() {
    if (!canEdit || !setRecords) return;
    const next = {
      id: `TRN-${200 + safeRecords.length}`,
      course: "New Training Event",
      category: "Fire",
      date: "Jun 14, 2026",
      endDate: "Jun 14, 2026",
      instructor: "Training Officer",
      hours: 2,
      attendees: 0,
      capacity: 12,
      completion: 0,
      expirationDate: "",
      status: "Scheduled",
      members: "All shifts",
      notes: "Add objectives and attendance requirements."
    };
    setRecords((current) => [next, ...current]);
    setShowNew(false);
    setMessage("Training event created");
  }

  function deleteRecord(record) {
    if (!canEdit || !setRecords || !record) return;
    const label = record.course || record.id;
    if (!window.confirm(`Delete training record "${label}"? This cannot be undone.`)) return;
    setRecords((current) => current.filter((item) => item.id !== record.id));
    if (selected?.id === record.id) setSelected(null);
    setMessage(`Deleted ${label}`);
  }

  return <div className="module-page training-page">
    <section className="module-heading"><div><span className="module-icon"><BookOpen size={22} /></span><div><h1>Training</h1><p>Training events, attendance, hours, EMS CE, fire training, and department compliance tracking.</p></div></div><div className="heading-actions"><button className="secondary-button">Export Training</button>{canEdit ? <button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> Add Training</button> : null}</div></section>
    <section className="training-hero">
      <div><span>Training Hub</span><h2>Department Training Dashboard</h2><p className="muted">Manage upcoming classes, compliance items, and completion progress from one page.</p></div>
      <div className="training-score"><small>Average Completion</small><strong>{averageCompletion}%</strong></div>
    </section>
    <section className="training-summary">{[["Training Events", safeRecords.length, "info"], ["In Progress", safeRecords.filter((record) => record.status === "In Progress").length, "warning"], ["Overdue", safeRecords.filter((record) => record.status === "Overdue").length, "critical"], ["Completed Hours", completedHours, "success"], ["EMS CE Events", safeRecords.filter((record) => record.category === "EMS CE").length, "info"]].map(([label, value, tone]) => <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</section>
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Fire", "EMS CE", "Driver", "Officer", "Scheduled", "In Progress", "Overdue", "Complete"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleRecords.length} training records shown</span></section>
    <section className="training-workspace">
      <Panel title="Active And Upcoming Classes" icon={CalendarDays} action={<span className="panel-count">{upcoming.length} scheduled</span>}>
        <div className="training-table"><div className="training-row training-head"><span>Class</span><span>Category</span><span>Date</span><span>Attendees</span><span>Completion</span><span>Status</span></div>{upcoming.map((record) => <div className="training-row" key={record.id}><button className="link-button" onClick={() => setSelected(record)}>{record.course}</button><span>{record.category}</span><span>{record.date}</span><span>{record.attendees} / {record.capacity}</span><span>{record.completion}%</span><Badge>{record.status}</Badge></div>)}</div>
      </Panel>
      <Panel title="Compliance Queue" icon={ShieldCheck} action={<span className="panel-count">{complianceQueue.length} need action</span>}>
        <div className="training-table">{complianceQueue.length ? complianceQueue.map((record) => <div className="training-row" key={record.id}><button className="link-button" onClick={() => setSelected(record)}>{record.course}</button><span>{record.category}</span><span>{record.endDate || record.date}</span><span>{record.members}</span><span>{record.completion}%</span><Badge>{record.status}</Badge></div>) : <p className="empty-table">No overdue or incomplete training items.</p>}</div>
      </Panel>
      <Panel title="All Training Records" icon={BookOpen} className="full-span">
        <div className="training-table wide"><div className="training-row training-head"><span>Training Event</span><span>Category</span><span>Instructor</span><span>Hours</span><span>Attendees</span><span>Completion</span><span>Status</span><span /></div>{visibleRecords.map((record) => <div className="training-row" key={record.id}><button className="link-button" onClick={() => setSelected(record)}>{record.course}</button><span>{record.category}</span><span>{record.instructor}</span><span>{record.hours}</span><span>{record.attendees} / {record.capacity}</span>{canEdit ? <select value={record.completion} onChange={(event) => updateRecord(record.id, { completion: Number(event.target.value), status: Number(event.target.value) >= 100 ? "Complete" : record.status })}>{[0, 25, 50, 75, 86, 100].map((value) => <option key={value} value={value}>{value}%</option>)}</select> : <span>{record.completion}%</span>}{canEdit ? <select value={record.status} onChange={(event) => updateRecord(record.id, { status: event.target.value })}>{["Scheduled", "In Progress", "Complete", "Overdue", "Needs Documentation", "Expired"].map((status) => <option key={status}>{status}</option>)}</select> : <Badge>{record.status}</Badge>}<div className="inline-actions"><button className="row-action" onClick={() => setSelected(record)}>Open</button>{canEdit ? <button type="button" className="icon-button danger-button" title="Delete training record" onClick={() => deleteRecord(record)}><Trash2 size={14} /></button> : null}</div></div>)}</div>
      </Panel>
    </section>
    {selected && <Modal title={selected.course} onClose={() => setSelected(null)}><div className="cert-detail-grid">{[["Training ID", selected.id], ["Category", selected.category], ["Instructor", selected.instructor], ["Start Date", selected.date], ["End Date", selected.endDate], ["Hours", selected.hours], ["Attendees", `${selected.attendees} / ${selected.capacity}`], ["Assigned Members", selected.members], ["Expiration", selected.expirationDate || "No expiration"], ["Status", selected.status], ["Notes", selected.notes]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setSelected(null)}>Close</button>{canEdit ? <button type="button" className="secondary-button danger-button" onClick={() => deleteRecord(selected)}><Trash2 size={14} /> Delete</button> : null}{canEdit ? <button className="primary-button" onClick={() => { updateRecord(selected.id, { status: "Complete", completion: 100 }); setSelected(null); setMessage(`${selected.course} marked complete`); }}><Check size={14} /> Mark Complete</button> : null}</div></Modal>}
    {showNew && canEdit && <Modal title="Add Training Event" onClose={() => setShowNew(false)}><div className="workflow-form"><label><span>Class Name</span><input defaultValue="New Training Event" /></label><label><span>Category</span><select><option>Fire</option><option>EMS CE</option><option>Driver</option><option>Officer</option></select></label><label><span>Start Date</span><input type="date" defaultValue="2026-06-14" /></label><label><span>Instructor</span><input defaultValue="Training Officer" /></label><label><span>Hours</span><input type="number" defaultValue="2" /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button><button className="primary-button" onClick={addTraining}><Check size={14} /> Create Event</button></div></Modal>}
  </div>;
}

function FleetSummary({ items }) {
  return <section className="fleet-summary">{items.map(([label, value, tone]) => <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</section>;
}

function ApparatusPage({
  units = [],
  setUnits,
  workOrders = [],
  setWorkOrders,
  canEdit = false,
  legacyWritesLocked = false,
  onOpenFleetAssets,
}) {
  const { getOptions } = useDropdowns();
  const [selectedId, setSelectedId] = useState(units[0]?.id || "");
  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [message, setMessage] = useState("");

  const stationGroups = useMemo(
    () => groupApparatusByStation(units, getOptions("stations")),
    [units, getOptions],
  );

  useEffect(() => {
    if (!units.length) {
      setSelectedId("");
      return;
    }
    if (!units.some((unit) => unit.id === selectedId)) {
      setSelectedId(units[0].id);
    }
  }, [units, selectedId]);

  const selected = units.find((unit) => unit.id === selectedId) || units[0];
  if (!selected) {
    return <div className="module-page apparatus-page"><section className="placeholder-page"><h1>Apparatus</h1><p>No apparatus records found.</p></section></div>;
  }
  const unitOrders = workOrders.filter((order) => order.unit === selected.unit);
  function updateStatus(status) {
    if (!canEdit) return;
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, status } : unit));
    setMessage(`${selected.unit} status updated to ${status}`);
  }
  function completeCheck(checkName) {
    if (!canEdit) return;
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, checks: unit.checks.map(([name, status]) => name === checkName ? [name, "Complete"] : [name, status]) } : unit));
    setMessage(`${checkName} marked complete`);
  }
  function createWorkOrder() {
    setWorkOrders((current) => [{ id: `WO-${26050 + current.length}`, unit: selected.unit, issue: "New apparatus service request", category: "General", priority: "Medium", opened: "Jun 7", vendor: "Internal Fleet", cost: "Pending", status: "Open" }, ...current]);
    setShowWorkOrder(false);
    setMessage(`Work order created for ${selected.unit}`);
  }
  function saveUnit(nextUnit) {
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, ...nextUnit, id: unit.id } : unit));
    setMessage(`${nextUnit.unit || selected.unit} updated`);
  }
  function addUnit() {
    const nextId = `APP-${String(units.length + 1).padStart(2, "0")}`;
    const nextUnit = {
      id: nextId,
      unit: "New Apparatus",
      type: "Apparatus",
      station: "Station 1",
      year: "",
      mileage: "",
      engineHours: "",
      pumpHours: "",
      fuel: "",
      pmDue: "",
      status: "In Service",
      operator: "Unassigned",
      checks: [],
    };
    setUnits((current) => [...current, nextUnit]);
    setSelectedId(nextId);
    setShowEdit(true);
    setMessage("New apparatus created — update details and save");
  }
  return <div className="module-page apparatus-page">
    <section className="module-heading"><div><span className="module-icon"><Truck size={22} /></span><div><h1>Apparatus</h1><p>Unit readiness, daily checks, operating metrics, service history, and repair requests.</p></div></div><div className="heading-actions">{canEdit && <button type="button" className="secondary-button" onClick={addUnit}><CirclePlus size={14} /> Add Unit</button>}<button className="secondary-button">Fleet Report</button><button className="primary-button" onClick={() => setShowWorkOrder(true)}><CirclePlus size={14} /> New Work Order</button></div></section>
    {legacyWritesLocked ? (
      <div className="warning-banner" role="status">
        Classic Apparatus list edits are locked after Fleet migration cutover.
        {" "}
        {typeof onOpenFleetAssets === "function" ? (
          <button type="button" className="text-button" onClick={onOpenFleetAssets}>Open All Fleet Assets</button>
        ) : null}
      </div>
    ) : null}
    <FleetSummary items={[["Total Units", units.length, "info"], ["In Service", units.filter((unit) => unit.status === "In Service").length, "success"], ["Out of Service", units.filter((unit) => unit.status === "Out of Service").length, "critical"], ["PM / Inspection Due", units.filter((unit) => /Due/.test(unit.status)).length, "warning"], ["Reserve", units.filter((unit) => unit.status === "Reserve").length, "neutral"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="fleet-workspace">
      <Panel title="Fleet Units" icon={Truck} action={<span className="panel-count">{units.length} units</span>}>
        <div className="unit-list">
          {stationGroups.map(({ station, units: groupUnits }) => (
            <section key={station} className="unit-station-group">
              <h3 className={`unit-station-heading${station === APPARATUS_UNASSIGNED_STATION ? " is-unassigned" : ""}`}>
                {station}
                <span>{groupUnits.length}</span>
              </h3>
              {groupUnits.length ? groupUnits.map((unit, index) => (
                <button
                  key={unit.id || `${unit.unit}-${index}`}
                  className={unit.id === selected.id ? "unit-row selected" : "unit-row"}
                  onClick={() => setSelectedId(unit.id)}
                >
                  <span className="unit-icon"><Truck size={17} /></span>
                  <span><strong>{unit.unit || unit.id}</strong><small>{unit.type}</small></span>
                  <Badge>{unit.status}</Badge>
                </button>
              )) : (
                <p className="unit-station-empty">No apparatus assigned</p>
              )}
            </section>
          ))}
        </div>
      </Panel>
      <section className="fleet-detail">
        <header className="profile-header"><div className="profile-identity"><span className="unit-icon large"><Truck size={24} /></span><div><h2>{selected.unit}</h2><p>{selected.year} {selected.type} - {selected.station}</p><div><Badge>{selected.status}</Badge></div></div></div><div className="heading-actions">{canEdit && <button type="button" className="secondary-button" onClick={() => setShowEdit(true)}>Edit Unit</button>}<select className="status-select" value={selected.status} disabled={!canEdit} onChange={(event) => updateStatus(event.target.value)}>{["In Service", "Out of Service", "PM Due", "Reserve"].map((status) => <option key={status}>{status}</option>)}</select></div></header>
        <section className="metric-strip">{[["Mileage", selected.mileage], ["Engine Hours", selected.engineHours], ["Pump Hours", selected.pumpHours], ["PM Due", selected.pmDue]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
        <div className="fleet-detail-grid">
          <Panel title="Readiness Checks" icon={ClipboardCheck}><div className="check-list">{selected.checks.map(([name, status]) => <div key={name}><span>{name}</span><Badge>{status}</Badge>{status !== "Complete" && <button className="row-action" onClick={() => completeCheck(name)}>Complete</button>}</div>)}</div></Panel>
          <Panel title="Open & Recent Work Orders" icon={Wrench} action={<button className="text-button" onClick={() => setShowWorkOrder(true)}>Add</button>}><div className="compact-orders">{unitOrders.length ? unitOrders.map((order) => <div key={order.id}><div><strong>{order.id} - {order.issue}</strong><span>{order.vendor} - {order.cost}</span></div><Badge>{order.status}</Badge></div>) : <p>No work orders for this unit.</p>}</div></Panel>
          <Panel title="Operational Details" icon={Gauge}><div className="detail-pairs"><span>Assigned station</span><strong>{selected.station}</strong><span>Apparatus type</span><strong>{selected.type}</strong><span>Model year</span><strong>{selected.year}</strong></div></Panel>
          <Panel title="Service Timeline" icon={Clock3}><div className="service-timeline"><div><i /><span><strong>Jun 7</strong> Daily readiness check submitted</span></div><div><i /><span><strong>May 28</strong> Preventive maintenance completed</span></div><div><i /><span><strong>Apr 14</strong> Annual hose inventory verified</span></div></div></Panel>
        </div>
      </section>
    </section>
    {showWorkOrder && <Modal title={`New Work Order - ${selected.unit}`} onClose={() => setShowWorkOrder(false)}><div className="workflow-form"><label><span>Unit</span><select><option>{selected.unit}</option></select></label><label><span>Priority</span><select><option>Medium</option><option>High</option><option>Low</option></select></label><label className="wide-field"><span>Issue Description</span><input defaultValue="New apparatus service request" /></label><label><span>Category</span><select><option>General</option><option>Pump</option><option>Electrical</option><option>PM</option></select></label><label><span>Assigned Vendor</span><select><option>Internal Fleet</option><option>Mid-South Apparatus</option></select></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowWorkOrder(false)}>Cancel</button><button className="primary-button" onClick={createWorkOrder}><Check size={14} /> Create Work Order</button></div></Modal>}
    {showEdit && canEdit && (
      <FleetRecordEditModal
        title={`Edit ${selected.unit}`}
        fields={APPARATUS_EDIT_FIELDS}
        record={selected}
        onSave={saveUnit}
        onClose={() => setShowEdit(false)}
      />
    )}
  </div>;
}

function MaintenancePage({ orders = [], setOrders }) {
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState("");
  const visibleOrders = orders.filter((order) => filter === "All" || order.status === filter);
  function updateOrder(id, status) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    setMessage(`Work order ${id} updated to ${status}`);
  }
  function addOrder() {
    setOrders((current) => [{ id: `WO-${26050 + current.length}`, unit: "FD-2", issue: "Scheduled preventive maintenance", category: "PM", priority: "Medium", opened: "Jun 7", vendor: "Internal Fleet", cost: "Pending", status: "Open" }, ...current]);
    setShowNew(false);
    setMessage("New maintenance work order created");
  }
  return <div className="module-page maintenance-page">
    <section className="module-heading"><div><span className="module-icon"><Wrench size={22} /></span><div><h1>Maintenance</h1><p>Work-order queue, vendor coordination, repair costs, preventive maintenance, and completion tracking.</p></div></div><div className="heading-actions"><button className="secondary-button">Cost Report</button><button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> New Work Order</button></div></section>
    <FleetSummary items={[["Open Orders", orders.filter((order) => !/Complete/.test(order.status)).length, "info"], ["High Priority", orders.filter((order) => order.priority === "High").length, "critical"], ["Awaiting Parts", orders.filter((order) => order.status === "Awaiting Parts").length, "warning"], ["Scheduled", orders.filter((order) => order.status === "Scheduled").length, "info"], ["Completed", orders.filter((order) => order.status === "Complete").length, "success"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleOrders.length} work orders shown</span></section>
    <Panel title="Maintenance Work Orders" icon={Wrench} action={<button className="text-button">Configure columns</button>}><div className="work-order-table"><div className="work-order-row work-order-head"><span>Work Order</span><span>Unit</span><span>Issue</span><span>Category</span><span>Priority</span><span>Vendor</span><span>Cost</span><span>Status</span></div>{visibleOrders.map((order) => <div className="work-order-row" key={order.id}><strong>{order.id}</strong><strong>{order.unit}</strong><span>{order.issue}</span><span>{order.category}</span><Badge>{order.priority}</Badge><span>{order.vendor}</span><span>{order.cost}</span><select value={order.status} onChange={(event) => updateOrder(order.id, event.target.value)}>{["Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((status) => <option key={status}>{status}</option>)}</select></div>)}</div></Panel>
    <section className="maintenance-bottom"><Panel title="Upcoming Preventive Maintenance" icon={CalendarDays}><MiniTable columns={["Unit", "Service", "Due", "Status"]} rows={[["Truck 3", "Aerial inspection", "Jun 18", "Due Soon"], ["FD-2", "Annual service", "Jun 21", "Upcoming"], ["Engine 1", "Oil and filters", "Aug 14", "Upcoming"]]} /></Panel><Panel title="Maintenance Spend" icon={BarChart3}><div className="spend-bars">{[["Repairs", "$12,840", "72%"], ["Preventive", "$6,420", "48%"], ["Tires", "$3,180", "31%"]].map(([label, value, width]) => <div key={label}><span>{label}</span><strong>{value}</strong><i><b style={{ width }} /></i></div>)}</div></Panel></section>
    {showNew && <Modal title="New Maintenance Work Order" onClose={() => setShowNew(false)}><div className="workflow-form"><label><span>Unit</span><select><option>FD-2</option><option>Engine 1</option><option>Truck 3</option></select></label><label><span>Priority</span><select><option>Medium</option><option>High</option><option>Low</option></select></label><label className="wide-field"><span>Issue Description</span><input defaultValue="Scheduled preventive maintenance" /></label><label><span>Category</span><select><option>PM</option><option>General</option><option>Electrical</option></select></label><label><span>Vendor</span><select><option>Internal Fleet</option><option>Mid-South Apparatus</option></select></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button><button className="primary-button" onClick={addOrder}><Check size={14} /> Create Work Order</button></div></Modal>}
  </div>;
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop"><section className="workflow-modal"><header><strong>{title}</strong><button onClick={onClose}><X size={16} /></button></header><div className="modal-content">{children}</div></section></div>;
}

function ModulePage({ name, query }) {
  const data = moduleData[name];
  const Icon = data?.icon || FileText;
  if (!data) return <PlaceholderPage name={name} />;
  return <div className="module-page"><section className="module-heading"><div><span className="module-icon"><Icon size={22} /></span><div><h1>{name}</h1><p>{data.description}</p></div></div><div className="heading-actions"><button className="secondary-button">Export</button><button className="primary-button">Add record</button></div></section><section className="module-toolbar"><div className="toolbar-stat"><strong>{data.rows.length}</strong><span>Records shown</span></div><div className="toolbar-stat"><strong>{data.rows.filter((row) => /due|overdue|deficit|expired/i.test(row.join(" "))).length}</strong><span>Need attention</span></div><button className="filter-button">All statuses</button><button className="filter-button">All assignments</button></section><Panel title={`${name} Records`} icon={Icon} action={<button className="text-button">Configure columns</button>}><DataTable columns={data.columns} rows={data.rows} query={query} /></Panel></div>;
}

function PlaceholderPage({ name }) {
  return <div className="module-page"><section className="placeholder-page"><span><HardHat size={30} /></span><h1>{name}</h1><p>This module is included in the RMS architecture and ready for its dedicated workflow in the next sprint.</p><button className="primary-button">Create module brief</button></section></div>;
}

function AccessDeniedModule({ name }) {
  return <div className="module-page"><section className="placeholder-page"><h1>{name}</h1><p>Your role does not include permission to access this module.</p></section></div>;
}

const APP_VIEW_PREF_KEY = "rms-app-view-pref";
const EMPTY_SHIFTS = [];

function persistAppViewPref(view) {
  try {
    window.sessionStorage.setItem(APP_VIEW_PREF_KEY, view);
    window.localStorage.removeItem("rms-app-view");
  } catch {
    // ignore
  }
}

function readAppViewPref(hasAdminAccess) {
  if (!hasAdminAccess) return "employee";
  try {
    const sessionPref = window.sessionStorage.getItem(APP_VIEW_PREF_KEY);
    if (sessionPref === "employee") return "employee";
  } catch {
    // ignore
  }
  return "admin";
}

function AppShell() {
  const { departmentId, profile, platformConfig, isPlatformScope: inPlatformScope, settings, isModuleEnabled, setDepartmentId, refreshDepartment } = useTenant();
  const {
    user,
    membership,
    permissions,
    signOut,
    isCreator,
    switchCreatorDepartment,
    recoverAccess,
    membershipLoading
  } = useAuth();
  const syncedDepartmentRef = useRef(null);
  const adminRecoveryAttemptedRef = useRef(false);

  useEffect(() => {
    if (!isCreator || !departmentId || isPlatformScope(departmentId)) return;
    if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === CREATOR_CONSOLE_PATH) return;
    if (syncedDepartmentRef.current === departmentId) return;
    syncedDepartmentRef.current = departmentId;
    switchCreatorDepartment(departmentId);
  }, [isCreator, departmentId, switchCreatorDepartment]);
  const initialDeepLink = typeof window !== "undefined" ? parseAppDeepLink(window.location) : null;
  const initialModule = typeof window !== "undefined" ? resolveInitialAppModule(window.location) : "Dashboard";
  const [appView, setAppView] = useState(initialDeepLink?.module ? "admin" : "admin");
  const [employeeSection, setEmployeeSection] = useState("My Dashboard");
  const [personnelNavigateId, setPersonnelNavigateId] = useState("");
  const [employeePreviewPersonId, setEmployeePreviewPersonId] = useState("");
  const [current, setCurrent] = useState(
    initialDeepLink?.module === CREATOR_CONSOLE_MODULE
      ? CREATOR_CONSOLE_MODULE
      : (typeof window !== "undefined" && pageFromLocation(PAGE_INDEX, window.location)) || initialModule
  );
  const [schedulingTab, setSchedulingTab] = useState(null);
  const clearSchedulingTab = useCallback(() => setSchedulingTab(null), []);
  const deepLinkAppliedRef = useRef(Boolean(initialDeepLink?.module));
  const [codeLibraryAccess, setCodeLibraryAccess] = useState(null);
  const [preplanFeatures, setPreplanFeatures] = useState(null);

  useEffect(() => {
    let active = true;
    if (!departmentId || isPlatformScope(departmentId)) {
      setCodeLibraryAccess(null);
      return undefined;
    }
    getDepartmentCodeLibraryAccess(departmentId)
      .then((access) => {
        if (active) setCodeLibraryAccess(access);
      })
      .catch(() => {
        if (active) setCodeLibraryAccess({ moduleEnabled: false, enabledPublicationIds: [] });
      });
    return () => {
      active = false;
    };
  }, [departmentId]);

  useEffect(() => {
    let active = true;
    if (!departmentId || isPlatformScope(departmentId)) {
      setPreplanFeatures(null);
      return undefined;
    }
    getDepartmentPreplanFeatures(departmentId)
      .then((features) => {
        if (active) {
          setPreplanFeatures(
            resolveEffectivePreplanFeatures(features, platformConfig?.availablePreplanFeatures),
          );
        }
      })
      .catch(() => {
        if (active) setPreplanFeatures(null);
      });
    return () => {
      active = false;
    };
  }, [departmentId, platformConfig?.availablePreplanFeatures]);

  const visibleNavGroups = useMemo(() => {
    const permissionFiltered = filterNavGroups(navGroups, permissions, { isCreator });
    const moduleFiltered = filterNavByEnabledModules(permissionFiltered, isModuleEnabled, {
      isCreator,
      isPlatformScope: inPlatformScope,
      isPlatformCreator: Boolean(membership?.isPlatformCreator)
    });
    const codeFiltered = filterNavByCodeLibraryAccess(moduleFiltered, codeLibraryAccess, {
      isCreator,
      isPlatformCreator: Boolean(membership?.isPlatformCreator),
    });
    return filterNavGroupsByPreplanFeatures(codeFiltered, preplanFeatures || {}, { isCreator });
  }, [permissions, isCreator, isModuleEnabled, inPlatformScope, membership?.isPlatformCreator, codeLibraryAccess, preplanFeatures]);
  const canViewInternalEmail = hasPermission(permissions, "viewInternalEmail");
  const canViewDailyLog = hasPermission(permissions, "viewDailyLog");
  const visibleEmployeeNavGroups = useMemo(
    () => filterEmployeePortalNav(employeePortalNavGroups, {
      canViewInternalEmail,
      canViewDailyLog,
      isModuleEnabled,
    }),
    [canViewInternalEmail, canViewDailyLog, isModuleEnabled]
  );
  const showAdminToggle = canAccessAdminRms(permissions, isCreator);
  const showEmployeeToggle = canAccessEmployeePortal(permissions);
  const effectiveAppView = showAdminToggle ? appView : "employee";

  // Keep the open page in the address (?page=...) so it can be bookmarked,
  // shared and reached with back/forward. The first sync replaces the current
  // history entry; later page changes add entries.
  const pageUrlSyncedRef = useRef(false);
  const pageFromHistoryRef = useRef(false);
  // In-app Back button: shown once there's an earlier in-app page to return to.
  const [canGoBack, setCanGoBack] = useState(() => (
    typeof window !== "undefined" && depthFromHistoryState(window.history.state) > 0
  ));
  useEffect(() => {
    if (typeof window === "undefined" || effectiveAppView !== "admin") return;
    if (current === CREATOR_CONSOLE_MODULE || isCreatorConsolePath()) return; // has its own /creator-console path
    const slug = current === "Dashboard" ? "" : pageSlug(current);
    const sameUrl = (new URLSearchParams(window.location.search).get("page") || "") === slug;
    const replace = !pageUrlSyncedRef.current || pageFromHistoryRef.current;
    pageUrlSyncedRef.current = true;
    pageFromHistoryRef.current = false;
    const depth = depthFromHistoryState(window.history.state);
    if (sameUrl && slugFromHistoryState(window.history.state) === slug) return;
    const nextUrl = urlWithPage(window.location.href, slug);
    if (replace || sameUrl) {
      window.history.replaceState(pageHistoryState(slug, depth), "", nextUrl);
      setCanGoBack(depth > 0);
    } else {
      window.history.pushState(pageHistoryState(slug, depth + 1), "", nextUrl);
      setCanGoBack(true);
    }
  }, [current, effectiveAppView]);

  useEffect(() => {
    function handlePageHistory() {
      // Only react to entries this app created (other code also fires popstate).
      const slug = slugFromHistoryState(window.history.state);
      if (slug === null) return;
      const name = slug ? PAGE_INDEX.get(slug) : "Dashboard";
      if (!name) return;
      pageFromHistoryRef.current = true;
      setCanGoBack(depthFromHistoryState(window.history.state) > 0);
      setCurrent((existing) => (existing === name ? existing : name));
      setMobileNav(false);
    }
    window.addEventListener("popstate", handlePageHistory);
    return () => window.removeEventListener("popstate", handlePageHistory);
  }, []);

  useEffect(() => {
    if (membershipLoading || !user?.uid || showAdminToggle) return undefined;
    if (adminRecoveryAttemptedRef.current) return undefined;
    let cancelled = false;
    (async () => {
      const restored = await recoverAccess();
      adminRecoveryAttemptedRef.current = true;
      if (!cancelled && restored) {
        persistAppViewPref("admin");
        setAppView("admin");
        setCurrent("Dashboard");
      }
    })();
    return () => { cancelled = true; };
  }, [showAdminToggle, user?.uid, recoverAccess, membershipLoading]);

  useEffect(() => {
    if (membershipLoading) return;
    if (parseAppDeepLink(window.location)?.module) return;
    // A ?page= address picks the page; don't reset it to the dashboard.
    if (pageFromLocation(PAGE_INDEX, window.location)) {
      persistAppViewPref("admin");
      setAppView("admin");
      return;
    }
    if (shouldOpenHydrantsModule(window.location)) {
      persistAppViewPref("admin");
      setAppView("admin");
      setCurrent("Hydrants");
      return;
    }
    if (!showAdminToggle && showEmployeeToggle) {
      setAppView("employee");
      return;
    }
    const nextView = readAppViewPref(showAdminToggle);
    setAppView(nextView);
    if (nextView === "admin" && showAdminToggle && !shouldOpenHydrantsModule(window.location)) {
      setCurrent("Dashboard");
    }
  }, [showAdminToggle, showEmployeeToggle, membershipLoading]);

  useEffect(() => {
    if (membershipLoading || deepLinkAppliedRef.current || wasDeepLinkApplied()) return undefined;
    const deepLink = parseAppDeepLink(window.location);
    if (!deepLink?.module) return undefined;

    deepLinkAppliedRef.current = true;
    markDeepLinkApplied();

    if (
      deepLink.module === CREATOR_CONSOLE_MODULE
      && (isCreator || membership?.isPlatformCreator)
      && !isCreatorConsolePath()
    ) {
      setDepartmentId(PLATFORM_SCOPE_ID);
    }

    if (deepLink.module === CREATOR_CONSOLE_MODULE) {
      persistAppViewPref("admin");
      setAppView("admin");
      setCurrent(CREATOR_CONSOLE_MODULE);
      setMobileNav(false);
    }

    return undefined;
  }, [membershipLoading, isCreator, membership?.isPlatformCreator, permissions, setDepartmentId]);

  const [personnel, setPersonnel] = useTenantPersistentState(departmentId, LIST_KEYS.personnel, getTenantListFallback(departmentId, LIST_KEYS.personnel));

  // New-department setup wizard: opens for admins of a department flagged
  // onboardingRequired until it's finished ("Finish later" hides it for this
  // session). System Admin can also open it on demand.
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardDismissed, setSetupWizardDismissed] = useState(false);
  const setupWizardNeeded = Boolean(
    !inPlatformScope
    && departmentId
    && settings?.onboardingRequired
    && !settings?.onboardingCompletedAt
    && canAccessSystemAdmin(permissions, isCreator)
  );
  useEffect(() => {
    if (setupWizardNeeded && !setupWizardDismissed) setSetupWizardOpen(true);
  }, [setupWizardNeeded, setupWizardDismissed]);
  useEffect(() => {
    const open = () => setSetupWizardOpen(true);
    window.addEventListener("forge:open-setup-wizard", open);
    return () => window.removeEventListener("forge:open-setup-wizard", open);
  }, []);
  useEffect(() => {
    // Switching departments resets the "finish later" choice.
    setSetupWizardDismissed(false);
    setSetupWizardOpen(false);
  }, [departmentId]);
  const [certifications, setCertifications] = useTenantPersistentState(departmentId, LIST_KEYS.certifications, getTenantListFallback(departmentId, LIST_KEYS.certifications));
  const [training, setTraining] = useTenantPersistentState(departmentId, LIST_KEYS.training, getTenantListFallback(departmentId, LIST_KEYS.training));
  const [apparatus, setApparatus] = useTenantPersistentState(departmentId, LIST_KEYS.apparatus, getTenantListFallback(departmentId, LIST_KEYS.apparatus));
  const [workOrders, setWorkOrders] = useTenantPersistentState(departmentId, LIST_KEYS.workOrders, getTenantListFallback(departmentId, LIST_KEYS.workOrders));
  const [fleetCutover, setFleetCutover] = useState({
    redirectApparatusToFleetAssets: false,
    legacyApparatusWritesLocked: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!departmentId || isPlatformScope(departmentId)) {
      setFleetCutover({
        redirectApparatusToFleetAssets: false,
        legacyApparatusWritesLocked: false,
      });
      return undefined;
    }
    loadFleetSettings(departmentId)
      .then((next) => {
        if (cancelled) return;
        setFleetCutover({
          redirectApparatusToFleetAssets: Boolean(next.redirectApparatusToFleetAssets),
          legacyApparatusWritesLocked: Boolean(next.legacyApparatusWritesLocked),
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  useEffect(() => {
    if (current === "Apparatus" && fleetCutover.redirectApparatusToFleetAssets) {
      setCurrent("All Fleet Assets");
    }
  }, [current, fleetCutover.redirectApparatusToFleetAssets]);
  const [assets, setAssets] = useTenantPersistentState(departmentId, LIST_KEYS.assets, getTenantListFallback(departmentId, LIST_KEYS.assets));
  const [documents, setDocuments] = useTenantPersistentState(departmentId, LIST_KEYS.documents, getTenantListFallback(departmentId, LIST_KEYS.documents));
  const [occupancies, setOccupancies] = useTenantPersistentState(departmentId, LIST_KEYS.occupancies, getTenantListFallback(departmentId, LIST_KEYS.occupancies));
  const [inspections, setInspections] = useTenantPersistentState(departmentId, LIST_KEYS.inspections, getTenantListFallback(departmentId, LIST_KEYS.inspections));
  const [preplans, setPreplans] = useTenantPersistentState(departmentId, LIST_KEYS.preplans, getTenantListFallback(departmentId, LIST_KEYS.preplans));
  const [hoseTests, setHoseTests] = useTenantPersistentState(departmentId, LIST_KEYS.hoseTests, getTenantListFallback(departmentId, LIST_KEYS.hoseTests));
  const [scheduleDays, setScheduleDays] = useTenantPersistentState(departmentId, LIST_KEYS.scheduleDays, getTenantListFallback(departmentId, LIST_KEYS.scheduleDays));
  const [roster, setRoster, rosterLoaded] = useTenantPersistentState(departmentId, LIST_KEYS.roster, getTenantListFallback(departmentId, LIST_KEYS.roster));
  const [leaveRequests, setLeaveRequests] = useTenantPersistentState(departmentId, LIST_KEYS.leaveRequests, getTenantListFallback(departmentId, LIST_KEYS.leaveRequests));
  const [overtimeOffers, setOvertimeOffers] = useTenantPersistentState(departmentId, LIST_KEYS.overtimeOffers, getTenantListFallback(departmentId, LIST_KEYS.overtimeOffers));
  const [vacancyPickups, setVacancyPickups] = useTenantPersistentState(departmentId, LIST_KEYS.vacancyPickups, getTenantListFallback(departmentId, LIST_KEYS.vacancyPickups));
  const [shiftTrades, setShiftTrades] = useTenantPersistentState(departmentId, LIST_KEYS.shiftTrades, getTenantListFallback(departmentId, LIST_KEYS.shiftTrades));
  const [callShifts, setCallShifts] = useTenantPersistentState(departmentId, LIST_KEYS.callShifts, getTenantListFallback(departmentId, LIST_KEYS.callShifts));
  const [digitalDashboardDisplays, setDigitalDashboardDisplays] = useTenantPersistentState(departmentId, LIST_KEYS.digitalDashboardDisplays, getTenantListFallback(departmentId, LIST_KEYS.digitalDashboardDisplays));
  const [digitalDashboardMedia, setDigitalDashboardMedia] = useTenantPersistentState(departmentId, LIST_KEYS.digitalDashboardMedia, getTenantListFallback(departmentId, LIST_KEYS.digitalDashboardMedia));
  const [digitalDashboardPlaylists, setDigitalDashboardPlaylists] = useTenantPersistentState(departmentId, LIST_KEYS.digitalDashboardPlaylists, getTenantListFallback(departmentId, LIST_KEYS.digitalDashboardPlaylists));
  const [digitalDashboardSchedules, setDigitalDashboardSchedules] = useTenantPersistentState(departmentId, LIST_KEYS.digitalDashboardSchedules, getTenantListFallback(departmentId, LIST_KEYS.digitalDashboardSchedules));
  const [active911Alerts, setActive911Alerts] = useTenantPersistentState(departmentId, LIST_KEYS.active911Alerts, getTenantListFallback(departmentId, LIST_KEYS.active911Alerts));
  const [alertDashboardConfig, setAlertDashboardConfig] = useTenantPersistentState(departmentId, LIST_KEYS.alertDashboardConfig, getTenantListFallback(departmentId, LIST_KEYS.alertDashboardConfig));
  const [alertBusinessDirectory, setAlertBusinessDirectory] = useTenantPersistentState(departmentId, LIST_KEYS.alertBusinessDirectory, getTenantListFallback(departmentId, LIST_KEYS.alertBusinessDirectory));
  const [dailyLogs, setDailyLogs] = useTenantPersistentState(departmentId, LIST_KEYS.dailyLogs, getTenantListFallback(departmentId, LIST_KEYS.dailyLogs));
  const [timeCards, setTimeCards] = useTenantPersistentState(departmentId, LIST_KEYS.timeCards, getTenantListFallback(departmentId, LIST_KEYS.timeCards));
  const [nerisFireReports, setNerisFireReports] = useTenantPersistentState(departmentId, LIST_KEYS.nerisFireReports, getTenantListFallback(departmentId, LIST_KEYS.nerisFireReports));
  const isHydrantsView = current === "Hydrants" || current === "Hydrant Overview";
  const showPlatformBrand = inPlatformScope || current === "Creator Console";
  const headerProfile = showPlatformBrand
    ? {
      ...profile,
      name: platformConfig?.name || profile.name,
      shortName: platformConfig?.name || profile.shortName,
      displayTitle: platformConfig?.platformTitle || profile.displayTitle,
      logoUrl: resolvePlatformLogoUrl(platformConfig?.logoUrl)
    }
    : profile;
  const headerTagline = platformConfig?.tagline
    || settings?.platform?.tagline
    || defaultDepartmentSettings.platform?.tagline
    || defaultPlatformConfig.tagline;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  // On narrow screens the side menu is a full-height drawer pinned to the
  // screen edge (styles.css). While it is open, lock the page behind it.
  useEffect(() => {
    if (!mobileNav || typeof document === "undefined") return undefined;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousOverflow;
    };
  }, [mobileNav]);
  const [query, setQuery] = useState("");
  const shiftRotation = useMemo(
    () => normalizeShiftRotation(settings?.shiftRotation, profile?.shifts),
    [settings?.shiftRotation, profile?.shifts]
  );
  const profileShifts = useMemo(
    () => (Array.isArray(profile?.shifts) ? profile.shifts : EMPTY_SHIFTS),
    [profile?.shifts]
  );
  const payPeriod = useMemo(
    () => normalizePayPeriod(settings?.payPeriod),
    [settings?.payPeriod]
  );
  const portalRules = useMemo(
    () => normalizeEmployeePortalRules(settings?.employeePortalRules),
    [settings?.employeePortalRules]
  );
  const payRules = useMemo(
    () => normalizePayRules(settings?.payRules),
    [settings?.payRules]
  );
  const dailyLogSettings = useMemo(
    () => normalizeDailyLogSettings(settings?.dailyLogSettings),
    [settings?.dailyLogSettings]
  );
  const schedulingSettings = useMemo(
    () => normalizeSchedulingSettings(settings?.schedulingSettings, apparatus.map((unit) => unit.unit)),
    [settings?.schedulingSettings, apparatus]
  );
  const callShiftRules = useMemo(
    () => normalizeCallShiftRules(settings?.callShiftRules),
    [settings?.callShiftRules]
  );
  const employeePreviewPerson = useMemo(
    () => personnel.find((person) => person.id === employeePreviewPersonId) || null,
    [personnel, employeePreviewPersonId]
  );
  const dashboardLiveDayMetrics = useMemo(
    () => buildLiveScheduleDayMetrics({
      referenceDayId: formatDayId(new Date()),
      dayCount: 7,
      scheduleDays,
      rotation: shiftRotation,
      roster,
      personnel,
      leaveRequests,
      shiftTrades,
      schedulingSettings,
      apparatus,
    }),
    [
      scheduleDays,
      shiftRotation,
      roster,
      personnel,
      leaveRequests,
      shiftTrades,
      schedulingSettings,
      apparatus,
    ]
  );

  function openPersonnelProfile(personnelId = "") {
    if (!personnelId) return;
    setPersonnelNavigateId(personnelId);
    persistAppViewPref("admin");
    setAppView("admin");
    setCurrent("Personnel");
    setQuery("");
    setMobileNav(false);
  }

  function openEmployeeProfileForPerson(personnelId = "") {
    if (!personnelId) return;
    setEmployeePreviewPersonId(personnelId);
    persistAppViewPref("employee");
    setAppView("employee");
    setEmployeeSection("My Profile");
    setMobileNav(false);
  }

  function navigate(name, options = {}) {
    if (!showAdminToggle) return;
    const moduleName = name === "Platform Admin" ? CREATOR_CONSOLE_MODULE : name;
    if (moduleName === "Scheduling" && options.schedulingTab) {
      setSchedulingTab(options.schedulingTab);
    } else {
      setSchedulingTab(null);
    }
    setCurrent(moduleName);
    setQuery("");
    setMobileNav(false);
    if (appView !== "admin") setAppView("admin");
    if (moduleName === CREATOR_CONSOLE_MODULE && typeof window !== "undefined") {
      const nextUrl = inPlatformScope
        ? `${CREATOR_CONSOLE_PATH}?scope=platform`
        : `${CREATOR_CONSOLE_PATH}`;
      if (window.location.pathname.replace(/\/$/, "") !== CREATOR_CONSOLE_PATH) {
        window.history.replaceState({}, "", nextUrl);
      }
    }
  }

  function handleSelectAdminView() {
    persistAppViewPref("admin");
    setAppView("admin");
    setCurrent("Dashboard");
    setQuery("");
    setMobileNav(false);
  }

  function handleSelectEmployeeView() {
    setEmployeePreviewPersonId("");
    persistAppViewPref("employee");
    setAppView("employee");
    setEmployeeSection("My Dashboard");
    setMobileNav(false);
  }

  function navigateEmployee(name) {
    setEmployeeSection(name);
    setMobileNav(false);
  }
  const pageContent = effectiveAppView === "employee" ? (
    <EmployeePortalPage
      current={employeeSection}
      onNavigate={setEmployeeSection}
      membership={membership}
      user={user}
      permissions={permissions}
      showInternalEmail={isModuleEnabled("internalEmail")}
      personnel={personnel}
      certifications={certifications}
      training={training}
      documents={documents}
      setDocuments={setDocuments}
      leaveRequests={leaveRequests}
      setLeaveRequests={setLeaveRequests}
      shiftTrades={shiftTrades}
      setShiftTrades={setShiftTrades}
      vacancyPickups={vacancyPickups}
      setVacancyPickups={setVacancyPickups}
      setPersonnel={setPersonnel}
      scheduleDays={scheduleDays}
      roster={roster}
      apparatus={apparatus}
      schedulingSettings={schedulingSettings}
      dailyLogs={dailyLogs}
      setDailyLogs={setDailyLogs}
      shiftChangeTime={dailyLogSettings.shiftChangeTime}
      isCreator={isCreator}
      workOrders={workOrders}
      setWorkOrders={setWorkOrders}
      shiftRotation={shiftRotation}
      profileShifts={profileShifts}
      payPeriod={payPeriod}
      portalRules={portalRules}
      payRules={payRules}
      departmentTitle={profile?.displayTitle || profile?.name || "Fire and EMS"}
      departmentLogoUrl={profile?.logoUrl || ""}
      stationNames={Array.isArray(profile?.stations) ? profile.stations : []}
      timeCards={timeCards}
      setTimeCards={setTimeCards}
      previewPerson={employeePreviewPerson}
      onClearPreviewPerson={() => {
        setEmployeePreviewPersonId("");
        persistAppViewPref("admin");
        setAppView("admin");
        setCurrent("System Admin");
        setMobileNav(false);
      }}
    />
  ) : current === "Dashboard" ? (
    <CommandDashboard onNavigate={navigate} departmentId={departmentId} personnel={personnel} certifications={certifications} apparatus={apparatus} workOrders={workOrders} training={training} assets={assets} inspections={inspections} documents={documents} scheduleDays={scheduleDays} leaveRequests={leaveRequests} shiftTrades={shiftTrades} shiftRotation={shiftRotation} liveDayMetrics={dashboardLiveDayMetrics} />
  ) : current === "Personnel" ? (
    hasPermission(permissions, "viewPersonnel") ? (
      <PersonnelPage
        query={query}
        records={personnel}
        setRecords={setPersonnel}
        training={training}
        departmentId={departmentId}
        canEditPhoto={canEditPersonnel(permissions, isCreator)}
        canEditProfile={canEditPersonnel(permissions, isCreator)}
        canViewPrivateInfo={canViewPersonnelPrivateInfo(permissions, isCreator)}
        initialPersonId={personnelNavigateId}
        onInitialPersonConsumed={() => setPersonnelNavigateId("")}
        onOpenEmployeeProfile={showEmployeeToggle ? openEmployeeProfileForPerson : undefined}
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Certifications" ? (
    hasPermission(permissions, "viewCertifications") ? (
      <CertificationsPage
        query={query}
        records={certifications}
        setRecords={setCertifications}
        departmentId={departmentId}
        canEdit={
          hasPermission(permissions, "editCertifications")
          || hasPermission(permissions, "manageSystemSettings")
        }
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Training" ? (
    hasPermission(permissions, "viewTraining") ? (
      <TrainingPage
        query={query}
        records={training}
        setRecords={setTraining}
        canEdit={
          hasPermission(permissions, "editTraining")
          || hasPermission(permissions, "manageSystemSettings")
        }
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Scheduling" ? (
    hasPermission(permissions, "viewSchedule") ? (
      <SchedulingPage
        days={scheduleDays}
        setDays={setScheduleDays}
        roster={roster}
        setRoster={setRoster}
        personnel={personnel}
        setPersonnel={setPersonnel}
        apparatus={apparatus}
        leaveRequests={leaveRequests}
        setLeaveRequests={setLeaveRequests}
        overtimeOffers={overtimeOffers}
        setOvertimeOffers={setOvertimeOffers}
        vacancyPickups={vacancyPickups}
        setVacancyPickups={setVacancyPickups}
        shiftTrades={shiftTrades}
        setShiftTrades={setShiftTrades}
        callShifts={callShifts}
        setCallShifts={setCallShifts}
        shiftRotation={shiftRotation}
        profileShifts={profileShifts}
        schedulingSettings={schedulingSettings}
        departmentName={profile?.displayTitle || profile?.name || ""}
        departmentId={departmentId}
        stationNames={Array.isArray(profile?.stations) ? profile.stations : []}
        shiftChangeTime={dailyLogSettings.shiftChangeTime}
        canEditRoster={canEditScheduleRoster(permissions, isCreator)}
        canManageCallShifts={
          isCreator
          || hasPermission(permissions, "editSchedule")
          || hasPermission(permissions, "manageSystemSettings")
        }
        callShiftRules={callShiftRules}
        rosterLoaded={rosterLoaded}
        initialTab={schedulingTab}
        onInitialTabConsumed={clearSchedulingTab}
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Time Sheets" ? (
    hasPermission(permissions, "viewSchedule") ? (
      <TimeSheetsPage
        personnel={personnel}
        timeCards={timeCards}
        setTimeCards={setTimeCards}
        payPeriod={payPeriod}
        payRules={payRules}
        leaveRequests={leaveRequests}
        roster={roster}
        scheduleDays={scheduleDays}
        schedulingSettings={schedulingSettings}
        apparatus={apparatus}
        shiftRotation={shiftRotation}
        shiftTrades={shiftTrades}
        departmentTitle={profile?.displayTitle || profile?.name || "Fire and EMS"}
        departmentLogoUrl={profile?.logoUrl || ""}
        shiftChangeTime={dailyLogSettings.shiftChangeTime}
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Daily Log" ? (
    hasPermission(permissions, "viewDailyLog") ? (
      <DailyLogPage
        query={query}
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
        shiftChangeTime={dailyLogSettings.shiftChangeTime}
        canEdit={
          hasPermission(permissions, "editDailyLog")
          || hasPermission(permissions, "editSchedule")
        }
        canUnlock={
          isCreator
          || hasPermission(permissions, "manageSystemSettings")
        }
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Apparatus" ? (
    hasPermission(permissions, "viewApparatus") ? (
      <ApparatusPage
        units={apparatus}
        setUnits={fleetCutover.legacyApparatusWritesLocked ? () => {} : setApparatus}
        workOrders={workOrders}
        setWorkOrders={setWorkOrders}
        canEdit={
          canEditApparatus(permissions, isCreator)
          && !fleetCutover.legacyApparatusWritesLocked
        }
        legacyWritesLocked={fleetCutover.legacyApparatusWritesLocked}
        onOpenFleetAssets={() => setCurrent("All Fleet Assets")}
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Fleet Dashboard" ? (
    hasPermission(permissions, "viewFleetDashboard") || hasPermission(permissions, "viewApparatus") || isCreator
      ? <FleetDashboardPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Readiness Board" ? (
    hasPermission(permissions, "viewFleetReadiness")
      || hasPermission(permissions, "viewFleetDashboard")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetReadinessBoardPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fleet Defects" ? (
    hasPermission(permissions, "viewFleetDefects")
      || hasPermission(permissions, "viewFleetReadiness")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetDefectsPage query={query} onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fleet Work Orders" ? (
    hasPermission(permissions, "viewFleetWorkOrders")
      || hasPermission(permissions, "viewFleetDefects")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? (
        <FleetWorkOrdersPage
          query={query}
          onNavigate={setCurrent}
          legacyApparatus={apparatus}
          legacyWorkOrders={workOrders}
        />
      )
      : <AccessDeniedModule name={current} />
  ) : current === "PM Forecast" ? (
    hasPermission(permissions, "viewFleetPm")
      || hasPermission(permissions, "viewFleetWorkOrders")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetPmForecastPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fleet Tests" ? (
    hasPermission(permissions, "viewFleetTests")
      || hasPermission(permissions, "viewFleetPm")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? (
        <FleetTestsPage
          query={query}
          onNavigate={setCurrent}
          legacyApparatus={apparatus}
          legacyHoseTests={hoseTests}
        />
      )
      : <AccessDeniedModule name={current} />
  ) : current === "Fuel & Energy" ? (
    hasPermission(permissions, "viewFleetFuel")
      || hasPermission(permissions, "viewFleetTelematics")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetFuelEnergyPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Components & Warranty" ? (
    hasPermission(permissions, "viewFleetComponents")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetComponentsWarrantyPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fleet Operations" ? (
    hasPermission(permissions, "viewFleetOperations")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetOperationsPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Accident & Risk" ? (
    hasPermission(permissions, "viewFleetRisk")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetAccidentRiskPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fleet Procurement" ? (
    hasPermission(permissions, "viewFleetProcurement")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetProcurementPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Cost & Replacement" ? (
    hasPermission(permissions, "viewFleetCost")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetCostReplacementPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Reporting & Automation" ? (
    hasPermission(permissions, "viewFleetReporting")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetReportingPage onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Vendor Portal" ? (
    hasPermission(permissions, "viewFleetVendorPortal")
      || hasPermission(permissions, "viewFleetWorkOrders")
      || hasPermission(permissions, "viewApparatus")
      || isCreator
      ? <FleetVendorPortalPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fleet Hardening" ? (
    hasPermission(permissions, "manageFleetConfig")
      || hasPermission(permissions, "manageSystemSettings")
      || hasPermission(permissions, "viewFleetDashboard")
      || isCreator
      ? <FleetHardeningPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "All Fleet Assets" ? (
    hasPermission(permissions, "viewFleetAssets") || hasPermission(permissions, "viewApparatus") || isCreator
      ? <FleetAssetsMasterPage query={query} onNavigate={setCurrent} legacyApparatus={apparatus} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fleet Configuration Studio" ? (
    hasPermission(permissions, "manageFleetConfig")
      || hasPermission(permissions, "manageSystemSettings")
      || hasPermission(permissions, "editApparatus")
      || isCreator
      ? (
        <FleetConfigStudioPage
          onNavigate={setCurrent}
          legacyApparatus={apparatus}
          legacyWorkOrders={workOrders}
        />
      )
      : <AccessDeniedModule name={current} />
  ) : current === "Maintenance" ? (
    hasPermission(permissions, "viewApparatus") ? <MaintenancePage orders={workOrders} setOrders={setWorkOrders} /> : <AccessDeniedModule name={current} />
  ) : current === "Assets" ? (
    hasPermission(permissions, "viewAssets") ? <AssetsPageConnected query={query} records={assets} setRecords={setAssets} canEdit={canEditAssets(permissions, isCreator)} /> : <AccessDeniedModule name={current} />
  ) : current === "Hose Testing" ? (
    hasPermission(permissions, "viewApparatus") ? <HoseTestingPage query={query} records={hoseTests} setRecords={setHoseTests} /> : <AccessDeniedModule name={current} />
  ) : current === "Occupancies" ? (
    hasPermission(permissions, "viewInspections") ? (
      <OccupanciesMasterPage
        query={query}
        legacyRecords={occupancies}
        onRecordsChange={setOccupancies}
        onNavigate={setCurrent}
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Configuration Studio" ? (
    hasPermission(permissions, "manageInspectionConfig")
      || hasPermission(permissions, "manageSystemSettings")
      || hasPermission(permissions, "editInspections")
      || isCreator
      ? <InspectionConfigStudioPage />
      : <AccessDeniedModule name={current} />
  ) : current === "Inspections Dashboard" || current === "Prevention Dashboard" ? (
    hasPermission(permissions, "viewInspections") || hasPermission(permissions, "viewInspectionDashboard")
      ? <InspectionsDashboardPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Work Queue" || current === "Prevention Work Queue" ? (
    hasPermission(permissions, "viewInspections")
      ? <InspectionsWorkQueuePage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "All Inspections" ? (
    hasPermission(permissions, "viewInspections")
      ? <AllInspectionsPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "My Inspections" ? (
    hasPermission(permissions, "viewInspections")
      ? <MyInspectionsPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Open Violations" ? (
    hasPermission(permissions, "viewViolations") || hasPermission(permissions, "viewInspections") || isCreator
      ? <ViolationsPage query={query} onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Search Codes" ? (
    hasPermission(permissions, "viewCodeLibrary") || hasPermission(permissions, "viewViolations") || hasPermission(permissions, "viewInspections") || isCreator
      ? <CodeLibraryBrowsePage mode="search" onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Browse Codes" ? (
    hasPermission(permissions, "viewCodeLibrary") || hasPermission(permissions, "viewViolations") || hasPermission(permissions, "viewInspections") || isCreator
      ? <CodeLibraryBrowsePage mode="browse" onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Frequently Used" || current === "Saved Sections" ? (
    hasPermission(permissions, "viewCodeLibrary") || hasPermission(permissions, "viewViolations") || isCreator
      ? <CodeLibrarySavedPage />
      : <AccessDeniedModule name={current} />
  ) : current === "Local Amendments" ? (
    hasPermission(permissions, "viewCodeLibrary") || hasPermission(permissions, "manageInspectionConfig") || isCreator
      ? <LocalAmendmentsLibraryPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Adopted Codes" ? (
    hasPermission(permissions, "manageAdoptedCodes") || hasPermission(permissions, "manageInspectionConfig") || isCreator
      ? <AdoptedCodesPage />
      : <AccessDeniedModule name={current} />
  ) : current === "Code Administration" ? (
    hasPermission(permissions, "manageCodeLibrary") || isCreator
      ? <CodeAdministrationPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Notices & Certificates" ? (
    hasPermission(permissions, "viewInspectionNotices")
      || hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "viewViolations")
      || isCreator
      ? <InspectionNoticesPage query={query} onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Enforcement" || current === "Enforcement Cases" ? (
    hasPermission(permissions, "viewInspectionEnforcement")
      || hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "viewViolations")
      || isCreator
      ? <InspectionEnforcementPage query={query} onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fire Protection Systems" ? (
    hasPermission(permissions, "viewFireProtectionSystems")
      || hasPermission(permissions, "viewInspections")
      || isCreator
      ? <FireProtectionSystemsPage query={query} onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Fees & Payments" ? (
    hasPermission(permissions, "viewInspectionFees")
      || hasPermission(permissions, "viewInspections")
      || isCreator
      ? <InspectionFeesPage query={query} onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Inspection Reports" ? (
    hasPermission(permissions, "viewInspectionReports")
      || hasPermission(permissions, "viewInspectionDashboard")
      || hasPermission(permissions, "viewInspections")
      || isCreator
      ? <InspectionReportsPage query={query} onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Offline & Sync" ? (
    hasPermission(permissions, "viewInspectionOffline")
      || hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "conductInspections")
      || isCreator
      ? <InspectionOfflinePage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Automation & Integrations" ? (
    hasPermission(permissions, "viewInspectionAutomation")
      || hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "manageInspectionConfig")
      || isCreator
      ? <InspectionAutomationPage query={query} onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Import & Hardening" || current === "Import & Data Quality" ? (
    hasPermission(permissions, "viewInspectionHardening")
      || hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "manageInspectionConfig")
      || isCreator
      ? <InspectionHardeningPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Inspection Queue" || current === "Inspections" ? (
    hasPermission(permissions, "viewInspections") ? <InspectionsPage query={query} records={inspections} setRecords={setInspections} /> : <AccessDeniedModule name={current} />
  ) : current === "New Preplan" ? (
    hasPermission(permissions, "createPreplans")
      || hasPermission(permissions, "editPreplans")
      || hasPermission(permissions, "viewInspections")
      || isCreator
      ? <NewPreplanPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Preplan Work Queue"
    || current === "Preplan Dashboard"
    || current === "My Preplans"
    || current === "Draft Preplans"
    || current === "Awaiting Review"
    || current === "Approved Preplans"
    || current === "Preplan Reports" ? (
    hasPermission(permissions, "viewPreplans") || hasPermission(permissions, "viewInspections") || isCreator
      ? <PreplansWorkQueuePage onNavigate={setCurrent} queueFilter={current} />
      : <AccessDeniedModule name={current} />
  ) : current === "All Preplans" ? (
    hasPermission(permissions, "viewPreplans") || hasPermission(permissions, "viewInspections") || isCreator
      ? <AllPreplansPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Templates" ? (
    hasPermission(permissions, "managePreplanConfig") || hasPermission(permissions, "manageInspectionConfig") || isCreator
      ? (() => {
        try {
          window.sessionStorage.setItem("forge-config-studio-tab", "preplans");
        } catch {
          // ignore
        }
        return <InspectionConfigStudioPage />;
      })()
      : <AccessDeniedModule name={current} />
  ) : current === "Nearby Preplans" ? (
    hasPermission(permissions, "viewPreplans") || hasPermission(permissions, "viewInspections") || isCreator
      ? (
        <PreplanOperationalPage
          onNavigate={setCurrent}
          variant="nearby"
          title="Nearby Preplans"
          description="Operational preplans for response (map overlay comes with Phase 5)."
        />
      )
      : <AccessDeniedModule name={current} />
  ) : current === "Target Hazards" ? (
    hasPermission(permissions, "viewPreplans") || hasPermission(permissions, "viewInspections") || isCreator
      ? (
        <PreplanOperationalPage
          onNavigate={setCurrent}
          variant="targetHazards"
          title="Target Hazards"
          description="High-priority and target-hazard preplans."
        />
      )
      : <AccessDeniedModule name={current} />
  ) : current === "Preplan Offline" ? (
    hasPermission(permissions, "viewPreplans") || hasPermission(permissions, "viewInspections") || isCreator
      ? (
        <PreplanOperationalPage
          onNavigate={setCurrent}
          variant="offline"
          title="Preplan Offline"
          description="Offline packages and flush status for field devices."
        />
      )
      : <AccessDeniedModule name={current} />
  ) : current === "QR Scan" ? (
    hasPermission(permissions, "viewPreplans") || hasPermission(permissions, "viewInspections") || isCreator
      ? (
        <PreplanOperationalPage
          onNavigate={setCurrent}
          variant="qr"
          title="QR Scan"
          description="Authenticated QR access for published preplans."
        />
      )
      : <AccessDeniedModule name={current} />
  ) : current === "Preplans" ? (
    hasPermission(permissions, "viewPreplans") || hasPermission(permissions, "viewInspections") || isCreator
      ? <PreplansPage onNavigate={setCurrent} query={query} />
      : <AccessDeniedModule name={current} />
  ) : current === "NERIS Fire Reports" ? (
    hasPermission(permissions, "viewNerisReports") ? (
      <NerisFireReportsPage
        query={query}
        records={nerisFireReports}
        setRecords={setNerisFireReports}
        canEdit={canEditNerisReports(permissions, isCreator)}
        personnel={personnel}
        apparatus={apparatus}
        occupancies={occupancies}
        preplans={preplans}
        inspections={inspections}
        scheduleDays={scheduleDays}
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "NERIS Analytics" ? (
    hasPermission(permissions, "viewNerisReports") ? (
      <NerisAnalyticsPage reports={nerisFireReports} />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Analytics" ? (
    hasPermission(permissions, "accessAdminRms") ? <AnalyticsPage personnel={personnel} certifications={certifications} training={training} apparatus={apparatus} workOrders={workOrders} assets={assets} inspections={inspections} scheduleDays={scheduleDays} /> : <AccessDeniedModule name={current} />
  ) : current === "Messages" ? (
    hasPermission(permissions, "viewInternalEmail") ? <InternalEmailBoardPage personnel={personnel} /> : <AccessDeniedModule name={current} />
  ) : current === "Digital Dashboard" ? (
    hasPermission(permissions, "viewDigitalDashboard") ? (
      <DigitalDashboardPage
        displays={digitalDashboardDisplays}
        setDisplays={setDigitalDashboardDisplays}
        media={digitalDashboardMedia}
        setMedia={setDigitalDashboardMedia}
        playlists={digitalDashboardPlaylists}
        setPlaylists={setDigitalDashboardPlaylists}
        schedules={digitalDashboardSchedules}
        setSchedules={setDigitalDashboardSchedules}
        active911Alerts={active911Alerts}
        setActive911Alerts={setActive911Alerts}
        alertDashboardConfig={alertDashboardConfig}
        setAlertDashboardConfig={setAlertDashboardConfig}
        alertBusinessDirectory={alertBusinessDirectory}
        setAlertBusinessDirectory={setAlertBusinessDirectory}
        permissions={permissions}
        isCreator={isCreator}
      />
    ) : <AccessDeniedModule name={current} />
  ) : ["SOGs / Policies", "EMS Protocols", "Forms", "Uploads"].includes(current) ? (
    hasPermission(permissions, "viewDocuments") ? (
      <DocumentsPage
        query={query}
        records={documents}
        setRecords={setDocuments}
        navLabel={current}
        departmentId={departmentId}
        canEdit={
          hasPermission(permissions, "editDocuments")
          || hasPermission(permissions, "manageSystemSettings")
        }
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Creator Console" ? (
    hasPermission(permissions, "manageDepartments") ? <CreatorConsolePage /> : <AccessDeniedModule name={current} />
  ) : current === "System Admin" ? (
    canAccessSystemAdmin(permissions, isCreator) ? (
      <AdminControlCenterPage
        personnel={personnel}
        apparatus={apparatus}
        onOpenPersonnelProfile={openPersonnelProfile}
        onOpenEmployeeProfile={showEmployeeToggle ? openEmployeeProfileForPerson : undefined}
      />
    ) : <AccessDeniedModule name={current} />
  ) : current === "Hydrants" || current === "Hydrant Overview" ? (
    <HydrantTestingPage embedded initialTab={resolveInitialHydrantTab({ embedded: true })} departmentId={departmentId} profile={profile} personnel={personnel} onNavigate={setCurrent} />
  ) : current === "Damage Reports"
    || current === "Open Damage Reports"
    || current === "Awaiting Water Company"
    || current === "Repairs in Progress"
    || current === "Ready for Verification"
    || current === "Overdue Repairs"
    || current === "Closed Reports" ? (
    hasPermission(permissions, "viewHydrantDamageReports")
      || hasPermission(permissions, "viewHydrants")
      || hasPermission(permissions, "viewInspections")
      || isCreator
      ? <HydrantDamageReportsPage onNavigate={setCurrent} activeNavName={current} />
      : <AccessDeniedModule name={current} />
  ) : current === "Water Company Directory" ? (
    hasPermission(permissions, "viewWaterCompanies")
      || hasPermission(permissions, "viewHydrantDamageReports")
      || hasPermission(permissions, "viewInspections")
      || isCreator
      ? <WaterCompanyDirectoryPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Water Districts" ? (
    hasPermission(permissions, "viewWaterDistricts")
      || hasPermission(permissions, "viewWaterCompanies")
      || hasPermission(permissions, "viewHydrantDamageReports")
      || hasPermission(permissions, "viewHydrants")
      || isCreator
      ? <WaterDistrictsPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : current === "Damage Analytics" ? (
    hasPermission(permissions, "viewHydrantDamageReports")
      || hasPermission(permissions, "viewHydrants")
      || hasPermission(permissions, "viewInspections")
      || isCreator
      ? <HydrantDamageAnalyticsPage onNavigate={setCurrent} />
      : <AccessDeniedModule name={current} />
  ) : <ModulePage name={current} query={query} />;

  return <main className={`app-shell ${collapsed ? "nav-collapsed" : ""} ${mobileNav ? "mobile-nav-open" : ""} ${isHydrantsView ? "hydrants-view" : ""} ${isDemoModeActive() ? "demo-mode-shell" : ""}`}>
    {isDemoModeActive() && <DemoModeBanner />}
    {setupWizardOpen && !inPlatformScope && departmentId && (
      <Suspense fallback={null}>
      <DepartmentSetupWizard
        key={departmentId}
        departmentId={departmentId}
        profile={profile}
        settings={settings}
        personnel={personnel}
        setPersonnel={setPersonnel}
        refreshDepartment={refreshDepartment}
        user={user}
        onClose={({ completed } = {}) => {
          setSetupWizardOpen(false);
          if (!completed) setSetupWizardDismissed(true);
        }}
      />
      </Suspense>
    )}
    <TopBar
          query={query}
          setQuery={setQuery}
          toggleMobileNav={() => setMobileNav(!mobileNav)}
          profile={headerProfile}
          membership={membership}
          user={user}
          onSignOut={signOut}
          appView={effectiveAppView}
          onSelectAdminView={handleSelectAdminView}
          onSelectEmployeeView={handleSelectEmployeeView}
          showAdminToggle={showAdminToggle}
          showEmployeeToggle={showEmployeeToggle}
          hideSearch={effectiveAppView === "employee"}
          departmentId={departmentId}
          isCreator={isCreator}
          wideBrandLogo={showPlatformBrand}
          tagline={headerTagline}
        />
        {effectiveAppView === "admin" ? (
          <SideNav
            current={current}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            onNavigate={navigate}
            groups={visibleNavGroups}
          />
        ) : (
          <SideNav
            current={employeeSection}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            onNavigate={navigateEmployee}
            groups={visibleEmployeeNavGroups}
          />
        )}
        {mobileNav && <button className="mobile-scrim" type="button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={24} /></button>}
    <section className={`workspace ${isHydrantsView ? "workspace-hydrants" : ""}`}>
      {canGoBack && effectiveAppView === "admin" && (
        <div className="page-back-bar">
          <button type="button" className="page-back-button" onClick={() => window.history.back()} title="Go back to the previous page">
            <ChevronLeft size={16} aria-hidden="true" /> Back
          </button>
        </div>
      )}
      {/* Module pages load on demand (see lazyPage). */}
      <Suspense fallback={<PageLoading />}>{pageContent}</Suspense>
    </section>
    {!isHydrantsView ? (
      <PlatformFooter
        departmentName={inPlatformScope ? platformConfig?.name : profile.name}
        platformConfig={platformConfig}
      />
    ) : null}
  </main>;
}

export default function App() {
  const { authRequired, authLoading, membershipLoading, user, membership, isCreator } = useAuth();
  const { ready, gatewayDepartmentId, gatewayError } = useTenant();

  if (isDemoEntryPath() && !authLoading) {
    return <DemoEntryPage />;
  }

  if (
    gatewayDepartmentId
    && gatewayError
    && !user
    && !(typeof window !== "undefined" && isAlertDashboardPath(window.location.pathname))
  ) {
    return <GatewayNotFoundPage />;
  }

  if (!authRequired) return <Suspense fallback={<LoadingScreen />}><AppShell /></Suspense>;
  // Wait for access to resolve everywhere, including the creator console: creator
  // status comes from the server-side platformCreators record, which loads async.
  if (authLoading || membershipLoading || !ready) {
    return <LoadingScreen message="Loading department access..." />;
  }
  if (gatewayDepartmentId && gatewayError && !(typeof window !== "undefined" && isAlertDashboardPath(window.location.pathname))) {
    return <GatewayNotFoundPage />;
  }
  if (!user) return isDemoModeActive() ? <DemoEntryPage /> : <LoginPage />;
  if (!membership && !isCreator) return <AccessDeniedPage userId={user?.uid} />;
  return <Suspense fallback={<LoadingScreen />}><AppShell /></Suspense>;
}
