"use client";

import {
  Plus,
  Copy,
  Trash2,
  Pencil,
  Save,
  X,
  ArrowLeft,
  MoreHorizontal,
  Share2,
  Search,
  Clock,
  Timer,
  Flame,
  Users,
  ChefHat,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

export const ICON_SIZES = {
  dense: 16,
  standard: 18,
  prominent: 20,
} as const;

export type AppIconName =
  | "add"
  | "duplicate"
  | "delete"
  | "edit"
  | "save"
  | "close"
  | "back"
  | "more"
  | "share"
  | "search"
  | "clock"
  | "timer"
  | "flame"
  | "users"
  | "chef-hat";

const ICON_MAP: Record<AppIconName, LucideIcon> = {
  add: Plus,
  duplicate: Copy,
  delete: Trash2,
  edit: Pencil,
  save: Save,
  close: X,
  back: ArrowLeft,
  more: MoreHorizontal,
  share: Share2,
  search: Search,
  clock: Clock,
  timer: Timer,
  flame: Flame,
  users: Users,
  "chef-hat": ChefHat,
};

export interface AppIconProps {
  name: AppIconName;
  size?: number;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
  title?: string;
}

export function AppIcon({
  name,
  size = ICON_SIZES.standard,
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
  title,
}: AppIconProps) {
  const Icon = ICON_MAP[name];
  const isDecorative = ariaLabel == null && ariaHidden !== false;
  const content = (
    <Icon
      size={size}
      className={cn("shrink-0", className)}
      aria-label={ariaLabel}
      aria-hidden={isDecorative ? true : undefined}
    />
  );
  if (title) {
    return (
      <span title={title} className="inline-flex shrink-0">
        {content}
      </span>
    );
  }
  return content;
}

export const ICON_BUTTON_CLASS =
  "inline-flex items-center justify-center min-w-[40px] min-h-[40px] p-0";

export const ICON_LABEL_GAP_CLASS = "gap-1.5";
