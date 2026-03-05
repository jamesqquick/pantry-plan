import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PageTitle } from "@/components/ui/page-title";
import { ProfileForm } from "@/components/forms/profile-form";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";

async function ProfilePageData() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <PageTitle>Profile</PageTitle>
      <ProfileForm
        initialName={user.name ?? ""}
        email={user.email}
      />
      <ResetPasswordForm />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading…</div>}>
      <ProfilePageData />
    </Suspense>
  );
}
