import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/recipes", label: "Recipes" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/orders", label: "Orders" },
  { href: "/meal-plan", label: "Meal plan" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavItemProps {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}

function NavItem({ href, label, active, onNavigate }: NavItemProps) {
  // Two-layer trick from the Next.js version: invisible bold text reserves
  // width so hovering to bold doesn't shift layout.
  return (
    <a href={href} className="group shrink-0 text-base" onClick={onNavigate}>
      <span className="relative inline-block whitespace-nowrap">
        <span className="invisible select-none font-bold" aria-hidden="true">
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
    </a>
  );
}

interface AppNavProps {
  /** Server-provided current pathname (from Astro.url.pathname). */
  pathname: string;
  onNavigate?: () => void;
}

export function AppNav({ pathname, onNavigate }: AppNavProps) {
  return (
    <>
      {NAV_ITEMS.map(({ href, label }) => (
        <NavItem
          key={href}
          href={href}
          label={label}
          active={isActive(pathname, href)}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}
