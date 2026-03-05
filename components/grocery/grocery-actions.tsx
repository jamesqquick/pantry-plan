"use client";

import { useCallback, useEffect, useState } from "react";
import { formatGroceryList, type GroceryLine } from "@/lib/grocery/format";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";

const CONFIRM_DURATION_MS = 2000;

type Props = {
  lines: GroceryLine[];
  title?: string;
};

export function GroceryActions({
  lines,
  title = "Grocery List",
}: Props) {
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [shareConfirm, setShareConfirm] = useState(false);
  const [shareAvailable, setShareAvailable] = useState(false);

  useEffect(() => {
    setShareAvailable(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const text = formatGroceryList(lines);
  const empty = lines.length === 0;

  const clearCopyConfirm = useCallback(() => {
    setCopyConfirm(false);
  }, []);
  const clearShareConfirm = useCallback(() => {
    setShareConfirm(false);
  }, []);

  useEffect(() => {
    if (!copyConfirm) return;
    const t = setTimeout(clearCopyConfirm, CONFIRM_DURATION_MS);
    return () => clearTimeout(t);
  }, [copyConfirm, clearCopyConfirm]);

  useEffect(() => {
    if (!shareConfirm) return;
    const t = setTimeout(clearShareConfirm, CONFIRM_DURATION_MS);
    return () => clearTimeout(t);
  }, [shareConfirm, clearShareConfirm]);

  const handleCopy = useCallback(async () => {
    if (empty) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyConfirm(true);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopyConfirm(true);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }, [text, empty]);

  const handleShare = useCallback(async () => {
    if (empty || !navigator.share) return;
    try {
      await navigator.share({
        title,
        text,
      });
      setShareConfirm(true);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setShareConfirm(false);
      }
    }
  }, [title, text, empty]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className={ICON_LABEL_GAP_CLASS}
          onClick={handleCopy}
          disabled={empty}
          aria-label="Copy grocery list to clipboard"
        >
          <AppIcon name="duplicate" size={18} aria-hidden />
          Copy
        </Button>
        {shareAvailable && (
          <Button
            type="button"
            variant="secondary"
            className={ICON_LABEL_GAP_CLASS}
            onClick={handleShare}
            disabled={empty}
            aria-label="Share grocery list"
          >
            <AppIcon name="share" size={18} aria-hidden />
            Share
          </Button>
        )}
      </div>
      {copyConfirm && (
        <p
          className="text-sm text-success"
          aria-live="polite"
          role="status"
        >
          Copied to clipboard
        </p>
      )}
      {shareConfirm && (
        <p
          className="text-sm text-success"
          aria-live="polite"
          role="status"
        >
          Shared
        </p>
      )}
    </div>
  );
}
