import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import axios from "axios";
import crypto from "crypto";
import schedule from "node-schedule";
import * as XLSX from "xlsx";
import helmet from "helmet";
import compression from "compression";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("trading.db");
const memDb = new Database(":memory:");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    api_key TEXT,
    secret_key TEXT,
    is_active INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS market_cache (
    symbol TEXT PRIMARY KEY,
    onboard_time INTEGER,
    onboard_date TEXT,
    last_updated INTEGER
  );

  CREATE TABLE IF NOT EXISTS target_market (
    symbol TEXT PRIMARY KEY,
    onboard_time INTEGER,
    onboard_date TEXT,
    last_updated INTEGER
  );

  CREATE TABLE IF NOT EXISTS trade_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    symbol TEXT,
    side TEXT,
    price REAL,
    entry_price REAL,
    quantity REAL,
    pnl REAL,
    reason TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    level TEXT,
    message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_trade_logs_timestamp ON trade_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_trade_logs_symbol ON trade_logs(symbol);
`);

// Initialize Memory Database for fast scanning
memDb.exec(`
  CREATE TABLE temp_table_1 (
    symbol TEXT PRIMARY KEY,
    k REAL,
    m REAL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    timestamp INTEGER
  );

  CREATE TABLE temp_table_2 (
    symbol TEXT PRIMARY KEY,
    k REAL,
    m REAL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    timestamp INTEGER
  );
`);

// Migrations
try {
  db.prepare("ALTER TABLE market_cache ADD COLUMN onboard_date TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE target_market ADD COLUMN onboard_date TEXT").run();
} catch (e) {}

// Helper for rounding to tickSize
function formatPrice(price: number, tickSize: number) {
  // Use log10 to get precision, avoiding scientific notation issues with toString()
  const precision = Math.max(0, Math.round(-Math.log10(tickSize)));
  const rounded = Math.round(price / tickSize) * tickSize;
  return rounded.toFixed(precision);
}

// Binance Service Utility
class BinanceService {
  private apiKey: string;
  private secretKey: string;
  private fapiEndpoints = ["https://fapi.binance.com", "https://fapi1.binance.com", "https://fapi2.binance.com"];
  private apiEndpoints = ["https://api.binance.com", "https://api1.binance.com", "https://api2.binance.com", "https://api3.binance.com"];

  constructor(apiKey: string, secretKey: string) {
    this.apiKey = apiKey.trim();
    this.secretKey = secretKey.trim();
  }

  private sign(queryString: string) {
    return crypto.createHmac("sha256", this.secretKey).update(queryString).digest("hex");
  }

  async request(method: string, path: string, params: any = {}, signed = false, isSpot = false) {
    if (signed && (!this.apiKey || !this.secretKey)) {
      throw new Error("未配置 API 密钥或私钥，无法执行签名请求");
    }
    // Refresh IP if it's still the default
    if (lastOutboundIp === "正在获取...") {
      updateOutboundIp();
    }
    
    const timestamp = Date.now();
    let queryString = new URLSearchParams(params).toString();
    
    if (signed) {
      const recvWindow = 10000;
      queryString += (queryString ? "&" : "") + `timestamp=${timestamp}&recvWindow=${recvWindow}`;
      const signature = this.sign(queryString);
      queryString += `&signature=${signature}`;
    }

    const endpoints = isSpot ? this.apiEndpoints : this.fapiEndpoints;
    let lastError: any = null;

    for (const baseUrl of endpoints) {
      const url = `${baseUrl}${path}${queryString ? "?" : ""}${queryString}`;
      const headers: any = { "X-MBX-APIKEY": this.apiKey };

      try {
        const response = await axios({ method, url, headers, timeout: 10000 });
        return response.data;
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;
        const data = error.response?.data;

        // If it's a 404 HTML page, it's likely a regional block/WAF redirect
        if (status === 404 && typeof data === 'string' && data.includes('<html>')) {
          console.warn(`币安节点 ${baseUrl} 返回 404 HTML。正在尝试下一个...`);
          continue; 
        }
        
        // If it's a real API error (like auth failure), don't retry on other nodes
        if (data && data.code) break;
      }
    }

    // Process the final error
    if (!lastError) throw new Error("币安请求过程中发生未知错误");

    const data = lastError.response?.data;
    let msg = lastError.message;

    if (data) {
      if (typeof data === 'string' && data.includes('<html>')) {
        msg = "币安服务器拒绝连接 (可能是 IP 被封禁或地区限制，请检查服务器位置)";
        logSystem("ERROR", `[BINANCE_API] ${msg} (当前服务器 IP: ${lastOutboundIp})`);
      } else if (data.msg) {
        msg = data.msg;
        const status = lastError.response?.status;
        if (msg.includes("Invalid API-key") || msg.includes("IP") || msg.includes("permissions") || status === 401 || status === 429 || status === 418) {
          msg = `API 访问限制/验证失败: ${msg}. (当前服务器 IP: ${lastOutboundIp}。请务必在币安 API 设置中: 1. 绑定此 IP 2. 勾选"允许合约" 3. 检查密钥是否复制完整)`;
          // Log to system logs as requested by user
          logSystem("ERROR", `[BINANCE_API] ${msg}`);
          
          const authError = new Error(msg);
          (authError as any).isAuthError = true;
          (authError as any).response = lastError.response;
          throw authError;
        }
      } else {
        msg = JSON.stringify(data);
      }
    }

    console.error(`Binance API Error (${isSpot ? 'Spot' : 'Futures'}): ${msg}`);
    const enhancedError = new Error(msg);
    (enhancedError as any).response = lastError.response;
    throw enhancedError;
  }

  async getExchangeInfo() {
    return this.request("GET", "/fapi/v1/exchangeInfo");
  }

  async getKlines(symbol: string, interval: string, limit = 100, endTime?: number, startTime?: number) {
    const params: any = { symbol, interval, limit };
    if (endTime) params.endTime = endTime;
    if (startTime) params.startTime = startTime;
    return this.request("GET", "/fapi/v1/klines", params);
  }

  async getTickers() {
    return this.request("GET", "/fapi/v1/ticker/24hr");
  }

  async createOrder(params: any) {
    return this.request("POST", "/fapi/v1/order", params, true);
  }

  async createAlgoOrder(params: any) {
    return this.request("POST", "/fapi/v1/algoOrder", params, true);
  }

  async getPositionMode() {
    return this.request("GET", "/fapi/v1/positionSide/dual", {}, true);
  }

  async changePositionMode(dualSidePosition: boolean) {
    return this.request("POST", "/fapi/v1/positionSide/dual", { dualSidePosition }, true);
  }

  async getOrder(symbol: string, orderId?: number, origClientOrderId?: string) {
    const params: any = { symbol };
    if (orderId) params.orderId = orderId;
    if (origClientOrderId) params.origClientOrderId = origClientOrderId;
    return this.request("GET", "/fapi/v1/order", params, true);
  }

  async cancelAllOpenOrders(symbol: string) {
    return this.request("DELETE", "/fapi/v1/allOpenOrders", { symbol }, true);
  }

  async getOpenAlgoOrders(symbol?: string) {
    const params: any = {};
    if (symbol) params.symbol = symbol;
    return this.request("GET", "/fapi/v1/openAlgoOrders", params, true);
  }

  async cancelAlgoOrder(algoId: string) {
    return this.request("DELETE", "/fapi/v1/algoOrder", { algoId }, true);
  }

  async getAccountInfo() {
    return this.request("GET", "/fapi/v2/account", {}, true);
  }

  async getPositionRisk() {
    return this.request("GET", "/fapi/v2/positionRisk", {}, true);
  }

  async getIncomeHistory(params: { symbol?: string, incomeType?: string, startTime?: number, endTime?: number, limit?: number } = {}) {
    return this.request("GET", "/fapi/v1/income", params, true);
  }

  async getBalance() {
    return this.request("GET", "/fapi/v2/balance", {}, true);
  }

  async getAccountTrades(symbol: string, limit = 10) {
    return this.request("GET", "/fapi/v1/userTrades", { symbol, limit }, true);
  }

  async setLeverage(symbol: string, leverage: number) {
    return this.request("POST", "/fapi/v1/leverage", { symbol, leverage }, true);
  }

  async getSpotAccount() {
    return this.request("GET", "/api/v3/account", {}, true, true);
  }

  async createListenKey() {
    return this.request("POST", "/fapi/v1/listenKey", {}, true);
  }

  async keepAliveListenKey() {
    return this.request("PUT", "/fapi/v1/listenKey", {}, true);
  }

  async getAllBalances() {
    let futuresUsdt = "0.00";
    let spotUsdt = "0.00";
    let errors = [];

    try {
      const futuresBalances = await this.getBalance();
      if (Array.isArray(futuresBalances)) {
        const usdtObj = futuresBalances.find((b: any) => b.asset === "USDT");
        futuresUsdt = usdtObj?.balance || usdtObj?.walletBalance || "0.00";
      } else {
        throw new Error("合约余额接口返回格式错误");
      }
    } catch (e: any) {
      const msg = `合约余额获取失败: ${e.response?.data?.msg || e.message}`;
      console.error(msg);
      errors.push(msg);
    }

    try {
      const spotAccount = await this.getSpotAccount();
      spotUsdt = spotAccount.balances.find((b: any) => b.asset === "USDT")?.free || "0.00";
    } catch (e: any) {
      const msg = `现货余额获取失败: ${e.response?.data?.msg || e.message}`;
      console.error(msg);
      errors.push(msg);
    }

    if (errors.length === 2) {
      throw new Error("无法获取任何账户余额，请检查 API 权限是否包含现货和合约。");
    }

    return {
      futures: futuresUsdt,
      spot: spotUsdt,
      warnings: errors
    };
  }
}

// WebSocket Manager for Binance
class BinanceWSManager {
  private ws: WebSocket | null = null;
  private userDataWs: WebSocket | null = null;
  private listenKey: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private symbols: Set<string> = new Set();
  private onMessage: (type: string, data: any) => void;

  constructor(onMessage: (type: string, data: any) => void) {
    this.onMessage = onMessage;
  }

  async startUserDataStream(service: BinanceService) {
    try {
      const res = await service.createListenKey();
      this.listenKey = res.listenKey;
      
      this.userDataWs = new WebSocket(`wss://fstream.binance.com/ws/${this.listenKey}`);
      
      this.userDataWs.on('open', () => {
        logSystem("INFO", "[WS] 币安用户数据流已连接");
        lastWsDataTimestamp = Date.now();
        this.keepAliveInterval = setInterval(async () => {
          try {
            await service.keepAliveListenKey();
          } catch (e) {
            console.error("无法延长 listenKey 的有效期", e);
          }
        }, 30 * 60 * 1000); // 30 minutes
      });

      this.userDataWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        lastWsDataTimestamp = Date.now();
        if (msg.e === 'ACCOUNT_UPDATE' || msg.e === 'ORDER_TRADE_UPDATE') {
          this.onMessage('USER_DATA', msg);
          
          // Hybrid Monitor Logic
          if (msg.e === 'ACCOUNT_UPDATE') {
            const positions = msg.a.P;
            for (const p of positions) {
              const symbol = p.s;
              const amount = Math.abs(parseFloat(p.pa));
              if (amount < 0.00000001 && monitoredExits.has(symbol)) {
                const exitInfo = monitoredExits.get(symbol)!;
                processPositionClosure(symbol, exitInfo);
              }
            }
          }
        }
      });

      this.userDataWs.on('close', () => {
        logSystem("WARN", "[WS] 币安用户数据流已关闭");
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
      });

      this.userDataWs.on('error', (err) => {
        logSystem("ERROR", `[WS] 币安用户数据流错误: ${err.message}`);
      });
    } catch (e: any) {
      logSystem("ERROR", `[WS] 启动币安用户数据流失败: ${e.message}`);
    }
  }

  updateSymbols(symbols: string[]) {
    const newSymbols = new Set(symbols.map(s => s.toLowerCase()));
    if (this.isSetEqual(this.symbols, newSymbols)) return;

    this.symbols = newSymbols;
    this.reconnectTickerStream();
  }

  private isSetEqual(a: Set<string>, b: Set<string>) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  private reconnectTickerStream() {
    if (this.ws) {
      this.ws.close();
    }

    if (this.symbols.size === 0) return;

    const streams = Array.from(this.symbols).map(s => `${s}@ticker`).join('/');
    this.ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

    this.ws.on('open', () => {
      lastWsDataTimestamp = Date.now();
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      lastWsDataTimestamp = Date.now();
      if (msg.stream && msg.data) {
        this.onMessage('TICKER', msg.data);
      }
    });

    this.ws.on('error', (err) => {
      console.error("币安 Ticker 数据流错误:", err);
    });
  }

  stop() {
    if (this.ws) this.ws.close();
    if (this.userDataWs) this.userDataWs.close();
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
  }
}

