import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger:
    "inline-flex items-center cursor-pointer rounded-input border border-destructive bg-destructive text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "ghost-danger":
    "inline-flex items-center cursor-pointer rounded-input border border-destructive/30 bg-transparent text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  default: "",          // btn-primary/btn-secondary already set px-4 py-2 text-sm
  lg: "px-6 py-3 text-base",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

type SharedProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

type ButtonAsButton = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };

type ButtonAsAnchor = SharedProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

/**
 * Unified button component. Renders `<a>` when `href` is provided, `<button>` otherwise.
 *
 * Variants: primary | secondary | danger | ghost-danger
 * Sizes:    sm | default | lg
 *
 * The `primary` and `secondary` variants inherit base styles (padding, font, shadows)
 * from `btn-primary` / `btn-secondary` in globals.css. The `danger` variants are
 * self-contained since they're used in fewer places.
 */
export const Button = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(function Button(props, ref) {
  const {
    variant = "primary",
    size = "default",
    className,
    ...rest
  } = props;

  const classes = cn(
    variants[variant],
    // danger/ghost-danger don't inherit from btn-primary/btn-secondary,
    // so they need the base size explicitly
    (variant === "danger" || variant === "ghost-danger") && size === "default"
      ? "px-4 py-2 text-sm font-semibold"
      : sizes[size],
    className,
  );

  if ("href" in rest && rest.href != null) {
    const { href, ...anchorRest } = rest as ButtonAsAnchor;
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={classes}
        {...anchorRest}
      />
    );
  }

  const { type = "button", ...buttonRest } = rest as ButtonAsButton;
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type}
      className={classes}
      {...buttonRest}
    />
  );
});
