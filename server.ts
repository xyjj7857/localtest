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
  const PORT = 3000;

  app.use(express.json());

  // Helper for Binance Signature
  const getSignature = (queryString: string, secret: string) => {
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
  };

  // API routes
  app.get("/api/server-info", async (req, res) => {
    const publicIpUrl = 'https://api.ipify.org?format=json';
    let publicIp = "Unknown";
    let publicIpStatus = 0;
    let publicIpError = null;

    try {
      console.log(`[SYSTEM] Executing public IP fetch: GET ${publicIpUrl}`);
      const response = await axios.get(publicIpUrl, { 
        timeout: 5000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      publicIp = response.data.ip;
      publicIpStatus = response.status;
      console.log(`[SYSTEM] Public IP fetch success. Status: ${publicIpStatus}, IP: ${publicIp}`);
    } catch (e: any) {
      publicIpStatus = e.response?.status || 500;
      publicIpError = e.message;
      console.error(`[SYSTEM] Public IP fetch failed. Status: ${publicIpStatus}, Error: ${publicIpError}`);
    }
    
    try {
      // Get local IP
      const interfaces = os.networkInterfaces();
      let localIp = "127.0.0.1";
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

      res.json({ 
        ip: publicIp,
        localIp: localIp,
        hostname: os.hostname(),
        debug: {
          publicIpFetch: {
            command: `GET ${publicIpUrl}`,
            status: publicIpStatus,
            error: publicIpError
          }
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get server info" });
    }
  });

  // Binance Proxy
  app.all("/api/binance/*", async (req, res) => {
    const apiPath = req.params[0];
    const method = req.method;
    const apiKey = req.headers["x-mbx-apikey"] as string;
    const apiSecret = req.headers["x-mbx-apisecret"] as string;
    const baseUrl = req.headers["x-mbx-baseurl"] as string || "https://fapi.binance.com";

    // Public endpoints don't need API key/secret
    const isPublic = apiPath.includes("exchangeInfo") || apiPath.includes("klines") || apiPath.includes("ticker");

    if (!isPublic && (!apiKey || !apiSecret)) {
      return res.status(401).json({ error: "API Key and Secret are required for private endpoints" });
    }

    try {
      let fullUrl = `${baseUrl}/${apiPath}`;
      let queryString = "";
      
      const queryParams: any = { ...req.query };
      
      if (!isPublic) {
        queryParams.timestamp = Date.now();
        queryString = Object.entries(queryParams)
          .map(([key, val]) => `${key}=${encodeURIComponent(String(val))}`)
          .join("&");
        const signature = getSignature(queryString, apiSecret);
        fullUrl = `${fullUrl}?${queryString}&signature=${signature}`;
      } else {
        queryString = Object.entries(queryParams)
          .map(([key, val]) => `${key}=${encodeURIComponent(String(val))}`)
          .join("&");
        if (queryString) {
          fullUrl = `${fullUrl}?${queryString}`;
        }
      }

      const headers: any = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      };

      if (method !== "GET" && method !== "DELETE") {
        headers["Content-Type"] = "application/json";
      }

      if (!isPublic) {
        headers["X-MBX-APIKEY"] = apiKey;
      }

      const response = await axios({
        method,
        url: fullUrl,
        headers,
        data: (method === "GET" || method === "DELETE") ? undefined : req.body,
        timeout: 15000,
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error(`Binance Proxy Error [${apiPath}]:`, error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    
    // Log local IP for user reference
    const interfaces = os.networkInterfaces();
    for (const k in interfaces) {
      const networkInterface = interfaces[k];
      if (networkInterface) {
        for (const address of networkInterface) {
          if (address.family === 'IPv4' && !address.internal) {
            console.log(`Local IP: http://${address.address}:${PORT}`);
          }
        }
      }
    }
  });
}

startServer();
