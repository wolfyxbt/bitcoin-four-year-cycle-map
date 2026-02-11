import { CONFIG } from "./config.js";
import { t } from "./i18n.js?v=20260211b";

function formatPct(v) {
  if (!Number.isFinite(v)) return "";
  return `${Math.round(v)}%`;
}

function formatPrice(v) {
  if (!Number.isFinite(v)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
}

function pctColorClass(pct) {
  if (!Number.isFinite(pct)) return "month-neutral";
  if (pct >= 40) return "pct-up-4";
  if (pct >= 30) return "pct-up-3";
  if (pct >= 20) return "pct-up-2";
  if (pct >= 10) return "pct-up-1";
  if (pct >= 0) return "pct-up-0";
  if (pct > -10) return "pct-down-0";
  if (pct > -20) return "pct-down-1";
  if (pct > -30) return "pct-down-2";
  return "pct-down-3";
}

function monthClass(cell, nowMonthKey, monthKey) {
  if (CONFIG.halvingMonths.has(monthKey || cell?.monthKey)) return "halving-month";
  if (!cell) return "future-cell";
  return pctColorClass(cell.pct);
}

export function renderMainTable({ yearRows, bottomStats, nowMonthKey }) {
  const table = document.getElementById("cycle-table");
  if (!table) return;

  const colgroup = `
    <colgroup>
      <col class="col-year">
      ${CONFIG.monthLabels.map(() => `<col class="col-month">`).join("")}
      <col class="col-gap">
      <col class="col-total">
      <col class="col-cycle">
    </colgroup>
  `;

  const monthLabels = t("monthLabels");
  const head = `
    <thead>
      <tr>
        <th>${t("yearHeader")}</th>
        ${monthLabels.map((m) => `<th>${m}</th>`).join("")}
        <th class="gap-col"></th>
        <th>${t("total")}</th>
        <th>${t("cycle")}</th>
      </tr>
    </thead>
  `;

  const bodyRows = [];
  const totalYears = yearRows.length;
  for (let i = 0; i < totalYears; i++) {
    const row = yearRows[i];
    const totalClass = pctColorClass(row.totalPct);
    // 年份背景渐变：最晚年份（i=0, 顶部）#aacfff → 最早年份（i=N-1, 底部）白色
    const ratio = totalYears > 1 ? 1 - i / (totalYears - 1) : 0;
    const r = Math.round(255 - 85 * ratio);  // 255 → 170
    const g = Math.round(255 - 48 * ratio);  // 255 → 207
    const yearBg = `rgb(${r},${g},255)`;
    bodyRows.push(`
      <tr>
        <td class="year-cell" style="background:${yearBg}">${row.year}</td>
        ${row.months
          .map((m, mi) => {
            const key = `${row.year}-${String(mi + 1).padStart(2, "0")}`;
            return `<td class="${monthClass(m, nowMonthKey, key)}">${m ? formatPct(m.pct) : ""}</td>`;
          })
          .join("")}
        <td class="gap-col"></td>
        <td class="total-cell ${totalClass}">${formatPct(row.totalPct)}</td>
        <td class="cycle-cell ${row.cycle.className}">${t(row.cycle.key)}</td>
      </tr>
    `);
    // 从 2011 起每 4 年一组，组的第一年（降序中最后一年）后面插入间隔行
    const phase = ((row.year - CONFIG.startYear) % 4 + 4) % 4;
    if (phase === 0 && i < yearRows.length - 1) {
      bodyRows.push(`<tr class="cycle-gap-row"><td colspan="16"></td></tr>`);
    }
  }

  const bottom = `
    <tr class="divider-row"><td colspan="16"></td></tr>
    <tr class="bottom-stat">
      <td>${t("median")}</td>
      ${bottomStats.median.map((m) => `<td class="${pctColorClass(m)}">${formatPct(m)}</td>`).join("")}
      <td class="lang-cell" rowspan="2" colspan="3"><div class="btn-group"><button id="lang-btn" class="lang-btn"><svg class="lang-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span class="lang-text">${t("langBtn")}</span></button><a id="x-btn" class="x-btn" href="https://x.com/intent/follow?screen_name=wolfyxbt" target="_blank" rel="noopener noreferrer"><svg class="x-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a><a id="gh-btn" class="gh-btn" href="https://github.com/wolfyxbt/bitcoin-four-year-cycle-map" target="_blank" rel="noopener noreferrer"><svg class="gh-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></a></div></td>
    </tr>
    <tr class="bottom-stat">
      <td>${t("average")}</td>
      ${bottomStats.average.map((m) => `<td class="${pctColorClass(m)}">${formatPct(m)}</td>`).join("")}
    </tr>
  `;

  table.innerHTML = `${colgroup}${head}<tbody>${bodyRows.join("")}${bottom}</tbody>`;
}

/* 数据相关的 CSS 类集合，用于就地更新时只替换数据类 */
const DATA_CLASSES = [
  "halving-month", "future-cell", "month-neutral",
  "pct-up-0", "pct-up-1", "pct-up-2", "pct-up-3", "pct-up-4",
  "pct-down-0", "pct-down-1", "pct-down-2", "pct-down-3",
];

function replaceDataClass(td, newClass) {
  for (const cls of DATA_CLASSES) td.classList.remove(cls);
  if (newClass) td.classList.add(newClass);
}

/**
 * 就地更新表格单元格内容和样式，不重建 DOM，保留 hover 状态。
 */
export function updateTableCells({ yearRows, bottomStats, nowMonthKey }) {
  const table = document.getElementById("cycle-table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  // 只遍历数据行（跳过 gap 行、divider 行、bottom-stat 行）
  const dataRows = tbody.querySelectorAll(
    "tr:not(.cycle-gap-row):not(.divider-row):not(.bottom-stat)"
  );

  for (let i = 0; i < yearRows.length && i < dataRows.length; i++) {
    const yr = yearRows[i];
    const tr = dataRows[i];
    const cells = tr.children;

    // 月份单元格（索引 1-12）
    for (let mi = 0; mi < 12; mi++) {
      const td = cells[mi + 1];
      if (!td) continue;
      const cell = yr.months[mi];
      const key = `${yr.year}-${String(mi + 1).padStart(2, "0")}`;
      const newClass = monthClass(cell, nowMonthKey, key);
      const newText = cell ? formatPct(cell.pct) : "";
      if (td.textContent !== newText) td.textContent = newText;
      replaceDataClass(td, newClass);
    }

    // Total 单元格（索引 14，gap 在 13）
    const totalTd = cells[14];
    if (totalTd) {
      const newClass = pctColorClass(yr.totalPct);
      const newText = formatPct(yr.totalPct);
      if (totalTd.textContent !== newText) totalTd.textContent = newText;
      replaceDataClass(totalTd, newClass);
    }
  }

  // 更新 Median / Average 行
  const bottomStatRows = tbody.querySelectorAll(".bottom-stat");
  const statsData = [bottomStats.median, bottomStats.average];
  for (let si = 0; si < statsData.length && si < bottomStatRows.length; si++) {
    const tr = bottomStatRows[si];
    const values = statsData[si];
    const cells = tr.children;
    for (let mi = 0; mi < 12; mi++) {
      const td = cells[mi + 1];
      if (!td) continue;
      const newText = formatPct(values[mi]);
      const newClass = pctColorClass(values[mi]);
      if (td.textContent !== newText) td.textContent = newText;
      replaceDataClass(td, newClass);
    }
  }
}

/**
 * 通用滚动数字：将容器内的文本以滚动方式更新
 * @param {HTMLElement} container - 需要更新的容器元素
 * @param {string} newText - 新的文本内容
 * @param {number} [startIndex=0] - 从第几个子元素开始处理（跳过前面的固定元素）
 */
function applyRollingText(container, newText, startIndex = 0) {
  const oldText = container.dataset.currentText || "";
  if (newText === oldText) return;

  if (!container.dataset.currentText) {
    // 首次调用清除纯文本内容（保留 startIndex 前的子元素）
    while (container.childNodes.length > startIndex) {
      container.removeChild(container.lastChild);
    }
  }
  container.dataset.currentText = newText;

  const chars = newText.split("");

  // 确保子元素数量匹配
  while (container.children.length - startIndex > chars.length) {
    container.removeChild(container.lastChild);
  }

  chars.forEach((char, i) => {
    const idx = startIndex + i;
    let col = container.children[idx];
    const isDigit = /\d/.test(char);

    if (!col) {
      col = document.createElement("span");
      col.className = isDigit ? "roll-col" : "roll-static";
      container.appendChild(col);
    }

    if (!isDigit) {
      if (col.className !== "roll-static" || col.textContent !== char) {
        col.className = "roll-static";
        col.innerHTML = "";
        col.textContent = char;
      }
      return;
    }

    if (col.className !== "roll-col") {
      col.className = "roll-col";
      col.innerHTML = "";
    }

    let strip = col.querySelector(".roll-strip");
    if (!strip) {
      strip = document.createElement("span");
      strip.className = "roll-strip";
      for (let d = 0; d <= 9; d++) {
        const digit = document.createElement("span");
        digit.className = "roll-digit";
        digit.textContent = d;
        strip.appendChild(digit);
      }
      col.appendChild(strip);
    }

    const digit = parseInt(char);
    strip.style.transform = `translateY(${-digit * 10}%)`;
  });
}

export function renderSpotPrice(price) {
  const el = document.getElementById("spot-price");
  if (!el) return;
  applyRollingText(el, formatPrice(price));
}

export function renderMonthChange(pct) {
  const el = document.getElementById("month-change");
  if (!el) return;
  if (!Number.isFinite(pct)) return;

  // 更新颜色
  el.className = `month-change ${pct >= 0 ? "up" : "down"}`;

  // 更新标签文本
  const label = document.getElementById("month-label");
  if (label) label.textContent = t("monthChangeLabel");

  // 构建滚动文本（符号 + 数字 + % ）
  const sign = pct >= 0 ? "+" : "";
  const text = `${sign}${pct.toFixed(2)}%`;
  applyRollingText(el, text);
}

