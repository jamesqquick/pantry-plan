export const EVALUATION_USER_ID = "ingredient-evaluation-user";
export const EVALUATION_OTHER_USER_ID = "ingredient-evaluation-other";

export const INGREDIENT_EVALUATION_CATALOG = [
  { id: "eval-chickpeas", name: "Chickpeas", aliases: [], userId: null },
  { id: "eval-scallions", name: "Scallions", aliases: [], userId: null },
  { id: "eval-cilantro", name: "Cilantro", aliases: [], userId: null },
  { id: "eval-icing-sugar", name: "Confectioners sugar", aliases: [], userId: null },
  { id: "eval-flour", name: "All-purpose flour", aliases: [], userId: null },
  { id: "eval-cornstarch", name: "Cornstarch", aliases: [], userId: null },
  { id: "eval-cornmeal", name: "Cornmeal", aliases: [], userId: null },
  { id: "eval-baking-soda", name: "Baking soda", aliases: [], userId: null },
  { id: "eval-baking-powder", name: "Baking powder", aliases: [], userId: null },
  { id: "eval-sugar", name: "Granulated sugar", aliases: [], userId: null },
  { id: "eval-brown-sugar", name: "Brown sugar", aliases: [], userId: null },
  { id: "eval-coconut-milk", name: "Coconut milk", aliases: [], userId: null },
  { id: "eval-coconut-cream", name: "Coconut cream", aliases: [], userId: null },
  { id: "eval-butter", name: "Butter", aliases: [], userId: null },
  { id: "eval-margarine", name: "Margarine", aliases: [], userId: null },
  { id: "eval-heavy-cream", name: "Heavy cream", aliases: [], userId: null },
  { id: "eval-double-cream", name: "Double cream", aliases: [], userId: null },
  { id: "eval-parsley", name: "Parsley", aliases: [], userId: null },
  { id: "eval-lentils", name: "Lentils", aliases: [], userId: null },
  { id: "eval-walnuts", name: "Walnuts", aliases: [], userId: null },
  { id: "eval-pecans", name: "Pecans", aliases: [], userId: null },
  { id: "eval-user-chickpeas", name: "Chickpeas", aliases: [], userId: EVALUATION_USER_ID },
  { id: "eval-user-olive-oil", name: "Olive oil", aliases: ["house olive oil"], userId: EVALUATION_USER_ID },
  { id: "eval-foreign-ingredient", name: "Private saffron blend", aliases: [], userId: EVALUATION_OTHER_USER_ID },
] as const;

export type IngredientEvaluationCase = {
  id: string;
  line: string;
  category: "exact" | "alias" | "synonym" | "preparation" | "misspelling" | "distinct" | "new" | "ambiguous";
  expectedIngredientId: string | null;
};

export const INGREDIENT_EVALUATION_CASES: readonly IngredientEvaluationCase[] = [
  { id: "owned-name-preference", line: "1 cup chickpeas", category: "exact", expectedIngredientId: "eval-user-chickpeas" },
  { id: "learned-alias", line: "2 tbsp house olive oil", category: "alias", expectedIngredientId: "eval-user-olive-oil" },
  { id: "garbanzo", line: "1 cup garbanzo beans, drained", category: "synonym", expectedIngredientId: "eval-user-chickpeas" },
  { id: "spring-onions", line: "3 spring onions, sliced", category: "synonym", expectedIngredientId: "eval-scallions" },
  { id: "coriander-leaves", line: "1 handful fresh coriander leaves", category: "synonym", expectedIngredientId: "eval-cilantro" },
  { id: "icing-sugar", line: "2 cups icing sugar", category: "synonym", expectedIngredientId: "eval-icing-sugar" },
  { id: "plain-flour", line: "250 g plain flour", category: "synonym", expectedIngredientId: "eval-flour" },
  { id: "corn-starch", line: "2 tbsp corn starch", category: "synonym", expectedIngredientId: "eval-cornstarch" },
  { id: "bicarbonate", line: "1 tsp sodium bicarbonate", category: "synonym", expectedIngredientId: "eval-baking-soda" },
  { id: "double-cream", line: "100 ml double cream", category: "distinct", expectedIngredientId: "eval-double-cream" },
  { id: "prepped-chickpeas", line: "1½ cups canned chickpeas, rinsed and drained", category: "preparation", expectedIngredientId: "eval-user-chickpeas" },
  { id: "soft-butter", line: "100 g unsalted butter, softened", category: "preparation", expectedIngredientId: "eval-butter" },
  { id: "powder-typo", line: "1 tsp baking powdr", category: "misspelling", expectedIngredientId: "eval-baking-powder" },
  { id: "starch-typo", line: "1 tbsp cornstartch", category: "misspelling", expectedIngredientId: "eval-cornstarch" },
  { id: "soda-distinction", line: "1 tsp baking soda", category: "distinct", expectedIngredientId: "eval-baking-soda" },
  { id: "powder-distinction", line: "1 tsp baking powder", category: "distinct", expectedIngredientId: "eval-baking-powder" },
  { id: "cream-distinction", line: "1 cup coconut cream", category: "distinct", expectedIngredientId: "eval-coconut-cream" },
  { id: "cornmeal-distinction", line: "1 cup cornmeal", category: "distinct", expectedIngredientId: "eval-cornmeal" },
  { id: "nuts-distinction", line: "1 cup chopped pecans", category: "distinct", expectedIngredientId: "eval-pecans" },
  { id: "new-fruit", line: "1 tbsp dragon fruit powder", category: "new", expectedIngredientId: null },
  { id: "new-mushroom", line: "100 g shiitake mushrooms", category: "new", expectedIngredientId: null },
  { id: "locale-sensitive-cornflour", line: "2 tbsp cornflour", category: "ambiguous", expectedIngredientId: null },
  { id: "unknown-white-powder", line: "1 tbsp white powder", category: "ambiguous", expectedIngredientId: null },
];
