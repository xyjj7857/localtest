import React, { useState, useEffect } from "react";
import { Lock, Unlock, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LockScreenProps {
  isLocked: boolean;
  onUnlock: (password: string) => boolean;
  autoLockMinutes: number;
}

export const LockScreen: React.FC<LockScreenProps> = ({ isLocked, onUnlock, autoLockMinutes }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUnlock(password)) {
      setPassword("");
      setError(false);
    } else {
      setError(true);
      setPassword("");
    }
  };

  if (!isLocked) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/95 backdrop-blur-xl"
      >
        <div className="w-full max-w-md p-8 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-8 flex justify-center"
          >
            <div className="rounded-full bg-emerald-50 p-6 ring-1 ring-emerald-600/20">
              <Lock className="h-12 w-12 text-emerald-600" />
            </div>
          </motion.div>

          <h1 className="mb-2 text-3xl font-bold tracking-tight text-zinc-900">本地超强</h1>
          <p className="mb-8 text-sm text-zinc-500">系统已锁定，请输入密码以继续</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入锁屏密码"
                className={`w-full rounded-lg bg-white px-4 py-3 text-center text-zinc-900 outline-none ring-1 transition-all focus:ring-2 ${
                  error ? "ring-red-500 focus:ring-red-500" : "ring-zinc-200 focus:ring-emerald-500"
                }`}
                autoFocus
              />
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-center justify-center gap-1 text-xs text-red-500"
                >
                  <ShieldAlert className="h-3 w-3" />
                  <span>密码错误，请重试</span>
                </motion.div>
              )}
            </div>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
            >
              <Unlock className="h-4 w-4" />
              解锁系统
            </button>
          </form>

          <div className="mt-12 text-[10px] uppercase tracking-widest text-zinc-600">
            Secure Trading Environment v1.0.0
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
