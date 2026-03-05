import Link from "next/link";

export default function RecipeNotFound() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="font-medium text-foreground">Recipe not found</p>
      <Link
        href="/recipes"
        className="mt-2 inline-block text-sm text-muted-foreground underline hover:text-foreground"
      >
        Back to recipes
      </Link>
    </div>
  );
}
