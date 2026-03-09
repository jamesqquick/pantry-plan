"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/recipes", label: "Recipes" },
  { href: "/meal-plan", label: "Meal plan" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/orders", label: "Orders" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/recipes") {
    return pathname === "/recipes" || pathname.startsWith("/recipes/");
  }
  if (href === "/ingredients") {
    return pathname === "/ingredients" || pathname.startsWith("/ingredients/");
  }
  if (href === "/meal-plan") {
    return pathname === "/meal-plan" || pathname.startsWith("/meal-plan/");
  }
  if (href === "/orders") {
    return pathname === "/orders" || pathname.startsWith("/orders/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Reusable nav link: selected and hover use header-logo color (white in dark, primary in light). */
function NavItem({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      className="group shrink-0 text-base"
      onClick={onNavigate}
    >
      <span className="relative inline-block whitespace-nowrap">
        <span className="invisible select-none font-bold" aria-hidden>
          {label}
        </span>
        <span
          className={cn(
            "absolute inset-0 text-left transition-colors duration-150 ease-out",
            active
              ? "font-bold text-header-logo"
              : "text-muted-foreground group-hover:font-bold group-hover:text-header-logo"
          )}
        >
          {label}
        </span>
      </span>
    </Link>
  );
}

/** Static nav for Suspense fallback; avoids usePathname() during prerender. */
function AppNavStatic({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {navItems.map(({ href, label }) => (
        <NavItem key={href} href={href} label={label} active={false} onNavigate={onNavigate} />
      ))}
    </>
  );
}

function AppNavWithPathname({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(({ href, label }) => (
        <NavItem
          key={href}
          href={href}
          label={label}
          active={isActive(pathname ?? "", href)}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

/** Wrapped in Suspense so usePathname() is not accessed during prerender (avoids blocking route). */
export function AppNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  return (
    <Suspense fallback={<AppNavStatic onNavigate={onNavigate} />}>
      <AppNavWithPathname onNavigate={onNavigate} />
    </Suspense>
  );
}