// Global state for background tasks
let activeBinance: BinanceService | null = null;
let binanceWS: BinanceWSManager | null = null;
let lastWsDataTimestamp = 0;

interface MonitoredExit {
  symbol: string;
  entryPrice: number;
  quantity: number;
  k: number;
  entrySide: string;
  tpPrice: string;
  slPrice: string;
  side: string;
  startTime: number;
}

const monitoredExits = new Map<string, MonitoredExit>();
let globalExitMonitorStarted = false;

async function processPositionClosure(symbol: string, exitInfo: MonitoredExit, markPriceOverride?: number, reasonOverride?: string) {
  // 立即检查并删除，防止并发重入
  if (!monitoredExits.has(symbol)) return;
  monitoredExits.delete(symbol);
  
  logSystem("INFO", `[出场模块] 检测到 ${symbol} 的持仓已关闭。正在清理订单...`);
  
  // --- Cleanup Step: Cancel all remaining orders ---
  try {
    logSystem("INFO", `[出场模块] 正在检查并取消 ${symbol} 的标准挂单...`);
    const cancelRes = await activeBinance?.cancelAllOpenOrders(symbol);
    logSystem("INFO", `[出场模块] ${symbol} 的标准单清理结果: ${JSON.stringify(cancelRes)}`);
  } catch (e: any) {
    logSystem("WARN", `[出场模块] ${symbol} 的标准单清理失败: ${e.message}`);
  }

  try {
    logSystem("INFO", `[出场模块] 正在检查并取消 ${symbol} 的算法单...`);
    const algoRes = await activeBinance?.getOpenAlgoOrders(symbol);
    const orders = Array.isArray(algoRes) ? algoRes : (algoRes?.orders || []);
    
    if (orders.length > 0) {
      logSystem("INFO", `[出场模块] 发现 ${symbol} 的 ${orders.length} 个算法单，正在取消...`);
      for (const algo of orders) {
        try {
          const cRes = await activeBinance?.cancelAlgoOrder(algo.algoId);
          logSystem("INFO", `[出场模块] ${symbol} 的算法单 ${algo.algoId} 已取消: ${JSON.stringify(cRes)}`);
        } catch (err: any) {
          logSystem("WARN", `[出场模块] 取消单个算法单 ${algo.algoId} 失败: ${err.message}`);
        }
      }
    } else {
      logSystem("INFO", `[出场模块] 未找到 ${symbol} 的开放算法单。`);
    }
  } catch (e: any) {
    logSystem("WARN", `[出场模块] ${symbol} 的算法单清理失败: ${e.message}`);
  }
  
  // Log trade
  const markPrice = markPriceOverride || 0;
  let reason = reasonOverride || "自动平仓";
  if (!reasonOverride && markPrice > 0) {
    if (exitInfo.entrySide === "BUY") {
      if (markPrice >= parseFloat(exitInfo.tpPrice) * 0.99) reason = "止盈";
      else if (markPrice <= parseFloat(exitInfo.slPrice) * 1.01) reason = "止损";
    } else {
      if (markPrice <= parseFloat(exitInfo.tpPrice) * 1.01) reason = "止盈";
      else if (markPrice >= parseFloat(exitInfo.slPrice) * 0.99) reason = "止损";
    }
  }
  
  const pnl = exitInfo.entrySide === "BUY" ? (markPrice - exitInfo.entryPrice) * exitInfo.quantity : (exitInfo.entryPrice - markPrice) * exitInfo.quantity;
  logTrade(symbol, exitInfo.side, markPrice, exitInfo.entryPrice, exitInfo.quantity, pnl, reason, "CLOSED");
}
const publicBinance = new BinanceService("", ""); // For public endpoints like exchangeInfo
let isTradingEnabled = false;
let isStrategyEnabled = false;
let isMarketScanning = false;

// Stats Caching
let cachedStats: any = null;
let lastStatsFetch = 0;
const STATS_CACHE_TTL = 60000; // 1 minute
let marketScanJob: schedule.Job | null = null;
let marketFilterInterval: NodeJS.Timeout | null = null;
let lastFilterRun: number = 0;
let nextFilterRun: number = 0;
let lastPhase1Run = 0;
let lastPhase2Run = 0;
let lastOrderReadyTime = 0;
let lastOrderReadySymbol = "";
let lastOutboundIp = "正在获取...";

async function updateOutboundIp() {
  try {
    const response = await axios.get("https://api.ipify.org?format=json", { timeout: 5000 });
    lastOutboundIp = response.data.ip;
  } catch (e) {
    console.error("获取出口 IP 失败:", e);
  }
}

// Initial fetch
updateOutboundIp();
// Update every hour
setInterval(updateOutboundIp, 3600000);

// Task: Market Scanner (Form 1)
async function runMarketScanner() {
  const binance = activeBinance || publicBinance;
  try {
    const info = await binance.getExchangeInfo();
    // Filter for USDT Perpetual and tradable
    const symbols = info.symbols.filter((s: any) => 
      s.quoteAsset === "USDT" && 
      s.marginAsset === "USDT" &&
      s.contractType === "PERPETUAL" && 
      s.status === "TRADING"
    );
    
    if (symbols.length === 0) {
      logSystem("WARN", "市场扫描器: 未找到符合条件的交易对。");
    }
    
    db.transaction(() => {
      db.prepare("DELETE FROM market_cache").run();
      for (const s of symbols) {
        const onboardTime = s.onboardDate || 0; 
        const onboardDate = onboardTime > 0 ? new Date(onboardTime).toISOString().replace('T', ' ').substring(0, 19) : 'Unknown';
        db.prepare("INSERT INTO market_cache (symbol, onboard_time, onboard_date, last_updated) VALUES (?, ?, ?, ?)")
          .run(s.symbol, Math.floor(onboardTime / 1000), onboardDate, Date.now());
      }
    })();
    
  logSystem("INFO", `[市场扫描器] 市场扫描器 (表1) 已更新 ${symbols.length} 个交易对。`);
    // After Form 1 update, immediately trigger a filter update if scanning is on
    if (isMarketScanning) {
      runMarketFilter();
    }
  } catch (err) {
    console.error(err);
    logSystem("ERROR", "市场扫描器运行失败。");
  }
}

