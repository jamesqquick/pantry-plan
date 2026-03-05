"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link2, Image as ImageIcon, Sparkles } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { AppIcon } from "@/components/ui/icons";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImportUrlTab } from "./import-url-tab";
import { ImportImageTab } from "./import-image-tab";
import { ImportManualTab } from "./import-manual-tab";
import { useImportWizard } from "./use-import-wizard";
import type { TagOption } from "@/components/recipes/recipe-tag-picker";

const INPUT_METHOD_INDEX: Record<string, number> = {
  url: 0,
  image: 1,
  manual: 2,
};

type CatalogItem = { id: string; name: string };

type ImportWizardProps = {
  ingredientsCatalog: CatalogItem[];
  existingTags?: TagOption[];
};

export function ImportWizard({
  ingredientsCatalog,
  existingTags,
}: ImportWizardProps) {
  const {
    url,
    setUrl,
    parseLoading,
    parseError,
    handleParse,
    urlDraft,
    imageParseLoading,
    imageParseError,
    handleImageParse,
    imageDraft,
    inputMethod,
    handleMethodChange,
    mappingSectionRef,
    toast,
    urlSectionProps,
    imageSectionProps,
    manualSectionProps,
  } = useImportWizard({ ingredientsCatalog, existingTags });

  const listRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null]);
  const [bubbleStyle, setBubbleStyle] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const updateBubblePosition = useCallback(() => {
    const listEl = listRef.current;
    const activeIndex = INPUT_METHOD_INDEX[inputMethod] ?? 0;
    const triggerEl = triggerRefs.current[activeIndex];
    if (!listEl || !triggerEl) return;
    const listRect = listEl.getBoundingClientRect();
    const triggerRect = triggerEl.getBoundingClientRect();
    setBubbleStyle({
      left: triggerRect.left - listRect.left,
      width: triggerRect.width,
    });
  }, [inputMethod]);

  useLayoutEffect(() => {
    updateBubblePosition();
    const handleResize = () => updateBubblePosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateBubblePosition]);

  return (
    <div className="space-y-8">
      <Tabs
        value={inputMethod}
        onValueChange={handleMethodChange}
        className="w-full"
      >
        <TabsList
          ref={listRef}
          className="relative grid w-full grid-cols-3"
        >
          {bubbleStyle != null && (
            <div
              aria-hidden
              className="absolute top-1 bottom-1 rounded-input bg-background shadow-sm transition-[left,width] duration-200 ease-out"
              style={{
                left: bubbleStyle.left,
                width: bubbleStyle.width,
              }}
            />
          )}
          <TabsTrigger
            ref={(el) => {
              triggerRefs.current[0] = el;
            }}
            value="url"
            className="relative z-10 inline-flex items-center justify-center gap-2 data-[state=active]:bg-transparent"
          >
            <Link2 size={16} aria-hidden />
            URL
          </TabsTrigger>
          <TabsTrigger
            ref={(el) => {
              triggerRefs.current[1] = el;
            }}
            value="image"
            className="relative z-10 inline-flex items-center justify-center gap-2 data-[state=active]:bg-transparent"
          >
            <ImageIcon size={16} aria-hidden />
            Image (
            <span className="inline-flex items-center gap-1" aria-hidden>
              <Sparkles size={14} className="shrink-0" />
              AI
            </span>
            )
          </TabsTrigger>
          <TabsTrigger
            ref={(el) => {
              triggerRefs.current[2] = el;
            }}
            value="manual"
            className="relative z-10 inline-flex items-center justify-center gap-2 data-[state=active]:bg-transparent"
          >
            <AppIcon name="edit" size={16} aria-hidden />
            Manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-6">
          <ImportUrlTab
            url={url}
            setUrl={setUrl}
            parseLoading={parseLoading}
            parseError={parseError}
            onParse={handleParse}
            urlDraft={urlDraft}
            mappingSectionRef={mappingSectionRef}
            sectionProps={urlSectionProps}
          />
        </TabsContent>

        <TabsContent value="image" className="space-y-6">
          <ImportImageTab
            imageParseLoading={imageParseLoading}
            imageParseError={imageParseError}
            onImageParse={handleImageParse}
            imageDraft={imageDraft}
            mappingSectionRef={mappingSectionRef}
            sectionProps={imageSectionProps}
          />
        </TabsContent>

        <TabsContent value="manual" className="space-y-6">
          <ImportManualTab
            mappingSectionRef={mappingSectionRef}
            sectionProps={manualSectionProps}
          />
        </TabsContent>
      </Tabs>

      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </div>
  );
}
