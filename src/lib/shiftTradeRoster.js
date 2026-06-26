export function isApprovedShiftTrade(trade = {}) {
  return /approved/i.test(String(trade.status || ""));
}

export function resolveShiftTradeRosterAdjustments(dayId = "", shiftTrades = []) {
  const excluded = new Set();
  const included = new Set();

  (Array.isArray(shiftTrades) ? shiftTrades : []).forEach((trade) => {
    if (!isApprovedShiftTrade(trade)) return;

    if (trade.giveDayId === dayId) {
      if (trade.personnelId) excluded.add(trade.personnelId);
      if (trade.coveragePersonnelId) included.add(trade.coveragePersonnelId);
    }

    if (trade.receiveDayId === dayId) {
      if (trade.coveragePersonnelId) excluded.add(trade.coveragePersonnelId);
      if (trade.personnelId) included.add(trade.personnelId);
    }
  });

  return { excluded, included };
}

export function resolveShiftTradeLabel(dayId = "", personnelId = "", shiftTrades = []) {
  const trade = (Array.isArray(shiftTrades) ? shiftTrades : []).find((entry) => {
    if (!isApprovedShiftTrade(entry)) return false;
    if (entry.giveDayId === dayId && entry.coveragePersonnelId === personnelId) {
      return true;
    }
    if (entry.receiveDayId === dayId && entry.personnelId === personnelId) {
      return true;
    }
    return false;
  });

  if (!trade) return "";
  if (trade.giveDayId === dayId && trade.coveragePersonnelId === personnelId) {
    return `Trade in for ${trade.requestedBy || "member"}`;
  }
  return `Trade in for ${trade.assignedCoverageMember || trade.coverage || "member"}`;
}
