/**
 * Deterministic question parsing. Services only ever receive these parsed
 * values; neither the user's text nor the model ever becomes a database query.
 */
const { addDays, daysBetween, isDateString, localParts } = require("../heatZone/time");

const MAX_WINDOW_DAYS = 366;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const CATEGORY_WORDS = [
  ["Fire", /\b(fires?|structure fire|house fire|brush|vehicle fire|smoke)\b/i],
  ["Medical", /\b(medical|ems|cardiac|sick|injur(y|ies)|patient|overdose|fall)\b/i],
  ["Rescue", /\b(rescue|extrication|entrapment|water rescue)\b/i],
  ["Hazardous Situation", /\b(hazmat|haz-mat|gas leak|spill|hazardous|odor)\b/i],
  ["Alarm", /\b(alarm|false alarm|smoke detector|co detector)\b/i],
  ["Vehicle Crash", /\b(mva|mvc|crash|collision|wreck|motor vehicle)\b/i],
  ["Public Service", /\b(public service|lift assist|service call|assist)\b/i],
];

const text = (v) => (v === null || v === undefined ? "" : String(v));

function startOfWeek(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -day);
}

/**
 * @param {string} message
 * @param {{timeZone:string, now?:number, defaultDays?:number}} opts
 * @returns {{from:string,to:string,label:string,explicit:boolean,hours:number|null}}
 */
