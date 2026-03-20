import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// 1. 定义全局变量，用于缓存最后一次获取到的出口 IP 地址
// 初始值为“正在获取...”，在前端展示时作为加载状态
let lastOutboundIp = "正在获取...";

/**
 * 2. 定义异步函数：更新服务器出口 IP
 * 尝试多个服务以确保在不同环境下都能获取到公网 IP
 */
async function updateOutboundIp() {
  const services = [
    "https://api.ipify.org?format=json",
    "https://api64.ipify.org?format=json",
    "https://ident.me/.json",
    "https://ifconfig.me/all.json"
  ];

  for (const service of services) {
    try {
      const response = await axios.get(service, { timeout: 3000 });
      const ip = response.data.ip || response.data.ip_addr || response.data.query;
      if (ip) {
        lastOutboundIp = ip;
        console.log(`[SYSTEM] 识别到阿里云 ECS 公网 IP: ${lastOutboundIp} (via ${new URL(service).hostname})`);
        console.log(`[SYSTEM] 请确保在币安 API 设置中已将此 IP 加入白名单。`);
        return;
      }
    } catch (e: any) {
      console.warn(`[SYSTEM] 尝试通过 ${service} 获取 IP 失败: ${e.message}`);
    }
  }
  
  if (lastOutboundIp === "正在获取...") {
    lastOutboundIp = "识别失败 (请检查服务器网络)";
  }
}

// 3. 程序启动时立即执行一次初始化获取
updateOutboundIp();

// 4. 设置定时任务：每 1 小时自动更新一次 IP
// 3600000 毫秒 = 60 分钟 * 60 秒 * 1000 毫秒
setInterval(updateOutboundIp, 3600000);

/**
 * 5. 注册 API 路由：供前端 UI 查询当前 IP
 * 路径: GET /api/system/ip
 */
app.get("/api/system/ip", async (req, res) => {
  // 如果请求参数中包含 refresh=true，则立即触发一次后端更新逻辑
  if (req.query.refresh === 'true') {
    await updateOutboundIp();
  }
  
  // 返回 JSON 格式的 IP 数据
  res.json({ ip: lastOutboundIp });
});

// Binance API Proxy with Signing
app.all("/api/binance/*", async (req, res) => {
  const apiKey = req.headers["x-mbx-apikey"] as string || process.env.BINANCE_API_KEY;
  const apiSecret = req.headers["x-mbx-apisecret"] as string || process.env.BINANCE_SECRET_KEY;
  let baseUrl = (req.headers["x-mbx-baseurl"] as string) || process.env.BINANCE_BASE_URL || "https://fapi.binance.com";
  // Remove trailing slash if present
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  const endpoint = req.params[0];
  const method = req.method;
  const query = { ...req.query };
  const body = req.body;

  // Add timestamp if needed for signed endpoints
  if (apiSecret && !query.timestamp) {
    query.timestamp = Date.now().toString();
  }

  // Create query string using URLSearchParams for proper encoding
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      params.append(key, String(val));
    }
  });

  // Sign if secret exists
  if (apiSecret) {
    const queryStringToSign = params.toString();
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(queryStringToSign)
      .digest("hex");
    params.append("signature", signature);
  }

  const finalQueryString = params.toString();
  const url = `${baseUrl}/${endpoint}${finalQueryString ? "?" + finalQueryString : ""}`;

  const axiosConfig: any = {
    method,
    url,
    headers: {
      "X-MBX-APIKEY": apiKey,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    timeout: 10000,
  };

  if (method !== "GET" && body && Object.keys(body).length > 0) {
    axiosConfig.data = body;
    axiosConfig.headers["Content-Type"] = "application/json";
  }

  try {
    const response = await axios(axiosConfig);
    res.json(response.data);
  } catch (error: any) {
    let status = error.response?.status || 500;
    let data = error.response?.data || { message: error.message };
    
    // Fallback mechanism for 403/CloudFront errors
    if (status === 403 && baseUrl.includes("fapi.binance.com")) {
      const fallbackUrl = url.replace("fapi.binance.com", "fapi1.binance.com");
      console.log(`[BINANCE 403 FALLBACK] Retrying with: ${fallbackUrl}`);
      try {
        const fallbackResponse = await axios({ ...axiosConfig, url: fallbackUrl });
        return res.json(fallbackResponse.data);
      } catch (fallbackError: any) {
        status = fallbackError.response?.status || status;
        data = fallbackError.response?.data || data;
      }
    }
    
    // Detailed logging for debugging 401/403 errors
    if (status === 401 || status === 403) {
      console.error(`[BINANCE ERROR ${status}]`);
      console.error(`- URL: ${url}`);
      console.error(`- Method: ${method}`);
      console.error(`- Outbound IP: ${lastOutboundIp}`);
      console.error(`- API Key (First 5): ${apiKey?.substring(0, 5)}...`);
      console.error(`- Response:`, typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data));
    }
    
    res.status(status).json(data);
  }
});

// Email Notification Endpoint
app.post("/api/notify", async (req, res) => {
  const { subject, text } = req.body;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return res.status(500).json({ message: "Email settings not configured" });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: SMTP_USER,
      to: NOTIFICATION_EMAIL || SMTP_USER,
      subject,
      text,
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
