import { DEFAULT_POST_TIMING, type PostTiming } from "@clc/core/features/reports/logic";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import {
  readPostTimingPreference,
  writePostTimingPreference,
} from "#/lib/navigation/catalog-filter-preference-storage";
import { parsePostTimingSearch, pickPostTimingSearch } from "#/lib/navigation/post-timing-search";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

export function usePostTiming(owner: StorageOwner | null = null): {
  timing: PostTiming;
  setTiming: (next: PostTiming) => void;
} {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const timing = parsePostTimingSearch(search);
  const restoredOwner = useRef<StorageOwner | undefined>(undefined);

  useEffect(() => {
    if (owner === null || restoredOwner.current === owner) return;
    restoredOwner.current = owner;
    const picked = pickPostTimingSearch(search);
    if (picked.timing !== undefined || picked.posted !== undefined) return;
    const stored = readPostTimingPreference(owner);
    if (!stored || stored === DEFAULT_POST_TIMING) return;
    void navigate({
      to: ".",
      replace: true,
      search: (previous) => ({ ...previous, timing: stored, posted: undefined }),
    });
  }, [navigate, owner, search]);

  const setTiming = useCallback(
    (next: PostTiming) => {
      if (owner !== null) writePostTimingPreference(owner, next);
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          timing: next === DEFAULT_POST_TIMING ? undefined : next,
          posted: undefined,
        }),
      });
    },
    [navigate, owner],
  );

  return { timing, setTiming };
}