function parseWindow(message, { timeZone, now = Date.now(), defaultDays = 7 } = {}) {
  const m = text(message).toLowerCase();
  const today = localParts(now, timeZone).date;
  const make = (from, to, label, hours = null) => {
    let f = from;
    if (daysBetween(f, to) + 1 > MAX_WINDOW_DAYS) f = addDays(to, -(MAX_WINDOW_DAYS - 1));
    return { from: f, to, label, explicit: true, hours };
  };

  const iso = m.match(/\b(\d{4}-\d{2}-\d{2})\b(?:\s*(?:to|through|-|–)\s*(\d{4}-\d{2}-\d{2}))?/);
  if (iso && isDateString(iso[1])) {
    const to = iso[2] && isDateString(iso[2]) ? iso[2] : iso[1];
    if (daysBetween(iso[1], to) >= 0) return make(iso[1], to, iso[2] ? `${iso[1]} to ${to}` : iso[1]);
  }
  const hours = m.match(/\b(?:last|past)\s+(\d{1,3})\s*(?:hours?|hrs?)\b/);
  if (hours) {
    const h = Math.min(Number(hours[1]) || 24, 24 * 14);
    const fromDate = localParts(now - h * 3600_000, timeZone).date;
    return make(fromDate, today, `last ${h} hours`, h);
  }
  const lastShift = () => make(localParts(now - 24 * 3600_000, timeZone).date, today, "last 24 hours", 24);
  if (/\b(last|past)\s+(24 hours|day)\b|\blast shift\b|\bthis shift\b/.test(m)) {
    return lastShift();
  }
  if (/\btoday\b|\btonight\b|\bthis morning\b/.test(m)) return make(today, today, "today");
  if (/\byesterday\b|\blast night\b/.test(m)) {
    const y = addDays(today, -1);
    return make(y, y, "yesterday");
  }
  const days = m.match(/\b(?:last|past)\s+(\d{1,3})\s*days?\b/);
  if (days) {
    const n = Math.max(1, Math.min(Number(days[1]) || 7, MAX_WINDOW_DAYS));
    return make(addDays(today, -(n - 1)), today, `last ${n} days`);
  }
  const weeks = m.match(/\b(?:last|past)\s+(\d{1,2})\s*weeks?\b/);
  if (weeks) {
    const n = Math.max(1, Math.min(Number(weeks[1]) || 1, 52));
    return make(addDays(today, -(n * 7 - 1)), today, `last ${n} weeks`);
  }
  if (/\bthis week\b/.test(m)) return make(startOfWeek(today), today, "this week");
  if (/\blast week\b/.test(m)) {
    const start = addDays(startOfWeek(today), -7);
    return make(start, addDays(start, 6), "last week");
  }
  if (/\bthis month\b/.test(m)) return make(`${today.slice(0, 7)}-01`, today, "this month");
  if (/\blast month\b/.test(m)) {
    const firstThis = `${today.slice(0, 7)}-01`;
    const lastPrev = addDays(firstThis, -1);
    return make(`${lastPrev.slice(0, 7)}-01`, lastPrev, "last month");
  }
  if (/\b(this|past|last) year\b|\bytd\b|year to date/.test(m)) {
    if (/\blast year\b/.test(m)) {
      const y = Number(today.slice(0, 4)) - 1;
      return make(`${y}-01-01`, `${y}-12-31`, "last year");
    }
    return make(`${today.slice(0, 4)}-01-01`, today, "this year");
  }
  const month = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(m));
  if (month >= 0) {
    let year = Number(today.slice(0, 4));
    const yearMatch = m.match(/\b(20\d{2})\b/);
    if (yearMatch) year = Number(yearMatch[1]);
    else if (month + 1 > Number(today.slice(5, 7))) year -= 1;
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, "0")}-01`;
    const end = addDays(nextMonth, -1);
    return make(from, daysBetween(end, today) < 0 ? today : end, `${MONTHS[month][0].toUpperCase()}${MONTHS[month].slice(1)} ${year}`);
  }
  // "Shift briefing" alone means the last 24 hours; an explicit window above wins.
  if (/\bshift\b/.test(m)) return lastShift();
  const n = Math.max(1, Math.min(defaultDays, MAX_WINDOW_DAYS));
  return { from: addDays(today, -(n - 1)), to: today, label: `last ${n} days`, explicit: false, hours: null };
}

/** Unit ids such as E1, M-12, Ladder 3, Medic 2, BC1 -> normalised "E1", "M12", "LADDER3". */
function parseUnits(message) {
  const out = new Set();
  const re = /\b(engine|ladder|truck|medic|rescue|squad|tanker|brush|battalion|bc|e|l|t|m|r|q|tk|br)[\s-]?(\d{1,3})\b/gi;
  let match;
  while ((match = re.exec(text(message)))) {
    out.add(normalUnit(`${match[1]}${match[2]}`));
  }
  return [...out].slice(0, 10);
}

const UNIT_WORDS = { ENGINE: "E", LADDER: "L", TRUCK: "T", MEDIC: "M", RESCUE: "R", SQUAD: "Q", TANKER: "TK", BRUSH: "BR", BATTALION: "BC" };

/** "Engine 1", "E-1", "e1" -> "E1"; used on both the question and the records. */
function normalUnit(value) {
  const compact = text(value).toUpperCase().replace(/[\s-]/g, "");
  const m = compact.match(/^([A-Z]+)(\d+)$/);
  if (!m) return compact;
  return `${UNIT_WORDS[m[1]] || m[1]}${Number(m[2])}`;
}

/** Report numbers like NERIS-2026-0042, 2026-00123, R-1001, or "report 42". */
function parseReportNumbers(message) {
  const out = new Set();
  const m = text(message);
  for (const match of m.matchAll(/\b([A-Z]{1,8}-\d{2,4}-\d{1,6}|\d{4}-\d{3,6}|[A-Z]{1,4}-\d{2,6})\b/g)) out.add(match[1]);
  for (const match of m.matchAll(/\b(?:report|incident|call)\s*#?\s*(\d{2,8})\b/gi)) out.add(match[1]);
  return [...out].filter((v) => !/^(E|L|T|M|R|Q|BC)-\d{1,3}$/i.test(v)).slice(0, 5);
}

function parseCategories(message) {
  return CATEGORY_WORDS.filter(([, re]) => re.test(text(message))).map(([name]) => name);
}

/** "on Main St", "at 100 Oak Ave", "near Elm" -> "main st" (lower-case fragment). */
function parseAddress(message) {
  const m = text(message).match(/\b(?:at|on|near|address)\s+((?:\d{1,6}\s+)?[A-Za-z0-9][A-Za-z0-9 .'-]{2,40}?\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|hwy|highway|pkwy|ct|court|way|pl|place|cir|circle)\b)/i);
  return m ? m[1].toLowerCase().replace(/\s+/g, " ").trim() : "";
}

function parseQuestion(message, opts) {
  return {
    window: parseWindow(message, opts),
    units: parseUnits(message),
    reportNumbers: parseReportNumbers(message),
    categories: parseCategories(message),
    address: parseAddress(message),
  };
}

module.exports = {
  MAX_WINDOW_DAYS,
  normalUnit,
  parseAddress,
  parseCategories,
  parseQuestion,
  parseReportNumbers,
  parseUnits,
  parseWindow,
};
