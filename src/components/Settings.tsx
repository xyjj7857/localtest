import React, { useState } from "react";
import { Save, RefreshCw, Shield, Mail, Search, Zap, Key, Database, Globe } from "lucide-react";
import { AppSettings } from "../types";
import { motion } from "motion/react";

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onSync: () => void;
  onRefreshIp: () => void;
  defaultSettings: AppSettings;
  ipAddress: string;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onSave, onSync, onRefreshIp, defaultSettings, ipAddress }) => {
  const [activeTab, setActiveTab] = useState<"api" | "supabase" | "scanner" | "order" | "email" | "security">("api");
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  const handleReset = () => {
    if (window.confirm("确定要恢复默认设置吗？所有当前修改将被覆盖。")) {
      setLocalSettings(defaultSettings);
      onSave(defaultSettings);
    }
  };

  const handleChange = (path: string, value: any) => {
    const newSettings = { ...localSettings };
    const keys = path.split(".");
    let current: any = newSettings;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    setLocalSettings(newSettings);
  };

  const tabs = [
    { id: "api", label: "API 管理", icon: Key },
    { id: "supabase", label: "Supabase", icon: Database },
    { id: "scanner", label: "扫描设置", icon: Search },
    { id: "order", label: "仓单设置", icon: Zap },
    { id: "email", label: "邮件通知", icon: Mail },
    { id: "security", label: "安全设置", icon: Shield },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-600 p-2 text-white">
            <Database className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900">系统设置</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
            恢复默认
          </button>
          <button
            onClick={onSync}
            className="flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
            云端同步
          </button>
          <button
            onClick={() => onSave(localSettings)}
            className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
          >
            <Save className="h-4 w-4" />
            保存设置
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <div className="w-64 border-r border-zinc-200 bg-zinc-50 p-4">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10"
                    : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-3xl space-y-8"
          >
            {activeTab === "api" && (
              <div className="space-y-6">
                <SectionHeader title="Binance API 配置" description="配置您的币安 API 密钥以进行交易和行情获取" />
                
                {/* Server IP Info Box */}
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-emerald-100 p-1.5 text-emerald-600">
                        <Globe className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">服务器公网 IP (ECS Public IP)</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-bold text-emerald-600">{ipAddress}</p>
                          <button 
                            onClick={onRefreshIp}
                            className="rounded p-0.5 hover:bg-emerald-200 text-emerald-600 transition-colors"
                            title="刷新 IP"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-medium text-emerald-700/60">请将此 IP 添加至币安 API 白名单</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <Input
                    label="Binance API Key"
                    value={localSettings.binance.apiKey}
                    onChange={(v) => handleChange("binance.apiKey", v)}
                    type="password"
                  />
                  <Input
                    label="Binance Secret Key"
                    value={localSettings.binance.secretKey}
                    onChange={(v) => handleChange("binance.secretKey", v)}
                    type="password"
                  />
                  <Input
                    label="Base URL"
                    value={localSettings.binance.baseUrl}
                    onChange={(v) => handleChange("binance.baseUrl", v)}
                  />
                  <Input
                    label="WS URL"
                    value={localSettings.binance.wsUrl}
                    onChange={(v) => handleChange("binance.wsUrl", v)}
                  />
                </div>
              </div>
            )}

            {activeTab === "supabase" && (
              <div className="space-y-6">
                <SectionHeader title="Supabase 云端同步" description="连接 Supabase 数据库以同步设置和交易记录" />
                <div className="grid gap-4">
                  <Input
                    label="Project URL"
                    value={localSettings.supabase.projectUrl}
                    onChange={(v) => handleChange("supabase.projectUrl", v)}
                  />
                  <Input
                    label="Publishable Key"
                    value={localSettings.supabase.publishableKey}
                    onChange={(v) => handleChange("supabase.publishableKey", v)}
                    type="password"
                  />
                  <Input
                    label="Connection String"
                    value={localSettings.supabase.connectionString}
                    onChange={(v) => handleChange("supabase.connectionString", v)}
                    type="password"
                  />
                  <Input
                    label="Supa名称 (表名)"
                    value={localSettings.supabase.tableName}
                    onChange={(v) => handleChange("supabase.tableName", v)}
                  />
                </div>
              </div>
            )}

            {activeTab === "scanner" && (
              <div className="space-y-8 pb-12">
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                    <SectionHeader title="全市场扫描 (Stage 0)" description="初步筛选符合上线时长的币种" noBorder />
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={localSettings.scanner.stage0.enabled}
                        onChange={(e) => handleChange("scanner.stage0.enabled", e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">启用 Stage 0</span>
                    </div>
                  </div>
                  <div className={`mt-4 grid grid-cols-2 gap-4 transition-opacity ${localSettings.scanner.stage0.enabled ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                    <Input label="绝对周期" value={localSettings.scanner.stage0.interval} onChange={(v) => handleChange("scanner.stage0.interval", v)} />
                    <Input label="启动时间" value={localSettings.scanner.stage0.startTime} onChange={(v) => handleChange("scanner.stage0.startTime", v)} />
                    <Input label="K线周期" value={localSettings.scanner.stage0.klinePeriod} onChange={(v) => handleChange("scanner.stage0.klinePeriod", v)} />
                    <Input label="K线数量下限" value={localSettings.scanner.stage0.minKlines} onChange={(v) => handleChange("scanner.stage0.minKlines", Number(v))} type="number" />
                    <Input label="K线数量上限" value={localSettings.scanner.stage0.maxKlines} onChange={(v) => handleChange("scanner.stage0.maxKlines", Number(v))} type="number" />
                    <Input label="自定义扫描时长 (min)" value={localSettings.scanner.stage0.customScanMinutes} onChange={(v) => handleChange("scanner.stage0.customScanMinutes", Number(v))} type="number" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                    <SectionHeader title="波动率过滤 (Stage 0P)" description="排除近期波动过大的币种" noBorder />
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={localSettings.scanner.stage0P.enabled}
                        onChange={(e) => handleChange("scanner.stage0P.enabled", e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">启用 Stage 0P</span>
                    </div>
                  </div>
                  
                  <div className={`space-y-6 transition-opacity ${localSettings.scanner.stage0P.enabled ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="绝对周期" value={localSettings.scanner.stage0P.interval} onChange={(v) => handleChange("scanner.stage0P.interval", v)} />
                      <Input label="启动时间" value={localSettings.scanner.stage0P.startTime} onChange={(v) => handleChange("scanner.stage0P.startTime", v)} />
                    </div>
                    {[
                      { id: "15m", label: "15M 检查", path: "check15m" },
                      { id: "1h", label: "1H 检查", path: "check1h" },
                      { id: "4h", label: "4H 检查", path: "check4h" },
                      { id: "1d", label: "1D 检查", path: "check1d" }
                    ].map(group => (
                      <div key={group.id} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-900">{group.label}</span>
                          <input
                            type="checkbox"
                            checked={(localSettings.scanner.stage0P as any)[group.path].enabled}
                            onChange={(e) => handleChange(`scanner.stage0P.${group.path}.enabled`, e.target.checked)}
                            className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                          />
                        </div>
                        <div className={`grid grid-cols-2 gap-4 transition-opacity ${(localSettings.scanner.stage0P as any)[group.path].enabled ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                          <Input label="K线数量" value={(localSettings.scanner.stage0P as any)[group.path].count} onChange={(v) => handleChange(`scanner.stage0P.${group.path}.count`, Number(v))} type="number" />
                          <Input label="参考值 (%)" value={(localSettings.scanner.stage0P as any)[group.path].threshold} onChange={(v) => handleChange(`scanner.stage0P.${group.path}.threshold`, Number(v))} type="number" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                    <SectionHeader title="基础指标过滤 (Stage 1)" description="筛选成交额与涨跌幅符合要求的币种" noBorder />
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={localSettings.scanner.stage1.enabled}
                        onChange={(e) => handleChange("scanner.stage1.enabled", e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">启用 Stage 1</span>
                    </div>
                  </div>
                  <div className={`mt-4 grid grid-cols-2 gap-4 transition-opacity ${localSettings.scanner.stage1.enabled ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                    <Input label="绝对周期" value={localSettings.scanner.stage1.interval} onChange={(v) => handleChange("scanner.stage1.interval", v)} />
                    <Input label="启动时间" value={localSettings.scanner.stage1.startTime} onChange={(v) => handleChange("scanner.stage1.startTime", v)} />
                    <Input label="成交额下限 M1 (USDT)" value={localSettings.scanner.stage1.minVolumeM1} onChange={(v) => handleChange("scanner.stage1.minVolumeM1", Number(v))} type="number" />
                    <div className="col-span-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-sm font-bold text-zinc-900">K1 范围 (%)</span>
                        <input
                          type="checkbox"
                          checked={localSettings.scanner.stage1.k1Range.enabled}
                          onChange={(e) => handleChange("scanner.stage1.k1Range.enabled", e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                        />
                      </div>
                      <div className={`grid grid-cols-2 gap-4 transition-opacity ${localSettings.scanner.stage1.k1Range.enabled ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                        <Input label="下限" value={localSettings.scanner.stage1.k1Range.range?.[0] ?? 0} onChange={(v) => handleChange("scanner.stage1.k1Range.range", [Number(v), localSettings.scanner.stage1.k1Range.range?.[1] ?? 0])} type="number" />
                        <Input label="上限" value={localSettings.scanner.stage1.k1Range.range?.[1] ?? 0} onChange={(v) => handleChange("scanner.stage1.k1Range.range", [localSettings.scanner.stage1.k1Range.range?.[0] ?? 0, Number(v)])} type="number" />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-4">
                      <Input label="白名单 (逗号分隔)" value={localSettings.scanner.stage1.whitelist.join(", ")} onChange={(v) => handleChange("scanner.stage1.whitelist", v.split(",").map(s => s.trim()).filter(Boolean))} />
                      <Input label="黑名单 (逗号分隔)" value={localSettings.scanner.stage1.blacklist.join(", ")} onChange={(v) => handleChange("scanner.stage1.blacklist", v.split(",").map(s => s.trim()).filter(Boolean))} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                    <SectionHeader title="形态锁定过滤 (Stage 2)" description="最终形态优选与下单前锁定" noBorder />
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={localSettings.scanner.stage2.enabled}
                        onChange={(e) => handleChange("scanner.stage2.enabled", e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">启用 Stage 2</span>
                    </div>
                  </div>
                  
                  <div className={`mt-4 space-y-6 transition-opacity ${localSettings.scanner.stage2.enabled ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="绝对周期" value={localSettings.scanner.stage2.interval} onChange={(v) => handleChange("scanner.stage2.interval", v)} />
                      <Input label="启动时间" value={localSettings.scanner.stage2.startTime} onChange={(v) => handleChange("scanner.stage2.startTime", v)} />
                      <Input label="冷却时间 (秒)" value={localSettings.scanner.stage2.cooldown} onChange={(v) => handleChange("scanner.stage2.cooldown", Number(v))} type="number" />
                    </div>

                    <div className="grid gap-4">
                      {[
                        { id: "k2", label: "K2 范围 (%)", path: "k2Range" },
                        { id: "a", label: "A 范围", path: "aRange" },
                        { id: "m", label: "M 范围 (USDT)", path: "mRange" },
                        { id: "k5", label: "K5 范围 (%)", path: "k5Range" },
                        { id: "kb", label: "KB 范围 (%)", path: "kbRange" }
                      ].map(group => (
                        <div key={group.id} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
                          <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-900">{group.label}</span>
                            <input
                              type="checkbox"
                              checked={(localSettings.scanner.stage2 as any)[group.path].enabled}
                              onChange={(e) => handleChange(`scanner.stage2.${group.path}.enabled`, e.target.checked)}
                              className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                            />
                          </div>
                          <div className={`grid grid-cols-2 gap-4 transition-opacity ${(localSettings.scanner.stage2 as any)[group.path].enabled ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                            <Input label="下限" value={(localSettings.scanner.stage2 as any)[group.path].range?.[0] ?? 0} onChange={(v) => handleChange(`scanner.stage2.${group.path}.range`, [Number(v), (localSettings.scanner.stage2 as any)[group.path].range?.[1] ?? 0])} type="number" />
                            <Input label="上限" value={(localSettings.scanner.stage2 as any)[group.path].range?.[1] ?? 0} onChange={(v) => handleChange(`scanner.stage2.${group.path}.range`, [(localSettings.scanner.stage2 as any)[group.path].range?.[0] ?? 0, Number(v)])} type="number" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}


            {activeTab === "order" && (
              <div className="space-y-6">
                <SectionHeader title="仓单执行设置" description="配置下单逻辑、杠杆与止盈止损" />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="杠杆倍数 L" value={localSettings.order.leverage} onChange={(v) => handleChange("order.leverage", Number(v))} type="number" />
                  <Input label="仓位比例 CW (%)" value={localSettings.order.positionRatio} onChange={(v) => handleChange("order.positionRatio", Number(v))} type="number" />
                  <Input label="最大仓位额 KCMAX (USDT)" value={localSettings.order.maxPositionUsdt} onChange={(v) => handleChange("order.maxPositionUsdt", Number(v))} type="number" />
                  <Input label="止盈比例 TPB (%)" value={localSettings.order.tpRatio} onChange={(v) => handleChange("order.tpRatio", Number(v))} type="number" />
                  <Input label="止损比例 SLB (%)" value={localSettings.order.slRatio} onChange={(v) => handleChange("order.slRatio", Number(v))} type="number" />
                  <Input label="正向单窗口 (秒)" value={localSettings.order.orderWindowSeconds} onChange={(v) => handleChange("order.orderWindowSeconds", Number(v))} type="number" />
                  <Input label="最大持仓时间 (min)" value={localSettings.order.maxHoldMinutes} onChange={(v) => handleChange("order.maxHoldMinutes", Number(v))} type="number" />
                  <Input label="K优选周期" value={localSettings.order.kOptimalPeriod} onChange={(v) => handleChange("order.kOptimalPeriod", v)} />
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <Input label="K优选窗口下限" value={localSettings.order.kOptimalWindow?.[0] ?? 0} onChange={(v) => handleChange("order.kOptimalWindow", [Number(v), localSettings.order.kOptimalWindow?.[1] ?? 0])} type="number" />
                    <Input label="K优选窗口上限" value={localSettings.order.kOptimalWindow?.[1] ?? 0} onChange={(v) => handleChange("order.kOptimalWindow", [localSettings.order.kOptimalWindow?.[0] ?? 0, Number(v)])} type="number" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "email" && (
              <div className="space-y-6">
                <SectionHeader title="邮件通知设置" description="配置报警邮件发送参数" />
                <div className="grid gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={localSettings.email.enabled}
                      onChange={(e) => handleChange("email.enabled", e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 bg-white text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-zinc-900">启用邮件通知</span>
                  </div>
                  <Input label="发件邮箱" value={localSettings.email.fromEmail} onChange={(v) => handleChange("email.fromEmail", v)} />
                  <Input label="收件邮箱" value={localSettings.email.toEmail} onChange={(v) => handleChange("email.toEmail", v)} />
                  <Input label="SMTP 服务器" value={localSettings.email.smtpHost} onChange={(v) => handleChange("email.smtpHost", v)} />
                  <Input label="SMTP 端口" value={localSettings.email.smtpPort} onChange={(v) => handleChange("email.smtpPort", Number(v))} type="number" />
                  <Input label="邮箱授权码" value={localSettings.email.smtpPass} onChange={(v) => handleChange("email.smtpPass", v)} type="password" />
                  <Input label="余额报警阈值 (USDT)" value={localSettings.email.balanceThreshold} onChange={(v) => handleChange("email.balanceThreshold", Number(v))} type="number" />
                  <Input label="连续亏损报警阈值 (次)" value={localSettings.email.consecutiveLossThreshold} onChange={(v) => handleChange("email.consecutiveLossThreshold", Number(v))} type="number" />
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                <SectionHeader title="安全与锁屏" description="保护您的交易终端不被他人操作" />
                <div className="grid gap-4">
                  <Input label="锁屏密码" value={localSettings.security.lockPassword} onChange={(v) => handleChange("security.lockPassword", v)} type="password" />
                  <Input label="自动锁屏时长 (分钟)" value={localSettings.security.autoLockMinutes} onChange={(v) => handleChange("security.autoLockMinutes", Number(v))} type="number" />
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, description, noBorder }: { title: string; description: string; noBorder?: boolean }) => (
  <div className={noBorder ? "" : "border-b border-zinc-200 pb-4"}>
    <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
    <p className="text-sm text-zinc-500">{description}</p>
  </div>
);

const Input = ({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (v: string) => void; type?: string }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-all focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
    />
  </div>
);
