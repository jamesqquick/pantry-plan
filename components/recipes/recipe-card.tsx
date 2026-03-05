import Link from "next/link";
import { cn } from "@/lib/cn";
import { AppIcon } from "@/components/ui/icons";

type Recipe = {
  id: string;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
};

export function RecipeCard({ recipe, className }: { recipe: Recipe; className?: string }) {
  const times: string[] = [];
  if (recipe.prepTimeMinutes != null) times.push(`Prep ${recipe.prepTimeMinutes}m`);
  if (recipe.cookTimeMinutes != null) times.push(`Cook ${recipe.cookTimeMinutes}m`);
  if (recipe.totalTimeMinutes != null && !times.length) times.push(`${recipe.totalTimeMinutes}m total`);
  const meta = [
    ...times,
    recipe.servings != null ? `${recipe.servings} servings` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className={cn(
        "group block rounded-input border border-border bg-card p-4 transition-colors hover:border-border hover:bg-muted/50",
        className
      )}
    >
      <div className="flex gap-4">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground transition-transform duration-300 ease-out group-hover:scale-105"
            aria-hidden
          >
            <AppIcon name="chef-hat" size={32} aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-foreground truncate">
            {recipe.title}
          </h3>
          {meta.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {meta.join(" · ")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
