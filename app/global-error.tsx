"use client";

import { PageTitle } from "@/components/ui/page-title";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
          <PageTitle>Something went wrong</PageTitle>
          <p>{error.message}</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
