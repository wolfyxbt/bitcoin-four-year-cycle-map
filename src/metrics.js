import { CONFIG, CYCLE_INFO } from "./config.js";

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getCycleInfo(year) {
  const normalized = ((year - CONFIG.cycleAnchorYear) % 4 + 4) % 4;
  return CYCLE_INFO[normalized];
}

function toMonthChangePercent(open, close) {
  const o = toNumberOrNull(open);
  const c = toNumberOrNull(close);
  if (o === null || c === null || o === 0) return null;
  return ((c - o) / o) * 100;
}

function getYearMonthFromKey(monthKey) {
  const [y, m] = monthKey.split("-");
  return { year: Number(y), monthIndex: Number(m) - 1 };
}

export function buildYearMatrix(rows) {
  const byYear = new Map();
  for (const row of rows) {
    const { year, monthIndex } = getYearMonthFromKey(row.monthKey);
    if (year < CONFIG.startYear || year > CONFIG.endYear) continue;

    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        months: new Array(12).fill(null),
      });
    }

    const item = byYear.get(year);
    const pct = toMonthChangePercent(row.open, row.close);
    item.months[monthIndex] = {
      monthKey: row.monthKey,
      open: row.open,
      close: row.close,
      pct,
      source: row.source,
      isClosed: row.isClosed,
    };
  }

  for (let year = CONFIG.startYear; year <= CONFIG.endYear; year += 1) {
    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        months: new Array(12).fill(null),
      });
    }
  }

  const years = [...byYear.values()].sort((a, b) => b.year - a.year);
  for (const y of years) {
    const first = y.months.find((m) => m && Number.isFinite(m.open));
    const last = [...y.months].reverse().find((m) => m && Number.isFinite(m.close));
    y.totalPct = first && last && first.open !== 0 ? ((last.close - first.open) / first.open) * 100 : null;
    y.cycle = getCycleInfo(y.year);
  }

  return years;
}

export function computeBottomStats(yearRows) {
  const monthly = Array.from({ length: 12 }, () => []);
  for (const row of yearRows) {
    for (let i = 0; i < 12; i += 1) {
      const pct = row.months[i]?.pct;
      if (Number.isFinite(pct)) monthly[i].push(pct);
    }
  }

  const average = monthly.map((values) => {
    if (values.length === 0) return null;
    return values.reduce((acc, n) => acc + n, 0) / values.length;
  });

  const median = monthly.map((values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  });

  return { average, median };
}

