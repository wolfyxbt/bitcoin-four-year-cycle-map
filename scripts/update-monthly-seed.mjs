import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BINANCE_BASE = "https://api.binance.com";
const SYMBOL = "BTCUSDT";
const TIMEZONE = "0";
const SEED_PATH = path.resolve(process.cwd(), "data/monthly-seed.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = {
    mode: "monthly",
    targetMonth: null,
  };
  for (const arg of args) {
    if (arg === "--sync-all") opt.mode = "sync-all";
    if (arg.startsWith("--target=")) opt.targetMonth = arg.slice("--target=".length);
  }
  return opt;
}

function monthKeyFromUtcTs(tsMs) {
  const d = new Date(tsMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStartUtcMs(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
}

function nextMonthStartUtcMs(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return Date.UTC(year, month, 1, 0, 0, 0, 0);
}

function previousMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const d = month === 0 ? new Date(Date.UTC(year - 1, 11, 1)) : new Date(Date.UTC(year, month - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchBinanceMonth(monthKey) {
  const startTime = monthStartUtcMs(monthKey);
  const endTime = nextMonthStartUtcMs(monthKey) - 1;
  const url =
    `${BINANCE_BASE}/api/v3/klines` +
    `?symbol=${SYMBOL}&interval=1M&timeZone=${TIMEZONE}&startTime=${startTime}&endTime=${endTime}&limit=2`;
  const rows = await fetchJson(url);
  const hit = rows.find((r) => monthKeyFromUtcTs(Number(r[0])) === monthKey);
  if (!hit) throw new Error(`Binance 未返回目标月份数据: ${monthKey}`);
  return {
    monthKey,
    open: Number(hit[1]),
    close: Number(hit[4]),
    source: "binance",
    isClosed: true,
  };
}

async function fetchBinanceAll() {
  const startTime = Date.UTC(2017, 7, 1);
  const endTime = Date.now();
  const url =
    `${BINANCE_BASE}/api/v3/klines` +
    `?symbol=${SYMBOL}&interval=1M&timeZone=${TIMEZONE}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const rows = await fetchJson(url);
  return rows.map((r) => ({
    monthKey: monthKeyFromUtcTs(Number(r[0])),
    open: Number(r[1]),
    close: Number(r[4]),
    source: "binance",
    isClosed: true,
  }));
}

async function fetchBlockchainMonthly() {
  const url = "https://api.blockchain.info/charts/market-price?timespan=all&format=json&cors=true";
  const data = await fetchJson(url);
  const monthly = new Map();
  for (const v of data.values || []) {
    const tsMs = Number(v.x) * 1000;
    const price = Number(v.y);
    if (!Number.isFinite(tsMs) || !Number.isFinite(price) || price <= 0) continue;
    const monthKey = monthKeyFromUtcTs(tsMs);
    if (!monthly.has(monthKey)) {
      monthly.set(monthKey, { monthKey, open: price, close: price, source: "blockchain-info", isClosed: true });
    } else {
      monthly.get(monthKey).close = price;
    }
  }
  return [...monthly.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

async function readSeed() {
  try {
    const raw = await fs.readFile(SEED_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || 1,
      timezone: parsed.timezone || "UTC",
      symbol: parsed.symbol || SYMBOL,
      updatedAt: parsed.updatedAt || null,
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    };
  } catch {
    return { version: 1, timezone: "UTC", symbol: SYMBOL, updatedAt: null, rows: [] };
  }
}

async function writeSeed(seed) {
  const sortedRows = [...seed.rows].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const output = {
    version: seed.version || 1,
    timezone: "UTC",
    symbol: SYMBOL,
    updatedAt: new Date().toISOString(),
    rows: sortedRows,
  };
  await fs.mkdir(path.dirname(SEED_PATH), { recursive: true });
  await fs.writeFile(SEED_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

function upsertRow(rows, row) {
  const idx = rows.findIndex((r) => r.monthKey === row.monthKey);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
}

async function runMonthly(targetMonth) {
  const seed = await readSeed();
  const month = targetMonth || previousMonthKey();
  const row = await fetchBinanceMonth(month);
  upsertRow(seed.rows, row);
  await writeSeed(seed);
  console.log(`updated month ${month}`);
}

async function runSyncAll() {
  const seed = await readSeed();
  const [blockchainRows, binanceRows] = await Promise.all([fetchBlockchainMonthly(), fetchBinanceAll()]);
  const merged = new Map();
  for (const row of blockchainRows) merged.set(row.monthKey, row);
  for (const row of binanceRows) merged.set(row.monthKey, row);

  const nowMonth = monthKeyFromUtcTs(Date.now());
  seed.rows = [...merged.values()]
    .filter((r) => r.monthKey < nowMonth)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  await writeSeed(seed);
  console.log(`sync-all done: ${seed.rows.length} rows`);
}

async function main() {
  const opt = parseArgs();
  if (opt.mode === "sync-all") {
    await runSyncAll();
    return;
  }
  await runMonthly(opt.targetMonth);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
