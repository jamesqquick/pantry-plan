export function getGoogleAuthErrorMessage(error: string | null): string | null {
  if (!error) return null;

  if (error === "account_not_linked") {
    return "This email already has a password account. Sign in with your password, then connect Google from Profile.";
  }

  return "Google sign-in was not completed. Please try again.";
}
