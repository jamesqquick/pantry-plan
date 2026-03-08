import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for the landing/home page while auth and redirect resolve. */
export function LandingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-2 px-4 py-4">
          <Skeleton className="h-8 w-40 rounded-input" aria-hidden />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20 rounded-input" aria-hidden />
            <Skeleton className="h-9 w-28 rounded-input" aria-hidden />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
          <Skeleton
            className="mx-auto h-10 w-full max-w-md rounded-input sm:h-12"
            aria-hidden
          />
          <Skeleton
            className="mx-auto mt-4 h-6 w-full max-w-lg rounded-input"
            aria-hidden
          />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Skeleton className="h-11 w-28 rounded-input" aria-hidden />
            <Skeleton className="h-11 w-24 rounded-input" aria-hidden />
          </div>
        </section>

        <section className="border-t border-border bg-panel/50 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <Skeleton
              className="mx-auto h-8 w-72 rounded-input"
              aria-hidden
            />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton
                  key={i}
                  className="h-24 rounded-input"
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
