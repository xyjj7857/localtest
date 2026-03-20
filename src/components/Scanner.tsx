import React, { useState } from "react";
import { Search, Filter, ShieldAlert, CheckCircle2, Clock, ArrowRight, Activity } from "lucide-react";
import { motion } from "motion/react";

interface ScannerProps {
  symbols: Array<{
    symbol: string;
    stage: number;
    status: "PASS" | "FAIL" | "PENDING";
    reason?: string;
    metrics: {
      age: number;
      volatility: number;
      volume: number;
      change: number;
    };
  }>;
  currentStage: number;
  isScanning: boolean;
}

export const Scanner: React.FC<ScannerProps> = ({ symbols, currentStage, isScanning }) => {
  const [filter, setFilter] = useState<"ALL" | "PASS" | "FAIL">("ALL");

  const filteredSymbols = symbols.filter((s) => {
    if (filter === "ALL") return true;
    return s.status === filter;
  });

  const stages = [
    { id: 0, label: "静态初筛", desc: "上线时长过滤" },
    { id: 1, label: "波动率过滤", desc: "Stage 0P 风险排除" },
    { id: 2, label: "基础指标", desc: "Stage 1 成交额/涨跌幅" },
    { id: 3, label: "形态锁定", desc: "Stage 2 实时形态优选" },
  ];

  return (
    <div className="flex h-full flex-col bg-zinc-50 text-zinc-900">
      {/* Header & Progress */}
      <div className="border-b border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-600 p-2 text-white">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-zinc-900">市场扫描引擎</h2>
              <p className="text-xs text-zinc-400 uppercase tracking-widest">Market Scanning Engine v2.4</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-bold text-zinc-500 ring-1 ring-zinc-200">
              <Activity className={`h-3 w-3 ${isScanning ? "animate-pulse text-emerald-600" : "text-zinc-400"}`} />
              {isScanning ? "正在执行实时扫描..." : "扫描引擎待命"}
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-900 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">显示全部</option>
              <option value="PASS">仅显示通过</option>
              <option value="FAIL">仅显示淘汰</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`relative rounded-xl border p-4 transition-all ${
                currentStage === stage.id
                  ? "border-emerald-500/50 bg-emerald-50 ring-1 ring-emerald-500/20"
                  : currentStage > stage.id
                  ? "border-zinc-200 bg-zinc-100/50"
                  : "border-zinc-100 bg-white opacity-50"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Stage 0{stage.id}</span>
                {currentStage > stage.id && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                {currentStage === stage.id && <Clock className="h-3 w-3 animate-spin text-emerald-600" />}
              </div>
              <h3 className={`text-sm font-bold ${currentStage === stage.id ? "text-zinc-900" : "text-zinc-400"}`}>{stage.label}</h3>
              <p className="text-[10px] text-zinc-500">{stage.desc}</p>
              {currentStage === stage.id && (
                <motion.div
                  layoutId="active-stage"
                  className="absolute -bottom-px left-4 right-4 h-0.5 bg-emerald-600"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Results Table */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400">
                <th className="px-6 py-4 font-bold">币种对</th>
                <th className="px-6 py-4 font-bold">当前阶段</th>
                <th className="px-6 py-4 font-bold">状态</th>
                <th className="px-6 py-4 font-bold">核心指标</th>
                <th className="px-6 py-4 font-bold">淘汰原因</th>
                <th className="px-6 py-4 font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filteredSymbols.map((s) => (
                <tr key={s.symbol} className="group transition-colors hover:bg-zinc-50">
                  <td className="px-6 py-4">
                    <span className="font-black text-zinc-900">{s.symbol}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500">STAGE {s.stage}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {s.status === "PASS" ? (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="font-bold">通过</span>
                        </div>
                      ) : s.status === "FAIL" ? (
                        <div className="flex items-center gap-1.5 text-red-600">
                          <ShieldAlert className="h-3 w-3" />
                          <span className="font-bold">淘汰</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <Clock className="h-3 w-3 animate-spin" />
                          <span className="font-bold">等待</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-4 font-mono text-[10px]">
                      <span title="上线时长">AGE: {s.metrics.age}</span>
                      <span title="波动率" className={s.metrics.volatility > 5 ? "text-red-500" : "text-zinc-400"}>VOL: {s.metrics.volatility.toFixed(2)}%</span>
                      <span title="成交额">M: {(s.metrics.volume / 1000000).toFixed(1)}M</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-zinc-400 italic">{s.reason || "-"}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="rounded p-1 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-900">
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSymbols.length === 0 && (
            <div className="flex h-64 flex-col items-center justify-center text-zinc-400">
              <Filter className="mb-2 h-12 w-12 opacity-10" />
              <p className="text-xs uppercase tracking-widest">暂无匹配数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
