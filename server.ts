import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import os from "os";
import CryptoJS from "crypto-js";
import axios from "axios";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // 1. 中间件配置
  app.use(express.json());

  // 签名助手函数
  const getSignature = (queryString: string, secret: string) => {
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
  };

  // --- API 路由开始 (必须放在静态资源处理之前) ---

  // 获取服务器信息 (IP/Hostname)
  app.get("/api/server-info", async (req, res) => {
    let publicIp = "Unknown";
    let localIp = "127.0.0.1";

    // 获取本地内网 IP
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
    } catch (e) {
      console.error("[ERROR] Local IP fetch error:", e);
    }

    // 尝试获取公网 IP (增加超时保护)
    try {
      const response = await axios.get('https://api.ipify.org?format=json', { 
        timeout: 3000 // 3秒超时，防止部署环境无法上外网导致接口挂起
      });
      publicIp = response.data.ip;
    } catch (e: any) {
      console.warn(`[WARN] Public IP fetch failed: ${e.message}. (Server may have no internet access)`);
    }

    // 始终返回 JSON，避免前端解析 HTML 报错
    res.json({ 
      ip: publicIp,
      localIp: localIp,
      hostname: os.hostname(),
      timestamp: Date.now()
    });
  });

  // 币安代理接口
  app.all("/api/binance/*", async (req, res) => {
    const apiPath = req.params[0];
    const method = req.method;
    const apiKey = req.headers["x-mbx-apikey"] as string;
    const apiSecret = req.headers["x-mbx-apisecret"] as string;
    const baseUrl = req.headers["x-mbx-baseurl"] as string || "https://fapi.binance.com";

    const isPublic = apiPath.includes("exchangeInfo") || apiPath.includes("klines") || apiPath.includes("ticker");

    if (!isPublic && (!apiKey || !apiSecret)) {
      return res.status(401).json({ error: "API Key and Secret are required" });
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
          "Content-Type": "application/json"
        },
        data: (method === "GET" || method === "DELETE") ? undefined : req.body,
        timeout: 10000,
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // --- 静态资源与生产环境处理 ---

  if (process.env.NODE_ENV !== "production") {
    // 开发模式：使用 Vite 中间件
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[MODE] Running in Development (Vite)");
  } else {
    // 生产模式：先服务静态文件，最后兜底 index.html
    const distPath = path.resolve(__dirname, '../dist'); // 根据你的目录结构调整
    app.use(express.static(distPath));
    
    // 只有非 API 请求才返回 index.html
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: "API Route not found" });
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log("[MODE] Running in Production (Static)");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
    console.log(`-----------------------------------------`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
