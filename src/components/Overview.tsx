import React, { useState, useEffect } from "react";
import { Wallet, Activity, TrendingUp, TrendingDown, Clock, Globe, ShieldCheck, Zap, AlertCircle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import { motion } from "motion/react";
import { format } from "date-fns";

interface OverviewProps {
  accountBalance: number;
  availableBalance: number;
  unrealizedPnL: number;
  wsStatus: "OPEN" | "CLOSED" | "CONNECTING";
  apiStatus: "OK" | "ERROR" | "PENDING";
  lastUpdateTime: number;
  btcPrice: number;
  btcChange: number;
  bestSymbol: {
    symbol: string;
    price: number;
    change15m: number;
    volume15m: number;
    status: "PLACED" | "MISSED" | "EXPIRED" | "SCANNING";
    selectedTime: number;
  } | null;
  activePosition: {
    symbol: string;
    entryTime: number;
    value: number;
    pnl: number;
  } | null;
  activeOrders: Array<{
    id: string;
    type: string;
    price: number;
    side: string;
  }>;
}

export const Overview: React.FC<OverviewProps> = (props) => {
  const [btcHistory, setBtcHistory] = useState<any[]>([]);

  useEffect(() => {
    // Mock BTC history for visualization
    const history = Array.from({ length: 20 }, (_, i) => ({
      time: i,
      price: props.btcPrice * (1 + (Math.random() - 0.5) * 0.001),
    }));
    setBtcHistory(history);
  }, [props.btcPrice]);

  return (
    <div className="h-full overflow-y-auto bg-zinc-50 p-6 text-zinc-900">
      <div className="grid grid-cols-12 gap-6">
        {/* Account Overview */}
        <div className="col-span-12 grid grid-cols-1 gap-6 md:grid-cols-4">
          <StatCard
            label="账户总余额"
            value={`${props.accountBalance.toFixed(2)} USDT`}
            icon={Wallet}
            color="text-emerald-600"
            subValue={`可用: ${props.availableBalance.toFixed(2)}`}
          />
          <StatCard
            label="未实现盈亏"
            value={`${props.unrealizedPnL.toFixed(2)} USDT`}
            icon={props.unrealizedPnL >= 0 ? TrendingUp : TrendingDown}
            color={props.unrealizedPnL >= 0 ? "text-emerald-600" : "text-red-600"}
            subValue={props.activePosition ? `持仓: ${props.activePosition.symbol}` : "当前无持仓"}
          />
          <StatCard
            label="系统状态"
            value={props.wsStatus === "OPEN" ? "运行中" : "连接中"}
            icon={Activity}
            color={props.wsStatus === "OPEN" ? "text-emerald-600" : "text-amber-600"}
            subValue={`数据更新: ${props.lastUpdateTime}s 前`}
          />
          <StatCard
            label="BTC 实时行情"
            value={`$${props.btcPrice.toLocaleString()}`}
            icon={Zap}
            color="text-amber-600"
            subValue={`${props.btcChange >= 0 ? "+" : ""}${props.btcChange.toFixed(2)}% (15m)`}
          />
        </div>

        {/* Best Symbol Details */}
        <div className="col-span-12">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-zinc-400">优选币对详情</h3>
            {props.bestSymbol ? (
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-black text-zinc-900">{props.bestSymbol.symbol}</span>
                  <StatusBadge status={props.bestSymbol.status} />
                </div>
                <div className="grid flex-1 grid-cols-2 gap-8 md:grid-cols-4">
                  <DataPoint label="实时价格" value={props.bestSymbol.price.toFixed(4)} />
                  <DataPoint label="15m 涨跌" value={`${props.bestSymbol.change15m.toFixed(2)}%`} color={props.bestSymbol.change15m >= 0 ? "text-emerald-600" : "text-red-600"} />
                  <DataPoint label="成交额" value={`${(props.bestSymbol.volume15m / 1000000).toFixed(2)}M`} />
                  <DataPoint label="选定时间" value={format(props.bestSymbol.selectedTime, "HH:mm:ss.SSS")} />
                </div>
              </div>
            ) : (
              <div className="flex h-32 flex-col items-center justify-center text-zinc-400">
                <Search className="mb-2 h-8 w-8 opacity-20" />
                <span className="text-xs uppercase tracking-widest">正在扫描市场...</span>
              </div>
            )}
          </div>
        </div>

        {/* Active Position & Orders */}
        <div className="col-span-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-zinc-400">当前持仓 - 正向单</h3>
            {props.activePosition ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-3xl font-black text-zinc-900">{props.activePosition.symbol}</span>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400">
                      开仓时间: {format(props.activePosition.entryTime, "yyyy-MM-dd HH:mm:ss.SSS")}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${props.activePosition.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {props.activePosition.pnl >= 0 ? "+" : ""}{props.activePosition.pnl.toFixed(2)} USDT
                    </span>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400">未实现盈亏</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-400">持仓价值</span>
                    <p className="text-lg font-bold text-zinc-900">{props.activePosition.value.toFixed(2)} USDT</p>
                  </div>
                  <button className="flex items-center justify-center rounded-lg bg-zinc-100 px-6 font-bold text-zinc-600 transition-colors hover:bg-zinc-200">
                    导出 EXCEL
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-zinc-400">
                <span className="text-xs uppercase tracking-widest">当前无活跃仓位</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-zinc-400">当前委托 - 反向单</h3>
            <div className="space-y-2">
              {props.activeOrders.length > 0 ? (
                props.activeOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded p-1.5 ${order.type === "STOP_MARKET" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                        <Zap className="h-3 w-3" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-zinc-900">{order.type}</span>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-400">{order.side}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-zinc-900">{order.price.toFixed(4)}</span>
                      <p className="text-[10px] uppercase tracking-widest text-zinc-400">委托价格</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-32 items-center justify-center text-zinc-400">
                  <span className="text-xs uppercase tracking-widest">当前无挂单委托</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, color, subValue }: any) => (
  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300">
    <div className="mb-3 flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</span>
      <Icon className={`h-4 w-4 ${color}`} />
    </div>
    <div className="mb-1 text-xl font-black text-zinc-900">{value}</div>
    <div className="text-[10px] font-medium text-zinc-400">{subValue}</div>
  </div>
);

const DataPoint = ({ label, value, color = "text-zinc-900" }: any) => (
  <div>
    <span className="text-[10px] uppercase tracking-widest text-zinc-400">{label}</span>
    <p className={`font-mono text-sm font-bold ${color}`}>{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const configs: any = {
    PLACED: { label: "已下单", color: "bg-emerald-50 text-emerald-600 ring-emerald-600/20" },
    MISSED: { label: "错过窗口", color: "bg-amber-50 text-amber-600 ring-amber-600/20" },
    EXPIRED: { label: "已过期", color: "bg-zinc-50 text-zinc-500 ring-zinc-500/20" },
    SCANNING: { label: "扫描中", color: "bg-blue-50 text-blue-600 ring-blue-600/20" },
  };
  const config = configs[status] || configs.SCANNING;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${config.color}`}>
      {config.label}
    </span>
  );
};

const Search = (props: any) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
