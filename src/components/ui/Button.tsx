import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-input font-ui text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "border border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border border-border bg-card text-secondary-foreground hover:border-primary/35 hover:bg-accent",
        outline: "border border-border bg-transparent text-foreground hover:bg-accent",
        ghost: "border border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        danger: "border border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
        "ghost-danger": "border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        default: "px-4 py-2",
        lg: "px-6 py-3 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

const variants = ["primary", "secondary", "outline", "ghost", "danger", "ghost-danger"] as const;
const sizes = ["sm", "default", "lg"] as const;

export type ButtonVariant = (typeof variants)[number];
export type ButtonSize = (typeof sizes)[number];

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
 * Variants: primary | secondary | outline | ghost | danger | ghost-danger
 * Sizes:    sm | default | lg
 *
 * All variants are defined with Tailwind utilities through CVA so callers can
 * extend them with className without depending on global component classes.
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

  const classes = cn(buttonVariants({ variant, size }), className);

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
