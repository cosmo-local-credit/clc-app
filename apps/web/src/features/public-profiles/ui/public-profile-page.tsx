import { Trans, useLingui } from "@lingui/react/macro";
import {
  PublicProfileContent,
  ProfileLoading,
  ProfileReadError,
} from "#/components/profile/public-profile-content";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { ShareLinkButton } from "#/components/share-link-button";
import { MessageButton } from "#/components/messaging/message-button";
import { usePublicProfile } from "../hooks/use-public-profile";

export function PublicProfilePage({ address }: { address: string }) {
  const { t } = useLingui();
  const { query, profile } = usePublicProfile(address);
  return (
    <main className="min-h-[100svh] bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[calc(var(--bottom-nav-offset)+1.5rem)]">
      <BackChevron label={t`Map`} to="/" search={{ tab: "market", view: "map" }} />
      {query.isPending ? (
        <ProfileLoading />
      ) : query.isError ? (
        <ProfileReadError pending={query.isFetching} retry={() => void query.refetch()} />
      ) : profile === null ? (
        <p className="py-6 text-sm">
          <Trans>This public profile is unavailable.</Trans>
        </p>
      ) : null}
      {profile ? (
        <>
          <div className="mb-6 flex items-start gap-3">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h1
                className="break-words font-heading text-[1.75rem] font-bold leading-tight"
                dir="auto"
              >
                {profile.username ?? profile.name ?? t`Public profile`}
              </h1>
              {profile.username && profile.name ? (
                <p className="mt-1 text-sm" dir="auto">
                  {profile.name}
                </p>
              ) : null}
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground" dir="ltr">
                {profile.address}
              </p>
            </div>
            <ShareLinkButton
              title={profile.username ?? t`Public profile`}
              path={`/profiles/${profile.address}`}
              size="icon-lg"
            />
          </div>
          <div className="mb-6">
            <MessageButton recipientAddress={profile.address} />
          </div>
          <PublicProfileContent profile={profile} />
        </>
      ) : null}
    </main>
  );
}
