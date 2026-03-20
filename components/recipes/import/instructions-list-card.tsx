"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { SortableInstructionsList } from "@/components/ui/sortable-instructions-list";
import { defaultInstruction } from "./import-wizard-helpers";

type InstructionsListCardProps = {
  instructionsList: string[];
  setInstructionsList: React.Dispatch<React.SetStateAction<string[]>>;
};

export function InstructionsListCard({
  instructionsList,
  setInstructionsList,
}: InstructionsListCardProps) {
  return (
    <Card>
      <CardContent>
        <SectionHeader variant="section" title="Instructions" />
        <SortableInstructionsList
          items={instructionsList}
          onItemsChange={(next) =>
            setInstructionsList(next.length === 0 ? [defaultInstruction] : next)
          }
          placeholder="Step description"
          removeLabel="Remove step"
          addLabel="Add step"
          minItems={1}
          onAdd={() =>
            setInstructionsList((prev) => [...prev, defaultInstruction])
          }
          insertBelowOnEnter
          splitLineAtCaretOnEnter
        />
      </CardContent>
    </Card>
  );
}
