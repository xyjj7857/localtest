import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import os from "os";
import CryptoJS from "crypto-js";
import axios from "axios";
import { fileURLToPath } from "url";
import dns from "dns";

const { Resolver } = dns.promises;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const NODE_ENV = process.env.NODE_ENV || "development";

  console.log(`[SYSTEM] Environment: ${NODE_ENV}`);
  console.log(`[SYSTEM] Port: ${PORT}`);

  // 基础中间件
  app.use(express.json());

  // 全局请求日志 (调试用)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[API REQUEST] ${req.method} ${req.path}`);
    }
    next();
  });

  // 币安签名助手
  const getSignature = (queryString: string, secret: string) => {
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
  };

  // --- API 路由 ---

  // 1. 获取服务器信息 (支持带或不带斜杠)
  app.get(["/api/server-info", "/api/server-info/"], async (req, res) => {
    console.log("[API] Handling /api/server-info");
    let publicIp = "Unknown";
    let localIp = "127.0.0.1";
    let debugInfo: any = {
      publicIpFetch: [],
      localIpFetch: { status: 200, error: null }
    };

    try {
      const interfaces = os.networkInterfaces();
      for (const k in interfaces) {
        const networkInterface = interfaces[k];
        if (networkInterface) {
          for (const address of networkInterface) {
            if (address.family === 'IPv4' && !address.internal) {
              localIp = address.address;
              break;
            }
          }
        }
        if (localIp !== "127.0.0.1") break;
      }
    } catch (e: any) {
      debugInfo.localIpFetch.status = 500;
      debugInfo.localIpFetch.error = e.message;
    }

    const providers = [
      { name: "ipify", url: "https://api.ipify.org?format=json", parser: (data: any) => data.ip },
      { name: "ident.me", url: "https://ident.me/.json", parser: (data: any) => data.address },
      { name: "ip-api", url: "http://ip-api.com/json", parser: (data: any) => data.query },
      { name: "icanhazip", url: "https://ipv4.icanhazip.com", parser: (data: any) => typeof data === 'string' ? data.trim() : data },
      { name: "ipinfo", url: "https://ipinfo.io/json", parser: (data: any) => data.ip },
      { name: "amazon", url: "https://checkip.amazonaws.com", parser: (data: any) => typeof data === 'string' ? data.trim() : data }
    ];

    for (const provider of providers) {
      try {
        const response = await axios.get(provider.url, { timeout: 3000 });
        const ip = provider.parser(response.data);
        if (ip && ip !== "Unknown") {
          publicIp = ip;
          debugInfo.publicIpFetch.push({ provider: provider.name, success: true });
          break;
        }
      } catch (e: any) {
        debugInfo.publicIpFetch.push({ provider: provider.name, success: false, error: e.message });
      }
    }

    res.json({ ip: publicIp, localIp, hostname: os.hostname(), timestamp: Date.now(), debug: debugInfo });
  });

  // 1.5 DNS 解析
  app.post(["/api/dns-lookup", "/api/dns-lookup/"], async (req, res) => {
    const { hostname, dnsServer } = req.body;
    if (!hostname) return res.status(400).json({ error: "Hostname is required" });
    const servers = dnsServer ? [dnsServer] : ["8.8.8.8", "114.114.114.114"];
    const resolver = new Resolver();
    resolver.setServers(servers);
    try {
      const addresses = await resolver.resolve4(hostname);
      res.json({ hostname, servers, addresses, timestamp: Date.now() });
    } catch (e: any) {
      res.status(500).json({ error: e.message, hostname, servers });
    }
  });

  // 2. 币安代理
  app.all("/api/binance/*", async (req, res) => {
    const apiPath = req.params[0];
    const method = req.method;
    const apiKey = req.headers["x-mbx-apikey"] as string;
    const apiSecret = req.headers["x-mbx-apisecret"] as string;
    const baseUrl = req.headers["x-mbx-baseurl"] as string || "https://fapi.binance.com";
    const isPublic = apiPath.includes("exchangeInfo") || apiPath.includes("klines") || apiPath.includes("ticker");

    if (!isPublic && (!apiKey || !apiSecret)) return res.status(401).json({ error: "API Key/Secret required" });

    try {
      let fullUrl = `${baseUrl}/${apiPath}`;
      const queryParams: any = { ...req.query };
      if (!isPublic) {
        queryParams.timestamp = Date.now();
        const queryString = Object.entries(queryParams).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
        fullUrl = `${fullUrl}?${queryString}&signature=${getSignature(queryString, apiSecret)}`;
      } else {
        const qs = new URLSearchParams(req.query as any).toString();
        if (qs) fullUrl = `${fullUrl}?${qs}`;
      }

      const response = await axios({
        method, url: fullUrl,
        headers: { 
          "X-MBX-APIKEY": apiKey || "",
          "User-Agent": "Mozilla/5.0...",
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        data: (method === "GET" || method === "DELETE") ? undefined : req.body,
        timeout: 15000,
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // --- 静态文件与兜底 ---
  if (NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    console.log(`[SYSTEM] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // 如果是 API 请求但没匹配到，返回 404 JSON
      if (req.path.startsWith('/api')) {
        console.warn(`[API 404] Route not found: ${req.path}`);
        return res.status(404).json({ error: `API route ${req.path} not found` });
      }
      // 否则返回前端页面
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[READY] Server running on http://0.0.0.0:${PORT}`);
  });
}

// 辅助函数：启动时打印内网 IP
function getInternalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

startServer().catch(err => {
  console.error("[FATAL ERROR]", err);
});