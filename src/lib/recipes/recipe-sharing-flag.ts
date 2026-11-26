import { getBooleanFlag } from "@/lib/feature-flags";

export async function isRecipeSharingEnabled(binding: Flagship | undefined): Promise<boolean> {
  try {
    return await getBooleanFlag(binding, "public-recipe-sharing", false);
  } catch {
    return false;
  }
}
