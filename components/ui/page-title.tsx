import * as React from "react";

import { cn } from "@/lib/utils";

export interface PageTitleProps extends React.ComponentProps<"h1"> {
  children: React.ReactNode;
  className?: string;
}

const PageTitle = React.forwardRef<HTMLHeadingElement, PageTitleProps>(
  ({ className, children, ...props }, ref) => (
    <h1
      ref={ref}
      className={cn(
        "mb-6 text-3xl font-bold text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </h1>
  )
);
PageTitle.displayName = "PageTitle";

export { PageTitle };
