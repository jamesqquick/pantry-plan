export class RecipeNotFoundError extends Error {
  constructor() {
    super("Recipe not found.");
    this.name = "RecipeNotFoundError";
  }
}

export class TagNotFoundError extends Error {
  constructor(public readonly tagName: string) {
    super(`No tag named "${tagName}".`);
    this.name = "TagNotFoundError";
  }
}
