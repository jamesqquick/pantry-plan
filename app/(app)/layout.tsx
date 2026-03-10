import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app/app-header";
import { AppShellWithToaster } from "@/components/app/app-shell-with-toaster";

async function AppLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <AppShellWithToaster>
      <div className="min-h-screen bg-background">
        <AppHeader userEmail={session?.user?.email ?? ""} />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </AppShellWithToaster>
  );
}

function AppLayoutFallback({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShellWithToaster>
      <div className="min-h-screen bg-background">
        <AppHeader userEmail="" />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </AppShellWithToaster>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AppLayoutFallback>{children}</AppLayoutFallback>}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </Suspense>
  );
}