// Task: Market Filter (Target Market Form)
async function runMarketFilter() {
  lastFilterRun = Date.now();
  const settings = getSettings();
  const market = settings.market || {};
  const filterPeriod = market.filterPeriod || 15;
  nextFilterRun = lastFilterRun + filterPeriod * 60000;

  // If manual mode is active, the target_market is already populated from upload
  if (market.mode === 'manual') return;

  const x = market.filterStart !== undefined ? market.filterStart : 150000;
  const y = market.filterEnd !== undefined ? market.filterEnd : 500;
  const T = Math.floor(Date.now() / 1000);
  
  const startTime = T - 900 * x;
  const endTime = T - 900 * y;

  const whiteList = (market.whiteList || "").split(',').map((s: string) => s.trim().toUpperCase()).filter((s: string) => s);
  const blackList = (market.blackList || "").split(',').map((s: string) => s.trim().toUpperCase()).filter((s: string) => s);

  try {
    let candidates = db.prepare(`
      SELECT * FROM market_cache 
      WHERE onboard_time >= ? AND onboard_time <= ?
    `).all(startTime, endTime) as any[];

    // Apply Blacklist
    if (blackList.length > 0) {
      candidates = candidates.filter(c => !blackList.includes(c.symbol));
    }

    // Apply Whitelist (if whitelist is not empty, only those in whitelist are allowed)
    // Actually usually whitelist means "always include" or "only include". 
    // Given the context, let's assume "only include if whitelist is not empty".
    if (whiteList.length > 0) {
      candidates = candidates.filter(c => whiteList.includes(c.symbol));
    }

    db.transaction(() => {
      db.prepare("DELETE FROM target_market").run();
      for (const c of candidates) {
        db.prepare("INSERT INTO target_market (symbol, onboard_time, onboard_date, last_updated) VALUES (?, ?, ?, ?)")
          .run(c.symbol, c.onboard_time, c.onboard_date, Date.now());
      }
    })();

    logSystem("INFO", `[市场过滤器] 市场过滤器已更新 ${candidates.length} 个目标交易对。`);
  } catch (err) {
    console.error(err);
    logSystem("ERROR", "市场过滤器运行失败。");
  }
}

function startMarketScanner() {
  const settings = getSettings();
  const market = settings.market || {};
  const scanTime = market.scanTime || "12:00";
  const [hour, minute] = scanTime.split(':').map(Number);
  const scanPeriod = market.scanPeriod !== undefined ? market.scanPeriod : 12;
  const filterPeriod = market.filterPeriod !== undefined ? market.filterPeriod : 15;

  stopMarketScanner();

  // Schedule Form 1 Scan
  const rule = new schedule.RecurrenceRule();
  const hours = [];
  for (let i = 0; i < 24; i += scanPeriod) {
    hours.push((hour + i) % 24);
  }
  rule.hour = hours;
  rule.minute = minute;
  rule.second = 0;
  
  marketScanJob = schedule.scheduleJob(rule, runMarketScanner);
  
  // Schedule Target Market Filter
  marketFilterInterval = setInterval(runMarketFilter, filterPeriod * 60000);
  
  isMarketScanning = true;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run('market_scanner_enabled', JSON.stringify(true));

  // Initial run
  runMarketScanner();
  logSystem("INFO", `市场扫描服务已启动。锚点: ${scanTime}, 周期: ${scanPeriod}h`);
}

function stopMarketScanner() {
  if (marketScanJob) {
    marketScanJob.cancel();
    marketScanJob = null;
  }
  if (marketFilterInterval) {
    clearInterval(marketFilterInterval);
    marketFilterInterval = null;
  }
  isMarketScanning = false;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run('market_scanner_enabled', JSON.stringify(false));
  logSystem("INFO", "市场扫描服务已停止。");
}

