import axios from "axios";
import { SymbolData } from "../types";

const API_BASE = "/api/binance";

const getHeaders = () => {
  const saved = localStorage.getItem("trading_settings");
  if (saved) {
    try {
      const settings = JSON.parse(saved);
      return {
        "X-MBX-APIKEY": settings.binance.apiKey,
        "X-MBX-APISECRET": settings.binance.secretKey,
        "X-MBX-BASEURL": settings.binance.baseUrl,
      };
    } catch (e) {
      console.error("Failed to parse settings for headers", e);
    }
  }
  return {};
};

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  config.headers = { ...config.headers, ...getHeaders() } as any;
  return config;
});

// Simple retry interceptor
api.interceptors.response.use(undefined, async (err) => {
  const { config, response } = err;
  if (!config || !config.retry) config.retry = 0;
  
  // Retry on network errors or 5xx errors, up to 3 times
  if (config.retry < 3 && (!response || response.status >= 500)) {
    config.retry += 1;
    const backoff = new Promise((resolve) => {
      setTimeout(() => resolve(null), config.retry * 1000);
    });
    await backoff;
    return api(config);
  }
  return Promise.reject(err);
});

export const binanceService = {
  async getExchangeInfo() {
    const response = await api.get(`/fapi/v1/exchangeInfo`);
    return response.data;
  },

  async getKlines(symbol: string, interval: string, limit: number = 100) {
    const response = await api.get(`/fapi/v1/klines`, {
      params: { symbol, interval, limit },
    });
    return response.data;
  },

  async getAccountInfo() {
    const response = await api.get(`/fapi/v2/account`);
    return response.data;
  },

  async getBalance() {
    const response = await api.get(`/fapi/v2/balance`);
    return response.data;
  },

  async getPositions() {
    const response = await api.get(`/fapi/v2/positionRisk`);
    return response.data;
  },

  async getOpenOrders(symbol?: string) {
    const response = await api.get(`/fapi/v1/openOrders`, {
      params: { symbol },
    });
    return response.data;
  },

  async placeOrder(params: any) {
    const response = await api.post(`/fapi/v1/order`, null, {
      params,
    });
    return response.data;
  },

  async cancelOrder(symbol: string, orderId: number) {
    const response = await api.delete(`/fapi/v1/order`, {
      params: { symbol, orderId },
    });
    return response.data;
  },

  async cancelAllOpenOrders(symbol: string) {
    const response = await api.delete(`/fapi/v1/allOpenOrders`, {
      params: { symbol },
    });
    return response.data;
  },

  async setLeverage(symbol: string, leverage: number) {
    const response = await api.post(`/fapi/v1/leverage`, null, {
      params: { symbol, leverage },
    });
    return response.data;
  },

  async setMarginType(symbol: string, marginType: "ISOLATED" | "CROSSED") {
    const response = await api.post(`/fapi/v1/marginType`, null, {
      params: { symbol, marginType },
    });
    return response.data;
  },
};

export class BinanceWS {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: (data: any) => void;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: any = null;
  private isManualClose = false;

  constructor(url: string, onMessage: (data: any) => void) {
    this.url = url;
    this.onMessage = onMessage;
    this.connect();
  }

  private connect() {
    this.isManualClose = false;
    // Ensure URL has /ws suffix if missing for stream connection
    const wsUrl = this.url.includes('/ws') ? this.url : `${this.url}/ws`;
    this.ws = new WebSocket(`${wsUrl}/!miniTicker@arr`);

    this.ws.onopen = () => {
      console.log("WebSocket Connected");
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (e) {
        console.error("WS Parse Error", e);
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.isManualClose) {
        this.reconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket Error", error);
      this.close(); // Use the robust close method
    };
  }

  private reconnect() {
    if (this.isManualClose) return; // Don't reconnect if manually closed
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`WebSocket Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error("Max WebSocket reconnection attempts reached");
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Binance doesn't require client-side ping for streams usually, 
        // but keeping connection active helps some proxies
        this.ws.send(JSON.stringify({ method: "LIST_SUBSCRIPTIONS", id: Date.now() }));
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public close() {
    this.isManualClose = true;
    this.stopHeartbeat();
    if (this.ws) {
      // Guard against closing a socket that isn't open or is already closing/closed
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close();
        } catch (e) {
          // Ignore errors during close
        }
      }
      this.ws = null;
    }
  }
}

export const createBinanceWS = (url: string, onMessage: (data: any) => void) => {
  return new BinanceWS(url, onMessage);
};
