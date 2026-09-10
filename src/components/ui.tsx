import React, { useEffect, useState } from "react";
import { initials, BADGE_META, type Badge } from "../lib/types";

export function Avatar({
  name,
  url,
  size = 44,
  ring,
  online,
}: {
  name: string;
  url?: string | null;
  size?: number;
  ring?: boolean;
  online?: boolean;
}) {
  const [err, setErr] = useState(false);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  const grads = [
    "from-cyan-400 to-blue-600",
    "from-fuchsia-400 to-purple-600",
    "from-amber-400 to-orange-600",
    "from-emerald-400 to-teal-600",
    "from-rose-400 to-pink-600",
    "from-indigo-400 to-violet-600",
  ];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url && !err ? (
        <img
          src={url}
          alt={name}
          onError={() => setErr(true)}
          className={`h-full w-full rounded-full object-cover ${ring ? "ring-2 ring-cyan-400/70" : ""}`}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br ${grads[hue]} font-display font-bold text-[#0B1220] ${ring ? "ring-2 ring-cyan-400/70" : ""}`}
          style={{ fontSize: size * 0.38 }}
        >
          {initials(name || "?")}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-[#0B1220] ${online ? "bg-emerald-400" : "bg-zinc-600"}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}

export function BadgeChip({ badge }: { badge: Badge }) {
  const meta = BADGE_META[badge];
  if (badge === "none" || !meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`}
      title={meta.label}
    >
      {meta.icon} {meta.label}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const styles = {
    primary:
      "bg-gradient-to-r from-cyan-400 to-indigo-500 text-[#071018] shadow-glow hover:brightness-110",
    ghost: "text-slate-300 hover:bg-white/5",
    outline: "border border-white/15 text-slate-200 hover:bg-white/5",
    danger: "bg-rose-500/90 text-white hover:bg-rose-500",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-white/10 bg-[#0F172A] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-lg border border-white/10 bg-[#0F172A] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-400/60 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`glass relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-2xl p-6 shadow-panel animate-fade-up ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400 ${className}`}
    />
  );
}

// ---------------- toast system ----------------
type ToastItem = { id: number; msg: string; kind: "ok" | "err" | "info" };
let toastId = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(msg: string, kind: ToastItem["kind"] = "info") {
  const t = { id: ++toastId, msg, kind };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const fn = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3600);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[92vw] max-w-sm -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`glass animate-fade-up rounded-xl px-4 py-3 text-sm font-medium shadow-panel ${
            t.kind === "err"
              ? "text-rose-300"
              : t.kind === "ok"
                ? "text-emerald-300"
                : "text-slate-200"
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
