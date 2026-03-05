import Link from "next/link";
import {
  Link2,
  BookOpen,
  ShoppingBag,
  Calculator,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader />

      <main className="flex-1">
        {/* Hero */}
        <section
          className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24"
          aria-labelledby="hero-heading"
        >
          <h1
            id="hero-heading"
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Recipes, ingredients, and grocery lists in one place
          </h1>
          <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
            Turn recipe URLs and meal plans into merged grocery lists and cost
            estimates. One catalog, less manual work.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/register">Get started</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        {/* Feature highlights */}
        <section
          className="border-t border-border bg-panel/50 py-16"
          aria-labelledby="features-heading"
        >
          <div className="mx-auto max-w-5xl px-4">
            <h2
              id="features-heading"
              className="text-center text-2xl font-semibold text-foreground sm:text-3xl"
            >
              Everything you need to plan and shop
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
              Import recipes, keep a single ingredient catalog, and get combined
              lists and cost estimates for any meal plan.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                icon={<Link2 className="size-6 text-primary" />}
                title="Import from URL"
                description="Paste a recipe link and get structured ingredients. Map each line to your catalog so everything stays consistent."
              />
              <FeatureCard
                icon={<BookOpen className="size-6 text-primary" />}
                title="Your ingredient catalog"
                description="One place for ingredients, units, and cost basis. Reuse the same item across every recipe and order."
              />
              <FeatureCard
                icon={<ShoppingBag className="size-6 text-primary" />}
                title="Orders & grocery lists"
                description="Add recipes with batch counts and get one merged grocery list. No more copying lines by hand."
              />
              <FeatureCard
                icon={<Calculator className="size-6 text-primary" />}
                title="Cost estimates"
                description="See estimated cost per order from your catalog. Great for meal prep, catering, or just knowing what you’ll spend."
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          className="py-16"
          aria-labelledby="how-heading"
        >
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2
              id="how-heading"
              className="text-2xl font-semibold text-foreground sm:text-3xl"
            >
              How it works
            </h2>
            <ol className="mt-10 flex flex-col gap-8 sm:flex-row sm:gap-6 sm:justify-between">
              <HowStep
                step={1}
                label="Add recipes"
                detail="Import from a URL or enter them manually. Map ingredients to your catalog."
              />
              <HowStep
                step={2}
                label="Build your catalog"
                detail="One ingredient (e.g. All-Purpose Flour) across all recipes, with optional cost and conversions."
              />
              <HowStep
                step={3}
                label="Create orders"
                detail="Pick recipes and batch counts. Get a merged grocery list and cost estimate."
              />
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section
          className="border-t border-border bg-panel/50 py-16"
          aria-labelledby="cta-heading"
        >
          <div className="mx-auto max-w-2xl px-4 text-center">
            <h2
              id="cta-heading"
              className="text-2xl font-semibold text-foreground sm:text-3xl"
            >
              Ready to simplify meal planning?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Get started free. No credit card required.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" asChild>
                <Link href="/register">Get started</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
          <p>Pantry Plan — recipes and grocery lists that add up.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link
              href="/login"
              className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="h-full border-border bg-card">
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-input bg-accent">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <CardDescription className="text-muted-foreground">
          {description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

function HowStep({
  step,
  label,
  detail,
}: {
  step: number;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex flex-1 flex-col items-center">
      <span
        className="flex size-10 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground"
        aria-hidden
      >
        {step}
      </span>
      <h3 className="mt-3 font-semibold text-foreground">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </li>
  );
}
