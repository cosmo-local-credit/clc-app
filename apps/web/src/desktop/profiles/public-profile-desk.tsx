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
  const { query, profile } = usePublicProfile(address);
  return (
    <DeskCanvas>
      {query.isPending ? (
        <ProfileLoading />
      ) : query.isError ? (
        <ProfileReadError pending={query.isFetching} retry={() => void query.refetch()} />
      ) : profile === null ? (
        <p className="text-sm">
          <Trans>This public profile is unavailable.</Trans>
        </p>
      ) : null}
      {profile ? (
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
