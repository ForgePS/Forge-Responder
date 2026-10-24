import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lazyPage } from "./lib/lazyPage.js";
import { useAuth } from "./context/AuthContext.jsx";
const AdminControlCenterPage = lazyPage(() => import("./pages/AdminControlCenterPage.jsx"));
const TimeSheetsPage = lazyPage(() => import("./pages/TimeSheetsPage.jsx"));
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
import { useDepartmentStatus } from "./hooks/useDepartmentStatus.js";
import DemoEntryPage from "./pages/DemoEntryPage.jsx";
import DemoModeBanner from "./components/DemoModeBanner.jsx";
import GatewayNotFoundPage from "./pages/GatewayNotFoundPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import TwoFactorScreen from "./components/security/TwoFactorScreen.jsx";
import AccountMenu from "./components/security/AccountMenu.jsx";
import TwoFactorReminder from "./components/security/TwoFactorReminder.jsx";
import { useTwoFactorStatus } from "./hooks/useTwoFactorStatus.js";
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
  Activity,
  AlertTriangle,
  Ambulance,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  DollarSign,
  ExternalLink,
  FileBarChart2,
  FileCheck2,
  FileText,
  Gauge,
  GraduationCap,
  Home,
  Landmark,
  LayoutList,
  Mail,
  MapPin,
  Menu,
  MonitorPlay,
  PackageSearch,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Store,
  Truck,
  Upload,
  Users,
  Wrench,
  X,
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
import { formatDayId } from "./lib/shiftCalendar.js";
import { buildLiveScheduleDayMetrics } from "./lib/schedulingRoster.js";
import { normalizeShiftRotation } from "./data/defaultShiftRotation.js";
import { normalizePayPeriod } from "./lib/payPeriods.js";
import { normalizeSchedulingSettings } from "./lib/schedulingSettings.js";
import { normalizeEmployeePortalRules } from "./lib/employeePortalRules.js";
import { normalizePayRules } from "./lib/payRules.js";
import { normalizeDailyLogSettings } from "./lib/dailyLogSettings.js";
const CreatorConsolePage = lazyPage(() => import("./pages/CreatorConsolePage.jsx"));
import { ModulePage, AccessDeniedModule, ModuleNotIncluded } from "./pages/ModulePage.jsx";
import { NAV_MODULE_MAP } from "./data/adminRegistry.js";
import SaveFailedNotice from "./components/SaveFailedNotice.jsx";
const CertificationsPage = lazyPage(() => import("./pages/CertificationsPage.jsx"));
const SchedulingPage = lazyPage(() => import("./pages/SchedulingPage.jsx"));
const TrainingPage = lazyPage(() => import("./pages/TrainingPage.jsx"));
const ApparatusPage = lazyPage(() => import("./pages/ApparatusPage.jsx"));
const MaintenancePage = lazyPage(() => import("./pages/MaintenancePage.jsx"));
const DepartmentSetupWizard = lazyPage(() => import("./components/onboarding/DepartmentSetupWizard.jsx"));
import { defaultDepartmentSettings } from "./data/defaultDepartment.js";
import { defaultPlatformConfig } from "./data/platformBrand.js";
import { getTenantListFallback } from "./data/tenants/index.js";
import { LIST_KEYS } from "./lib/tenantListKeys.js";
import { resolveDepartmentLogoUrl, resolvePlatformLogoUrl } from "./lib/brandAssets.js";
import { listUserNotifications, markNotificationRead } from "./lib/notificationService.js";
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
          <div className={wideBrandLogo ? "top-brand-logo-wrap" : "top-brand-logo"}>
            <img src={resolveDepartmentLogoUrl(profile.logoUrl)} alt={profile.name} />
          </div>
          {!wideBrandLogo && (
            <div className="top-brand-text">
              <strong title={brandTitle}>{brandTitle}</strong>
              {brandSubtitle && brandSubtitle !== brandTitle && <span title={brandSubtitle}>{brandSubtitle}</span>}
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
      <AccountMenu initials={initials} displayName={displayName} roleLabel={roleLabel} onSignOut={onSignOut} />
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
  // A page whose module is switched off (reachable by a saved ?page= link) is not shown.
  const blockedModuleKey = effectiveAppView === "employee" ? "" : NAV_MODULE_MAP[current] || "";
  const moduleBlocked = Boolean(!inPlatformScope && blockedModuleKey && !isModuleEnabled(blockedModuleKey));
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
      callShifts={callShifts}
      setCallShifts={setCallShifts}
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
        onOpenFleetReport={hasPermission(permissions, "viewFleetReporting") || isCreator ? () => setCurrent("Reporting & Automation") : undefined}
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
    hasPermission(permissions, "viewApparatus") ? <MaintenancePage orders={workOrders} setOrders={setWorkOrders} units={apparatus} canEdit={canEditApparatus(permissions, isCreator)} /> : <AccessDeniedModule name={current} />
  ) : current === "Assets" ? (
    hasPermission(permissions, "viewAssets") ? <AssetsPageConnected query={query} records={assets} setRecords={setAssets} canEdit={canEditAssets(permissions, isCreator)} /> : <AccessDeniedModule name={current} />
  ) : current === "Hose Testing" ? (
    hasPermission(permissions, "viewApparatus") ? <HoseTestingPage query={query} records={hoseTests} setRecords={setHoseTests} apparatus={apparatus} canEdit={canEditApparatus(permissions, isCreator)} /> : <AccessDeniedModule name={current} />
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
  ) : <ModulePage name={current} />;

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
      <Suspense fallback={<PageLoading />}>{moduleBlocked ? <ModuleNotIncluded name={current} /> : pageContent}</Suspense>
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
  const { ready, gatewayDepartmentId, gatewayError, departmentId: activeDepartmentId, isPlatformScope: platformScopeActive } = useTenant();
  const twoFactor = useTwoFactorStatus();
  const departmentStatus = useDepartmentStatus(user && !isCreator && !platformScopeActive ? activeDepartmentId : "");

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
  // Two-factor before anything else: creators always, department admins after the deadline.
  if (twoFactor.level === "required") {
    if (twoFactor.sessionOk === null) return <LoadingScreen message="Checking sign-in..." />;
    if (!twoFactor.sessionOk) {
      return (
        <TwoFactorScreen
          enrolled={twoFactor.enrolled}
          reason={isCreator
            ? "Platform creator accounts must use two-factor login."
            : "Department administrator accounts must use two-factor login."}
        />
      );
    }
  }
  if (!membership && !isCreator) return <AccessDeniedPage userId={user?.uid} />;
  // The rules refuse members of a suspended or archived department; say why.
  if (!isCreator && departmentStatus.reason) return <AccessDeniedPage userId={user?.uid} />;
  return (
    <>
      <Suspense fallback={<LoadingScreen />}><AppShell /></Suspense>
      <SaveFailedNotice />
      {twoFactor.level === "grace" && twoFactor.sessionOk === false && (
        <TwoFactorReminder daysLeft={twoFactor.daysLeft} enrolled={twoFactor.enrolled} />
      )}
    </>
  );
}
