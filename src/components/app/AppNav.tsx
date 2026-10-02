import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/recipes", label: "Recipes" },
  { href: "/meal-plan", label: "Meal plan" },
  { href: "/orders", label: "Orders" },
  { href: "/ingredients", label: "Ingredients" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Where the nav renders: desktop header, mobile bottom bar, or full-screen menu. */
export type AppNavVariant = "header" | "bar" | "overlay";

const VARIANT_CLASS: Record<AppNavVariant, { base: string; active: string; idle: string }> = {
  header: {
    base: "rounded-full px-3.5 py-2.5 text-sm font-semibold",
    active: "bg-nav-active text-nav-active-foreground",
    idle: "text-foreground hover:bg-header-hover",
  },
  bar: {
    base: "rounded-2xl text-sm font-semibold",
    active: "bg-nav-active text-nav-active-foreground",
    idle: "text-muted-foreground hover:bg-header-hover hover:text-foreground",
  },
  overlay: {
    base: "rounded-full px-5 font-semibold",
    active: "bg-nav-active text-nav-active-foreground",
    idle: "text-foreground hover:bg-header-hover",
  },
};

interface NavItemProps {
  href: string;
  label: string;
  active: boolean;
  variant: AppNavVariant;
  onNavigate?: () => void;
}

function NavItem({ href, label, active, variant, onNavigate }: NavItemProps) {
  const styles = VARIANT_CLASS[variant];
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap font-ui transition-colors",
        styles.base,
        active ? styles.active : styles.idle,
      )}
      onClick={onNavigate}
    >
      {label}
    </a>
  );
}

interface AppNavProps {
  /** Server-provided current pathname (from Astro.url.pathname). */
  pathname: string;
  variant?: AppNavVariant;
  onNavigate?: () => void;
}

export function AppNav({ pathname, variant = "header", onNavigate }: AppNavProps) {
  return (
    <>
      {NAV_ITEMS.map(({ href, label }) => (
        <NavItem
          key={href}
          href={href}
          label={label}
          active={isActive(pathname, href)}
          variant={variant}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}
