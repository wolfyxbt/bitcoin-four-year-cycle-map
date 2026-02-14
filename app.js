import { CONFIG } from "./src/config.js?v=20260211a";
import { loadHistoricalMonthlyData, fetchCurrentMonthKlineSnapshot, connectRealtimeStreams } from "./src/dataService.js?v=20260211a";
import { buildYearMatrix, computeBottomStats } from "./src/metrics.js?v=20260211a";
import { renderMainTable, updateTableCells, renderSpotPrice, renderMonthChange } from "./src/render.js?v=20260211b";
import { getLang, setLang, t } from "./src/i18n.js?v=20260211b";

const state = {
  rowsByMonth: new Map(),
  nowMonthKey: "",
  destroyRealtime: null,
  renderTimer: null,
  tableRendered: false,
};

function getNowMonthKeyUTC() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function setRow(row) {
  state.rowsByMonth.set(row.monthKey, row);
}

function rebuildView(forceFullRender = false) {
  const rows = [...state.rowsByMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const yearRows = buildYearMatrix(rows);
  const bottomStats = computeBottomStats(yearRows);

  if (!state.tableRendered || forceFullRender) {
    renderMainTable({ yearRows, bottomStats, nowMonthKey: state.nowMonthKey });
    setupCrossHighlight();
    state.tableRendered = true;
  } else {
    // 实时更新：只修改变化的单元格内容和样式，不重建 DOM
    updateTableCells({ yearRows, bottomStats, nowMonthKey: state.nowMonthKey });
  }
}

function scheduleRender() {
  if (state.renderTimer) return;
  state.renderTimer = window.setTimeout(() => {
    state.renderTimer = null;
    rebuildView();
  }, 120);
}

async function bootstrap() {
  try {
    state.nowMonthKey = getNowMonthKeyUTC();

    const { rows } = await loadHistoricalMonthlyData();
    for (const row of rows) setRow(row);

    // 先用历史数据渲染表格，不阻塞
    rebuildView();

    // 异步补当前月快照，成功后刷新表格
    fetchCurrentMonthKlineSnapshot()
      .then((currentMonth) => {
        if (currentMonth) {
          setRow(currentMonth);
          rebuildView();
        }
      })
      .catch(() => {});

    // 获取减半倒计时数据，动态高亮下次减半月份
    fetch("https://api.blockchair.com/tools/halvening")
      .then((res) => res.json())
      .then((json) => {
        const btc = json?.data?.bitcoin ?? null;
        if (btc?.halvening_time) {
          const d = new Date(btc.halvening_time.replace(" ", "T") + "Z");
          const apiKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          const estimated = "2028-04";
          let changed = false;
          if (apiKey !== estimated && CONFIG.halvingMonths.has(estimated)) {
            CONFIG.halvingMonths.delete(estimated);
            changed = true;
          }
          if (!CONFIG.halvingMonths.has(apiKey)) {
            CONFIG.halvingMonths.add(apiKey);
            changed = true;
          }
          if (changed) rebuildView(true);
        }
      })
      .catch(() => {});

    state.destroyRealtime = connectRealtimeStreams({
      onTradePrice: (price) => {
        renderSpotPrice(price);
        // 计算本月涨跌幅
        const currentRow = state.rowsByMonth.get(state.nowMonthKey);
        if (currentRow && currentRow.open > 0) {
          const pct = ((price - currentRow.open) / currentRow.open) * 100;
          renderMonthChange(pct);
        }
      },
      onMonthKline: (kline) => {
        setRow({
          monthKey: kline.monthKey,
          open: kline.open,
          close: kline.close,
          source: kline.source,
          isClosed: kline.isClosed,
        });
        scheduleRender();
      },
    });
  } catch (error) {
    console.error("初始化失败:", error);
  }
}

function fitToViewport() {
  const page = document.querySelector(".page");
  if (!page) return;
  // 先重置所有缩放相关样式，获取真实内容尺寸
  page.style.transform = "";
  page.style.marginLeft = "";
  page.style.marginRight = "";
  page.style.marginBottom = "";

  // 同时测量 page 和 table，取最大值以确保完整宽度
  const table = document.querySelector(".cycle-table");
  const pagePadX = 32; // page 左右 padding 各 16px
  const tableW = table ? table.offsetWidth + pagePadX : 0;
  const contentW = Math.max(page.scrollWidth, page.offsetWidth, tableW);
  const contentH = Math.max(page.scrollHeight, page.offsetHeight);

  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  // 获取 CSS 中的 margin-top（36px），高度计算需扣除
  const marginTop = parseFloat(getComputedStyle(page).marginTop) || 0;

  // 宽度留 ~8% 两侧留白，高度扣除顶部 margin + 底部 16px 留白
  const scaleW = (vw / contentW) * 0.92;
  const scaleH = (vh - marginTop - 16) / contentH;
  const scale = Math.min(scaleW, scaleH, 1); // 不超过 1

  if (scale < 1) {
    // 从左上角缩放，再通过 marginLeft 手动居中
    page.style.transformOrigin = "top left";
    page.style.transform = `scale(${scale})`;

    const visualW = contentW * scale;
    const offsetX = Math.max(0, (vw - visualW) / 2);
    page.style.marginLeft = `${offsetX}px`;
    page.style.marginRight = "0px";
    // transform 不影响布局尺寸，用负 margin 补偿多余的空白
    page.style.marginBottom = `${-contentH * (1 - scale)}px`;
  }
}

// tooltip 元素
let tooltipEl = null;
function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "cell-tooltip";
    // 放在 .page 内部，跟表格处于同一个 zoom 上下文
    const page = document.querySelector(".page");
    (page || document.body).appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showTooltip(td, e) {
  const open = td.dataset.open;
  const close = td.dataset.close;
  const pct = td.dataset.pct;
  const monthKey = td.dataset.month;
  if (!open || !close || !pct || !monthKey) {
    hideTooltip();
    return;
  }

  const tip = getTooltip();
  const fmtPrice = (v) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
  const pctNum = Number(pct);
  const sign = pctNum >= 0 ? "+" : "";
  const pctClass = pctNum >= 0 ? "tip-up" : "tip-down";

  tip.innerHTML = `
    <div class="tip-row"><span class="tip-label">${t("tooltipOpen")}</span><span class="tip-value">${fmtPrice(open)}</span></div>
    <div class="tip-row"><span class="tip-label">${t("tooltipClose")}</span><span class="tip-value">${fmtPrice(close)}</span></div>
    <div class="tip-row"><span class="tip-label">${t("tooltipChange")}</span><span class="tip-value ${pctClass}">${sign}${pct}%</span></div>
  `;
  tip.style.display = "block";
  positionTooltip(td);
}

function positionTooltip(td) {
  const tip = getTooltip();
  const page = document.querySelector(".page");
  if (!page) return;

  // 获取当前 transform 缩放比例
  const m = page.style.transform.match(/scale\(([\d.]+)\)/);
  const scale = m ? parseFloat(m[1]) : 1;

  const tdRect = td.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  const tipW = tip.offsetWidth;
  const tipH = tip.offsetHeight;

  // getBoundingClientRect 返回的是缩放后的视口坐标
  // 需要除以 scale 转换为 .page 内部的未缩放坐标
  const tdRight = (tdRect.right - pageRect.left) / scale;
  const tdLeft = (tdRect.left - pageRect.left) / scale;
  const tdTop = (tdRect.top - pageRect.top) / scale;
  const tdH = tdRect.height / scale;
  const tdCenterY = tdTop + tdH / 2;

  // 默认显示在单元格右侧，垂直居中
  let left = tdRight + 10;
  let top = tdCenterY - tipH / 2;

  // 如果右侧空间不够（在未缩放坐标系中判断），显示在左侧
  const pageW = page.scrollWidth;
  if (left + tipW > pageW) {
    left = tdLeft - tipW - 10;
  }
  // 上下边界保护
  if (top < 0) top = 0;
  const pageH = page.scrollHeight;
  if (top + tipH > pageH) top = pageH - tipH;

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = "none";
}

// 交叉高亮：hover 数据单元格时，同时放大对应的年份和月份表头
let crossHighlightBound = false;
function setupCrossHighlight() {
  const table = document.getElementById("cycle-table");
  if (!table || crossHighlightBound) return;
  crossHighlightBound = true;

  let highlighted = [];
  let currentTd = null;

  table.addEventListener("mouseover", (e) => {
    const td = e.target.closest("td");
    if (!td || td.classList.contains("gap-col") || td.classList.contains("year-cell")) return;

    const tr = td.closest("tr");
    if (!tr || tr.classList.contains("cycle-gap-row") || tr.classList.contains("divider-row")) return;

    // 同一个单元格不重复处理，避免闪烁
    if (td === currentTd) return;

    const children = Array.from(tr.children);
    const colIndex = children.indexOf(td);
    const isBottomStat = tr.classList.contains("bottom-stat");

    // 年份列仅在数据行中跳过；bottom-stat 的首列（label）允许触发高亮
    if (colIndex < 1 && !isBottomStat) return;
    // bottom-stat label 单元格（index 0）也需要处理
    if (colIndex < 0) return;

    clearHighlight();
    currentTd = td;

    // bottom-stat 行（中位数 / 平均数）：垂直高亮同一列所有年份的月份
    if (isBottomStat && colIndex >= 1) {
      // 高亮表头月份
      const thead = table.querySelector("thead tr");
      const monthTh = thead ? thead.children[colIndex] : null;
      if (monthTh && !monthTh.classList.contains("gap-col")) {
        monthTh.classList.add("group-highlight");
        highlighted.push(monthTh);
      }
      // 高亮所有数据行同一列的单元格（不含 bottom-stat 行）
      const dataRows = table.querySelectorAll(
        "tbody tr:not(.cycle-gap-row):not(.divider-row):not(.bottom-stat)"
      );
      for (const row of dataRows) {
        const cell = row.children[colIndex];
        if (cell && !cell.classList.contains("gap-col")) {
          cell.classList.add("group-highlight");
          highlighted.push(cell);
        }
      }
      // 被悬停的单元格本身也高亮
      td.classList.add("group-highlight");
      highlighted.push(td);
      return;
    }
    if (isBottomStat) return; // label 单元格（index 0）不触发高亮

    // Total 列（index 14）或 Cycle 列（index 15）：年份 + 12 个月份 + Total + Cycle 高亮
    if (colIndex === 14 || colIndex === 15) {
      for (let c = 0; c <= 12; c++) {
        const cell = children[c];
        if (cell) {
          cell.classList.add("group-highlight");
          highlighted.push(cell);
        }
      }
      for (const c of [14, 15]) {
        const cell = children[c];
        if (cell) {
          cell.classList.add("group-highlight");
          highlighted.push(cell);
        }
      }
      return;
    }

    // 普通月份单元格：高亮年份 + 对应月份表头
    const yearCell = tr.querySelector(".year-cell");
    const thead = table.querySelector("thead tr");
    const monthTh = thead ? thead.children[colIndex] : null;

    if (yearCell) {
      yearCell.classList.add("cross-highlight");
      highlighted.push(yearCell);
    }
    if (monthTh && !monthTh.classList.contains("gap-col")) {
      monthTh.classList.add("cross-highlight");
      highlighted.push(monthTh);
    }

    // 显示 tooltip
    showTooltip(td, e);
  });

  table.addEventListener("mouseleave", () => {
    clearHighlight();
    hideTooltip();
  });

  function clearHighlight() {
    for (const el of highlighted) {
      el.classList.remove("cross-highlight");
      el.classList.remove("group-highlight");
    }
    highlighted = [];
    currentTd = null;
    hideTooltip();
  }
}

// 语言切换
function updateStaticTexts() {
  const titleEl = document.getElementById("main-title");
  if (titleEl) titleEl.innerHTML = `${t("mainTitle")} <span class="muted">${t("mainTitleSuffix")}</span>`;
  const pageTitleEl = document.getElementById("page-title");
  if (pageTitleEl) pageTitleEl.textContent = t("pageTitle");
  const priceLabelEl = document.getElementById("price-label");
  if (priceLabelEl) priceLabelEl.textContent = t("priceLabel");
  const monthLabelEl = document.getElementById("month-label");
  if (monthLabelEl) monthLabelEl.textContent = t("monthChangeLabel");
  const langText = document.querySelector("#lang-btn .lang-text");
  if (langText) langText.textContent = t("langBtn");
}

function switchLanguage() {
  const newLang = getLang() === "zh" ? "en" : "zh";
  setLang(newLang);
  document.body.classList.toggle("lang-en", newLang === "en");
  updateStaticTexts();
  // 强制完整重渲染表格
  state.tableRendered = false;
  crossHighlightBound = false;
  rebuildView(true);
  requestAnimationFrame(() => requestAnimationFrame(fitToViewport));
}

// 事件委托：按钮在表格内，每次重建后 DOM 会变化
document.addEventListener("click", (e) => {
  if (e.target.id === "lang-btn" || e.target.closest("#lang-btn")) {
    switchLanguage();
  }
});

window.addEventListener("beforeunload", () => {
  if (state.destroyRealtime) state.destroyRealtime();
});

bootstrap().then(() => {
  // 双层 rAF：确保 iOS Safari 完成布局后再测量，避免 scrollWidth 不准
  requestAnimationFrame(() => requestAnimationFrame(fitToViewport));
});
