"use client";

import {
  Home,
  BarChart3,
  PenLine,
  FileText,
  Mic,
  Kanban,
  Lightbulb,
  Settings,
  SlidersHorizontal,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { NavItem } from "./NavItem";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/analysis", icon: BarChart3, label: "Analysis", disabled: true },
  { href: "/editor", icon: PenLine, label: "Editor", disabled: true },
  { href: "/cover-letter", icon: FileText, label: "Cover Letter", disabled: true },
  { href: "/interview", icon: Mic, label: "Interview", disabled: true },
  { href: "/tracker", icon: Kanban, label: "Tracker", disabled: true },
  { href: "/insights", icon: Lightbulb, label: "Insights", disabled: true },
] as const;

export function Sidebar() {
  const collapsed    = useAppStore((s) => s.sidebarCollapsed);
  const toggle       = useAppStore((s) => s.toggleSidebar);
  const togglePrefs  = useAppStore((s) => s.togglePrefs);
  const prefsOpen    = useAppStore((s) => s.prefsOpen);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300",
        collapsed ? "w-16" : "w-56",
      )}
      style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 items-center px-4 border-b border-sidebar-border",
          collapsed ? "justify-center" : "gap-3",
        )}
      >
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-[0_2px_8px_oklch(0.65_0.14_42/0.3)]">
          <span className="text-[13px] font-bold text-primary-foreground">C</span>
        </div>
        {!collapsed && (
          <span className="text-[14px] font-semibold tracking-tight text-foreground">
            CareerOps
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2.5 pt-4">
        {navItems.map((item) => (
          <NavItem key={item.href} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-2.5 py-3 space-y-0.5">
        <NavItem href="/settings" icon={Settings} label="Settings" collapsed={collapsed} disabled />

        {/* Preferences button */}
        <button
          onClick={togglePrefs}
          className={cn(
            "flex w-full items-center rounded-xl px-3 py-2.5 transition-colors",
            prefsOpen
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-foreground/40 hover:text-foreground/70 hover:bg-[oklch(0.94_0.01_50)]",
            collapsed && "justify-center px-2",
          )}
          aria-label="My Preferences"
        >
          <SlidersHorizontal className="size-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && (
            <span className="ml-3 text-[12px] font-medium">Preferences</span>
          )}
        </button>
        <button
          onClick={toggle}
          className={cn(
            "flex w-full items-center rounded-xl px-3 py-2.5 text-foreground/30 transition-colors hover:text-foreground/60 hover:bg-[oklch(0.94_0.01_50)]",
            collapsed && "justify-center px-2",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" strokeWidth={1.5} />
          ) : (
            <>
              <ChevronsLeft className="size-4" strokeWidth={1.5} />
              <span className="ml-3 text-[12px] font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