// Task: Strategy Analyzer (Phase 1 & Phase 2)
async function runPhase1(triggerTime?: number) {
  if (!activeBinance) {
    logSystem("WARN", "阶段 1: 无活跃的币安账户。");
    return;
  }
  if (!isStrategyEnabled) return;

  const settings = getSettings();
  const strategy = settings.strategy || {};
  
  const targetMarket = db.prepare(`SELECT symbol FROM target_market`).all() as { symbol: string }[];
  if (targetMarket.length === 0) {
    logSystem("WARN", "阶段 1: 目标市场为空。");
    memDb.prepare("DELETE FROM temp_table_1").run();
    return;
  }

  logSystem("INFO", `[入场模块] 阶段 1 已启动，共 ${targetMarket.length} 个交易对。触发时间: ${triggerTime ? new Date(triggerTime).toISOString() : 'N/A'}`);
  
  try {
    // Step 1: Optimization A - Use 24h Ticker for pre-filtering cold symbols
    const allTickers = await activeBinance.getTickers();
    if (!Array.isArray(allTickers)) {
      throw new Error("获取所有行情数据失败");
    }

    const m_min = strategy.p1_m_min !== undefined ? strategy.p1_m_min : 500000;
    const m_max = strategy.p1_m_max !== undefined ? strategy.p1_m_max : 10000000000;
    
    // Filter symbols that are in target market and meet volume criteria (M)
    const targetSymbols = new Set(targetMarket.map(m => m.symbol));
    const activeTickers = allTickers.filter((t: any) => {
      const m = parseFloat(t.quoteVolume);
      return targetSymbols.has(t.symbol) && m >= m_min && m <= m_max;
    });

    logSystem("INFO", `[入场模块] 阶段 1: 已根据 24h 成交额 (M) 过滤出 ${activeTickers.length}/${targetMarket.length} 个交易对。`);

    if (activeTickers.length === 0) {
      memDb.prepare("DELETE FROM temp_table_1").run();
      return;
    }

    // Step 2: Fetch 15m klines for filtered symbols to calculate K
    const results: any[] = [];
    const chunkSize = 20; // Process in chunks to avoid overwhelming rate limits
    
    for (let i = 0; i < activeTickers.length; i += chunkSize) {
      const chunk = activeTickers.slice(i, i + chunkSize);
      const promises = chunk.map(async (ticker: any) => {
        try {
          // Fetch the candle that was current at the trigger time
          const klines = await activeBinance.getKlines(ticker.symbol, "15m", 1, triggerTime);
          if (!klines || klines.length < 1) return null;
          
          const [time, open, high, low, close, volume, closeTime, quoteVolume] = klines[0];
          
          const k = 100 * (parseFloat(close) - parseFloat(open)) / parseFloat(open);
          const m24h = parseFloat(ticker.quoteVolume); // Optimization A: Use 24h volume as M

          const k_min = strategy.p1_k_min !== undefined ? strategy.p1_k_min : 2;
          const k_max = strategy.p1_k_max !== undefined ? strategy.p1_k_max : 10;

          if (k >= k_min && k <= k_max) {
            return {
              symbol: ticker.symbol,
              k, m: m24h,
              open: parseFloat(open),
              high: parseFloat(high),
              low: parseFloat(low),
              close: parseFloat(close),
              timestamp: Date.now()
            };
          }
        } catch (e) {
          // Silent error for individual symbols to avoid log spam
        }
        return null;
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults.filter(r => r !== null));
    }

    // Optimization D - Use memDb for temp_table_1
    memDb.transaction(() => {
      memDb.prepare("DELETE FROM temp_table_1").run();
      const insert = memDb.prepare("INSERT INTO temp_table_1 (symbol, k, m, open, high, low, close, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const r of results) {
        insert.run(r.symbol, r.k, r.m, r.open, r.high, r.low, r.close, r.timestamp);
      }
    })();
    
    logSystem("INFO", `[入场模块] 阶段 1 已完成。找到 ${results.length} 个候选交易对。(总扫描数: ${targetMarket.length})`);
  } catch (err: any) {
    logSystem("ERROR", `[入场模块] 阶段 1 严重错误: ${err.message}`);
  }
}

async function runPhase2(triggerTime?: number) {
  if (!activeBinance) {
    logSystem("WARN", "阶段 2: 无活跃的币安账户。");
    return;
  }
  if (!isStrategyEnabled) return;

  const settings = getSettings();
  const strategy = settings.strategy || {};
  
  const candidates = memDb.prepare("SELECT * FROM temp_table_1").all() as any[];
  if (candidates.length === 0) {
    logSystem("WARN", "阶段 2: 临时表 1 为空。跳过阶段 2。");
    memDb.prepare("DELETE FROM temp_table_2").run();
    return;
  }

  logSystem("INFO", `[入场模块] 阶段 2 已启动，共 ${candidates.length} 个候选交易对。触发时间: ${triggerTime ? new Date(triggerTime).toISOString() : 'N/A'}`);
  const results = [];

  // Calculate the start of the current 15m cycle to fetch the correct "特征k"
  const effectiveTime = triggerTime || Date.now();
  const cycleStart = Math.floor(effectiveTime / 900000) * 900000;

  // Max Position Limit check (once before loop)
  if (strategy.p2_max_pos_enabled !== false) {
    try {
      const account = await activeBinance.getAccountInfo();
      const activePositions = account.positions.filter((p: any) => Math.abs(parseFloat(p.positionAmt)) > 0.00000001);
      if (activePositions.length > 0) {
        logSystem("INFO", `[入场模块] 阶段 2: 全局检查失败。已发现 ${activePositions.length} 个活跃持仓。跳过所有候选交易对。`);
        memDb.prepare("DELETE FROM temp_table_2").run();
        return;
      }
    } catch (e) {
      logSystem("ERROR", `阶段 2: 获取账户信息以检查最大持仓限制失败: ${e.message}`);
      throw new Error("获取账户信息以检查最大持仓限制失败: " + e.message);
    }
  }

  // BTC Verification
  if (strategy.p2_btc_enabled !== false) {
    try {
      const btcKlines = await activeBinance.getKlines("BTCUSDT", "15m", 1);
      const [t, o, h, l, c] = btcKlines[0];
      const btcK = 100 * (parseFloat(c) - parseFloat(o)) / parseFloat(o);
      const btc_min = strategy.p2_btc_min !== undefined ? strategy.p2_btc_min : 0.5;
      const btc_max = strategy.p2_btc_max !== undefined ? strategy.p2_btc_max : 15;

      if (btcK >= btc_min && btcK <= btc_max) {
        logSystem("INFO", `[入场模块] 阶段 2: BTC 检查失败 (kbtc=${btcK.toFixed(4)} 在排除范围 [${btc_min}, ${btc_max}] 内)。跳过候选交易对。`);
        memDb.prepare("DELETE FROM temp_table_2").run();
        return; 
      }
      logSystem("INFO", `[入场模块] 阶段 2: BTC 检查通过 (kbtc=${btcK.toFixed(4)} 在排除范围 [${btc_min}, ${btc_max}] 之外)`);
    } catch (e) {
      logSystem("ERROR", "阶段 2: 获取 BTC 数据失败。跳过阶段 2。");
      throw new Error("获取 BTC 数据失败。跳过阶段 2。");
    }
  }

  for (const item of candidates) {
    try {
      // 1. K and M check (Mandatory)
      const k_min = strategy.p2_k_min !== undefined ? strategy.p2_k_min : 4;
      const k_max = strategy.p2_k_max !== undefined ? strategy.p2_k_max : 8;
      const m_min = strategy.p2_m_min !== undefined ? strategy.p2_m_min : 1000000;
      const m_max = strategy.p2_m_max !== undefined ? strategy.p2_m_max : 10000000000;

      // Fetch current 15m turnover (from open of current 15m candle to now)
      // This is the "特征k" turnover as requested by the user.
      // Use cycleStart as startTime to ensure we get the correct candle even if there's lag.
      const klines15m = await activeBinance.getKlines(item.symbol, "15m", 1, undefined, cycleStart);
      if (!klines15m || klines15m.length === 0) {
        logSystem("WARN", `阶段 2: 无法获取 ${item.symbol} 的 15m K线数据 (startTime=${cycleStart})，跳过。`);
        continue;
      }
      const m15m = parseFloat(klines15m[0][7]); // quoteVolume is turnover
      
      // Update item.m to 15m turnover for the check and subsequent sorting
      item.m = m15m;

      if (item.k < k_min || item.k > k_max || item.m < m_min || item.m > m_max) {
        logSystem("INFO", `阶段 2: ${item.symbol} 未通过 K/M 检查 (k=${item.k.toFixed(4)}, m15m=${item.m.toFixed(0)})`);
        continue;
      }

      // 2. Time Filter (Optional)
      if (strategy.p2_time_filter_enabled) {
        const x = strategy.p2_time_filter_x || 60;
        const y = strategy.p2_time_filter_y || 15;
        const n = strategy.p2_time_filter_n || 0;
        
        const limit = Math.ceil(x / 15);
        const history = await activeBinance.getKlines(item.symbol, "15m", limit + 1);
        history.pop(); // Remove current
        
        const relevantCount = Math.ceil((x - y) / 15);
        const relevantHistory = history.slice(-relevantCount);
        
        let count = 0;
        for (const h of relevantHistory) {
          if (parseFloat(h[2]) > item.close) { // h[2] is high
            count++;
          }
        }
        if (count > n) {
          logSystem("INFO", `阶段 2: ${item.symbol} 未通过时间过滤器 (count=${count} > n=${n})`);
          continue;
        }
      }

      // 3. Upper Shadow a (Optional)
      if (strategy.p2_shadow_enabled !== false) {
        const a = 100 * (item.high - item.close) / item.close;
        const shadow_min = strategy.p2_shadow_min !== undefined ? strategy.p2_shadow_min : 0.01;
        const shadow_max = strategy.p2_shadow_max !== undefined ? strategy.p2_shadow_max : 3;
        if (a < shadow_min || a > shadow_max) {
          logSystem("INFO", `阶段 2: ${item.symbol} 未通过影线过滤器 (a=${a.toFixed(4)})`);
          continue;
        }
      }

      // 4. K5m Verification (Optional)
      if (strategy.p2_k5m_enabled !== false) {
        const k5mKlines = await activeBinance.getKlines(item.symbol, "5m", 1);
        const [t, o, h, l, c] = k5mKlines[0];
        const k5m = 100 * (parseFloat(c) - parseFloat(o)) / parseFloat(o);
        const k5m_min = strategy.p2_k5m_min !== undefined ? strategy.p2_k5m_min : 0.5;
        const k5m_max = strategy.p2_k5m_max !== undefined ? strategy.p2_k5m_max : 7;
        if (k5m < k5m_min || k5m > k5m_max) {
          logSystem("INFO", `阶段 2: ${item.symbol} 未通过 5m K线检查 (k5m=${k5m.toFixed(4)})`);
          continue;
        }
      }

      // 5. Cooldown (Optional)
      if (strategy.p2_cooldown_enabled !== false) {
        try {
          const cooldownMs = (strategy.p2_cooldown_min !== undefined ? strategy.p2_cooldown_min : 30) * 60000;
          const trades = await activeBinance.getAccountTrades(item.symbol, 5);
          const lastTradeTime = trades.length > 0 ? Math.max(...trades.map((t: any) => t.time)) : 0;
          
          if (lastTradeTime > 0 && (Date.now() - lastTradeTime) < cooldownMs) {
            logSystem("INFO", `阶段 2: ${item.symbol} 因冷却期跳过 (上次交易在 ${((Date.now() - lastTradeTime)/60000).toFixed(1)} 分钟前)。`);
            continue;
          }
        } catch (e) {
          logSystem("ERROR", `阶段 2: 获取 ${item.symbol} 的成交记录以进行冷却检查失败: ${e.message}`);
          // Fallback to local logs if API fails
          const cooldownMs = (strategy.p2_cooldown_min !== undefined ? strategy.p2_cooldown_min : 30) * 60000;
          const lastTrade = db.prepare("SELECT timestamp FROM trade_logs WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1").get(item.symbol) as any;
          if (lastTrade && (Date.now() - lastTrade.timestamp) < cooldownMs) {
            logSystem("INFO", `阶段 2: ${item.symbol} 因本地冷却期跳过。`);
            continue;
          }
        }
      }

      results.push(item);
    } catch (e) {
      logSystem("ERROR", `阶段 2: 处理 ${item.symbol} 时出错: ${e.message}`);
    }
  }

  // Sort by m descending
  results.sort((a, b) => b.m - a.m);

  memDb.transaction(() => {
    memDb.prepare("DELETE FROM temp_table_2").run();
    const insert = memDb.prepare("INSERT INTO temp_table_2 (symbol, k, m, open, high, low, close, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const r of results) {
      insert.run(r.symbol, r.k, r.m, r.open, r.high, r.low, r.close, r.timestamp);
    }
  })();

  logSystem("INFO", `阶段 2 已完成。找到 ${results.length} 个合格的交易对。`);

  if (results.length > 0) {
    lastOrderReadyTime = Date.now();
    lastOrderReadySymbol = results[0].symbol;
    logSystem("INFO", `[订单就绪] 阶段 2: ${results[0].symbol} 的订单就绪状态已激活，时间: ${new Date(lastOrderReadyTime).toISOString()}`);
    
    if (isTradingEnabled) {
      logSystem("INFO", `阶段 2: 正在触发 ${results[0].symbol} 的自动订单执行`);
      executeOrder(results[0]);
    } else {
      logSystem("INFO", `阶段 2: 跳过 ${results[0].symbol} 的自动订单执行，因为交易模块已禁用。`);
    }
  }
}

async function executeOrder(candidate: any) {
  if (!activeBinance) {
    logSystem("ERROR", `[订单操作] 订单执行失败: 未配置活跃的币安账户。`);
    throw new Error("订单执行失败: 未配置活跃的币安账户。");
  }
  const settings = getSettings();
  const orderSettings = settings.order || {};
  const exitSettings = settings.exit || {};
  
  const delayMs = orderSettings.delay_ms !== undefined ? orderSettings.delay_ms : 2500;
  logSystem("INFO", `[订单操作] 标准单: 在执行 ${candidate.symbol} 之前等待 ${delayMs}ms 延迟`);
  
  setTimeout(async () => {
    try {
      logSystem("INFO", `[订单操作] 标准单: 开始执行 ${candidate.symbol}`);
      
      const balance = await activeBinance!.getBalance();
      const usdtBalance = balance.find((b: any) => b.asset === "USDT")?.balance || 0;
      
      const leverage = orderSettings.leverage || 5;
      const positionSize = orderSettings.positionSize || 20; // %
      
      // Set leverage before entry
      try {
        logSystem("INFO", `[订单操作] 正在为 ${candidate.symbol} 设置杠杆为 ${leverage}x`);
        await activeBinance!.setLeverage(candidate.symbol, leverage);
      } catch (e: any) {
        logSystem("WARN", `[订单操作] 为 ${candidate.symbol} 设置杠杆失败: ${e.message}。将使用默认杠杆继续。`);
      }
      
      // Get exchange info for precision
      const exchangeInfo = await activeBinance!.getExchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === candidate.symbol);
      if (!symbolInfo) throw new Error(`未找到 ${candidate.symbol} 的交易对信息`);
      
      const pricePrecision = symbolInfo.pricePrecision;
      const quantityPrecision = symbolInfo.quantityPrecision;
      
      let quantity = (usdtBalance * leverage * (positionSize / 100)) / candidate.close;
      
      // Check max cap
      const maxCap = orderSettings.maxCap || 1000;
      if (quantity * candidate.close > maxCap) {
        quantity = maxCap / candidate.close;
      }

      // Standard Order: Market Long
      const orderParams: any = {
        symbol: candidate.symbol,
        side: "BUY",
        type: "MARKET",
        quantity: quantity.toFixed(quantityPrecision)
      };

      // Check for Hedge Mode
      let isHedgeMode = false;
      try {
        const mode = await activeBinance!.getPositionMode();
        isHedgeMode = mode.dualSidePosition;
        if (isHedgeMode) {
          orderParams.positionSide = "LONG";
        }
      } catch (e) {
        logSystem("WARN", `[订单操作] 检查持仓模式失败: ${e.message}`);
      }

      const standardOrder = await activeBinance!.createOrder(orderParams);

      logSystem("INFO", `[订单操作] 标准单已提交: ${candidate.symbol}, 数量: ${quantity.toFixed(quantityPrecision)}${isHedgeMode ? ' (对冲模式: LONG)' : ''}`);
      
      // Poll for order completion
      let filledOrder = null;
      
      // Check if the order is already filled in the initial response
      if (standardOrder && standardOrder.status === "FILLED") {
        filledOrder = standardOrder;
      } else {
        logSystem("INFO", `[订单操作] 开始查询订单状态，Order ID: ${standardOrder.orderId}`);
        for (let i = 0; i < 10; i++) {
          try {
            const orderStatus = await activeBinance!.getOrder(candidate.symbol, standardOrder.orderId);
            logSystem("INFO", `[订单操作] 第 ${i + 1} 次检查: 状态为 "${orderStatus.status}"`);
            if (orderStatus.status === "FILLED") {
              filledOrder = orderStatus;
              break;
            } else if (["CANCELED", "REJECTED", "EXPIRED"].includes(orderStatus.status)) {
              logSystem("ERROR", `[订单操作] 订单失败，状态为: ${orderStatus.status}`);
              throw new Error(`订单失败，状态为: ${orderStatus.status}`);
            }
          } catch (e: any) {
            // Handle "Order does not exist" which can happen due to indexing delay on Binance side
            if (e.message && e.message.includes("Order does not exist")) {
              logSystem("WARN", `[订单操作] 第 ${i + 1} 次检查: 订单尚未找到 (索引延迟)，正在重试...`);
            } else {
              throw e; // Re-throw other errors
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!filledOrder) {
        logSystem("WARN", `[订单操作] ${candidate.symbol} 的标准单在 10 秒内未成交。当前状态: UNKNOWN。放弃触发出场模块。`);
        return;
      }

      const entryPrice = parseFloat(filledOrder.avgPrice || filledOrder.price);
      const filledQty = parseFloat(filledOrder.executedQty);
      
      if (filledQty <= 0) {
        logSystem("ERROR", `[订单操作] 订单显示已成交 (FILLED)，但成交数量为 0。操作终止。`);
        throw new Error("订单显示已成交 (FILLED)，但成交数量为 0。操作终止。");
      }

      logSystem("INFO", `[订单操作] {"标准单完全成交"}: ${candidate.symbol}, Price: ${entryPrice}, Qty: ${filledQty}, 参考 K 值: ${candidate.k.toFixed(4)}%`);
      
      // Verify position exists in account
      try {
        const positions = await activeBinance!.getPositionRisk();
        const pos = positions.find((p: any) => p.symbol === candidate.symbol);
        const actualQty = pos ? Math.abs(parseFloat(pos.positionAmt)) : 0;
        logSystem("INFO", `[订单操作] 账户验证: ${candidate.symbol} 持仓数量: ${actualQty}`);
        if (actualQty === 0) {
          logSystem("WARN", `[订单操作] 订单已成交，但未发现 ${candidate.symbol} 的活跃持仓。这可能是因为仓位被立即平仓或强平。`);
        }
      } catch (e: any) {
        logSystem("WARN", `[订单操作] 无法验证持仓状态: ${e.message}`);
      }

      // Log trade to database
      try {
        logTrade(candidate.symbol, "BUY", entryPrice, entryPrice, filledQty, 0, "策略匹配", "OPEN");
      } catch (e: any) {
        logSystem("ERROR", `[订单操作] 无法将交易记录保存到数据库: ${e.message}`);
        throw new Error("无法将交易记录保存到数据库: " + e.message);
      }

      // Trigger Exit Module
      triggerExitModule(candidate.symbol, entryPrice, filledQty, candidate.k, "BUY");
      
    } catch (err: any) {
      logSystem("ERROR", `[订单操作] ${candidate.symbol} 订单执行失败: ${err.message}`);
    }
  }, delayMs);
}

// --- Global Position Monitor for Exit Module ---
async function startGlobalExitMonitor() {
  if (globalExitMonitorStarted) return;
  globalExitMonitorStarted = true;
  
  logSystem("INFO", "[系统] 全局出场监控已启动 (混合模式)。");
  
  // Start WS User Data Stream if not already started
  if (binanceWS && activeBinance) {
    binanceWS.startUserDataStream(activeBinance);
  }
  
  setInterval(async () => {
    if (monitoredExits.size === 0 || !activeBinance || !isStrategyEnabled) return;
    
    const now = Date.now();
    // If WS has provided data in the last 10 seconds, skip polling
    if (now - lastWsDataTimestamp < 10000) {
      return;
    }
    
    try {
      const positions = await activeBinance.getPositionRisk();
      
      for (const [symbol, exitInfo] of monitoredExits.entries()) {
        const pos = positions.find((p: any) => p.symbol === symbol);
        
        // If position is gone or amount is 0, it's closed
        if (!pos || Math.abs(parseFloat(pos.positionAmt)) < 0.00000001) {
          await processPositionClosure(symbol, exitInfo, pos ? parseFloat(pos.markPrice) : 0);
        }
      }
    } catch (err: any) {
      // Silent error in global polling
    }
  }, 5000); // Poll every 5s globally (only if WS fails)
}

async function triggerExitModule(symbol: string, entryPrice: number, quantity: number, k: number, entrySide: string) {
  if (!activeBinance) return;
  if (!isStrategyEnabled) {
    logSystem("INFO", `[出场模块] 策略已禁用。放弃 ${symbol} 的出场模块。`);
    return;
  }
  
  // Ensure global monitor is running
  startGlobalExitMonitor();
  
  const settings = getSettings();
  const exit = settings.exit || {};
  
  const tp_ratio = exit.tp_ratio || 45; 
  const sl_ratio = exit.sl_ratio || 85; 
  const t = exit.maxTime || 0;  // Max Hold Time (minutes)

  logSystem("INFO", `[出场模块] 收到 {"标准单完全成交"} 信号，Symbol: ${symbol}。正在启动出场模块。`);

  try {
    // Get exchange info for precision
    const exchangeInfo = await activeBinance.getExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
    if (!symbolInfo) throw new Error(`未找到 ${symbol} 的交易对信息`);
    
    const quantityPrecision = symbolInfo.quantityPrecision;
    const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === "PRICE_FILTER");
    const tickSize = parseFloat(priceFilter?.tickSize || "0.00000001");

    // 计算目标价格
    const kAbs = Math.abs(k);
    const tpPriceRaw = entrySide === "BUY" 
      ? entryPrice * (1 + (kAbs / 100) * (tp_ratio / 100)) 
      : entryPrice * (1 - (kAbs / 100) * (tp_ratio / 100));

    const slPriceRaw = entrySide === "BUY" 
      ? entryPrice * (1 - (kAbs / 100) * (sl_ratio / 100)) 
      : entryPrice * (1 + (kAbs / 100) * (sl_ratio / 100));

    const tpPrice = formatPrice(tpPriceRaw, tickSize);
    const slPrice = formatPrice(slPriceRaw, tickSize);

    // 安全检查：确保价格有效且大于 0
    const tpNum = parseFloat(tpPrice);
    const slNum = parseFloat(slPrice);
    if (isNaN(tpNum) || tpNum <= 0 || isNaN(slNum) || slNum <= 0) {
      logSystem("ERROR", `[出场模块] ${symbol} 计算出的价格无效: TP=${tpPrice}, SL=${slPrice}。请检查止盈止损比例设置或交易对精度。 (K: ${k.toFixed(4)}%, Entry: ${entryPrice}, RawTP: ${tpPriceRaw.toFixed(8)}, RawSL: ${slPriceRaw.toFixed(8)})`);
      return;
    }

    const side = entrySide === "BUY" ? "SELL" : "BUY";

    // Check for Hedge Mode
    let positionSide = "BOTH";
    let isHedgeMode = false;
    try {
      const mode = await activeBinance.getPositionMode();
      isHedgeMode = mode.dualSidePosition;
      if (isHedgeMode) {
        positionSide = entrySide === "BUY" ? "LONG" : "SHORT";
      }
    } catch (e) {}

    // --- 1. 止盈逻辑：提交标准限价单 (LIMIT) ---
    const placeLimitTP = async () => {
      const tpParams: any = {
        symbol: symbol,
        side: side,
        type: "LIMIT",
        quantity: quantity.toFixed(quantityPrecision),
        price: tpPrice,
        timeInForce: "GTC"
      };
      if (isHedgeMode) {
        tpParams.positionSide = positionSide;
      } else {
        tpParams.reduceOnly = "true";
      }
      return await activeBinance!.createOrder(tpParams);
    };

    // --- 2. 止损逻辑：提交算法单 (Algo CONDITIONAL) ---
    const submitAlgoSL = async () => {
      const algoParams: any = {
        symbol: symbol,
        side: side,
        quantity: quantity.toFixed(quantityPrecision),
        workingType: 'MARK_PRICE',
        stopPrice: slPrice,
        triggerPrice: slPrice,
        algoType: 'CONDITIONAL',
        type: 'STOP_MARKET'
      };
      if (isHedgeMode) {
        algoParams.positionSide = positionSide;
      }
      return await activeBinance!.createAlgoOrder(algoParams);
    };

    // --- 3. 止损兜底逻辑 ---
    const placeStopSLFallback = async () => {
      const fallbackParams: any = {
        symbol: symbol,
        side: side,
        type: 'STOP_MARKET',
        stopPrice: slPrice,
        quantity: quantity.toFixed(quantityPrecision),
        workingType: 'MARK_PRICE'
      };
      if (isHedgeMode) {
        fallbackParams.positionSide = positionSide;
      } else {
        fallbackParams.reduceOnly = "true";
      }
      return await activeBinance!.createOrder(fallbackParams);
    };

    // Execute TP
    try {
      const tpOrder = await placeLimitTP();
      logSystem("INFO", `[出场模块] TP 止盈限价单已提交，Symbol: ${symbol}, 价格: ${tpPrice} (参考 K 值: ${k.toFixed(4)}%)。Order ID: ${tpOrder.orderId}`);
    } catch (e: any) {
      logSystem("ERROR", `[出场模块] 提交 ${symbol} 的 TP 止盈限价单失败: ${e.message}`);
    }

    // Execute SL (Algo)
    try {
      const slOrder = await submitAlgoSL();
      logSystem("INFO", `[出场模块] SL 止损算法单已提交，Symbol: ${symbol}, 价格: ${slPrice} (参考 K 值: ${k.toFixed(4)}%)。Algo ID: ${slOrder.algoId || 'N/A'}`);
    } catch (e: any) {
      logSystem("WARN", `[出场模块] ${symbol} 的 SL 止损算法单提交失败: ${e.message}。正在尝试兜底方案...`);
      try {
        const fallbackOrder = await placeStopSLFallback();
        logSystem("INFO", `[出场模块] SL 止损兜底单已提交，Symbol: ${symbol}, 价格: ${slPrice} (参考 K 值: ${k.toFixed(4)}%)。Order ID: ${fallbackOrder.orderId}`);
      } catch (e2: any) {
        logSystem("ERROR", `[出场模块] ${symbol} 的 SL 止损兜底单也提交失败: ${e2.message}`);
      }
    }

    // Add to global monitor instead of individual setInterval
    monitoredExits.set(symbol, {
      symbol,
      entryPrice,
      quantity,
      k,
      entrySide,
      tpPrice,
      slPrice,
      side,
      startTime: Date.now()
    });

  } catch (err: any) {
    logSystem("ERROR", `[出场模块] ${symbol} 的出场模块发生严重错误: ${err.message}`);
  }

  // 3. Max Hold Time (Timed Exit) - Keep as setTimeout as it's a one-off event
  if (t > 0) {
    logSystem("INFO", `[出场模块] 为 ${symbol} 设置了 ${t} 分钟的最大持仓时间`);
    setTimeout(async () => {
      try {
        if (!isStrategyEnabled) return;
        const positions = await activeBinance?.getPositionRisk();
        const pos = positions?.find((p: any) => p.symbol === symbol);
        if (pos && Math.abs(parseFloat(pos.positionAmt)) > 0.00000001) {
          logSystem("INFO", `[出场模块] ${symbol} 已达到最大持仓时间。正在执行市价平仓。`);
          
          const closeParams: any = {
            symbol: symbol,
            side: entrySide === "BUY" ? "SELL" : "BUY",
            type: "MARKET",
            quantity: Math.abs(parseFloat(pos.positionAmt)).toString()
          };

          try {
            const mode = await activeBinance!.getPositionMode();
            if (mode.dualSidePosition) {
              closeParams.positionSide = entrySide === "BUY" ? "LONG" : "SHORT";
            } else {
              closeParams.reduceOnly = "true";
            }
          } catch (e) {}

          const exitInfo = monitoredExits.get(symbol);
          if (!exitInfo) {
            logSystem("INFO", `[出场模块] ${symbol} 的定时出场已跳过: 持仓已关闭。`);
            return;
          }

          await activeBinance!.createOrder(closeParams);
          logSystem("INFO", `[出场模块] ${symbol} 的定时出场已触发。市价单已发送。`);
          
          await processPositionClosure(symbol, exitInfo, parseFloat(pos.markPrice), "到期");
        }
      } catch (err: any) {
        logSystem("ERROR", `[出场模块] ${symbol} 的定时出场失败: ${err.message}`);
      }
    }, t * 60000);
  }
}

function getSettings() {
  const rows = db.prepare("SELECT * FROM settings").all();
  return rows.reduce((acc: any, row: any) => {
    acc[row.key] = JSON.parse(row.value);
    return acc;
  }, {});
}

function logSystem(level: string, message: string) {
  db.prepare("INSERT INTO system_logs (timestamp, level, message) VALUES (?, ?, ?)")
    .run(Date.now(), level, message);
}

function logTrade(symbol: string, side: string, price: number, entryPrice: number, quantity: number, pnl: number, reason: string, status: string = "OPEN") {
  db.prepare("INSERT INTO trade_logs (timestamp, symbol, side, price, entry_price, quantity, pnl, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(Date.now(), symbol, side, price, entryPrice, quantity, pnl, reason, status);
}

// Scheduler Setup
schedule.scheduleJob("0 * * * *", runMarketScanner); // Every hour
// Analysis scheduling with 15-minute absolute cycles and custom trigger
setInterval(() => {
  if (!isStrategyEnabled) return;

  const now = Date.now();
  const settings = getSettings();
  const strategy = settings.strategy || {};
  
  const cycleStart = Math.floor(now / 900000) * 900000;

  // Phase 1 Trigger
  const p1_m = strategy.p1_trigger_min !== undefined ? strategy.p1_trigger_min : 14;
  const p1_s = strategy.p1_trigger_sec !== undefined ? strategy.p1_trigger_sec : 30;
  const p1_ms = strategy.p1_trigger_ms !== undefined ? strategy.p1_trigger_ms : 0;
  const p1_offset = (p1_m % 15) * 60000 + p1_s * 1000 + p1_ms;
  let p1_trigger_time = cycleStart + p1_offset;
  
  // If current time already passed the trigger point in this cycle, 
  // the next valid trigger is in the next 15m cycle
  if (now > p1_trigger_time + 500) { // 500ms buffer
    p1_trigger_time += 900000;
  }
  
  if (now >= p1_trigger_time && lastPhase1Run < p1_trigger_time) {
    lastPhase1Run = now;
    runPhase1(p1_trigger_time);
  }

  // Phase 2 Trigger
  const p2_m = strategy.p2_trigger_min !== undefined ? strategy.p2_trigger_min : 14;
  const p2_s = strategy.p2_trigger_sec !== undefined ? strategy.p2_trigger_sec : 56;
  const p2_ms = strategy.p2_trigger_ms !== undefined ? strategy.p2_trigger_ms : 0;
  const p2_offset = (p2_m % 15) * 60000 + p2_s * 1000 + p2_ms;
  let p2_trigger_time = cycleStart + p2_offset;

  if (now > p2_trigger_time + 500) {
    p2_trigger_time += 900000;
  }

  if (now >= p2_trigger_time && lastPhase2Run < p2_trigger_time) {
    lastPhase2Run = now;
    runPhase2(p2_trigger_time);
  }
}, 100);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Local clients connected to our server
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  const broadcast = (type: string, data: any) => {
    const payload = JSON.stringify({ type, data });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  binanceWS = new BinanceWSManager((type, data) => {
    broadcast(type, data);
  });

  // Security and Performance Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for easier iframe integration
    crossOriginEmbedderPolicy: false
  }));
  app.use(compression());
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // API Keys Management
  app.get("/api/keys", (req, res) => {
    const keys = db.prepare("SELECT id, name, is_active FROM api_keys").all();
    res.json(keys);
  });

  app.post("/api/keys", async (req, res) => {
    const { name, api_key, secret_key } = req.body;
    const logs: string[] = [];
    try {
      logs.push(`[${new Date().toLocaleTimeString()}] 开始验证 API 密钥...`);
      
      // Validate API Key
      const testBinance = new BinanceService(api_key, secret_key);
      logs.push(`[${new Date().toLocaleTimeString()}] 正在连接币安服务器 (fapi.binance.com)...`);
      await testBinance.getExchangeInfo();
      logs.push(`[${new Date().toLocaleTimeString()}] 合约接口连接成功。`);
      
      // Fetch initial balances to verify
      logs.push(`[${new Date().toLocaleTimeString()}] 正在获取账户余额 (现货 & 合约)...`);
      const balanceData = await testBinance.getAllBalances();
      logs.push(`[${new Date().toLocaleTimeString()}] 余额获取成功: 合约 ${balanceData.futures} USDT, 现货 ${balanceData.spot} USDT`);
      
      if (balanceData.warnings && balanceData.warnings.length > 0) {
        balanceData.warnings.forEach((w: string) => logs.push(`[${new Date().toLocaleTimeString()}] 注意: ${w}`));
      }
      
      // Check if this is the first key
      const count = db.prepare("SELECT COUNT(*) as count FROM api_keys").get() as any;
      const isFirst = count.count === 0;
      
      logs.push(`[${new Date().toLocaleTimeString()}] 正在保存密钥到本地数据库...`);
      const stmt = db.prepare("INSERT INTO api_keys (name, api_key, secret_key, is_active) VALUES (?, ?, ?, ?)");
      stmt.run(name, api_key, secret_key, isFirst ? 1 : 0);
      
      if (isFirst) {
        activeBinance = new BinanceService(api_key, secret_key);
        logs.push(`[${new Date().toLocaleTimeString()}] 已自动激活首个交易账号。`);
      }
      
      logs.push(`[${new Date().toLocaleTimeString()}] 验证完成，账号已就绪。`);
      res.json({ success: true, balances: balanceData, logs });
    } catch (e: any) {
      const errorMsg = e.message || "未知错误";
      logs.push(`[${new Date().toLocaleTimeString()}] 验证失败: ${errorMsg}`);
      res.status(400).json({ error: errorMsg, logs });
    }
  });

  app.delete("/api/keys/:id", (req, res) => {
    try {
      const id = req.params.id;
      const key = db.prepare("SELECT is_active FROM api_keys WHERE id = ?").get(id) as any;
      
      if (key && key.is_active) {
        activeBinance = null;
        logSystem("INFO", "活跃的 API 密钥已删除，交易服务已清除。");
      }
      
      db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
      logSystem("INFO", `API 密钥已删除 (ID: ${id})`);
      res.json({ success: true });
    } catch (e: any) {
      console.error("Delete key error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/keys/activate/:id", async (req, res) => {
    const logs: string[] = [];
    try {
      db.prepare("UPDATE api_keys SET is_active = 0").run();
      db.prepare("UPDATE api_keys SET is_active = 1 WHERE id = ?").run(req.params.id);
      
      const key = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(req.params.id) as any;
      let balances = { futures: "0.00", spot: "0.00" };
      
      if (key) {
        logs.push(`[${new Date().toLocaleTimeString()}] 正在切换至账号: ${key.name}...`);
        activeBinance = new BinanceService(key.api_key, key.secret_key);
        
        logs.push(`[${new Date().toLocaleTimeString()}] 正在同步账户余额...`);
        balances = await activeBinance.getAllBalances();
        logs.push(`[${new Date().toLocaleTimeString()}] 同步成功: 合约 ${balances.futures} USDT, 现货 ${balances.spot} USDT`);
      }
      
      res.json({ success: true, balances, logs });
    } catch (e: any) {
      const errorMsg = e.response?.data?.msg || e.message;
      logs.push(`[${new Date().toLocaleTimeString()}] 激活失败: ${errorMsg}`);
      res.status(500).json({ error: errorMsg, logs });
    }
  });

  app.get("/api/stats", async (req, res) => {
    if (!activeBinance) {
      return res.json({ todayPnL: 0, winRate: '0.0', totalTrades: 0 });
    }

    const now = Date.now();
    if (cachedStats && (now - lastStatsFetch < STATS_CACHE_TTL)) {
      return res.json(cachedStats);
    }

    try {
      // Fetch last 24 hours for "Today's PnL" to be safe across timezones
      const last24hStart = now - 24 * 60 * 60 * 1000;

      // Fetch Realized PnL from Binance
      const incomeHistory = await activeBinance.getIncomeHistory({
        incomeType: "REALIZED_PNL",
        startTime: last24hStart,
        limit: 1000
      });

      let binanceTodayPnL = 0;
      if (Array.isArray(incomeHistory)) {
        binanceTodayPnL = incomeHistory.reduce((sum, item) => sum + parseFloat(item.income || "0"), 0);
      }

      // Calculate win rate: Try local DB first, if empty, try Binance income history
      let winRate = 0;
      let totalTrades = 0;

      const monthTrades = db.prepare("SELECT pnl FROM trade_logs WHERE timestamp >= ? AND pnl IS NOT NULL").all(now - 30 * 24 * 60 * 60 * 1000) as any[];
      
      if (monthTrades.length > 0) {
        const wins = monthTrades.filter(t => t.pnl > 0).length;
        totalTrades = monthTrades.length;
        winRate = (wins / totalTrades) * 100;
      } else {
        // Fallback: Calculate from Binance income history (last 100 realized PnL items)
        const recentIncome = await activeBinance.getIncomeHistory({
          incomeType: "REALIZED_PNL",
          limit: 100
        });
        
        if (Array.isArray(recentIncome) && recentIncome.length > 0) {
          const wins = recentIncome.filter(item => parseFloat(item.income || "0") > 0).length;
          totalTrades = recentIncome.length;
          winRate = (wins / totalTrades) * 100;
        }
      }

      cachedStats = {
        todayPnL: binanceTodayPnL,
        winRate: winRate,
        totalTrades: totalTrades
      };
      lastStatsFetch = now;

      res.json(cachedStats);
    } catch (e: any) {
      console.error("从币安获取统计数据失败:", e.message || e);
      // Return stale cache if available on error, otherwise empty
      if (cachedStats) return res.json(cachedStats);
      res.json({ todayPnL: 0, winRate: '0.0', totalTrades: 0 });
    }
  });

  app.get("/api/account/status", async (req, res) => {
    if (!activeBinance) {
      return res.json({ balance: "0.00", positions: [], active: false, totalUnrealizedProfit: 0 });
    }
    try {
      // Fetch both account info and position risk to get markPrice and balance
      const [accountInfo, positionRisk] = await Promise.all([
        activeBinance.getAccountInfo(),
        activeBinance.getPositionRisk()
      ]);
      
      const usdtAsset = accountInfo.assets?.find((a: any) => a.asset === "USDT");
      const usdtBalance = usdtAsset?.walletBalance || usdtAsset?.marginBalance || "0.00";
      
      const activePositions = positionRisk?.filter((p: any) => {
        const amt = parseFloat(p.positionAmt || "0");
        return Math.abs(amt) > 0.00000001;
      }) || [];
      
      const totalUnrealizedProfit = parseFloat(accountInfo.totalUnrealizedProfit || "0");
      
      res.json({ 
        balance: usdtBalance, 
        positions: activePositions, 
        active: true,
        totalUnrealizedProfit
      });
    } catch (e) {
      console.error("从 /fapi/v2/account 获取账户状态失败，正在尝试备选方案...", e);
      // Fallback to individual calls if /fapi/v2/account fails
      try {
        const [balances, positions] = await Promise.all([
          activeBinance.getBalance(),
          activeBinance.getPositionRisk()
        ]);
        
        const usdtObj = Array.isArray(balances) ? balances.find((b: any) => b.asset === "USDT") : null;
        const usdtBalance = usdtObj?.balance || usdtObj?.walletBalance || "0.00";
        
        const activePositions = Array.isArray(positions)
          ? positions.filter((p: any) => {
              const amt = parseFloat(p.positionAmt || p.amt || "0");
              return Math.abs(amt) > 0.00000001;
            })
          : [];
          
        res.json({ 
          balance: usdtBalance, 
          positions: activePositions, 
          active: true,
          totalUnrealizedProfit: activePositions.reduce((sum, p) => sum + parseFloat(p.unRealizedProfit || p.unrealizedProfit || "0"), 0)
        });
      } catch (fallbackErr: any) {
        console.error("所有账户状态获取方法均失败:", fallbackErr.message || fallbackErr);
        res.status(500).json({ error: fallbackErr.message || "Failed to fetch account status", active: false });
      }
    }
  });

  app.get("/api/account/balance", async (req, res) => {
    if (!activeBinance) {
      return res.json({ balances: { futures: "0.00", spot: "0.00" }, active: false });
    }
    try {
      const balances = await activeBinance.getAllBalances();
      res.json({ balances, active: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch balances", active: false });
    }
  });

  // Settings Management
  app.get("/api/settings", (req, res) => {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = rows.reduce((acc: any, row: any) => {
      acc[row.key] = JSON.parse(row.value);
      return acc;
    }, {});
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    stmt.run(key, JSON.stringify(value));
    res.json({ success: true });
  });

  // Control
  app.post("/api/control/toggle", (req, res) => {
    isTradingEnabled = req.body.enabled;
    logSystem("INFO", `交易已${isTradingEnabled ? "启用" : "禁用"}`);
    res.json({ enabled: isTradingEnabled });
  });

  app.get("/api/control/status", (req, res) => {
    res.json({ enabled: isTradingEnabled });
  });

  app.get("/api/strategy/order-status", (req, res) => {
    res.json({
      ready: lastOrderReadyTime > 0 && (Date.now() - lastOrderReadyTime) < 900000, // Valid for 15 mins
      timestamp: lastOrderReadyTime,
      symbol: lastOrderReadySymbol
    });
  });

  // Logs
  app.get("/api/logs/system", (req, res) => {
    const logs = db.prepare("SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 100").all();
    res.json(logs);
  });

  app.post("/api/logs/system", (req, res) => {
    const { level, message } = req.body;
    logSystem(level || "INFO", message);
    res.json({ success: true });
  });

  app.get("/api/logs/trades", (req, res) => {
    const logs = db.prepare("SELECT * FROM trade_logs ORDER BY timestamp DESC LIMIT 100").all();
    res.json(logs);
  });

  app.post("/api/trading/close-position", async (req, res) => {
    const { symbol } = req.body;
    
    if (!activeBinance) {
      logSystem("ERROR", `[订单操作] ${symbol} 手动平仓失败: 未配置活跃的币安账户。`);
      return res.status(400).json({ error: "No active account" });
    }

    try {
      const positions = await activeBinance.getPositionRisk();
      const pos = positions.find((p: any) => p.symbol === symbol && Math.abs(parseFloat(p.positionAmt)) > 0);
      
      if (!pos) {
        logSystem("WARN", `[订单操作] 手动平仓已跳过: 未发现 ${symbol} 的活跃持仓。`);
        return res.status(400).json({ error: "No active position for " + symbol });
      }

      const amt = parseFloat(pos.positionAmt);
      const side = amt > 0 ? "SELL" : "BUY";
      const quantity = Math.abs(amt);

      logSystem("INFO", `[订单操作] 收到 ${symbol} 的手动平仓请求。持仓: ${amt}。正在执行市价 ${side} 单。`);

      const params: any = {
        symbol,
        side,
        type: "MARKET",
        quantity: quantity.toString()
      };

      // Handle Hedge Mode if necessary
      if (pos.positionSide && pos.positionSide !== "BOTH") {
        params.positionSide = pos.positionSide;
      } else {
        params.reduceOnly = "true";
      }

      const result = await activeBinance.createOrder(params);
      
      // Log manual close
      const entryPrice = parseFloat(pos.entryPrice);
      const markPrice = parseFloat(pos.markPrice);
      const pnl = amt > 0 ? (markPrice - entryPrice) * quantity : (entryPrice - markPrice) * quantity;
      logTrade(symbol, side, markPrice, entryPrice, quantity, pnl, "手动", "CLOSED");
      
      // Verify if the position is actually closed
      setTimeout(async () => {
        try {
          const updatedPositions = await activeBinance!.getPositionRisk();
          const stillExists = updatedPositions.find((p: any) => p.symbol === symbol && Math.abs(parseFloat(p.positionAmt)) > 0);
          if (!stillExists) {
            logSystem("INFO", `[订单操作] ${symbol} 手动平仓成功。已验证持仓关闭。`);
          } else {
            logSystem("ERROR", `[订单操作] ${symbol} 手动平仓验证失败。持仓仍处于活跃状态: ${stillExists.positionAmt}`);
          }
        } catch (err: any) {
          logSystem("WARN", `[订单操作] ${symbol} 手动平仓验证出错: ${err.message}`);
        }
      }, 2000);

      res.json({ success: true, result });
    } catch (e: any) {
      logSystem("ERROR", `[订单操作] ${symbol} 手动平仓失败: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/trading/status", (req, res) => {
    res.json({ enabled: isTradingEnabled });
  });

  app.post("/api/trading/toggle", (req, res) => {
    const { enabled } = req.body;
    isTradingEnabled = enabled;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run('trading_enabled', JSON.stringify(isTradingEnabled));
    logSystem("INFO", `[交易循环] 交易循环 (出场模块上下文) ${isTradingEnabled ? '已启动' : '已停止'}。`);
    res.json({ enabled: isTradingEnabled });
  });

  app.get("/api/strategy/temp1", (req, res) => {
    const data = memDb.prepare("SELECT * FROM temp_table_1 ORDER BY m DESC").all();
    res.json(data);
  });

  app.get("/api/strategy/temp2", (req, res) => {
    const data = memDb.prepare("SELECT * FROM temp_table_2 ORDER BY m DESC").all();
    res.json(data);
  });

  app.get("/api/strategy/status", (req, res) => {
    const settings = getSettings();
    const strategy = settings.strategy || {};
    
    const now = Date.now();
    const cycleStart = Math.floor(now / 900000) * 900000;
    const nextCycleStart = cycleStart + 900000;

    const getNextTrigger = (m: number, s: number, ms: number) => {
      let trigger = cycleStart + (m % 15) * 60000 + s * 1000 + ms;
      if (trigger <= now) {
        trigger = nextCycleStart + (m % 15) * 60000 + s * 1000 + ms;
      }
      return trigger;
    };

    const p1Trigger = getNextTrigger(strategy.p1_trigger_min !== undefined ? strategy.p1_trigger_min : 14, strategy.p1_trigger_sec !== undefined ? strategy.p1_trigger_sec : 30, strategy.p1_trigger_ms !== undefined ? strategy.p1_trigger_ms : 0);
    const p2Trigger = getNextTrigger(strategy.p2_trigger_min !== undefined ? strategy.p2_trigger_min : 14, strategy.p2_trigger_sec !== undefined ? strategy.p2_trigger_sec : 56, strategy.p2_trigger_ms !== undefined ? strategy.p2_trigger_ms : 0);

    res.json({
      enabled: isStrategyEnabled,
      lastPhase1Run,
      lastPhase2Run,
      nextPhase1Trigger: p1Trigger,
      nextPhase2Trigger: p2Trigger,
      serverTime: now
    });
  });

  app.post("/api/strategy/toggle", (req, res) => {
    const { enabled } = req.body;
    isStrategyEnabled = enabled;
    
    logSystem("INFO", `[入场模块] 策略入场模块 ${isStrategyEnabled ? '已启动' : '已停止'}。`);

    if (isStrategyEnabled) {
      const now = Date.now();
      const settings = getSettings();
      const strategy = settings.strategy || {};
      const cycleStart = Math.floor(now / 900000) * 900000;
      
      const p1_trigger_min = strategy.p1_trigger_min !== undefined ? strategy.p1_trigger_min : 14;
      const p1_trigger_sec = strategy.p1_trigger_sec !== undefined ? strategy.p1_trigger_sec : 30;
      const p1_trigger_ms = strategy.p1_trigger_ms !== undefined ? strategy.p1_trigger_ms : 0;
      
      const p2_trigger_min = strategy.p2_trigger_min !== undefined ? strategy.p2_trigger_min : 14;
      const p2_trigger_sec = strategy.p2_trigger_sec !== undefined ? strategy.p2_trigger_sec : 56;
      const p2_trigger_ms = strategy.p2_trigger_ms !== undefined ? strategy.p2_trigger_ms : 0;

      const p1_time_in_cycle = (p1_trigger_min % 15) * 60000 + (p1_trigger_sec) * 1000 + (p1_trigger_ms);
      const p2_time_in_cycle = (p2_trigger_min % 15) * 60000 + (p2_trigger_sec) * 1000 + (p2_trigger_ms);
      
      const current_time_in_cycle = now - cycleStart;
      
      // If started after trigger, set lastRun to current time to ensure it only runs in NEXT cycle
      if (current_time_in_cycle >= p1_time_in_cycle) {
        lastPhase1Run = now; 
      } else {
        lastPhase1Run = 0; // Allow it to run in current cycle if trigger is still ahead
      }

      if (current_time_in_cycle >= p2_time_in_cycle) {
        lastPhase2Run = now;
      } else {
        lastPhase2Run = 0;
      }
      
      logSystem("INFO", `策略分析模块已启动。(当前周期偏移: ${current_time_in_cycle}ms)`);
    } else {
      logSystem("INFO", "策略分析模块已停止。");
    }
    
    res.json({ enabled: isStrategyEnabled });
  });

  app.get("/api/system/ip", async (req, res) => {
    if (req.query.refresh === 'true') {
      await updateOutboundIp();
    }
    res.json({ ip: lastOutboundIp });
  });

  app.get("/api/market/status", (req, res) => {
    res.json({ 
      enabled: isMarketScanning,
      lastFilterRun,
      nextFilterRun,
      serverTime: Date.now()
    });
  });

  app.post("/api/market/toggle", (req, res) => {
    const { enabled } = req.body;
    if (enabled) {
      startMarketScanner();
      runMarketScanner(); // Run immediately
    } else {
      stopMarketScanner();
    }
    res.json({ enabled: isMarketScanning });
  });

  app.get("/api/market/form1", (req, res) => {
    const data = db.prepare("SELECT * FROM market_cache ORDER BY onboard_time DESC").all();
    res.json(data);
  });

  app.get("/api/market/target", (req, res) => {
    const data = db.prepare("SELECT * FROM target_market ORDER BY onboard_time DESC").all();
    res.json(data);
  });

  app.get("/api/market/download/:type", (req, res) => {
    const type = req.params.type;
    const table = type === 'form1' ? 'market_cache' : 'target_market';
    const data = db.prepare(`SELECT symbol as '币种', onboard_date as '上线时间', onboard_time as 'Unix时间(秒)' FROM ${table}`).all();
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MarketData");
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', `attachment; filename="market_${type}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  });

  app.post("/api/market/upload", (req, res) => {
    // In a real app we'd use multer, but for simplicity we'll handle base64 or similar if needed
    // Actually, let's assume the client sends the data as JSON for simplicity if they parsed it
    // or we can just implement a simple upload if we have the buffer.
    // For this environment, let's assume JSON payload of symbols for now or a simple XLSX parser.
    const { symbols } = req.body; 
    if (!symbols || !Array.isArray(symbols)) return res.status(400).json({ error: "Invalid data" });

    db.transaction(() => {
      db.prepare("DELETE FROM target_market").run();
      for (const s of symbols) {
        db.prepare("INSERT INTO target_market (symbol, onboard_time, onboard_date, last_updated) VALUES (?, ?, ?, ?)")
          .run(s, 0, 'Manual Upload', Date.now());
      }
    })();
    
    logSystem("INFO", `手动市场上传: ${symbols.length} 个交易对。`);
    res.json({ success: true, count: symbols.length });
  });

  // Initialize active account
  const activeKey = db.prepare("SELECT * FROM api_keys WHERE is_active = 1").get() as any;
  if (activeKey) {
    activeBinance = new BinanceService(activeKey.api_key, activeKey.secret_key);
    binanceWS.startUserDataStream(activeBinance);
    
    // Initial symbols to watch
    const symbols = db.prepare("SELECT symbol FROM target_market").all() as any[];
    binanceWS.updateSymbols(symbols.map(s => s.symbol));
  }

  // Initialize Trading Status
  // User requested it to always default to stopped on boot
  isTradingEnabled = false;

  // Initialize Market Scanner
  const scannerEnabled = db.prepare("SELECT value FROM settings WHERE key = 'market_scanner_enabled'").get() as any;
  if (scannerEnabled && JSON.parse(scannerEnabled.value)) {
    startMarketScanner();
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
