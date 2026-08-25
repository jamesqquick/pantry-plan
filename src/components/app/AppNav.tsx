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
  return (
    <a
      href={href}
      className={cn(
        "shrink-0 whitespace-nowrap font-ui text-sm transition-colors",
        active ? "font-semibold text-header-logo" : "text-muted-foreground hover:text-header-logo",
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
