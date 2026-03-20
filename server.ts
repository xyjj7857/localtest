import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import os from "os";
import axios from "axios";
import crypto from "crypto";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// 1. 全局变量缓存
let lastOutboundIp = "正在获取...";
let serverHostname = os.hostname();

/**
 * 2. 优化后的 IP 更新函数
 * 采用并发竞速模式，并增加本地 IP 回退机制
 */
async function updateOutboundIp() {
  console.log(`[SYSTEM] 正在触发公网 IP 更新程序...`);

  const sources = [
    { name: "Ipify", url: "https://api.ipify.org?format=json", timeout: 3000 },
    { name: "Aliyun Metadata", url: "http://100.100.100.200/latest/meta-data/public-ipv4", timeout: 2000, headers: { 'Metadata': 'true' } },
    { name: "IPIP.net", url: "https://myip.ipip.net/s", timeout: 3000 },
    { name: "Ifconfig.me", url: "https://ifconfig.me/ip", timeout: 3000 },
    { name: "Amazon", url: "https://checkip.amazonaws.com", timeout: 3000 },
    { name: "Akamai", url: "http://whatismyip.akamai.com", timeout: 3000 }
  ];

  const tasks = sources.map(source => {
    return (async () => {
      try {
        const res = await axios.get(source.url, { 
          timeout: source.timeout, 
          headers: source.headers || {} 
        });
        let data = "";
        if (typeof res.data === 'object' && res.data.ip) {
          data = res.data.ip;
        } else {
          data = String(res.data).trim();
        }
        const ipMatch = data.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
        if (ipMatch) {
          return ipMatch[0];
        }
        throw new Error(`无效响应`);
      } catch (err) {
        throw err;
      }
    })();
  });

  try {
    const fastIp = await Promise.any(tasks);
    lastOutboundIp = fastIp;
    console.log(`[SYSTEM] 当前公网 IP 已确认: ${lastOutboundIp}`);
  } catch (e) {
    console.warn("[SYSTEM] 无法获取公网 IP，正在尝试获取本地 IP...");
    const interfaces = os.networkInterfaces();
    let localIp = "127.0.0.1";
    for (const k in interfaces) {
      const iface = interfaces[k];
      if (iface) {
        for (const address of iface) {
          if (address.family === "IPv4" && !address.internal) {
            localIp = address.address;
            break;
          }
        }
      }
      if (localIp !== "127.0.0.1") break;
    }
    lastOutboundIp = localIp;
    console.log(`[SYSTEM] 已回退至本地 IP: ${lastOutboundIp}`);
  }
}

// 3. 初始化与定时任务
updateOutboundIp();
setInterval(updateOutboundIp, 3600000); // 每小时更新一次

/**
 * 4. API 路由：获取当前 IP
 */
app.get("/api/system/ip", async (req, res) => {
  if (req.query.refresh === 'true') {
    await updateOutboundIp();
  }
  res.json({ ip: lastOutboundIp, hostname: serverHostname });
});

/**
 * 4.1 新增：参考用户要求的 IP 获取接口
 */
app.get("/api/server-info", async (req, res) => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    res.json({ 
      ip: data.ip,
      hostname: os.hostname()
    });
  } catch (error) {
    const interfaces = os.networkInterfaces();
    let localIp = "127.0.0.1";
    for (const k in interfaces) {
      const iface = interfaces[k];
      if (iface) {
        for (const address of iface) {
          if (address.family === "IPv4" && !address.internal) {
            localIp = address.address;
            break;
          }
        }
      }
      if (localIp !== "127.0.0.1") break;
    }
    res.json({ ip: localIp, hostname: os.hostname() });
  }
});

// Helper for Binance Signature (using CryptoJS as requested)
const getBinanceSignature = (queryString: string, secret: string) => {
  return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
};

/**
 * 5. Binance API Proxy
 */
// 新增：参考用户要求的 Proxy 接口
app.post("/api/binance-proxy", async (req, res) => {
  const { method, endpoint, params, apiKey, apiSecret } = req.body;

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: "Missing API credentials" });
  }

  try {
    const timestamp = Date.now();
    const baseParams = {
      ...(params || {}),
      timestamp: timestamp.toString(),
    };

    const queryString = new URLSearchParams(baseParams).toString();
    const signature = getBinanceSignature(queryString, apiSecret);
    
    const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const baseUrl = req.body.baseUrl || "https://fapi.binance.com";
    
    let url = `${baseUrl}${safeEndpoint}`;
    let options: RequestInit = {
      method: method || "GET",
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    };

    if (options.method === "POST" || options.method === "PUT" || options.method === "DELETE") {
      const bodyParams = new URLSearchParams({
        ...baseParams,
        signature: signature,
      });
      options.body = bodyParams.toString();
      options.headers = {
        ...options.headers,
        "Content-Type": "application/x-www-form-urlencoded",
      };
    } else {
      url += `?${queryString}&signature=${signature}`;
    }

    const response = await fetch(url, options);
    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(response.status).json({ 
        error: "Binance API returned a non-JSON response.",
        status: response.status,
        url: url,
        details: responseText.substring(0, 500)
      });
    }

    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// 保留原有的通配符 Proxy 接口以兼容前端
app.all("/api/binance/*", async (req, res) => {
  const apiKey = req.headers["x-mbx-apikey"] as string || process.env.BINANCE_API_KEY;
  const apiSecret = req.headers["x-mbx-apisecret"] as string || process.env.BINANCE_SECRET_KEY;
  let baseUrl = (req.headers["x-mbx-baseurl"] as string) || process.env.BINANCE_BASE_URL || "https://fapi.binance.com";
  
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  const endpoint = req.params[0];
  const method = req.method;
  const query = { ...req.query };
  const body = req.body;

  if (apiSecret && !query.timestamp) {
    query.timestamp = Date.now().toString();
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      params.append(key, String(val));
    }
  });

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
    
    // Binance 403 Fallback 逻辑
    if (status === 403 && baseUrl.includes("fapi.binance.com")) {
      const fallbackUrl = url.replace("fapi.binance.com", "fapi1.binance.com");
      try {
        const fallbackResponse = await axios({ ...axiosConfig, url: fallbackUrl });
        return res.json(fallbackResponse.data);
      } catch (fallbackError: any) {
        status = fallbackError.response?.status || status;
        data = fallbackError.response?.data || data;
      }
    }
    
    if (status === 401 || status === 403) {
      console.error(`[BINANCE ERROR ${status}] IP: ${lastOutboundIp} URL: ${url}`);
    }
    res.status(status).json(data);
  }
});

/**
 * 6. Email Notification (保留原逻辑)
 */
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
    auth: { user: SMTP_USER, pass: SMTP_PASS },
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

/**
 * 7. Server Start
 */
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

  // 监听 0.0.0.0 以允许外部访问
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Initial Outbound IP Check in progress...`);
  });
}

startServer();
