import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import os from "os";
import CryptoJS from "crypto-js";

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
        for (const k2 in interfaces[k]!) {
          const address = interfaces[k][k2]!;
          if (address.family === "IPv4" && !address.internal) {
            localIp = address.address;
            break;
          }
        }
      }
      res.json({ ip: localIp, hostname: os.hostname() });
    }
  });

  // Binance Proxy Route
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
      const signature = getSignature(queryString, apiSecret);
      
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
        // For these methods, we can send params in the body
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
        // For GET, params must be in the query string
        url += `?${queryString}&signature=${signature}`;
      }

      console.log(`Proxying ${options.method} request to: ${url}`);

      const response = await fetch(url, options);

      const contentType = response.headers.get("content-type");
      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Binance non-JSON response from URL:", url);
        console.error("Response snippet:", responseText.substring(0, 500));
        return res.status(response.status).json({ 
          error: "Binance API returned a non-JSON response (likely an HTML error page).",
          status: response.status,
          url: url,
          details: responseText.substring(0, 500)
        });
      }

      res.status(response.status).json(data);
    } catch (error: any) {
      console.error("Binance Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
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
  });
}

startServer();
