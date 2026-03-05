"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

export function IngredientsSearchInput({
  defaultValue = "",
}: {
  defaultValue?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from URL when defaultValue (from server) changes (e.g. initial load or back/forward)
  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  // Debounced URL update: only push when debounced value differs from current URL
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const trimmed = value.trim();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      const currentSearch = searchParams.get("search") ?? "";
      if (trimmed === currentSearch) return;
      const sp = new URLSearchParams();
      if (trimmed) sp.set("search", trimmed);
      const limitParam = searchParams.get("limit");
      if (limitParam) sp.set("limit", limitParam);
      const categoryParam = searchParams.get("category");
      if (categoryParam) sp.set("category", categoryParam);
      const query = sp.toString() ? `?${sp.toString()}` : "";
      router.push(`${pathname}${query}`);
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, pathname, router, searchParams]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  return (
    <Input
      type="search"
      placeholder="Search by name..."
      value={value}
      onChange={handleChange}
      className="w-full sm:max-w-xs"
      aria-label="Search ingredients"
    />
  );
}
