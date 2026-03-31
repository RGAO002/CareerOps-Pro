/**
 * User Preferences Store
 *
 * TypeScript 学习笔记：
 *
 * 1. `interface` 定义了对象的"形状"——每个字段叫什么、是什么类型
 * 2. `"h1b" | "opt" | "none"` 是联合类型，visa 只能是这三个值之一
 * 3. `Partial<UserPrefs>` 是 TypeScript 内置工具类型，
 *    意思是"UserPrefs 的所有字段都变成可选的"
 *    等价于手写 { targetRole?: string; visa?: "h1b"|"opt"|"none"; ... }
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── 数据结构 ──────────────────────────────────────────────────────
export interface UserPrefs {
  targetRole: string;
  targetLocations: string;
  visa: "h1b" | "opt" | "none";
  flagChineseEnglish: boolean;
  notes: string;
}

// ── Store 类型：数据 + 操作 ────────────────────────────────────────
interface PrefsState {
  prefs: UserPrefs;
  // Partial<UserPrefs> 意思是：传入的对象不需要包含所有字段，
  // 只传你想更新的那几个就行（局部更新）
  updatePrefs: (patch: Partial<UserPrefs>) => void;
  resetPrefs: () => void;
}

// ── 默认值 ────────────────────────────────────────────────────────
const DEFAULT_PREFS: UserPrefs = {
  targetRole: "",
  targetLocations: "",
  visa: "h1b",
  flagChineseEnglish: true,
  notes: "",
};

// ── `persist` 中间件会自动把 store 内容存到 localStorage ──────────
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_PREFS,

      updatePrefs: (patch) =>
        // ...s.prefs 先展开旧的，patch 覆盖需要改的字段
        set((s) => ({ prefs: { ...s.prefs, ...patch } })),

      resetPrefs: () => set({ prefs: DEFAULT_PREFS }),
    }),
    {
      name: "careerops-user-prefs", // localStorage 的 key 名
    },
  ),
);

// ── Helper：把 prefs 转成 AI system prompt 片段 ───────────────────
// 这个函数在调用 AI 时注入，让 AI 知道用户背景
export function prefsToSystemPrompt(prefs: UserPrefs): string {
  const lines: string[] = ["User context:"];

  if (prefs.targetRole)
    lines.push(`- Target role: ${prefs.targetRole}`);

  if (prefs.targetLocations)
    lines.push(`- Preferred locations: ${prefs.targetLocations}`);

  const visaLabel = { h1b: "Needs H1B sponsorship", opt: "On OPT", none: "No visa restriction" };
  lines.push(`- Visa status: ${visaLabel[prefs.visa]}`);

  if (prefs.flagChineseEnglish)
    lines.push("- Please flag any Chinese-style English expressions in resume bullets.");

  if (prefs.notes)
    lines.push(`- Additional notes: ${prefs.notes}`);

  return lines.join("\n");
}
