import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildYearMatrix } from "../src/metrics.js";

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEED_PATH = path.resolve(process.cwd(), "data/monthly-seed.json");
const CURRENT_MONTH_PATH = path.resolve(process.cwd(), "data/current-month.json");
const EPSILON = 1e-9;

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function validateRow(row, label) {
  assert(row && typeof row === "object", `${label} must be an object`);
  assert.match(row.monthKey, MONTH_KEY_PATTERN, `${label}.monthKey must use YYYY-MM`);
  assert(Number.isFinite(row.open) && row.open > 0, `${label}.open must be a finite positive number`);
  assert(Number.isFinite(row.close) && row.close > 0, `${label}.close must be a finite positive number`);
}

function assertApproximatelyEqual(actual, expected, label) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  assert(Math.abs(actual - expected) <= EPSILON * scale, `${label}: expected ${expected}, received ${actual}`);
}

const seed = await readJson(SEED_PATH);
const currentMonth = await readJson(CURRENT_MONTH_PATH);

assert(Array.isArray(seed.rows), "data/monthly-seed.json must contain a rows array");
assert(currentMonth.row && typeof currentMonth.row === "object", "data/current-month.json must contain a row object");

seed.rows.forEach((row, index) => validateRow(row, `monthly-seed.rows[${index}]`));
validateRow(currentMonth.row, "current-month.row");

const seedMonthKeys = seed.rows.map((row) => row.monthKey);
assert.equal(new Set(seedMonthKeys).size, seedMonthKeys.length, "monthly seed contains duplicate month keys");

const sortedSeedMonthKeys = [...seedMonthKeys].sort((a, b) => a.localeCompare(b));
assert.deepEqual(seedMonthKeys, sortedSeedMonthKeys, "monthly seed rows must be in chronological order");

const allRows = [...seed.rows, currentMonth.row];
const allMonthKeys = allRows.map((row) => row.monthKey);
assert.equal(new Set(allMonthKeys).size, allMonthKeys.length, "seed and current snapshot contain duplicate month keys");

const sortedRows = [...allRows].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
const yearMatrix = buildYearMatrix(sortedRows);

for (const yearRow of yearMatrix) {
  const rowsForYear = sortedRows.filter((row) => row.monthKey.startsWith(`${yearRow.year}-`));
  if (rowsForYear.length === 0) {
    assert.equal(yearRow.totalPct, null, `${yearRow.year} Total must be null without monthly data`);
    continue;
  }

  const firstValid = rowsForYear.find((row) => Number.isFinite(row.open));
  const lastValid = [...rowsForYear].reverse().find((row) => Number.isFinite(row.close));
  const expectedTotal = ((lastValid.close - firstValid.open) / firstValid.open) * 100;

  assert.equal(yearRow.totalOpen, firstValid.open, `${yearRow.year} Total must use the first valid monthly open`);
  assert.equal(yearRow.totalClose, lastValid.close, `${yearRow.year} Total must use the last valid monthly close`);
  assertApproximatelyEqual(yearRow.totalPct, expectedTotal, `${yearRow.year} annual Total`);

  const summedMonthlyPercentages = rowsForYear.reduce(
    (sum, row) => sum + ((row.close - row.open) / row.open) * 100,
    0,
  );
  if (rowsForYear.length > 1 && Math.abs(expectedTotal - summedMonthlyPercentages) > EPSILON) {
    assert(
      Math.abs(yearRow.totalPct - summedMonthlyPercentages) > EPSILON,
      `${yearRow.year} Total must not sum monthly percentages`,
    );
  }
}

console.log(`JSON validation: PASS (${path.basename(SEED_PATH)}, ${path.basename(CURRENT_MONTH_PATH)})`);
console.log(`Monthly data integrity: PASS (${seed.rows.length} closed rows + 1 current row)`);
console.log("Annual Total calculation: PASS (first valid monthly open -> last valid monthly close)");
