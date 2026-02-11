import { CONFIG } from "./config.js";

function toMonthKeyFromTimestamp(tsMs) {
  const shifted = new Date(tsMs + CONFIG.timezoneOffsetMs);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getNowMonthKey() {
  return toMonthKeyFromTimestamp(Date.now());
}

function normalizeBinanceKlineRow(row) {
  const openTime = Number(row[0]);
  const open = Number(row[1]);
  const close = Number(row[4]);
  const closeTime = Number(row[6]);
  return {
    monthKey: toMonthKeyFromTimestamp(openTime),
    open,
    close,
    closeTime,
    source: "binance",
    isClosed: closeTime <= Date.now(),
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`请求失败: ${res.status} ${url}`);
  return res.json();
}

function normalizeSeedRows(input) {
  const rows = Array.isArray(input) ? input : Array.isArray(input?.rows) ? input.rows : [];
  return rows
    .map((row) => ({
      monthKey: row.monthKey,
      open: Number(row.open),
      close: Number(row.close),
      source: row.source || "seed",
      isClosed: true,
    }))
    .filter((row) => row.monthKey && Number.isFinite(row.open) && Number.isFinite(row.close))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export async function loadHistoricalMonthlyData() {
  try {
    const seed = await fetchJson(CONFIG.monthlySeedPath);
    return { rows: normalizeSeedRows(seed), fromCache: false };
  } catch {
    return { rows: [], fromCache: false };
  }
}

export async function fetchCurrentMonthKlineSnapshot() {
  const nowMonthKey = getNowMonthKey();
  const url = "https://api.binance.me/api/v3/klines?symbol=BTCUSDT&interval=1M&timeZone=0&limit=2";
  const data = await fetchJson(url);
  const normalized = data.map(normalizeBinanceKlineRow).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return normalized.find((r) => r.monthKey === nowMonthKey) || normalized[normalized.length - 1] || null;
}

export function connectRealtimeStreams({ onTradePrice, onMonthKline, onStatus = () => {}, onError = () => {} }) {
  let ws = null;
  let reconnectTimer = null;
  let attempts = 0;
  let manuallyClosed = false;

  const connect = () => {
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    const streams = "btcusdt@kline_1M/btcusdt@trade";
    ws = new WebSocket(`wss://stream.binance.me:9443/stream?streams=${streams}`);

    ws.onopen = () => {
      attempts = 0;
      onStatus("已连接");
    };

    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        const stream = packet.stream || "";
        const data = packet.data || {};

        if (stream.includes("@trade")) {
          const price = Number(data.p);
          if (Number.isFinite(price)) onTradePrice(price);
        } else if (stream.includes("@kline_1M")) {
          const k = data.k || {};
          const monthKey = toMonthKeyFromTimestamp(Number(k.t));
          const open = Number(k.o);
          const close = Number(k.c);
          const isClosed = Boolean(k.x);
          if (Number.isFinite(open) && Number.isFinite(close)) {
            onMonthKline({ monthKey, open, close, isClosed, source: "binance-live" });
          }
        }
      } catch (error) {
        onError(`消息解析失败: ${error.message}`);
      }
    };

    ws.onerror = () => {
      onStatus("连接异常，准备重连...");
    };

    ws.onclose = () => {
      if (manuallyClosed) return;
      onStatus("连接断开，重连中...");
      attempts += 1;
      const delay = Math.min(30000, 1000 * 2 ** attempts);
      reconnectTimer = window.setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    manuallyClosed = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };
}
