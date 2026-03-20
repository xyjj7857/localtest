import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  Search, 
  Zap, 
  History, 
  ShieldCheck, 
  AlertCircle,
  Play,
  Square,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  Download,
  Upload,
  FileSpreadsheet,
  Timer,
  Activity,
  LogOut,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

type Tab = 'dashboard' | 'api' | 'market' | 'strategy' | 'orders' | 'exit' | 'logs';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isRunning, setIsRunning] = useState(false);
  const [isBalanceRefreshing, setIsBalanceRefreshing] = useState(true);
  const [settings, setSettings] = useState<any>({});
  const [keys, setKeys] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [tradeLogs, setTradeLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ todayPnL: 0, winRate: '0.0', totalTrades: 0 });
  const [outboundIp, setOutboundIp] = useState<string>('正在获取...');
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const [orderReadyStatus, setOrderReadyStatus] = useState<{ready: boolean, timestamp: number, symbol: string}>({ready: false, timestamp: 0, symbol: ''});
  const [accountBalance, setAccountBalance] = useState<{ 
    balance: string, 
    positions: any[],
    active: boolean,
    totalUnrealizedProfit?: number
  }>({ 
    balance: '0.00', 
    positions: [],
    active: false 
  });

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    let ws: WebSocket;
    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        try {
          const { type } = JSON.parse(event.data);
          if (type === 'USER_DATA') {
            // Real-time update for account balance and positions
            fetchBalance();
            fetchStats();
            fetchLogs();
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchSettings();
    fetchKeys();
    fetchBalance();
    fetchLogs();
    fetchStats();
    fetchIp();
    fetchOrderReadyStatus();
    const interval = setInterval(() => {
      fetchLogs();
      if (isBalanceRefreshing) fetchBalance();
      fetchStats();
      fetchIp();
      fetchOrderReadyStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [isBalanceRefreshing]);

  const fetchOrderReadyStatus = async () => {
    try {
      const res = await fetch('/api/strategy/order-status');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setOrderReadyStatus(data);
      } else {
        console.error("获取订单就绪状态失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取订单就绪状态失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/trading/status');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setIsRunning(data.enabled);
      } else {
        console.error("获取交易状态失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取交易状态失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setSettings(data);
      } else {
        console.error("获取设置失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取设置失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setKeys(data);
      } else {
        console.error("获取 API 密钥失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取 API 密钥失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchBalance = async () => {
    try {
      const res = await fetch('/api/account/status');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setAccountBalance({ 
          balance: data.balance || '0.00', 
          positions: data.positions || [],
          active: data.active || false,
          totalUnrealizedProfit: data.totalUnrealizedProfit || 0
        });
      } else {
        console.error("获取账户状态失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取账户状态失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setStats(data);
      } else {
        console.error("获取统计数据失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取统计数据失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchIp = async (refresh = false) => {
    try {
      const res = await fetch(`/api/system/ip${refresh ? '?refresh=true' : ''}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setOutboundIp(data.ip);
      } else {
        console.error("获取 IP 失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取 IP 失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchLogs = async () => {
    try {
      const [sysRes, tradesRes] = await Promise.all([
        fetch('/api/logs/system'),
        fetch('/api/logs/trades')
      ]);

      const processLogResponse = async (res: Response, name: string) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          throw new Error(`${name} Invalid response format: ${text.substring(0, 100)}`);
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(`${name} Server Error: ${data.error || res.statusText}`);
        }
        return data;
      };

      const [sys, trades] = await Promise.all([
        processLogResponse(sysRes, "System Logs"),
        processLogResponse(tradesRes, "Trade Logs")
      ]);

      setSystemLogs(sys);
      setTradeLogs(trades);
    } catch (e: any) {
      console.error("获取日志失败:", e.message || e);
    }
  };

  const toggleTrading = async (forceEnabled?: any) => {
    const enabled = (typeof forceEnabled === 'boolean') ? forceEnabled : !isRunning;
    try {
      const res = await fetch('/api/trading/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setIsRunning(data.enabled);
      } else {
        console.error("切换交易状态失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("切换交易状态失败 (Network/Parse Error):", e.message || e);
    }
  };

  const saveSetting = async (key: string, value: any) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        let errorMsg = res.statusText;
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        }
        console.error(`保存设置 ${key} 失败:`, errorMsg);
      } else {
        fetchSettings();
      }
    } catch (e: any) {
      console.error(`保存设置 ${key} 网络错误:`, e.message || e);
    }
  };

  const navItems = [
    { id: 'dashboard', label: '控制面板', icon: LayoutDashboard },
    { id: 'api', label: 'API 配置', icon: ShieldCheck },
    { id: 'market', label: '市场扫描', icon: Search },
    { id: 'strategy', label: '策略分析', icon: Zap },
    { id: 'orders', label: '进场模块', icon: RefreshCw },
    { id: 'exit', label: '出场模块', icon: LogOut },
    { id: 'logs', label: '运行日志', icon: History },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#141414] border-r border-white/5 z-50">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">BNB Trader</h1>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  activeTab === item.id 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 w-full p-6 border-t border-white/5">
          <div className="mb-4 px-4 py-2 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between group">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">本地 IP (需绑定币安)</span>
              <span className="text-xs font-mono text-emerald-400/80">{outboundIp}</span>
            </div>
            <button 
              onClick={() => copyToClipboard(outboundIp)}
              className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-zinc-500 hover:text-white"
              title="复制 IP"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {navItems.find(n => n.id === activeTab)?.label}
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              {isRunning ? '系统运行中 - 正在实时监控市场' : '系统已就绪 - 请配置参数后启动'}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-[#141414] rounded-lg border border-white/5">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                {isRunning ? 'Trading Active' : 'Trading Stopped'}
              </span>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && (
              <DashboardView 
                tradeLogs={tradeLogs} 
                balance={accountBalance.balance} 
                positions={accountBalance.positions} 
                stats={stats} 
                totalUnrealizedProfit={accountBalance.totalUnrealizedProfit || 0}
              />
            )}
            {activeTab === 'api' && <ApiConfigView keys={keys} onRefresh={fetchKeys} balance={accountBalance} onUpdateBalance={(b, a) => setAccountBalance({ balance: b, positions: [], active: a })} onRefreshStatus={fetchBalance} isRunning={isRunning} onToggleTrading={toggleTrading} isBalanceRefreshing={isBalanceRefreshing} onToggleBalanceRefresh={() => setIsBalanceRefreshing(!isBalanceRefreshing)} onRefreshIp={() => fetchIp(true)} />}
            {activeTab === 'market' && <MarketScanView settings={settings} onSave={saveSetting} />}
            {activeTab === 'strategy' && <StrategyView settings={settings} onSave={saveSetting} />}
            {activeTab === 'orders' && <EntryConfigView settings={settings} onSave={saveSetting} orderReadyStatus={orderReadyStatus} isRunning={isRunning} onToggleTrading={toggleTrading} positions={accountBalance.positions} />}
            {activeTab === 'exit' && <ExitConfigView settings={settings} onSave={saveSetting} positions={accountBalance.positions} />}
            {activeTab === 'logs' && <LogsView systemLogs={systemLogs} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function PositionsDisplay({ positions, title = "实时持仓" }: { positions: any[], title?: string }) {
  const [showPositions, setShowPositions] = useState(true);
  const [confirmingSymbol, setConfirmingSymbol] = useState<string | null>(null);
  const confirmTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCloseClick = async (symbol: string) => {
    // If not already confirming this symbol, enter confirmation state
    if (confirmingSymbol !== symbol) {
      setConfirmingSymbol(symbol);
      
      // Auto-reset after 3 seconds
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingSymbol(null);
      }, 3000);
      
      return;
    }

    // If already confirming, proceed with close
    setConfirmingSymbol(null);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);

    try {
      const response = await fetch('/api/trading/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMsg = response.statusText;
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        }
        console.error('手动平仓失败:', errorMsg);
      }
    } catch (e: any) {
      console.error('平仓网络错误:', e.message || e);
    }
  };

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden shadow-xl">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg">
            <LayoutDashboard className="w-4 h-4 text-emerald-500" />
          </div>
          <h4 className="text-sm font-bold text-zinc-300">{title}</h4>
        </div>
        <button 
          onClick={() => setShowPositions(!showPositions)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-2 ${showPositions ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-zinc-500 hover:text-white'}`}
        >
          {showPositions ? '收起持仓' : '展开持仓'}
        </button>
      </div>
      
      <AnimatePresence>
        {showPositions && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-0">
              {positions.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 italic text-sm">暂无活跃持仓</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-black/40 text-zinc-500 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-medium">合约</th>
                        <th className="px-6 py-4 font-medium">方向</th>
                        <th className="px-6 py-4 font-medium">持仓量</th>
                        <th className="px-6 py-4 font-medium">开仓价</th>
                        <th className="px-6 py-4 font-medium">标记价</th>
                        <th className="px-6 py-4 font-medium">未实现盈亏</th>
                        <th className="px-6 py-4 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {positions.map((pos, i) => {
                        const amt = parseFloat(pos.positionAmt || pos.amt || "0");
                        const unRealizedProfit = parseFloat(pos.unRealizedProfit || pos.unrealizedProfit || "0");
                        const entryPrice = parseFloat(pos.entryPrice || "0");
                        const markPrice = parseFloat(pos.markPrice || "0");
                        const isLong = amt > 0;
                        const isConfirming = confirmingSymbol === pos.symbol;

                        return (
                          <tr key={i} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-bold text-white">{pos.symbol}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold ${isLong ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                {isLong ? '做多' : '做空'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-zinc-300">{Math.abs(amt)}</td>
                            <td className="px-6 py-4 text-zinc-400">{entryPrice.toFixed(4)}</td>
                            <td className="px-6 py-4 text-zinc-400">{markPrice.toFixed(4)}</td>
                            <td className={`px-6 py-4 font-bold ${unRealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {unRealizedProfit.toFixed(2)} USDT
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleCloseClick(pos.symbol)}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition-all border ${
                                  isConfirming 
                                  ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse' 
                                  : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500 hover:text-white'
                                }`}
                              >
                                {isConfirming ? '确认平仓?' : '市价平仓'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DashboardView({ tradeLogs, balance, positions, stats, totalUnrealizedProfit }: { tradeLogs: any[], balance: string, positions: any[], stats: any, totalUnrealizedProfit: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '账户余额', value: parseFloat(String(balance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 }), unit: 'USDT', color: 'text-white' },
            { label: '未实现盈亏', value: totalUnrealizedProfit >= 0 ? '+' + totalUnrealizedProfit.toFixed(2) : totalUnrealizedProfit.toFixed(2), unit: 'USDT', color: totalUnrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: '今日已实现', value: (parseFloat(String(stats.todayPnL || 0)) >= 0 ? '+' : '') + parseFloat(String(stats.todayPnL || 0)).toFixed(2), unit: 'USDT', color: parseFloat(String(stats.todayPnL || 0)) >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: '近一月胜率', value: parseFloat(String(stats.winRate || 0)).toFixed(1), unit: '%', color: 'text-white' },
          ].map((stat, i) => (
            <div key={i} className="bg-[#141414] p-6 rounded-2xl border border-white/5">
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">{stat.label}</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                <span className="text-zinc-500 text-xs">{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Real-time Positions Display on Dashboard */}
        <PositionsDisplay positions={positions} title="实时持仓" />

      </div>

      <div className="space-y-6">
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-6">
          <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-zinc-400">交易统计 (近30天)</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 text-sm">总成交笔数</span>
              <span className="font-mono text-white">{stats.totalTrades}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 text-sm">胜率</span>
              <span className="font-mono text-emerald-400">{parseFloat(String(stats.winRate || 0)).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-[#141414] rounded-2xl border border-white/5 p-6">
          <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-zinc-400">系统状态</h3>
          <div className="space-y-4">
            {[
              { label: 'API 连接', status: '正常', color: 'text-emerald-400' },
              { label: '市场扫描', status: '进行中', color: 'text-emerald-400' },
              { label: '策略引擎', status: '待机', color: 'text-zinc-500' },
              { label: '数据库', status: '正常', color: 'text-emerald-400' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">{item.label}</span>
                <span className={`font-medium ${item.color}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiConfigView({ keys, onRefresh, balance, onUpdateBalance, onRefreshStatus, isRunning, onToggleTrading, isBalanceRefreshing, onToggleBalanceRefresh, onRefreshIp }: { keys: any[], onRefresh: () => void, balance: { balance: string, positions: any[], active: boolean }, onUpdateBalance: (b: any, a: boolean) => void, onRefreshStatus: () => void, isRunning: boolean, onToggleTrading: (enabled: boolean) => void, isBalanceRefreshing: boolean, onToggleBalanceRefresh: () => void, onRefreshIp: () => void }) {
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAdd = async () => {
    if (!name || !apiKey || !secretKey) return;
    setLoading(true);
    onRefreshIp();
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, api_key: apiKey, secret_key: secretKey })
      });
      const data = await res.json();
      
      if (res.ok) {
        setName('');
        setApiKey('');
        setSecretKey('');
        const isFirst = keys.length === 0;
        if (data.balances) onUpdateBalance(data.balances.futures, isFirst);
        onRefresh();
        onRefreshStatus();
        // Auto-start trading loop on successful save
        onToggleTrading(true);
      } else {
        alert(data.error || '添加失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
        onRefreshStatus();
        setDeletingId(null);
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } catch (e) {
      alert('网络错误，请重试');
    }
  };

  const handleActivate = async (id: number) => {
    try {
      const res = await fetch(`/api/keys/activate/${id}`, { method: 'POST' });
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        if (data.balances) onUpdateBalance(data.balances.futures, true);
        onRefresh();
        onRefreshStatus();
      } else {
        console.error("激活 API 密钥失败 (Server Error):", data.error || res.statusText);
        alert(`激活失败: ${data.error || res.statusText}`);
      }
    } catch (e: any) {
      console.error("激活 API 密钥失败 (Network/Parse Error):", e.message || e);
      alert(`激活网络错误: ${e.message || e}`);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await onRefreshStatus();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <div className="max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold">已保存账号 (最多3个)</h3>
          </div>
          <div className="divide-y divide-white/5">
            {keys.map((key) => (
              <div key={key.id} className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 ${key.is_active ? 'bg-emerald-500/10' : 'bg-white/5'} rounded-full flex items-center justify-center`}>
                    <ShieldCheck className={`w-5 h-5 ${key.is_active ? 'text-emerald-500' : 'text-zinc-500'}`} />
                  </div>
                  <div>
                    <p className="font-bold">{key.name}</p>
                    <p className="text-xs text-zinc-500 font-mono">**** **** **** {key.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {key.is_active ? (
                    <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded">使用中</span>
                  ) : (
                    <button 
                      onClick={() => handleActivate(key.id)}
                      className="text-xs bg-white/5 text-zinc-400 px-2 py-1 rounded hover:bg-white/10"
                    >
                      激活
                    </button>
                  )}
                  
                  {deletingId == key.id ? (
                    <div className="flex items-center gap-2 bg-red-500/10 p-1 rounded-lg border border-red-500/20">
                      <span className="text-[10px] text-red-400 font-bold px-1">确定删除?</span>
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(key.id);
                        }}
                        className="text-[10px] bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 font-bold transition-colors"
                      >
                        确认
                      </button>
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeletingId(null);
                        }}
                        className="text-[10px] bg-white/10 text-zinc-300 px-2 py-1 rounded hover:bg-white/20 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletingId(key.id);
                      }}
                      className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                      title="删除账号"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {keys.length === 0 && (
              <div className="p-12 text-center text-zinc-500">暂无保存的账号</div>
            )}
          </div>
        </div>

        {/* API Troubleshooting Section */}
        <div className="bg-amber-500/5 rounded-2xl border border-amber-500/20 p-6 space-y-4">
          <div className="flex items-center gap-3 text-amber-500">
            <AlertCircle className="w-5 h-5" />
            <h4 className="font-bold">API 常见问题排查</h4>
          </div>
          <div className="space-y-3 text-sm text-zinc-400">
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</div>
              <p><span className="text-zinc-200 font-bold">IP 限制错误：</span> 如果提示 "Invalid API-key, IP, or permissions"，请确保在币安 API 设置中勾选了 <span className="text-amber-500">"限制只允许受信任的IP访问"</span> 并添加左下角的本地 IP。</p>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</div>
              <p><span className="text-zinc-200 font-bold">权限不足：</span> 请确保 API 密钥已开启 <span className="text-amber-500">"允许合约"</span> 权限。如果是新账号，可能需要先在币安手动开通合约账户。</p>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</div>
              <p><span className="text-zinc-200 font-bold">密钥错误：</span> 请检查 API Key 和 Secret Key 是否完整复制，不要包含多余的空格。</p>
            </div>
          </div>
        </div>

        <div className="bg-[#141414] p-8 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold mb-6">添加新账号</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">账号名称</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" 
                placeholder="例如: 主账号" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">API Key</label>
              <input 
                type="text" 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Secret Key</label>
              <input 
                type="password" 
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" 
              />
            </div>
            <button 
              onClick={handleAdd}
              disabled={loading}
              className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl hover:bg-emerald-400 transition-colors mt-4 disabled:opacity-50"
            >
              {loading ? '正在验证...' : '保存并验证'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[#141414] p-6 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">账户状态</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleBalanceRefresh}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  isBalanceRefreshing 
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20' 
                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/20'
                }`}
              >
                {isBalanceRefreshing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {isBalanceRefreshing ? '正在实时读取' : '已停止读取'}
              </button>
              <button 
                onClick={handleManualRefresh}
                disabled={refreshing}
                className={`p-2 text-zinc-500 hover:text-emerald-500 transition-all ${refreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <p className="text-zinc-500 text-xs mb-1">U本位合约余额 (USDT)</p>
              <p className="text-2xl font-bold text-white font-mono">
                {parseFloat(String(balance.balance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            
            <div className="pt-6 border-t border-white/5">
              <p className="text-zinc-500 text-xs mb-3 uppercase tracking-widest font-bold">当前持仓</p>
              <div className="space-y-3">
                {balance.positions.length > 0 ? (
                  balance.positions.map((pos, i) => (
                    <div key={i} className="bg-black/30 p-3 rounded-lg border border-white/5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-sm">{pos.symbol}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${parseFloat(pos.positionAmt) > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                          {parseFloat(pos.positionAmt) > 0 ? '做多' : '做空'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <p className="text-zinc-500">持仓量</p>
                          <p className="text-zinc-300 font-mono">{Math.abs(parseFloat(pos.positionAmt))}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">未实现盈亏</p>
                          <p className={`font-mono ${parseFloat(pos.unRealizedProfit) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {parseFloat(pos.unRealizedProfit).toFixed(2)} USDT
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-600 text-[10px] italic">暂无活跃持仓</p>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-zinc-500">API 状态</span>
                <span className={`${balance.active ? 'text-emerald-400' : 'text-red-400'} font-medium`}>
                  {balance.active ? '已连接' : '未连接'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">最后同步</span>
                <span className="text-zinc-400">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketScanView({ settings, onSave }: { settings: any, onSave: (key: string, value: any) => void }) {
  const DEFAULT_MARKET = { 
    mode: 'auto', 
    scanTime: '12:00', 
    scanPeriod: 12, 
    filterStart: 150000, 
    filterEnd: 500, 
    filterPeriod: 15, 
    whiteList: '', 
    blackList: '' 
  };
  const market = { ...DEFAULT_MARKET, ...(settings.market || {}) };
  const [isRunning, setIsRunning] = useState(false);
  const [form1Data, setForm1Data] = useState<any[]>([]);
  const [targetData, setTargetData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<string>('--:--:--');
  const [filterCountdown, setFilterCountdown] = useState<string>('--:--');
  const [showWhiteList, setShowWhiteList] = useState(false);
  const [showBlackList, setShowBlackList] = useState(false);
  const [nextFilterRun, setNextFilterRun] = useState<number>(0);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);

  useEffect(() => {
    fetchStatus();
    fetchData();
    const dataInterval = setInterval(fetchData, 10000);
    const statusInterval = setInterval(fetchStatus, 10000); // Fetch status every 10s instead of 1s
    
    const timerInterval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      updateCountdownLocal();
    }, 1000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(statusInterval);
      clearInterval(timerInterval);
    };
  }, [market.scanTime, market.scanPeriod, isRunning, nextFilterRun, serverTimeOffset]);

  const updateCountdownLocal = () => {
    const now = Date.now();
    const currentServerTime = now + serverTimeOffset;

    // Filter Countdown
    if (nextFilterRun > 0) {
      const diff = nextFilterRun - currentServerTime;
      if (diff > 0) {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setFilterCountdown(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      } else {
        setFilterCountdown('00:00');
      }
    }

    // Scan Countdown
    if (!isRunning || !market.scanTime || !market.scanTime.includes(':')) {
      setCountdown('--:--:--');
      return;
    }

    const [h, m] = market.scanTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) {
      setCountdown('--:--:--');
      return;
    }

    const next = new Date(currentServerTime);
    next.setHours(h, m, 0, 0);

    while (next.getTime() <= currentServerTime) {
      next.setHours(next.getHours() + (market.scanPeriod || 1));
    }

    const diff = next.getTime() - currentServerTime;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    setCountdown(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/market/status');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setIsRunning(data.enabled);
        setNextFilterRun(data.nextFilterRun);
        setServerTimeOffset(data.serverTime - Date.now());
      } else {
        console.error("获取市场扫描状态失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("获取市场扫描状态失败 (Network/Parse Error):", e.message || e);
    }
  };

  const fetchData = async () => {
    try {
      const [f1Res, targetRes] = await Promise.all([
        fetch('/api/market/form1'),
        fetch('/api/market/target')
      ]);

      const processMarketResponse = async (res: Response, name: string) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          throw new Error(`${name} Invalid response format: ${text.substring(0, 100)}`);
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(`${name} Server Error: ${data.error || res.statusText}`);
        }
        return data;
      };

      const [f1, target] = await Promise.all([
        processMarketResponse(f1Res, "Form1 Data"),
        processMarketResponse(targetRes, "Target Data")
      ]);

      setForm1Data(f1);
      setTargetData(target);
    } catch (e: any) {
      console.error("获取市场数据失败:", e.message || e);
    }
  };

  const toggleScanning = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/market/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isRunning })
      });
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setIsRunning(data.enabled);
        fetchData();
      } else {
        console.error("切换扫描状态失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("切换扫描状态失败 (Network/Parse Error):", e.message || e);
    } finally {
      setLoading(false);
    }
  };

  const updateMarket = (field: string, value: any) => {
    onSave('market', { ...market, [field]: value });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      
      const symbols = data.flat().filter(s => typeof s === 'string' && s.includes('USDT'));
      
      if (symbols.length > 0) {
        try {
          const res = await fetch('/api/market/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols })
          });
          if (res.ok) {
            fetchData();
            alert(`成功导入 ${symbols.length} 个币种`);
          } else {
            const contentType = res.headers.get("content-type");
            let errorMsg = res.statusText;
            if (contentType && contentType.includes("application/json")) {
              const data = await res.json();
              errorMsg = data.error || errorMsg;
            }
            alert(`导入失败: ${errorMsg}`);
          }
        } catch (e: any) {
          alert(`导入网络错误: ${e.message || e}`);
        }
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-[#141414] p-8 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">市场扫描配置</h3>
            <button
              onClick={toggleScanning}
              disabled={loading}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all ${
                isRunning 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' 
                  : 'bg-emerald-500 text-black hover:bg-emerald-400'
              }`}
            >
              {isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {isRunning ? '停止扫描' : '启动扫描'}
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div 
                onClick={() => updateMarket('mode', 'auto')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  market.mode === 'auto' ? 'bg-emerald-500/5 border-emerald-500/50' : 'bg-black/40 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">全市场扫描</span>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${market.mode === 'auto' ? 'border-emerald-500' : 'border-zinc-600'}`}>
                    {market.mode === 'auto' && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                  </div>
                </div>
                <p className="text-xs text-zinc-500">自动从币安获取全部USDT永续合约</p>
              </div>

              <div 
                onClick={() => updateMarket('mode', 'manual')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  market.mode === 'manual' ? 'bg-emerald-500/5 border-emerald-500/50' : 'bg-black/40 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">手动上传表单</span>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${market.mode === 'manual' ? 'border-emerald-500' : 'border-zinc-600'}`}>
                    {market.mode === 'manual' && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                  </div>
                </div>
                <p className="text-xs text-zinc-500">通过上传 .xlsx 文件指定目标币种</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setShowWhiteList(!showWhiteList)}
                className={`py-2 rounded-xl border font-bold transition-all ${showWhiteList ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : 'bg-black/40 border-white/5 text-zinc-400'}`}
              >
                {showWhiteList ? '隐藏白名单' : '编辑白名单'}
              </button>
              <button 
                onClick={() => setShowBlackList(!showBlackList)}
                className={`py-2 rounded-xl border font-bold transition-all ${showBlackList ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-black/40 border-white/5 text-zinc-400'}`}
              >
                {showBlackList ? '隐藏黑名单' : '编辑黑名单'}
              </button>
            </div>

            <AnimatePresence>
              {showWhiteList && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">白名单 (逗号分隔)</label>
                  <textarea 
                    value={market.whiteList || ''}
                    onChange={e => updateMarket('whiteList', e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 text-xs min-h-[80px]" 
                    placeholder="例如: BTCUSDT, ETHUSDT"
                  />
                </motion.div>
              )}
              {showBlackList && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">黑名单 (逗号分隔)</label>
                  <textarea 
                    value={market.blackList || ''}
                    onChange={e => updateMarket('blackList', e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500/50 text-xs min-h-[80px]" 
                    placeholder="例如: PEPEUSDT, DOGEUSDT"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {market.mode === 'auto' ? (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">开启时间 (HH:mm:00)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={market.scanTime || '00:00'}
                      onChange={e => {
                        const val = e.target.value;
                        // Permissive regex for typing HH:mm
                        if (/^([0-2]?\d?)(:([0-5]?\d?)?)?$/.test(val) && val.length <= 5) {
                          updateMarket('scanTime', val);
                        }
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(val)) {
                          updateMarket('scanTime', '00:00');
                        }
                      }}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 font-mono" 
                      placeholder="10:00"
                    />
                    {isRunning && (
                      <div className="mt-2 flex items-center gap-2 text-[10px]">
                        <span className="text-zinc-500">下次扫描倒计时:</span>
                        <span className="text-emerald-500 font-mono font-bold">{countdown}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">扫描周期 (小时)</label>
                  <input 
                    type="number" 
                    value={market.scanPeriod || 1}
                    onChange={e => updateMarket('scanPeriod', parseInt(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50" 
                  />
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="relative block border-2 border-dashed border-white/10 rounded-2xl p-8 text-center hover:border-emerald-500/50 transition-colors cursor-pointer group">
                  <input type="file" accept=".xlsx" className="hidden" onChange={handleFileUpload} />
                  <Upload className="w-8 h-8 text-zinc-600 group-hover:text-emerald-500 mx-auto mb-2 transition-colors" />
                  <p className="text-zinc-400 font-medium">点击上传 .xlsx 目标表单</p>
                </label>
              </div>
            )}

            {market.mode === 'auto' && (
              <div className="pt-6 border-t border-white/5">
                <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-500" />
                  币对筛选参数 (T-900x 到 T-900y)
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">起始点 x</label>
                    <input 
                      type="number" 
                      value={market.filterStart ?? 150000}
                      onChange={e => updateMarket('filterStart', parseInt(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">终止点 y</label>
                    <input 
                      type="number" 
                      value={market.filterEnd ?? 500}
                      onChange={e => updateMarket('filterEnd', parseInt(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">筛选周期 z (分)</label>
                    <input 
                      type="number" 
                      value={market.filterPeriod ?? 15}
                      onChange={e => updateMarket('filterPeriod', parseInt(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50" 
                    />
                  </div>
                </div>
                <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                      <Timer className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">距离下一次币对筛选</p>
                      <p className="text-xl font-mono font-bold text-emerald-500">{filterCountdown}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">当前状态</p>
                    <p className="text-xs font-bold text-zinc-300">{isRunning ? '正在运行' : '已停止'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#141414] p-6 rounded-2xl border border-white/5">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">扫描统计</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">初选市场 (Form 1)</span>
                <span className="text-lg font-bold font-mono">{form1Data.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">目标市场 (Target)</span>
                <span className="text-lg font-bold font-mono text-emerald-400">{targetData.length}</span>
              </div>
              <div className="pt-4 border-t border-white/5 space-y-2">
                <a 
                  href="/api/market/download/form1" 
                  className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-xs"
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> 下载初选表单 1</span>
                  <Download className="w-3 h-3" />
                </a>
                <a 
                  href="/api/market/download/target" 
                  className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-xs"
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-500" /> 下载目标表单</span>
                  <Download className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-black/20 flex items-center justify-between">
            <h4 className="text-sm font-bold">初选市场缓存 (Form 1)</h4>
            <span className="text-[10px] text-zinc-500">按扫描周期更新</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#141414] text-zinc-500 uppercase text-[10px] tracking-wider border-b border-white/5">
                <tr>
                  <th className="px-4 py-3">币种</th>
                  <th className="px-4 py-3">上线时间</th>
                  <th className="px-4 py-3">Unix时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {form1Data.slice(0, 50).map((item, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-bold text-zinc-200">{item.symbol}</td>
                    <td className="px-4 py-3 text-zinc-400">{item.onboard_date}</td>
                    <td className="px-4 py-3 text-zinc-500">{item.onboard_time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-black/20 flex items-center justify-between">
            <h4 className="text-sm font-bold text-emerald-400">目标市场表单</h4>
            <span className="text-[10px] text-zinc-500">按筛选周期更新</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#141414] text-zinc-500 uppercase text-[10px] tracking-wider border-b border-white/5">
                <tr>
                  <th className="px-4 py-3">币种</th>
                  <th className="px-4 py-3">上线时间</th>
                  <th className="px-4 py-3">Unix时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {targetData.map((item, i) => (
                  <tr key={i} className="hover:bg-emerald-500/5">
                    <td className="px-4 py-3 font-bold text-emerald-400">{item.symbol}</td>
                    <td className="px-4 py-3 text-zinc-400">{item.onboard_date}</td>
                    <td className="px-4 py-3 text-zinc-500">{item.onboard_time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyView({ settings, onSave }: { settings: any, onSave: (key: string, value: any) => void }) {
  const DEFAULT_STRATEGY = {
    p1_trigger_min: 14, p1_trigger_sec: 30, p1_trigger_ms: 0,
    p1_k_min: 2, p1_k_max: 10, p1_m_min: 500000, p1_m_max: 10000000000,
    p2_trigger_min: 14, p2_trigger_sec: 56, p2_trigger_ms: 0,
    p2_k_min: 4, p2_k_max: 8, p2_m_min: 1000000, p2_m_max: 10000000000,
    p2_shadow_enabled: true, p2_shadow_min: 0.01, p2_shadow_max: 3,
    p2_btc_enabled: true, p2_btc_min: 0.5, p2_btc_max: 15,
    p2_k5m_enabled: true, p2_k5m_min: 0.5, p2_k5m_max: 7,
    p2_max_pos_enabled: true,
    p2_cooldown_enabled: true, p2_cooldown_min: 30
  };

  const [strategyState, setStrategyState] = useState(settings.strategy || DEFAULT_STRATEGY);
  const [isStrategyEnabled, setIsStrategyEnabled] = useState(false);
  const [temp1, setTemp1] = useState<any[]>([]);
  const [temp2, setTemp2] = useState<any[]>([]);
  const [p1Countdown, setP1Countdown] = useState('--:--');
  const [p2Countdown, setP2Countdown] = useState('--:--');
  const [showP1Settings, setShowP1Settings] = useState(false);
  const [showP2Settings, setShowP2Settings] = useState(false);
  const [showTemp1, setShowTemp1] = useState(false);
  const [showTemp2, setShowTemp2] = useState(false);

  useEffect(() => {
    if (settings.strategy && Object.keys(settings.strategy).length > 0) {
      setStrategyState(settings.strategy);
    }
  }, [settings.strategy]);

  const [p1Trigger, setP1Trigger] = useState<number>(0);
  const [p2Trigger, setP2Trigger] = useState<number>(0);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/strategy/status');
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }
        const status = await res.json();
        if (res.ok) {
          setIsStrategyEnabled(status.enabled);
          setP1Trigger(status.nextPhase1Trigger);
          setP2Trigger(status.nextPhase2Trigger);
          setServerTimeOffset(status.serverTime - Date.now());
        } else {
          console.error("获取策略状态失败 (Server Error):", status.error || res.statusText);
        }
      } catch (e: any) {
        console.error("获取策略状态失败 (Network/Parse Error):", e.message || e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleStrategy = async () => {
    try {
      const res = await fetch('/api/strategy/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isStrategyEnabled })
      });
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      if (res.ok) {
        setIsStrategyEnabled(data.enabled);
        // Refresh triggers immediately after toggle
        const statusRes = await fetch('/api/strategy/status');
        if (statusRes.ok) {
          const status = await statusRes.json();
          setP1Trigger(status.nextPhase1Trigger);
          setP2Trigger(status.nextPhase2Trigger);
        }
      } else {
        console.error("切换策略状态失败 (Server Error):", data.error || res.statusText);
      }
    } catch (e: any) {
      console.error("切换策略状态失败 (Network/Parse Error):", e.message || e);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [t1Res, t2Res] = await Promise.all([
          fetch('/api/strategy/temp1'),
          fetch('/api/strategy/temp2')
        ]);

        const processTempResponse = async (res: Response, name: string) => {
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            throw new Error(`${name} Invalid response format: ${text.substring(0, 100)}`);
          }
          const data = await res.json();
          if (!res.ok) {
            throw new Error(`${name} Server Error: ${data.error || res.statusText}`);
          }
          return data;
        };

        const [t1, t2] = await Promise.all([
          processTempResponse(t1Res, "Temp1 Data"),
          processTempResponse(t2Res, "Temp2 Data")
        ]);

        setTemp1(t1);
        setTemp2(t2);
      } catch (e: any) {
        console.error("获取策略临时数据失败:", e.message || e);
      }
    };

    fetchData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateCountdowns = () => {
      if (document.visibilityState === 'hidden') return;

      const now = Date.now() + serverTimeOffset;

      const formatDiff = (diff: number) => {
        if (!isStrategyEnabled) return '--:--';
        if (diff <= 0) return '00:00';
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      };

      setP1Countdown(formatDiff(p1Trigger - now));
      setP2Countdown(formatDiff(p2Trigger - now));
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000); // 1000ms instead of 500ms
    return () => clearInterval(interval);
  }, [isStrategyEnabled, p1Trigger, p2Trigger, serverTimeOffset]);

  const updateLocalStrategy = (field: string, value: any) => {
    setStrategyState((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave('strategy', strategyState);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-[#141414] p-6 rounded-2xl border border-white/5 shadow-lg shadow-black/20">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl transition-all duration-500 ${isStrategyEnabled ? 'bg-emerald-500/20 text-emerald-500 shadow-lg shadow-emerald-500/10' : 'bg-zinc-500/10 text-zinc-500'}`}>
            <Zap className={`w-6 h-6 ${isStrategyEnabled ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">策略分析模块控制</h3>
            <p className="text-xs text-zinc-500">独立控制策略执行逻辑，遵循15分钟绝对周期</p>
          </div>
        </div>
        <button 
          onClick={toggleStrategy}
          className={`px-8 py-3 rounded-xl font-bold transition-all duration-300 ${isStrategyEnabled ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'}`}
        >
          {isStrategyEnabled ? '停止策略分析' : '启动策略分析'}
        </button>
      </div>

      {/* Phase 1 Section */}
      <div className="bg-[#141414] p-8 rounded-2xl border border-white/5">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Zap className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">一阶段初选 (15m K线)</h3>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">周期: 15分钟绝对时间</p>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <button 
                onClick={() => setShowP1Settings(!showP1Settings)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showP1Settings ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
              >
                <Settings className="w-3.5 h-3.5" />
                {showP1Settings ? '收起参数' : '参数设置'}
              </button>
              {showP1Settings && (
                <button 
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-emerald-500 text-black text-xs font-bold rounded-lg hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  保存设置
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <Timer className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] text-zinc-500 font-bold uppercase">筛选倒计时:</span>
            <span className="text-sm font-mono font-bold text-emerald-500">{p1Countdown}</span>
            <div className={`ml-2 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${isStrategyEnabled ? 'bg-emerald-500/20 text-emerald-500 animate-pulse' : 'bg-zinc-500/20 text-zinc-500'}`}>
              {isStrategyEnabled ? '正在运行' : '已停止'}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showP1Settings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 p-6 bg-black/20 rounded-2xl border border-white/5">
                <div className="md:col-span-4 flex items-center gap-4 border-b border-white/5 pb-4 mb-2">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">发起时间设置 (相对于15m周期起点)</label>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-600 uppercase mb-1 text-center">分</span>
                      <input 
                        type="number" 
                        value={strategyState.p1_trigger_min || 0}
                        onChange={e => updateLocalStrategy('p1_trigger_min', parseInt(e.target.value))}
                        className="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs w-14 text-center focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                    <span className="text-zinc-600 self-end mb-2">:</span>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-600 uppercase mb-1 text-center">秒</span>
                      <input 
                        type="number" 
                        value={strategyState.p1_trigger_sec || 0}
                        onChange={e => updateLocalStrategy('p1_trigger_sec', parseInt(e.target.value))}
                        className="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs w-14 text-center focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                    <span className="text-zinc-600 self-end mb-2">:</span>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-600 uppercase mb-1 text-center">毫秒</span>
                      <input 
                        type="number" 
                        value={strategyState.p1_trigger_ms || 0}
                        onChange={e => updateLocalStrategy('p1_trigger_ms', parseInt(e.target.value))}
                        className="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs w-20 text-center focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">特征K下限 (%)</label>
                  <input 
                    type="number" 
                    value={strategyState.p1_k_min ?? ''}
                    onChange={e => updateLocalStrategy('p1_k_min', parseFloat(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">特征K上限 (%)</label>
                  <input 
                    type="number" 
                    value={strategyState.p1_k_max ?? ''}
                    onChange={e => updateLocalStrategy('p1_k_max', parseFloat(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">交易额下限 (USDT)</label>
                  <input 
                    type="number" 
                    value={strategyState.p1_m_min ?? ''}
                    onChange={e => updateLocalStrategy('p1_m_min', parseFloat(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">交易额上限 (USDT)</label>
                  <input 
                    type="number" 
                    value={strategyState.p1_m_max ?? ''}
                    onChange={e => updateLocalStrategy('p1_m_max', parseFloat(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors text-sm" 
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-black/40 rounded-xl border border-white/5 overflow-hidden">
          <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">临时表 1 (初选结果)</span>
              <span className="text-[10px] text-zinc-600 font-mono">{temp1.length} 个币种</span>
            </div>
            <button 
              onClick={() => setShowTemp1(!showTemp1)}
              className="px-2 py-1 bg-white/5 text-zinc-400 text-[10px] font-bold rounded hover:bg-white/10 transition-colors"
            >
              {showTemp1 ? '隐藏表单' : '展示表单'}
            </button>
          </div>
          <AnimatePresence>
            {showTemp1 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="max-h-[200px] overflow-y-auto">
                  {temp1.length === 0 ? (
                    <div className="p-8 text-center text-zinc-600 text-xs italic">暂无数据</div>
                  ) : (
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-black/20 text-zinc-500 uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-3 py-2">币种</th>
                          <th className="px-3 py-2 text-right">K (%)</th>
                          <th className="px-3 py-2 text-right">成交额 (M)</th>
                          <th className="px-3 py-2 text-right">Open</th>
                          <th className="px-3 py-2 text-right">High</th>
                          <th className="px-3 py-2 text-right">Low</th>
                          <th className="px-3 py-2 text-right">Close</th>
                          <th className="px-3 py-2 text-right">更新时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {temp1.map((item, i) => (
                          <tr key={i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-2 font-bold text-zinc-300">{item.symbol}</td>
                            <td className={`px-3 py-2 text-right ${item.k >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.k.toFixed(2)}%</td>
                            <td className="px-3 py-2 text-right text-zinc-400">{(item.m / 1000000).toFixed(2)}M</td>
                            <td className="px-3 py-2 text-right text-zinc-500">{item.open?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-zinc-500">{item.high?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-zinc-500">{item.low?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-zinc-300 font-bold">{item.close?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-zinc-600">{new Date(item.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Phase 2 Section */}
      <div className="bg-[#141414] p-8 rounded-2xl border border-white/5">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">二阶段细化分析</h3>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">目标: 过滤临时表 1</p>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <button 
                onClick={() => setShowP2Settings(!showP2Settings)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showP2Settings ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
              >
                <Settings className="w-3.5 h-3.5" />
                {showP2Settings ? '收起参数' : '参数设置'}
              </button>
              {showP2Settings && (
                <button 
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-emerald-500 text-black text-xs font-bold rounded-lg hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  保存设置
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <Timer className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] text-zinc-500 font-bold uppercase">细化分析倒计时:</span>
            <span className="text-sm font-mono font-bold text-emerald-500">{p2Countdown}</span>
            <div className={`ml-2 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${isStrategyEnabled ? 'bg-emerald-500/20 text-emerald-500 animate-pulse' : 'bg-zinc-500/20 text-zinc-500'}`}>
              {isStrategyEnabled ? '正在运行' : '已停止'}
            </div>
          </div>
        </div>
        
        <AnimatePresence>
          {showP2Settings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-6 bg-black/20 rounded-2xl border border-white/5 mb-6">
                <div className="flex items-center gap-4 border-b border-white/5 pb-4 mb-6">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">发起时间设置 (相对于15m周期起点)</label>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-600 uppercase mb-1 text-center">分</span>
                      <input 
                        type="number" 
                        value={strategyState.p2_trigger_min || 0}
                        onChange={e => updateLocalStrategy('p2_trigger_min', parseInt(e.target.value))}
                        className="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs w-14 text-center focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                    <span className="text-zinc-600 self-end mb-2">:</span>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-600 uppercase mb-1 text-center">秒</span>
                      <input 
                        type="number" 
                        value={strategyState.p2_trigger_sec || 0}
                        onChange={e => updateLocalStrategy('p2_trigger_sec', parseInt(e.target.value))}
                        className="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs w-14 text-center focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                    <span className="text-zinc-600 self-end mb-2">:</span>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-600 uppercase mb-1 text-center">毫秒</span>
                      <input 
                        type="number" 
                        value={strategyState.p2_trigger_ms || 0}
                        onChange={e => updateLocalStrategy('p2_trigger_ms', parseInt(e.target.value))}
                        className="bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs w-20 text-center focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-6">
                    <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] border-b border-emerald-500/20 pb-2">1. 基础指标 (必要)</h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] text-zinc-500 mb-1 font-bold uppercase">K值下限 %</label>
                          <input 
                            type="number" 
                            value={strategyState.p2_k_min ?? ''}
                            onChange={e => updateLocalStrategy('p2_k_min', parseFloat(e.target.value))}
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 text-sm" 
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-500 mb-1 font-bold uppercase">K值上限 %</label>
                          <input 
                            type="number" 
                            value={strategyState.p2_k_max ?? ''}
                            onChange={e => updateLocalStrategy('p2_k_max', parseFloat(e.target.value))}
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 text-sm" 
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] text-zinc-500 mb-1 font-bold uppercase">成交额下限 (USDT)</label>
                          <input 
                            type="number" 
                            value={strategyState.p2_m_min ?? ''}
                            onChange={e => updateLocalStrategy('p2_m_min', parseFloat(e.target.value))}
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 text-sm" 
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-500 mb-1 font-bold uppercase">成交额上限 (USDT)</label>
                          <input 
                            type="number" 
                            value={strategyState.p2_m_max ?? ''}
                            onChange={e => updateLocalStrategy('p2_m_max', parseFloat(e.target.value))}
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 text-sm" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] border-b border-emerald-500/20 pb-2">2. 高级过滤 (可选)</h4>
                    <div className="space-y-4">
                      <div className="p-4 bg-black/30 border border-white/5 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">时间筛选过滤 [x, y] min</span>
                          <input 
                            type="checkbox" 
                            checked={strategyState.p2_time_filter_enabled || false}
                            onChange={e => updateLocalStrategy('p2_time_filter_enabled', e.target.checked)}
                            className="accent-emerald-500 w-4 h-4" 
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">x</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_time_filter_x ?? ''}
                              onChange={e => updateLocalStrategy('p2_time_filter_x', parseInt(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="x" 
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">y</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_time_filter_y ?? ''}
                              onChange={e => updateLocalStrategy('p2_time_filter_y', parseInt(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="y" 
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">n</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_time_filter_n ?? ''}
                              onChange={e => updateLocalStrategy('p2_time_filter_n', parseInt(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="n" 
                            />
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-black/30 border border-white/5 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">上影线 a [a1, a2] %</span>
                          <input 
                            type="checkbox" 
                            checked={strategyState.p2_shadow_enabled || false}
                            onChange={e => updateLocalStrategy('p2_shadow_enabled', e.target.checked)}
                            className="accent-emerald-500 w-4 h-4" 
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">下限 a1</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_shadow_min ?? ''}
                              onChange={e => updateLocalStrategy('p2_shadow_min', parseFloat(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="a1" 
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">上限 a2</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_shadow_max ?? ''}
                              onChange={e => updateLocalStrategy('p2_shadow_max', parseFloat(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="a2" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] border-b border-emerald-500/20 pb-2">3. 关联与限制 (可选)</h4>
                    <div className="space-y-4">
                      <div className="p-4 bg-black/30 border border-white/5 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">BTC 涨幅验证 %</span>
                          <input 
                            type="checkbox" 
                            checked={strategyState.p2_btc_enabled || false}
                            onChange={e => updateLocalStrategy('p2_btc_enabled', e.target.checked)}
                            className="accent-emerald-500 w-4 h-4" 
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">kbtc1</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_btc_min ?? ''}
                              onChange={e => updateLocalStrategy('p2_btc_min', parseFloat(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="kbtc1" 
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">kbtc2</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_btc_max ?? ''}
                              onChange={e => updateLocalStrategy('p2_btc_max', parseFloat(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="kbtc2" 
                            />
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-black/30 border border-white/5 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">5m 涨幅验证 %</span>
                          <input 
                            type="checkbox" 
                            checked={strategyState.p2_k5m_enabled || false}
                            onChange={e => updateLocalStrategy('p2_k5m_enabled', e.target.checked)}
                            className="accent-emerald-500 w-4 h-4" 
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">k5m1</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_k5m_min ?? ''}
                              onChange={e => updateLocalStrategy('p2_k5m_min', parseFloat(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="k5m1" 
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-zinc-600 text-center mb-1">k5m2</span>
                            <input 
                              type="number" 
                              value={strategyState.p2_k5m_max ?? ''}
                              onChange={e => updateLocalStrategy('p2_k5m_max', parseFloat(e.target.value))}
                              className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="k5m2" 
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-black/30 border border-white/5 rounded-xl">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">最大持仓单限制 (1)</span>
                        <input 
                          type="checkbox" 
                          checked={strategyState.p2_max_pos_enabled || false}
                          onChange={e => updateLocalStrategy('p2_max_pos_enabled', e.target.checked)}
                          className="accent-emerald-500 w-4 h-4" 
                        />
                      </div>

                      <div className="p-4 bg-black/30 border border-white/5 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">同币种下单冷却期 (min)</span>
                          <input 
                            type="checkbox" 
                            checked={strategyState.p2_cooldown_enabled || false}
                            onChange={e => updateLocalStrategy('p2_cooldown_enabled', e.target.checked)}
                            className="accent-emerald-500 w-4 h-4" 
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-zinc-600 text-center mb-1">冷却时间 (x)</span>
                          <input 
                            type="number" 
                            value={strategyState.p2_cooldown_min ?? ''}
                            onChange={e => updateLocalStrategy('p2_cooldown_min', parseFloat(e.target.value))}
                            className="bg-black border border-white/10 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500/50" placeholder="x" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-black/40 rounded-xl border border-white/5 overflow-hidden">
          <div className="px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">临时表 2 (细化分析结果)</span>
              <span className="text-[10px] text-emerald-600 font-mono">{temp2.length} 个币种</span>
            </div>
            <button 
              onClick={() => setShowTemp2(!showTemp2)}
              className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded hover:bg-emerald-500/20 transition-colors"
            >
              {showTemp2 ? '隐藏表单' : '展示表单'}
            </button>
          </div>
          <AnimatePresence>
            {showTemp2 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="max-h-[200px] overflow-y-auto">
                  {temp2.length === 0 ? (
                    <div className="p-8 text-center text-zinc-600 text-xs italic">暂无数据</div>
                  ) : (
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-black/20 text-zinc-500 uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-3 py-2">币种</th>
                          <th className="px-3 py-2 text-right">K (%)</th>
                          <th className="px-3 py-2 text-right">成交额 (M)</th>
                          <th className="px-3 py-2 text-right">Open</th>
                          <th className="px-3 py-2 text-right">High</th>
                          <th className="px-3 py-2 text-right">Low</th>
                          <th className="px-3 py-2 text-right">Close</th>
                          <th className="px-3 py-2 text-right">更新时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {temp2.map((item, i) => (
                          <tr key={i} className="hover:bg-emerald-500/5 transition-colors">
                            <td className="px-3 py-2 font-bold text-emerald-400">{item.symbol}</td>
                            <td className={`px-3 py-2 text-right ${item.k >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.k.toFixed(2)}%</td>
                            <td className="px-3 py-2 text-right text-zinc-400">{(item.m / 1000000).toFixed(2)}M</td>
                            <td className="px-3 py-2 text-right text-zinc-500">{item.open?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-zinc-500">{item.high?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-zinc-500">{item.low?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-emerald-300 font-bold">{item.close?.toFixed(4)}</td>
                            <td className="px-3 py-2 text-right text-zinc-600">{new Date(item.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function EntryConfigView({ settings, onSave, orderReadyStatus, isRunning, onToggleTrading, positions }: { settings: any, onSave: (key: string, value: any) => void, orderReadyStatus: any, isRunning: boolean, onToggleTrading: (force?: boolean) => void, positions: any[] }) {
  const order = settings.order || {
    delay_ms: 2500,
    leverage: 5,
    positionSize: 20,
    maxCap: 1000
  };
  const [showOrderSettings, setShowOrderSettings] = useState(false);
  const [showPositions, setShowPositions] = useState(true);

  const updateOrder = (field: string, value: any) => {
    onSave('order', { ...order, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* Order Readiness Status */}
      {orderReadyStatus.ready && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center animate-pulse">
              <Zap className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-500">已经准备好下单了</h3>
              <p className="text-sm text-zinc-400">
                目标币种: <span className="text-white font-mono font-bold">{orderReadyStatus.symbol}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1">准备就绪时间 (T)</div>
            <div className="text-xl font-mono font-bold text-white">
              {orderReadyStatus.timestamp ? new Date(orderReadyStatus.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--'}
              <span className="text-sm text-zinc-500 ml-1">
                .{orderReadyStatus.timestamp ? String(orderReadyStatus.timestamp % 1000).padStart(3, '0') : '000'}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Module Control */}
      <div className="flex items-center justify-between bg-[#141414] p-6 rounded-2xl border border-white/5 shadow-lg shadow-black/20">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl transition-all duration-500 ${isRunning ? 'bg-emerald-500/20 text-emerald-500 shadow-lg shadow-emerald-500/10' : 'bg-zinc-500/10 text-zinc-500'}`}>
            <RefreshCw className={`w-6 h-6 ${isRunning ? 'animate-spin-slow' : ''}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">进场控制</h3>
            <p className="text-xs text-zinc-500">控制自动进场策略的执行状态</p>
          </div>
        </div>
        <button 
          onClick={() => onToggleTrading()}
          className={`px-8 py-3 rounded-xl font-bold transition-all duration-300 ${isRunning ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'}`}
        >
          {isRunning ? '停止进场' : '启动进场'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
            <h3 className="text-sm font-bold">进场参数配置</h3>
            <button 
              onClick={() => setShowOrderSettings(!showOrderSettings)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showOrderSettings ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-zinc-500 hover:text-white'}`}
            >
              <Settings className={`w-3.5 h-3.5 transition-transform ${showOrderSettings ? 'rotate-90' : ''}`} />
              {showOrderSettings ? '收起设置' : '参数设置'}
            </button>
          </div>
          
          <AnimatePresence>
            {showOrderSettings && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-6 space-y-6 bg-black/40">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">下单延时自定义</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={order.delay_ms ?? ''}
                        onChange={e => updateOrder('delay_ms', parseInt(e.target.value))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 font-mono" 
                        placeholder="[xxx] 毫秒" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-bold">MS</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">杠杆倍数</label>
                      <input 
                        type="number" 
                        value={order.leverage || ''}
                        onChange={e => updateOrder('leverage', parseInt(e.target.value))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50" 
                        placeholder="20" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">仓位比例 (%)</label>
                      <input 
                        type="number" 
                        value={order.positionSize || ''}
                        onChange={e => updateOrder('positionSize', parseInt(e.target.value))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50" 
                        placeholder="10" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">合约上限 (USDT)</label>
                    <input 
                      type="number" 
                      value={order.maxCap || ''}
                      onChange={e => updateOrder('maxCap', parseFloat(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50" 
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Real-time Positions Display */}
      <PositionsDisplay positions={positions} title="实时持仓" />
    </div>
  );
}

function ExitConfigView({ settings, onSave, positions }: { settings: any, onSave: (key: string, value: any) => void, positions: any[] }) {
  const exit = settings.exit || {
    tp_ratio: 45,
    sl_ratio: 85
  };
  const [showExitSettings, setShowExitSettings] = useState(true);

  const updateExit = (field: string, value: any) => {
    onSave('exit', { ...exit, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* Exit Module Configuration */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-orange-500/10 rounded-lg">
              <LogOut className="w-4 h-4 text-orange-500" />
            </div>
            <h3 className="text-sm font-bold">出场模块配置</h3>
          </div>
          <button 
            onClick={() => setShowExitSettings(!showExitSettings)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showExitSettings ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-white/5 text-zinc-500 hover:text-white'}`}
          >
            <Settings className={`w-3.5 h-3.5 transition-transform ${showExitSettings ? 'rotate-90' : ''}`} />
            {showExitSettings ? '收起设置' : '参数设置'}
          </button>
        </div>
        
        <AnimatePresence>
          {showExitSettings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-6 space-y-6 bg-black/40">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">反向单价格参数 (x %)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.01"
                        value={exit.tp_ratio ?? ''}
                        onChange={e => updateExit('tp_ratio', parseFloat(e.target.value))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50 font-mono" 
                        placeholder="[x] %" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-bold">%</span>
                    </div>
                    <p className="mt-1.5 text-[10px] text-zinc-500 italic">价格 = 开仓价 * (1 + x% * k)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">市场出场价格参数 (y %)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.01"
                        value={exit.sl_ratio ?? ''}
                        onChange={e => updateExit('sl_ratio', parseFloat(e.target.value))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50 font-mono" 
                        placeholder="[y] %" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-bold">%</span>
                    </div>
                    <p className="mt-1.5 text-[10px] text-zinc-500 italic">触发 = 标记价 ≤ 开仓价 * (1 - y% * k)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">最大持仓时间 (t 分钟)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={exit.maxTime ?? ''}
                        onChange={e => updateExit('maxTime', parseInt(e.target.value))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50 font-mono" 
                        placeholder="[t] 分钟" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-bold">MIN</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">持仓单校验周期 (t1 毫秒)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="100"
                        value={exit.checkInterval ?? ''}
                        onChange={e => updateExit('checkInterval', parseInt(e.target.value))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500/50 font-mono" 
                        placeholder="[t1] 毫秒" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-bold">MS</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Real-time Positions Display */}
      <PositionsDisplay positions={positions} title="实时持仓" />
    </div>
  );
}

function LogsView({ systemLogs }: { systemLogs: any[] }) {
  return (
    <div className="space-y-6">
      <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-bold">系统运行日志</h3>
          <button className="text-xs text-emerald-500 hover:underline">清空日志</button>
        </div>
        <div className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/40 text-zinc-500 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">时间</th>
                <th className="px-6 py-4 font-medium">级别</th>
                <th className="px-6 py-4 font-medium">消息</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {systemLogs.map((log, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.level === 'INFO' ? 'bg-emerald-500/10 text-emerald-500' : 
                      log.level === 'ERROR' ? 'bg-red-500/10 text-red-500' :
                      'bg-zinc-500/10 text-zinc-400'
                    }`}>
                      {log.level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-300">{log.message}</td>
                </tr>
              ))}
              {systemLogs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-zinc-500">暂无日志</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
