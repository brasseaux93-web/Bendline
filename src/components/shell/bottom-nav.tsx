"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BarChart3, BookOpenCheck, ClipboardCheck, Compass, Home, Wrench } from "lucide-react";
import { MOTION_SPRING } from "@/lib/motion";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/practice", label: "Practice", icon: BookOpenCheck },
  { href: "/mock", label: "Mock", icon: ClipboardCheck },
  { href: "/draw", label: "Draw", icon: Compass },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/progress", label: "Progress", icon: BarChart3 },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-subtle bg-glass/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <div className="mx-auto grid max-w-4xl grid-cols-6 gap-1 px-2 py-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[0.75rem] font-medium leading-none transition-colors duration-200 ${
                isActive ? "text-ink-primary" : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-active"
                  transition={MOTION_SPRING.snappy}
                  className="absolute inset-0 -z-10 rounded-xl border border-accent-cyan/40 bg-elevated"
                  aria-hidden="true"
                />
              )}
              <Icon className={`h-[22px] w-[22px] ${isActive ? "text-accent-cyan" : "text-ink-secondary"}`} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
