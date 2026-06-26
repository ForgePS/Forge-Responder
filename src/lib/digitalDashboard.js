export const MEDIA_TYPES = [
  { value: "announcement", label: "Announcement" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "html", label: "HTML / Web" },
  { value: "office", label: "Microsoft Office" },
  { value: "weather", label: "Weather Ticker" },
];

export const DISPLAY_STATUSES = [
  { value: "online", label: "Online" },
  { value: "syncing", label: "Syncing" },
  { value: "offline", label: "Offline" },
  { value: "maintenance", label: "Maintenance" },
];

export const TRANSITION_TYPES = [
  { value: "fade", label: "Crossfade" },
  { value: "cut", label: "Cut" },
];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function createDigitalDashboardId(prefix = "DD") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function formatDurationSeconds(totalSeconds = 0) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function formatDisplayStatus(status = "") {
  return DISPLAY_STATUSES.find((item) => item.value === status)?.label || status || "Unknown";
}

export function displayStatusTone(status = "") {
  if (status === "online") return "success";
  if (status === "syncing") return "info";
  if (status === "maintenance") return "warning";
  return "critical";
}

export function mediaTypeLabel(type = "") {
  return MEDIA_TYPES.find((item) => item.value === type)?.label || type || "Media";
}

export function computePlaylistDuration(playlist = {}, mediaById = {}) {
  const itemIds = Array.isArray(playlist.itemIds) ? playlist.itemIds : [];
  return itemIds.reduce((total, mediaId) => {
    const media = mediaById[mediaId];
    return total + (Number(media?.durationSec) || 0);
  }, 0);
}

export function buildMediaLookup(media = []) {
  return Object.fromEntries((media || []).map((item) => [item.id, item]));
}

export function buildPlaylistLookup(playlists = []) {
  return Object.fromEntries((playlists || []).map((item) => [item.id, item]));
}

export function resolveDisplayPlaylist(display = {}, playlistsById = {}) {
  if (!display?.playlistId) return null;
  return playlistsById[display.playlistId] || null;
}

export function summarizeDashboardStats(displays = [], media = [], playlists = [], schedules = []) {
  const online = displays.filter((item) => item.status === "online").length;
  const activeSchedules = schedules.filter((item) => item.active !== false).length;
  return {
    displayCount: displays.length,
    onlineCount: online,
    mediaCount: media.length,
    playlistCount: playlists.length,
    scheduleCount: schedules.length,
    activeScheduleCount: activeSchedules,
  };
}

export function formatLastSync(value = "") {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function defaultDisplayForm(overrides = {}) {
  return {
    id: "",
    name: "",
    location: "",
    station: "",
    resolution: "1920×1080",
    orientation: "landscape",
    status: "offline",
    playlistId: "",
    notes: "",
    lastSyncAt: "",
    ...overrides,
  };
}

export function defaultMediaForm(overrides = {}) {
  return {
    id: "",
    title: "",
    type: "announcement",
    durationSec: 10,
    content: "",
    url: "",
    storagePath: "",
    tags: [],
    groups: ["Default"],
    locked: false,
    priority: 1,
  importSource: "",
  galleryConfig: null,
  webConfig: null,
  localConfig: null,
  socialConfig: null,
  hubConfig: null,
  selectedGalleryImageId: "",
  createdAt: "",
    ...overrides,
  };
}

export function defaultPlaylistForm(overrides = {}) {
  return {
    id: "",
    name: "",
    description: "",
    itemIds: [],
    loop: true,
    transition: "fade",
    ...overrides,
  };
}

export function defaultScheduleForm(overrides = {}) {
  return {
    id: "",
    name: "",
    displayIds: [],
    playlistId: "",
    priority: 1,
    startDate: "",
    endDate: "",
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "06:00",
    endTime: "22:00",
    active: true,
    ...overrides,
  };
}

export function filterLibraryRecords(records = [], query = "", fields = []) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => fields.some((field) => {
    const value = record?.[field];
    if (Array.isArray(value)) {
      return value.some((item) => String(item).toLowerCase().includes(needle));
    }
    return String(value ?? "").toLowerCase().includes(needle);
  }));
}

export function formatDurationClock(totalSeconds = 0) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

export function parseDurationClock(value = "") {
  const parts = String(value || "0:0:0").split(":").map((part) => Number(part) || 0);
  while (parts.length < 3) parts.unshift(0);
  const [hours, minutes, seconds] = parts.slice(-3);
  return (hours * 3600) + (minutes * 60) + seconds;
}

export const SUPPORTED_MEDIA_EXTENSIONS = [
  "bmp", "gif", "jpeg", "jpg", "mov", "mp3", "mp4", "ogg", "pdf", "png", "svg", "wav", "webm", "webp",
];

export const MICROSOFT_OFFICE_EXTENSIONS = [
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "potx", "ppsx", "csv",
];

export function isMicrosoftHostedUrl(url = "") {
  return /onedrive\.live\.com|1drv\.ms|sharepoint\.com|officeapps\.live\.com|office\.com|microsoft\.com\/.*\/view/i.test(String(url));
}

export function isOfficeFileName(name = "") {
  const lower = String(name || "").toLowerCase();
  return MICROSOFT_OFFICE_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function inferMediaTypeFromFile(name = "", mimeType = "") {
  const lower = String(name || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(lower) || mime.startsWith("image/")) return "image";
  if (/\.(mp4|webm|mov|m4v|ogg)$/.test(lower) || mime.startsWith("video/")) return "video";
  if (/\.(mp3|wav|ogg)$/.test(lower) || mime.startsWith("audio/")) return "announcement";
  if (/\.(html?|htm)$/.test(lower) || mime.includes("html")) return "html";
  if (isOfficeFileName(lower) || /\.(docx?|xlsx?|pptx?|potx|ppsx|csv)$/.test(lower)) return "office";
  if (/\.pdf$/.test(lower) || mime === "application/pdf") return "announcement";
  return "announcement";
}

export function buildMediaStoragePath(departmentId, fileName = "asset") {
  const safeName = String(fileName).replace(/[^\w.-]+/g, "-");
  return `departments/${departmentId}/digital-dashboard-media/${Date.now()}-${safeName}`;
}
