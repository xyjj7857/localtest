import React from "react";
import { BarChart3, TrendingUp, TrendingDown, Download, Filter, Calendar, DollarSign, Activity } from "lucide-react";
import { TradeReport } from "../types";
import { format } from "date-fns";

interface ReportsProps {
  reports: TradeReport[];
}

export const Reports: React.FC<ReportsProps> = ({ reports }) => {
  const totalPnL = reports.reduce((acc, r) => acc + (r.pnl || 0), 0);
  const winRate = reports.length > 0 ? (reports.filter((r) => (r.pnl || 0) > 0).length / reports.length) * 100 : 0;

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-600 p-2 text-white shadow-lg shadow-emerald-600/20">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-900">交易报表</h2>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Trading Performance & Reports</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-200">
            <Download className="h-3 w-3" />
            导出报表
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatBox label="总盈亏" value={`${totalPnL.toFixed(2)} USDT`} icon={DollarSign} color={totalPnL >= 0 ? "text-emerald-600" : "text-red-600"} />
          <StatBox label="胜率" value={`${winRate.toFixed(1)}%`} icon={Activity} color="text-emerald-600" />
          <StatBox label="交易单数" value={reports.length.toString()} icon={Calendar} color="text-zinc-900" />
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="px-6 py-4 font-bold">交易 ID</th>
                <th className="px-6 py-4 font-bold">币种对</th>
                <th className="px-6 py-4 font-bold">方向</th>
                <th className="px-6 py-4 font-bold">入场价</th>
                <th className="px-6 py-4 font-bold">出场价</th>
                <th className="px-6 py-4 font-bold">盈亏 (USDT)</th>
                <th className="px-6 py-4 font-bold">状态</th>
                <th className="px-6 py-4 font-bold">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {reports.map((r) => (
                <tr key={r.id} className="group transition-colors hover:bg-zinc-50">
                  <td className="px-6 py-4 font-mono text-zinc-400">{r.id.slice(0, 8)}</td>
                  <td className="px-6 py-4 font-black text-zinc-900">{r.symbol}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded px-1.5 py-0.5 font-bold ${r.side === "BUY" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                      {r.side}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-600">{r.entryPrice.toFixed(4)}</td>
                  <td className="px-6 py-4 font-mono text-zinc-600">{r.exitPrice?.toFixed(4) || "-"}</td>
                  <td className="px-6 py-4">
                    <span className={`font-mono font-bold ${r.pnl && r.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {r.pnl ? `${r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(2)}` : "-"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${r.status === "CLOSED" ? "bg-zinc-100 text-zinc-500 ring-zinc-200" : "bg-emerald-50 text-emerald-600 ring-emerald-200"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-400">{format(r.entryTime, "MM-dd HH:mm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {reports.length === 0 && (
            <div className="flex h-64 flex-col items-center justify-center text-zinc-300">
              <Calendar className="mb-2 h-12 w-12 opacity-10" />
              <p className="text-xs uppercase tracking-widest">暂无交易记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, icon: Icon, color }: any) => (
  <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
      <Icon className={`h-4 w-4 ${color}`} />
    </div>
    <div className={`text-2xl font-black ${color}`}>{value}</div>
  </div>
);
