export interface BinanceSettings {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  wsUrl: string;
}

export interface SupabaseSettings {
  projectUrl: string;
  publishableKey: string;
  connectionString: string;
  tableName: string;
}

export interface ScannerSettings {
  stage0: {
    enabled: boolean;
    interval: string;
    startTime: string;
    klinePeriod: string;
    minKlines: number;
    maxKlines: number;
    customScanMinutes: number;
  };
  stage0P: {
    enabled: boolean;
    interval: string;
    startTime: string;
    check15m: { enabled: boolean; count: number; threshold: number };
    check1h: { enabled: boolean; count: number; threshold: number };
    check4h: { enabled: boolean; count: number; threshold: number };
    check1d: { enabled: boolean; count: number; threshold: number };
  };
  stage1: {
    enabled: boolean;
    interval: string;
    startTime: string;
    minVolumeM1: number;
    k1Range: { enabled: boolean; range: [number, number] };
    whitelist: string[];
    blacklist: string[];
  };
  stage2: {
    enabled: boolean;
    interval: string;
    startTime: string;
    cooldown: number;
    k2Range: { enabled: boolean; range: [number, number] };
    aRange: { enabled: boolean; range: [number, number] };
    mRange: { enabled: boolean; range: [number, number] };
    k5Range: { enabled: boolean; range: [number, number] };
    kbRange: { enabled: boolean; range: [number, number] };
  };
}

export interface OrderSettings {
  leverage: number;
  positionRatio: number;
  maxPositionUsdt: number;
  tpRatio: number;
  slRatio: number;
  orderWindowSeconds: number;
  maxHoldMinutes: number;
  kOptimalPeriod: string;
  kOptimalWindow: [number, number];
}

export interface EmailSettings {
  enabled: boolean;
  fromEmail: string;
  toEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpPass: string;
  balanceThreshold: number;
  consecutiveLossThreshold: number;
}

export interface SecuritySettings {
  lockPassword: string;
  autoLockMinutes: number;
}

export interface AppSettings {
  binance: BinanceSettings;
  supabase: SupabaseSettings;
  scanner: ScannerSettings;
  order: OrderSettings;
  email: EmailSettings;
  security: SecuritySettings;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  module: string;
}

export interface TradeReport {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  pnl?: number;
  entryTime: number;
  exitTime?: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
}

export interface SymbolData {
  symbol: string;
  price: number;
  change15m: number;
  volume15m: number;
  high15m: number;
  low15m: number;
  open15m: number;
  lastUpdate: number;
}
