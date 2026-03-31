"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { useAppStore } from "@/stores/app";
import { usePrefsStore } from "@/stores/prefs";
import { cn } from "@/lib/utils";

// TypeScript 학습 노트：
// 这个组件没有 props（父组件不传任何东西给它），
// 所有数据都从 zustand store 里读，这叫"连接组件"

const VISA_OPTIONS = [
  { value: "h1b", label: "Need H1B sponsorship" },
  { value: "opt", label: "On OPT / F-1" },
  { value: "none", label: "No restriction" },
] as const;
// TypeScript 笔记：`as const` 让数组里的值变成字面量类型
// 不加：value 的类型是 string
// 加了：value 的类型是 "h1b" | "opt" | "none"（更精确）

export function PreferencesDrawer() {
  const open       = useAppStore((s) => s.prefsOpen);
  const toggle     = useAppStore((s) => s.togglePrefs);
  const collapsed  = useAppStore((s) => s.sidebarCollapsed);

  const prefs      = usePrefsStore((s) => s.prefs);
  const update     = usePrefsStore((s) => s.updatePrefs);
  const reset      = usePrefsStore((s) => s.resetPrefs);

  const sidebarW   = collapsed ? 64 : 224;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="prefs-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30"
            style={{ background: "oklch(0.10 0.01 50 / 0.25)" }}
            onClick={toggle}
          />

          {/* Drawer — slides up from bottom, respects sidebar offset */}
          <motion.div
            key="prefs-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed bottom-0 z-40 flex flex-col"
            style={{
              left: sidebarW,
              right: 0,
              maxHeight: "82vh",
              background: "var(--background)",
              borderTop: "1px solid var(--border)",
              borderLeft: "1px solid var(--border)",
              borderTopLeftRadius: "16px",
              boxShadow: "0 -8px 40px oklch(0.20 0.02 50 / 0.12)",
            }}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-border shrink-0">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                  My Preferences
                </h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  The AI advisor reads this every time you chat
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { reset(); }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="size-3" strokeWidth={1.5} />
                  Reset
                </button>
                <button
                  onClick={toggle}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* ── Form ── */}
            <div className="overflow-y-auto flex-1 px-8 py-6" style={{ scrollbarWidth: "none" }}>
              <div className="max-w-2xl space-y-7">

                {/* Target role + locations — side by side */}
                <div className="grid grid-cols-2 gap-5">
                  <Field label="Target role" hint="e.g. SWE L3–L4, Product Manager">
                    <Input
                      value={prefs.targetRole}
                      onChange={(v) => update({ targetRole: v })}
                      placeholder="Software Engineer L3"
                    />
                  </Field>

                  <Field label="Preferred locations" hint="e.g. NYC, SF, Remote">
                    <Input
                      value={prefs.targetLocations}
                      onChange={(v) => update({ targetLocations: v })}
                      placeholder="New York, NY"
                    />
                  </Field>
                </div>

                {/* Visa status */}
                <Field label="Visa status" hint="Affects which jobs we highlight">
                  <div className="flex gap-3 flex-wrap">
                    {VISA_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => update({ visa: opt.value })}
                        className={cn(
                          "rounded-xl px-4 py-2 text-[12.5px] font-medium transition-all duration-150",
                          prefs.visa === opt.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-secondary text-secondary-foreground hover:bg-accent",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* Toggle: Chinese-style English */}
                <Field label="Resume feedback">
                  <Toggle
                    checked={prefs.flagChineseEnglish}
                    onChange={(v) => update({ flagChineseEnglish: v })}
                    label="Flag Chinese-style English expressions"
                    description="AI will highlight phrases that sound unnatural to US recruiters"
                  />
                </Field>

                {/* Free text notes */}
                <Field
                  label="Anything else?"
                  hint="Freeform notes the AI should always keep in mind"
                >
                  <textarea
                    value={prefs.notes}
                    onChange={(e) => update({ notes: e.target.value })}
                    placeholder={`e.g.\n- Don't recommend startups with < 100 employees\n- I prefer backend over frontend\n- Currently in NYC, not willing to relocate`}
                    rows={5}
                    className="w-full resize-none rounded-xl border border-border bg-secondary px-4 py-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </Field>

              </div>
            </div>

            {/* ── Footer ── */}
            <div
              className="shrink-0 px-8 py-4 border-t border-border flex items-center justify-between"
              style={{ background: "var(--surface-1)" }}
            >
              <p className="text-[11.5px] text-muted-foreground">
                Saved automatically · Used as AI context
              </p>
              <button
                onClick={toggle}
                className="rounded-xl bg-primary px-5 py-2 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Small reusable sub-components ──────────────────────────────── */

// TypeScript 笔记：
// 这里用 `interface` 定义 props（父组件传给子组件的参数）
// `children` 是 React 特殊 prop，类型是 `React.ReactNode`
// `?` 表示这个字段是可选的（optional）

interface FieldProps {
  label: string;
  hint?: string;           // ? = 可选，不传也不报错
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[12.5px] font-semibold text-foreground">{label}</p>
        {hint && (
          <p className="text-[11.5px] text-muted-foreground mt-0.5">{hint}</p>
        )}
      </div>
      {children}
    </div>
  );
}

interface InputProps {
  value: string;
  onChange: (value: string) => void;  // 函数类型：接收 string，返回 void
  placeholder?: string;
}

function Input({ value, onChange, placeholder }: InputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
    />
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-4 rounded-xl border border-border bg-secondary px-4 py-3.5 text-left transition-all hover:border-primary/20"
    >
      {/* The toggle pill */}
      <div
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-primary" : "bg-muted-foreground/20",
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </div>
      <div>
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-[11.5px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </button>
  );
}
