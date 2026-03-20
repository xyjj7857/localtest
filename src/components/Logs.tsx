import React from "react";
import { Terminal, Info, AlertTriangle, XCircle, CheckCircle2, Search, Download } from "lucide-react";
import { LogEntry } from "../types";
import { format } from "date-fns";

interface LogsProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const Logs: React.FC<LogsProps> = ({ logs, onClear }) => {
  const getIcon = (level: LogEntry["level"]) => {
    switch (level) {
      case "info": return <Info className="h-3 w-3 text-blue-500" />;
      case "warn": return <AlertTriangle className="h-3 w-3 text-amber-500" />;
      case "error": return <XCircle className="h-3 w-3 text-red-500" />;
      case "success": return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    }
  };

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-600 p-2 text-white shadow-lg shadow-emerald-600/20">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-900">系统日志</h2>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">System Logs & Events</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-200">
            <Download className="h-3 w-3" />
            导出日志
          </button>
          <button
            onClick={onClear}
            className="flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-200"
          >
            清空日志
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        <div className="space-y-1">
          {logs.map((log) => (
            <div key={log.id} className="group flex items-start gap-3 rounded px-2 py-1 transition-colors hover:bg-zinc-50">
              <span className="shrink-0 text-zinc-400">[{format(log.timestamp, "HH:mm:ss.SSS")}]</span>
              <span className="shrink-0 uppercase tracking-widest text-zinc-400">[{log.module}]</span>
              <div className="mt-0.5 shrink-0">{getIcon(log.level)}</div>
              <span className={`flex-1 ${log.level === "error" ? "text-red-600" : log.level === "warn" ? "text-amber-600" : log.level === "success" ? "text-emerald-600" : "text-zinc-900"}`}>
                {log.message}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="flex h-64 flex-col items-center justify-center text-zinc-300">
              <Terminal className="mb-2 h-12 w-12 opacity-10" />
              <p className="text-xs uppercase tracking-widest">暂无日志记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
