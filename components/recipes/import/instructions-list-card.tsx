"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EditableNumberedList } from "@/components/ui/editable-numbered-list";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
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
        <SectionHeader
          variant="section"
          title="Instructions"
          action={
            <Button
              type="button"
              variant="secondary"
              aria-label="Add step"
              onClick={() =>
                setInstructionsList((prev) => [defaultInstruction, ...prev])
              }
              className={cn(ICON_BUTTON_CLASS, "h-9 w-9 shrink-0")}
            >
              <AppIcon name="add" size={18} aria-hidden />
            </Button>
          }
        />
        <EditableNumberedList
          items={instructionsList}
          onItemsChange={(next) =>
            setInstructionsList(next.length === 0 ? [defaultInstruction] : next)
          }
          placeholder="Step description"
          removeLabel="Remove step"
          minItems={1}
        />
      </CardContent>
    </Card>
  );
}
