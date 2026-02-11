import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SYMBOL = "BTCUSDT";
const SEED_PATH = path.resolve(process.cwd(), "data/monthly-seed.json");

/* ── helpers ───────────────────────────────────────── */

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = { mode: "monthly", targetMonth: null };
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

function previousMonthKey() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const d = m === 0 ? new Date(Date.UTC(y - 1, 11, 1)) : new Date(Date.UTC(y, m - 1, 1));
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

/* ── blockchain.info data source ───────────────────── */

async function fetchBlockchainMonthly() {
  const url = "https://api.blockchain.info/charts/market-price?timespan=all&format=json&cors=true";
  console.log("Fetching from blockchain.info …");
  const data = await fetchJson(url);
  const monthly = new Map();
  for (const v of data.values || []) {
    const tsMs = Number(v.x) * 1000;
    const price = Number(v.y);
    if (!Number.isFinite(tsMs) || !Number.isFinite(price) || price <= 0) continue;
    const mk = monthKeyFromUtcTs(tsMs);
    if (!monthly.has(mk)) {
      monthly.set(mk, { monthKey: mk, open: price, close: price, source: "blockchain-info", isClosed: true });
    } else {
      monthly.get(mk).close = price;
    }
  }
  console.log(`  ✓ blockchain.info returned ${monthly.size} months`);
  return monthly;
}

/* ── seed read / write ─────────────────────────────── */

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

/* ── run modes ─────────────────────────────────────── */

async function runMonthly(targetMonth) {
  const seed = await readSeed();
  const month = targetMonth || previousMonthKey();
  console.log(`Updating month: ${month}`);

  const allMonths = await fetchBlockchainMonthly();
  const row = allMonths.get(month);
  if (!row) throw new Error(`blockchain.info 未返回 ${month} 的数据`);

  upsertRow(seed.rows, row);
  await writeSeed(seed);
  console.log(`✓ Updated ${month} (open: ${row.open}, close: ${row.close})`);
}

async function runSyncAll() {
  const seed = await readSeed();
  const allMonths = await fetchBlockchainMonthly();
  const nowMonth = monthKeyFromUtcTs(Date.now());

  // Keep existing rows as base, overlay with blockchain.info data
  const merged = new Map();
  for (const row of seed.rows) merged.set(row.monthKey, row);
  for (const [mk, row] of allMonths) {
    if (mk < nowMonth) merged.set(mk, row);
  }

  seed.rows = [...merged.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  await writeSeed(seed);
  console.log(`✓ sync-all done: ${seed.rows.length} rows`);
}

/* ── main ──────────────────────────────────────────── */

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
