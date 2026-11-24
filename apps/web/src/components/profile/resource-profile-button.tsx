import type { ProfileResourceKind } from "@clc/api/features/public-profiles/client";
import { resourceProfilesQueryOptions } from "@clc/api/features/public-profiles/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiUserLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import {
  DialogRoot,
  DialogPortal,
  DialogBackdrop,
  DialogContent,
  DialogTitle,
} from "#/components/ui/dialog";
import { publicProfilesClient } from "#/lib/api/public-profiles";
import { ProfileLoading, ProfileReadError } from "./public-profile-content";

/** Resolve public association on demand; a Post never leaks anonymous authorship. */
export function ResourceProfileButton({
  kind,
  resourceId,
}: {
  kind: ProfileResourceKind;
  resourceId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" tap onClick={() => setOpen(true)}>
        <RiUserLine aria-hidden="true" />
        <Trans>Profile</Trans>
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="max-h-[80svh] overflow-y-auto rounded-none bg-card shadow-none">
            <DialogTitle>
              <Trans>Profiles</Trans>
            </DialogTitle>
            {open ? (
              <ResourceProfiles
                kind={kind}
                resourceId={resourceId}
                onSelect={() => setOpen(false)}
              />
            ) : null}
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}

function ResourceProfiles({
  kind,
  resourceId,
  onSelect,
}: {
  kind: ProfileResourceKind;
  resourceId: string;
  onSelect: () => void;
}) {
  const { t } = useLingui();
  const query = useQuery(resourceProfilesQueryOptions(publicProfilesClient, kind, resourceId));
  const navigate = useNavigate();
  const single =
    query.isSuccess && !query.isFetching && query.data.length === 1 ? query.data[0] : undefined;
  useEffect(() => {
    if (!single) return;
    onSelect();
    void navigate({ to: "/profiles/$address", params: { address: single.address } });
  }, [single, navigate, onSelect]);
  return (
    <div className="mt-4 space-y-3">
      {query.isPending || query.isFetching || single ? (
        <ProfileLoading />
      ) : query.isError ? (
        <ProfileReadError pending={query.isFetching} retry={() => void query.refetch()} />
      ) : query.data?.length ? (
        query.data.map((profile) => (
          <Link
            key={profile.address}
            to="/profiles/$address"
            params={{ address: profile.address }}
            onClick={onSelect}
            className="flex min-w-0 items-center gap-3 border border-border bg-card p-3 text-sm underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="size-8 shrink-0 rounded-full object-cover"
              />
            ) : null}
            <span className="min-w-0 break-all font-mono" dir="auto">
              {profile.username ?? profile.address}
            </span>
          </Link>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{t`No public profile is available.`}</p>
      )}
    </div>
  );
}
