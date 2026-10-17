import { signIn } from "@/lib/auth-client";
import { safeRelativePath } from "@/lib/navigate";
import { Button } from "@/components/ui/Button";

interface Props {
  next?: string;
  label?: string;
  oauthQuery?: string;
}

export function GoogleSignInButton({ next, label = "Continue with Google", oauthQuery }: Props) {
  const handleClick = async () => {
    try {
      const destination = safeRelativePath(next, "/recipes");
      const callbackURL = `${window.location.origin}${destination}`;
      const errorURL = new URL(oauthQuery ? `/login?${oauthQuery}` : "/login", window.location.origin);
      if (next) errorURL.searchParams.set("next", destination);

      await signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: errorURL.toString(),
      });
    } catch {
      // Better Auth normally returns errors, but network failures reject.
      const errorURL = new URL(oauthQuery ? `/login?${oauthQuery}` : "/login", window.location.origin);
      errorURL.searchParams.set("auth_error", "google_sign_in_failed");
      window.location.href = errorURL.toString();
    }
  };

  return (
    <Button type="button" variant="outline" className="w-full py-2.5" onClick={handleClick}>
      {label}
    </Button>
  );
}
