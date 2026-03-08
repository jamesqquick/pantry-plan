import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/forms/register-form";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";

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
    <Suspense fallback={<AuthFormSkeleton />}>
      <RegisterPageData />
    </Suspense>
  );
}
