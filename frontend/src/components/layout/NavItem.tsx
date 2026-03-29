"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
  disabled?: boolean;
}

export function NavItem({
  href,
  icon: Icon,
  label,
  collapsed,
  disabled,
}: NavItemProps) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={disabled ? "#" : href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
        active
          ? "text-primary"
          : "text-foreground/35 hover:text-foreground/65 hover:bg-[oklch(0.94_0.01_50)]",
        disabled && "pointer-events-none opacity-20",
        collapsed && "justify-center px-2",
      )}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
          style={{ boxShadow: "2px 0 10px oklch(0.65 0.14 42 / 0.35)" }}
        />
      )}

      <Icon
        className={cn("relative size-[18px] shrink-0 transition-colors", active && "text-primary")}
        strokeWidth={active ? 2 : 1.5}
      />
      {!collapsed && <span className="relative">{label}</span>}
    </Link>
  );
}
