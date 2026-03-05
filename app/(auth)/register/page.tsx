import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/forms/register-form";

async function RegisterPageData() {
  const session = await auth();
  if (session?.user) redirect("/recipes");
  return (
    <div className="w-full max-w-sm">
      <RegisterForm />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading…</div>}>
      <RegisterPageData />
    </Suspense>
  );
}
