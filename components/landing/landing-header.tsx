import Link from "next/link";
import { Lilita_One } from "next/font/google";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

const lilitaOne = Lilita_One({ weight: "400", subsets: ["latin"] });

export function LandingHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:flex-nowrap sm:gap-0">
        <Link
          href="/"
          className={cn(
            "flex shrink-0 items-baseline gap-1 text-2xl sm:text-3xl",
            lilitaOne.className
          )}
          aria-label="Pantry Plan home"
        >
          <span className="text-primary">Pantry</span>
          <span className="text-accent [paint-order:stroke_fill] [-webkit-text-stroke:1.5px_hsl(var(--primary))]">
            Plan
          </span>
        </Link>

        <nav
          className="flex flex-wrap items-center gap-2 sm:gap-4"
          aria-label="Sign in and register"
        >
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
