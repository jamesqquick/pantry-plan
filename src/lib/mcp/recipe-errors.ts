export class RecipeNotFoundError extends Error {
  constructor() {
    super("Recipe not found.");
    this.name = "RecipeNotFoundError";
  }
}
