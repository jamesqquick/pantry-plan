"use client";

import { RecipeDetailsSection } from "./recipe-details-section";
import type { RecipeDetailsSectionProps } from "./recipe-details-section";

type ImportManualTabProps = {
  mappingSectionRef: React.RefObject<HTMLDivElement | null>;
  sectionProps: RecipeDetailsSectionProps;
};

export function ImportManualTab({
  mappingSectionRef,
  sectionProps,
}: ImportManualTabProps) {
  return (
    <div ref={mappingSectionRef} className="space-y-6">
      <RecipeDetailsSection {...sectionProps} />
    </div>
  );
}
