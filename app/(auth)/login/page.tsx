import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";

async function LoginPageData({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; registered?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/recipes");
  const { callbackUrl, error, registered } = await searchParams;
  return (
    <div className="w-full max-w-sm">
      {registered === "1" && (
        <p className="mb-4 text-sm text-success" role="status">
          Account created. Sign in below.
        </p>
      )}
      {error === "CredentialsSignin" && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          Invalid email or password.
        </p>
      )}
      <LoginForm callbackUrl={callbackUrl ?? "/recipes"} />
    </div>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; registered?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading…</div>}>
      <LoginPageData searchParams={searchParams} />
    </Suspense>
  );
}
