"use client";

type EnhancingIngredientsLoaderProps = {
  size?: "default" | "large";
};

export function EnhancingIngredientsLoader({
  size = "default",
}: EnhancingIngredientsLoaderProps) {
  const isLarge = size === "large";
  const width = isLarge ? 128 : 64;
  const height = isLarge ? 112 : 56;
  const strokeWidth = isLarge ? 2.5 : 2;
  const chipRadius = isLarge ? 2.5 : 1.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 64 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-muted-foreground"
      aria-hidden
    >
      <g className="animate-cookie-float">
        {/* Cookie body - rounded blob / ellipse */}
        <ellipse
          cx="32"
          cy="28"
          rx="22"
          ry="18"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Chocolate chips */}
        <circle
          cx="24"
          cy="22"
          r={chipRadius}
          fill="currentColor"
          opacity="0.8"
        />
        <circle
          cx="40"
          cy="24"
          r={chipRadius}
          fill="currentColor"
          opacity="0.8"
        />
        <circle
          cx="28"
          cy="32"
          r={chipRadius}
          fill="currentColor"
          opacity="0.8"
        />
        <circle
          cx="38"
          cy="34"
          r={chipRadius}
          fill="currentColor"
          opacity="0.8"
        />
        <circle
          cx="32"
          cy="26"
          r={chipRadius}
          fill="currentColor"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}
