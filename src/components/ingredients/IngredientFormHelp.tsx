import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function IngredientFormHelp({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  function position() {
    const button = buttonRef.current;
    const tip = tipRef.current;
    if (!button || !tip) return;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const left = viewport?.offsetLeft ?? 0;
    const width = viewport?.width ?? document.documentElement.clientWidth;
    const height = viewport?.height ?? window.innerHeight;
    if (rect.bottom < top || rect.top > top + height) {
      tip.hidePopover();
      return;
    }
    const tipWidth = Math.min(320, width - 32);
    tip.style.width = `${tipWidth}px`;
    const tipHeight = tip.getBoundingClientRect().height;
    tip.style.left = `${Math.max(left + 16, Math.min(rect.left, left + width - tipWidth - 16))}px`;
    tip.style.top = `${Math.max(top + 16, Math.min(rect.top >= top + tipHeight + 24 ? rect.top - tipHeight - 8 : rect.bottom + 8, top + height - tipHeight - 16))}px`;
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", position, { passive: true, capture: true });
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open]);

  return (
    <>
      <button ref={buttonRef} type="button" className="ingredient-help" popoverTarget={id}
        aria-label={label} aria-describedby={id} aria-expanded={open}>
        <span aria-hidden="true">i</span>
      </button>
      <span ref={tipRef} id={id} popover="auto" role="tooltip" className="ingredient-help-text"
        onToggle={(event) => {
          setOpen(event.newState === "open");
          if (event.newState === "open") position();
        }}>
        {children}
      </span>
    </>
  );
}
