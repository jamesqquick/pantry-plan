import { useId, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface OrderItemPickerProps {
  label: string;
  value: string;
  displayName: string;
  query: string;
  options: { id: string; name: string; description?: string; searchText?: string }[];
  placeholder: string;
  emptyMessage: string;
  onSearchChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate?: () => void;
}

export function OrderItemPicker({
  label, value, displayName, query, options, placeholder, emptyMessage,
  onSearchChange, onSelect, onCreate,
}: OrderItemPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const matches = options.filter((option) => (option.searchText ?? option.name)
    .toLowerCase().includes(query.trim().toLowerCase())).slice(0, 15);

  function selectOption(id: string) {
    onSelect(id);
    setOpen(false);
  }

  function search(next: string) {
    onSearchChange(next);
    setActiveIndex(-1);
    setOpen(true);
  }

  return (
    <div className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={open && activeIndex >= 0 && matches.length > 0
          ? `${id}-option-${Math.min(activeIndex, matches.length - 1)}` : undefined}
        value={open || !value ? query : displayName}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setActiveIndex(-1); }}
        onChange={(event) => search(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (!open && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            search(event.key);
          } else if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.blur();
          } else if (event.key === "ArrowDown" && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp" && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => index < 0 ? matches.length - 1 : Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (matches.length > 0) selectOption(matches[Math.max(0, Math.min(activeIndex, matches.length - 1))]!.id);
          }
        }}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg">
          <ul id={`${id}-options`} role="listbox" aria-label={label} className="max-h-48 overflow-auto">
            {matches.map((option, index) => (
              <li
                key={option.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-label={option.name}
                aria-selected={option.id === value}
                className={`min-h-11 cursor-pointer break-words px-3 py-2 text-body hover:bg-primary/10 ${index === activeIndex ? "bg-primary/10" : ""} ${option.id === value ? "font-semibold text-primary-on-card" : "text-card-foreground"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option.id)}
              >
                {option.name}
                {option.description && <span className="block text-sm font-normal text-muted-foreground">{option.description}</span>}
              </li>
            ))}
            {matches.length === 0 && <li role="presentation" className="px-3 py-2 text-body text-muted-foreground">{emptyMessage}</li>}
          </ul>
          {onCreate && <div className="border-t border-border p-2">
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onCreate}>New material</Button>
          </div>}
        </div>
      )}
    </div>
  );
}
