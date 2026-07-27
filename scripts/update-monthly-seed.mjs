import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const SYMBOL = "BTCUSDT";
const SEED_PATH = path.resolve(process.cwd(), "data/monthly-seed.json");
const CURRENT_SNAPSHOT_PATH = path.resolve(process.cwd(), "data/current-month.json");
const BINANCE_FIRST_MONTH = "2017-08";
const BINANCE_ARCHIVE_BASE = "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT";
const BINANCE_DAILY_ARCHIVE_BASE = "https://data.binance.vision/data/spot/daily/klines/BTCUSDT/1d";
const execFileAsync = promisify(execFile);

/* ── helpers ───────────────────────────────────────── */

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = { mode: "monthly", targetMonth: null };
  for (const arg of args) {
    if (arg === "--sync-all") opt.mode = "sync-all";
    if (arg === "--snapshot") opt.mode = "snapshot";
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

function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month, 1));
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
  const url = "https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false";
  console.log("Fetching from blockchain.info …");
  const data = await fetchJson(url);
  const monthly = new Map();
  for (const v of data.values || []) {
    const tsMs = Number(v.x) * 1000;
    const price = Number(v.y);
    if (!Number.isFinite(tsMs) || !Number.isFinite(price) || price <= 0) continue;
    const mk = monthKeyFromUtcTs(tsMs);
    if (!monthly.has(mk)) {
      monthly.set(mk, {
        monthKey: mk,
        open: price,
        close: price,
        source: "blockchain-info-daily-usd",
        isClosed: true,
      });
    } else {
      monthly.get(mk).close = price;
    }
  }
  console.log(`  ✓ blockchain.info returned ${monthly.size} months`);
  return monthly;
}

/* ── Binance public data archive ───────────────────── */

function normalizeArchiveTimestamp(value) {
  return value >= 1e14 ? Math.floor(value / 1000) : value;
}

