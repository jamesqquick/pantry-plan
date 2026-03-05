import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  PageContainer,
  CardShell,
  FormField,
  TotalsPanel,
  Divider,
} from "@/components/primitives";

export default function UIShowcasePage() {
  return (
    <PageContainer className="space-y-8">
      <div>
        <Link
          href="/recipes"
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to app
        </Link>
        <PageTitle className="mt-2">UI Showcase</PageTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Primitives and key components for visual regression. All tokens; calm
          system look.
        </p>
      </div>

      <section className="space-y-4">
        <SectionHeader
          title="Section header"
          subtitle="Optional subtitle and action slot"
          action={<Button size="sm">Action</Button>}
        />
        <p className="text-sm text-muted-foreground">
          Use SectionHeader for page sections. 8pt spacing; text-foreground /
          text-muted-foreground.
        </p>
      </section>

      <Divider />

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon">🔗</Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Inputs</h2>
        <div className="max-w-sm space-y-4">
          <FormField label="Default input" htmlFor="input-default">
            <Input id="input-default" placeholder="Placeholder" />
          </FormField>
          <FormField
            label="With help"
            htmlFor="input-help"
            help="Helper text uses text-muted-foreground."
          >
            <Input id="input-help" placeholder="With help" />
          </FormField>
          <FormField
            label="Error state"
            htmlFor="input-error"
            error="Error message uses text-destructive."
          >
            <Input id="input-error" placeholder="Error" error />
          </FormField>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Cards & panels</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card (shadcn)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              rounded-lg, border-border, bg-card. Use for content blocks.
            </CardContent>
          </Card>
          <CardShell>
            <h3 className="text-sm font-medium text-foreground">
              CardShell (primitive)
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              p-4 default; border-border, bg-card, rounded-lg.
            </p>
          </CardShell>
        </div>
        <TotalsPanel
          title="Totals"
          items={[
            { label: "Subtotal", value: "$12.00" },
            { label: "Tax", value: "$1.20" },
            { label: "Total", value: "$13.20" },
          ]}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Badges / chips</h2>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            Muted chip
          </span>
          <span className="inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
            Primary
          </span>
          <span className="inline-flex items-center rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
            Success
          </span>
          <span className="inline-flex items-center rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive">
            Destructive
          </span>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Status alerts</h2>
        <div className="space-y-2">
          <div
            className="rounded-input border border-border bg-success/15 px-4 py-3 text-sm text-success"
            role="status"
          >
            Success message (bg-success/15, text-success). Muted.
          </div>
          <div
            className="rounded-input border border-border bg-warning/15 px-4 py-3 text-sm text-warning"
            role="status"
          >
            Warning (bg-warning/15, text-warning).
          </div>
          <div
            className="rounded-input border border-border bg-destructive/15 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            Error (bg-destructive/15, text-destructive).
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">
          Ingredient row sample
        </h2>
        <CardShell>
          <ul className="divide-y divide-border">
            <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <span className="text-foreground">2 cups Flour</span>
              <span className="text-sm text-muted-foreground">optional</span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <span className="text-foreground">1 tbsp Butter</span>
            </li>
          </ul>
        </CardShell>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">
          Empty & loading states
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <CardShell>
            <p className="py-6 text-center text-sm text-muted-foreground">
              No items yet. Add one to get started.
            </p>
          </CardShell>
          <CardShell>
            <div className="space-y-2 py-4">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-4 w-5/6 rounded bg-muted" />
            </div>
          </CardShell>
        </div>
      </section>

      <Divider />
      <p className="text-xs text-muted-foreground">
        Focus: focus-visible:ring-2 focus-visible:ring-ring
        focus-visible:ring-offset-2 focus-visible:ring-offset-background. Radii:
        cards rounded-lg, inputs/buttons rounded-md.
      </p>
    </PageContainer>
  );
}
