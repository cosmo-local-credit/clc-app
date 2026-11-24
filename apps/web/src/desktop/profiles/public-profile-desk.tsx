import { BackendApiError } from "@clc/api/client/errors";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  PublicProfileContent,
  ProfileLoading,
  ProfileReadError,
} from "#/components/profile/public-profile-content";
import { ShareLinkButton } from "#/components/share-link-button";
import { MessageButton } from "#/components/messaging/message-button";
import { DeskCanvas, DeskTitleRow } from "#/desktop/ui/page";
import { usePublicProfile } from "#/features/public-profiles/hooks/use-public-profile";

export function PublicProfileDesk({ address }: { address: string }) {
  const { t } = useLingui();
  const query = usePublicProfile(address);
  const profile = query.data;
  return (
    <DeskCanvas>
      {query.isPending ? (
        <ProfileLoading />
      ) : query.isError ? (
        query.error instanceof BackendApiError && query.error.status === 404 ? (
          <p className="text-sm">
            <Trans>This public profile is unavailable.</Trans>
          </p>
        ) : (
          <ProfileReadError pending={query.isFetching} retry={() => void query.refetch()} />
        )
      ) : profile ? (
        <>
          <DeskTitleRow
            title={profile.username ?? profile.name ?? t`Public profile`}
            wrap
            meta={
              <span className="font-mono" dir="ltr">
                {profile.address}
              </span>
            }
            actions={
              <>
                <MessageButton recipientAddress={profile.address} />
                <ShareLinkButton
                  title={profile.username ?? t`Public profile`}
                  path={`/profiles/${profile.address}`}
                  size="icon"
                />
              </>
            }
          />
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="size-20 rounded-full object-cover" />
          ) : null}
          {profile.username && profile.name ? (
            <p className="text-sm" dir="auto">
              {profile.name}
            </p>
          ) : null}
          <PublicProfileContent
            profile={profile}
            gridClassName="grid-cols-[repeat(auto-fit,minmax(240px,1fr))]"
          />
        </>
      ) : null}
    </DeskCanvas>
  );
}
