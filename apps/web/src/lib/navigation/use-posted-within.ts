import type { PostedWithin } from "@clc/core/features/reports/logic";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import {
  readPostedWithinPreference,
  writePostedWithinPreference,
} from "#/lib/navigation/catalog-filter-preference-storage";
import { parsePostedSearch, pickPostedSearch } from "#/lib/navigation/posted-search";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

export function usePostedWithin(owner: StorageOwner | null = null): {
  posted: PostedWithin;
  setPosted: (next: PostedWithin) => void;
} {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const posted = parsePostedSearch(search);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current || owner === null) return;
    restored.current = true;
    if (pickPostedSearch(search).posted !== undefined) return;
    const stored = readPostedWithinPreference(owner);
    if (!stored) return;
    void navigate({
      to: ".",
      replace: true,
      search: (previous) => ({ ...previous, posted: stored }),
    });
  }, [navigate, owner, posted, search]);

  const setPosted = useCallback(
    (next: PostedWithin) => {
      if (owner !== null) writePostedWithinPreference(owner, next);
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          posted: next,
        }),
      });
    },
    [navigate, owner],
  );

  return { posted, setPosted };
}
