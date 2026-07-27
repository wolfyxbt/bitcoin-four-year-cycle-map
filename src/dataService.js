import { CONFIG } from "./config.js?v=20260727b";

const REQUEST_TIMEOUT_MS = 8000;
const REST_ENDPOINTS = [
  { name: "binance-data", baseUrl: "https://data-api.binance.vision" },
  { name: "binance-me", baseUrl: "https://api.binance.me" },
];
const WS_ENDPOINTS = [
  {
    name: "binance-data",
    url: "wss://data-stream.binance.vision:443/stream?streams=btcusdt@kline_1M/btcusdt@trade",
  },
  {
    name: "binance-me",
    url: "wss://stream.binance.me:9443/stream?streams=btcusdt@kline_1M/btcusdt@trade",
  },
];

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`请求失败: ${res.status} ${url}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
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

export async function loadCurrentMonthFallbackSnapshot() {
  try {
    const input = await fetchJson(CONFIG.currentMonthSnapshotPath);
    const row = input?.row;
    const open = Number(row?.open);
    const close = Number(row?.close);
    const fetchedAt = Date.parse(row?.asOf || input?.updatedAt);
    if (
      row?.monthKey !== getNowMonthKey() ||
      !Number.isFinite(open) ||
      !Number.isFinite(close) ||
      !Number.isFinite(fetchedAt)
    ) {
      return null;
    }
    return {
      monthKey: row.monthKey,
      open,
      close,
      source: row.source || "static-snapshot",
      isClosed: false,
      fetchedAt,
    };
  } catch {
    return null;
  }
}

export async function fetchCurrentMonthKlineSnapshot() {
  const nowMonthKey = getNowMonthKey();
  const errors = [];
  for (const endpoint of REST_ENDPOINTS) {
    try {
      const url = `${endpoint.baseUrl}/api/v3/klines?symbol=BTCUSDT&interval=1M&timeZone=0&limit=2`;
      const data = await fetchJson(url);
      const normalized = data.map(normalizeBinanceKlineRow).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
      const row = normalized.find((item) => item.monthKey === nowMonthKey);
      if (!row) throw new Error(`未返回当前月份 ${nowMonthKey}`);
      return { ...row, endpoint: endpoint.name, fetchedAt: Date.now() };
    } catch (error) {
      errors.push(`${endpoint.name}: ${error.message}`);
    }
  }
  throw new Error(`Binance 当前月快照不可用（${errors.join("; ")}）`);
}

export function connectRealtimeStreams({ onTradePrice, onMonthKline, onStatus = () => {}, onError = () => {} }) {
  let ws = null;
  let reconnectTimer = null;
  let attempts = 0;
  let endpointIndex = 0;
  let manuallyClosed = false;

  const connect = () => {
    const endpoint = WS_ENDPOINTS[endpointIndex];
    let connectionFinished = false;
    onStatus({ state: "connecting", source: endpoint.name });
    ws = new WebSocket(endpoint.url);

    ws.onopen = () => {
      attempts = 0;
      onStatus({ state: "live", source: endpoint.name });
    };

    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        const stream = packet.stream || "";
        const data = packet.data || {};

        if (stream.includes("@trade")) {
          const price = Number(data.p);
          if (Number.isFinite(price)) onTradePrice(price, { source: endpoint.name, updatedAt: Date.now() });
        } else if (stream.includes("@kline_1M")) {
          const k = data.k || {};
          const monthKey = toMonthKeyFromTimestamp(Number(k.t));
          const open = Number(k.o);
          const close = Number(k.c);
          const isClosed = Boolean(k.x);
          if (Number.isFinite(open) && Number.isFinite(close)) {
            onMonthKline({
              monthKey,
              open,
              close,
              isClosed,
              source: `binance-live:${endpoint.name}`,
              updatedAt: Date.now(),
            });
          }
        }
      } catch (error) {
        onError(`消息解析失败: ${error.message}`);
      }
    };

    const handleDisconnect = () => {
      if (manuallyClosed || connectionFinished) return;
      connectionFinished = true;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();

      if (endpointIndex + 1 < WS_ENDPOINTS.length) {
        endpointIndex += 1;
        onStatus({ state: "switching", source: WS_ENDPOINTS[endpointIndex].name });
        reconnectTimer = window.setTimeout(connect, 250);
        return;
      }

      endpointIndex = 0;
      attempts += 1;
      const delay = Math.min(30000, 1000 * 2 ** attempts);
      onStatus({ state: "offline", retryInMs: delay });
      reconnectTimer = window.setTimeout(connect, delay);
    };
    ws.onerror = handleDisconnect;
    ws.onclose = handleDisconnect;
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
