"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/recipes", label: "Recipes" },
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
  if (href === "/orders") {
    return pathname === "/orders" || pathname.startsWith("/orders/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Static nav for Suspense fallback; avoids usePathname() during prerender. */
function AppNavStatic({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {navItems.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="group shrink-0 text-base"
          onClick={onNavigate}
        >
          <span className="relative inline-block whitespace-nowrap">
            <span className="invisible select-none font-bold" aria-hidden>
              {label}
            </span>
            <span className="absolute inset-0 text-left text-muted-foreground transition-colors duration-150 ease-out group-hover:font-bold group-hover:text-primary">
              {label}
            </span>
          </span>
        </Link>
      ))}
    </>
  );
}

function AppNavWithPathname({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(({ href, label }) => {
        const active = isActive(pathname ?? "", href);
        return (
          <Link
            key={href}
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
                    ? "font-bold text-primary"
                    : "text-muted-foreground group-hover:font-bold group-hover:text-primary"
                )}
              >
                {label}
              </span>
            </span>
          </Link>
        );
      })}
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
