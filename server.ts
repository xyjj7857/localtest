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
  // 建议从环境变量获取端口，默认 3000
  const PORT = Number(process.env.PORT) || 3000;

  // 基础中间件
  app.use(express.json());

  // 币安签名助手
  const getSignature = (queryString: string, secret: string) => {
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
  };

  // --- [重点] API 路由定义开始 ---

  // 1. 获取服务器信息 (IP/Hostname)
  app.get("/api/server-info", async (req, res) => {
    let publicIp = "Unknown";
    let localIp = "127.0.0.1";
    let debugInfo: any = {
      publicIpFetch: [],
      localIpFetch: {
        command: "os.networkInterfaces()",
        status: 200,
        error: null
      }
    };

    // A. 获取本地内网 IP
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
      console.error("[LOCAL IP ERROR]", e);
      debugInfo.localIpFetch.status = 500;
      debugInfo.localIpFetch.error = e.message;
    }

    // B. 获取公网 IP (多渠道备份)
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
          debugInfo.publicIpFetch.push({
            provider: provider.name,
            status: response.status,
            success: true
          });
          break; // 成功获取则跳出循环
        }
      } catch (e: any) {
        debugInfo.publicIpFetch.push({
          provider: provider.name,
          status: e.response?.status || 500,
          success: false,
          error: e.message
        });
      }
    }

    // C. 强制返回 JSON 格式
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ 
      ip: publicIp,
      localIp: localIp,
      hostname: os.hostname(),
      timestamp: Date.now(),
      debug: debugInfo
    });
  });

  // 1.5 DNS 解析接口
  app.post("/api/dns-lookup", async (req, res) => {
    const { hostname, dnsServer } = req.body;
    if (!hostname) {
      return res.status(400).json({ error: "Hostname is required" });
    }

    const servers = dnsServer ? [dnsServer] : ["8.8.8.8", "114.114.114.114"];
    const resolver = new Resolver();
    resolver.setServers(servers);

    try {
      const addresses = await resolver.resolve4(hostname);
      res.json({
        hostname,
        servers,
        addresses,
        timestamp: Date.now()
      });
    } catch (e: any) {
      res.status(500).json({
        error: `DNS lookup failed: ${e.message}`,
        hostname,
        servers
      });
    }
  });

  // 2. 币安代理接口
  app.all("/api/binance/*", async (req, res) => {
    const apiPath = req.params[0];
    const method = req.method;
    const apiKey = req.headers["x-mbx-apikey"] as string;
    const apiSecret = req.headers["x-mbx-apisecret"] as string;
    const baseUrl = req.headers["x-mbx-baseurl"] as string || "https://fapi.binance.com";

    const isPublic = apiPath.includes("exchangeInfo") || apiPath.includes("klines") || apiPath.includes("ticker");

    if (!isPublic && (!apiKey || !apiSecret)) {
      return res.status(401).json({ error: "API Key and Secret required" });
    }

    try {
      let fullUrl = `${baseUrl}/${apiPath}`;
      const queryParams: any = { ...req.query };
      
      if (!isPublic) {
        queryParams.timestamp = Date.now();
        const queryString = Object.entries(queryParams)
          .map(([key, val]) => `${key}=${encodeURIComponent(String(val))}`)
          .join("&");
        const signature = getSignature(queryString, apiSecret);
        fullUrl = `${fullUrl}?${queryString}&signature=${signature}`;
      } else {
        const queryString = new URLSearchParams(req.query as any).toString();
        if (queryString) fullUrl = `${fullUrl}?${queryString}`;
      }

      const response = await axios({
        method,
        url: fullUrl,
        headers: { 
          "X-MBX-APIKEY": apiKey || "",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Content-Type": "application/json",
          "Origin": "https://www.binance.com",
          "Referer": "https://www.binance.com/"
        },
        data: (method === "GET" || method === "DELETE") ? undefined : req.body,
        timeout: 15000, // Increased timeout slightly
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      let data = error.response?.data;
      
      // If the response is HTML (likely a CloudFront error), wrap it in a JSON object
      if (typeof data === 'string' && data.includes('<!DOCTYPE HTML')) {
        console.error(`[BINANCE PROXY HTML ERROR] [${apiPath}] Status: ${status}`, data.substring(0, 500));
        data = { 
          error: "Binance API returned an HTML error (possibly blocked by CloudFront)", 
          htmlSnippet: data.substring(0, 200),
          status: status
        };
      } else {
        console.error(`[BINANCE PROXY ERROR] [${apiPath}] Status: ${status}`, data || error.message);
      }
      
      res.status(status).json(data || { error: error.message });
    }
  });

  // --- [重点] 生产环境与开发环境切换 ---

  if (process.env.NODE_ENV !== "production") {
    // 开发模式
    console.log("[SERVER] Starting in DEVELOPMENT mode (Vite)");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // 生产模式
    console.log("[SERVER] Starting in PRODUCTION mode");
    // 假设你的打包结果在项目根目录的 dist 文件夹中
    const distPath = path.resolve(process.cwd(), 'dist');
    
    // 1. 服务静态资源
    app.use(express.static(distPath));

    // 2. 最后的兜底路由
    app.get('*', (req, res) => {
      // 如果请求的是以 /api 开头但没匹配到上面的路由，返回 404 JSON 而不是 HTML
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: `API route ${req.path} not found` });
      }
      // 否则返回 index.html 供单页应用前端路由处理
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`-------------------------------------------`);
    console.log(`  Server is running on http://localhost:${PORT}`);
    console.log(`  Local IP: http://${getInternalIp()}:${PORT}`);
    console.log(`-------------------------------------------`);
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