async function downloadVerifiedArchiveRows(archiveUrl, fileName) {
  const archiveRes = await fetch(archiveUrl);
  if (archiveRes.status === 404) return null;
  if (!archiveRes.ok) throw new Error(`HTTP ${archiveRes.status} ${archiveUrl}`);

  const archive = Buffer.from(await archiveRes.arrayBuffer());
  const checksumUrl = `${archiveUrl}.CHECKSUM`;
  const checksumRes = await fetch(checksumUrl);
  if (!checksumRes.ok) throw new Error(`HTTP ${checksumRes.status} ${checksumUrl}`);
  const checksum = (await checksumRes.text()).trim().split(/\s+/)[0];
  const actualChecksum = createHash("sha256").update(archive).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(checksum) || actualChecksum !== checksum.toLowerCase()) {
    throw new Error(`Binance archive checksum mismatch: ${fileName}`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "btc-monthly-"));
  const archivePath = path.join(tempDir, fileName);
  try {
    await fs.writeFile(archivePath, archive);
    const { stdout } = await execFileAsync("unzip", ["-p", archivePath]);
    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .filter((item) => /^\d+,/.test(item));
    if (lines.length === 0) throw new Error(`Binance archive contains no kline row: ${fileName}`);
    return lines.map((line) => line.split(","));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchBinanceArchiveMonth(monthKey) {
  for (const interval of ["1mo", "1d"]) {
    const fileName = `${SYMBOL}-${interval}-${monthKey}.zip`;
    const archiveUrl = `${BINANCE_ARCHIVE_BASE}/${interval}/${fileName}`;
    const rows = await downloadVerifiedArchiveRows(archiveUrl, fileName);
    if (!rows) continue;

    const first = rows[0];
    const last = rows[rows.length - 1];
    const openTime = normalizeArchiveTimestamp(Number(first[0]));
    const closeTime = normalizeArchiveTimestamp(Number(last[6]));
    const open = Number(first[1]);
    const close = Number(last[4]);
    if (
      monthKeyFromUtcTs(openTime) !== monthKey ||
      monthKeyFromUtcTs(closeTime) !== monthKey ||
      !Number.isFinite(open) ||
      !Number.isFinite(close)
    ) {
      throw new Error(`Invalid Binance monthly kline: ${fileName}`);
    }

    return {
      monthKey,
      open,
      close,
      source: "binance-public-data",
      isClosed: true,
    };
  }
  return null;
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchBinanceDailyKline(dateKey) {
  const fileName = `${SYMBOL}-1d-${dateKey}.zip`;
  const archiveUrl = `${BINANCE_DAILY_ARCHIVE_BASE}/${fileName}`;
  const rows = await downloadVerifiedArchiveRows(archiveUrl, fileName);
  if (!rows) return null;

  const row = rows[0];
  const openTime = normalizeArchiveTimestamp(Number(row[0]));
  const closeTime = normalizeArchiveTimestamp(Number(row[6]));
  if (utcDateKey(new Date(openTime)) !== dateKey || utcDateKey(new Date(closeTime)) !== dateKey) {
    throw new Error(`Invalid Binance daily kline: ${fileName}`);
  }
  return { open: Number(row[1]), close: Number(row[4]), closeTime };
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

  if (month < BINANCE_FIRST_MONTH) {
    throw new Error(`Binance BTCUSDT history starts at ${BINANCE_FIRST_MONTH}`);
  }

  const row = await fetchBinanceArchiveMonth(month);
  if (!row) {
    console.log(`Binance archive is not published yet: ${month}`);
    return;
  }

  upsertRow(seed.rows, row);
  await writeSeed(seed);
  console.log(`✓ Updated ${month} (open: ${row.open}, close: ${row.close})`);
}

async function runSyncAll() {
  const seed = await readSeed();
  const blockchainMonths = await fetchBlockchainMonthly();
  const lastClosedMonth = previousMonthKey();
  const rows = [...blockchainMonths.values()].filter((row) => row.monthKey < BINANCE_FIRST_MONTH);

  const monthKeys = [];
  for (let month = BINANCE_FIRST_MONTH; month <= lastClosedMonth; month = nextMonthKey(month)) {
    monthKeys.push(month);
  }

  for (let index = 0; index < monthKeys.length; index += 8) {
    const batchKeys = monthKeys.slice(index, index + 8);
    const batchRows = await Promise.all(batchKeys.map(fetchBinanceArchiveMonth));
    for (let i = 0; i < batchKeys.length; i += 1) {
      const row = batchRows[i];
      if (!row) {
        const existing = seed.rows.find(
          (item) => item.monthKey === batchKeys[i] && String(item.source).startsWith("binance"),
        );
        if (!existing) throw new Error(`Missing Binance archive: ${batchKeys[i]}`);
        rows.push(existing);
      } else {
        rows.push(row);
      }
    }
    console.log(`  ✓ Binance archives ${batchKeys[0]} – ${batchKeys[batchKeys.length - 1]}`);
  }

  seed.rows = rows.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  await writeSeed(seed);
  console.log(`✓ sync-all done: ${seed.rows.length} rows`);
}

async function runSnapshot() {
  const now = new Date();
  const monthKey = monthKeyFromUtcTs(now.getTime());
  const firstDayKey = `${monthKey}-01`;
  const previousDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const previousDayKey = utcDateKey(previousDay);
  if (!previousDayKey.startsWith(monthKey)) {
    console.log(`No completed daily kline for ${monthKey} yet`);
    return;
  }

  const [firstDay, lastDay] = await Promise.all([
    fetchBinanceDailyKline(firstDayKey),
    fetchBinanceDailyKline(previousDayKey),
  ]);
  if (!firstDay || !lastDay) {
    console.log(`Binance daily archive is not published yet: ${previousDayKey}`);
    return;
  }

  const asOf = new Date(lastDay.closeTime).toISOString();
  const output = {
    version: 1,
    timezone: "UTC",
    symbol: SYMBOL,
    updatedAt: asOf,
    row: {
      monthKey,
      open: firstDay.open,
      close: lastDay.close,
      source: "binance-public-data-daily",
      isClosed: false,
      asOf,
    },
  };
  await fs.writeFile(CURRENT_SNAPSHOT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`✓ Snapshot updated through ${asOf} (open: ${firstDay.open}, close: ${lastDay.close})`);
}

/* ── main ──────────────────────────────────────────── */

async function main() {
  const opt = parseArgs();
  if (opt.mode === "sync-all") {
    await runSyncAll();
    return;
  }
  if (opt.mode === "snapshot") {
    await runSnapshot();
    return;
  }
  await runMonthly(opt.targetMonth);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
