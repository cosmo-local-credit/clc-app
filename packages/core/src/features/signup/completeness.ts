import { isPlaceholderSignupEmail, PAPER_WALLET_PLACEHOLDER_NAME } from "../wallet/paper-wallet";

export type ProfileCompletenessInput = {
  name: string;
  email: string;
  phone: string;
  avatarUrl?: string | null;
};

export type ProfileGaps = { avatar: boolean; name: boolean; contact: boolean };

/**
 * What an account still lacks for a complete profile. Web onboarding collects
 * everything up front; an account issued in bulk as a paper wallet starts with
 * placeholders, and this is how the app notices and asks the holder to finish.
 */
export function profileGaps(profile: ProfileCompletenessInput): ProfileGaps {
  const name = profile.name.trim();
  return {
    avatar: !profile.avatarUrl,
    name: name === "" || name === PAPER_WALLET_PLACEHOLDER_NAME,
    contact:
      (profile.email.trim() === "" || isPlaceholderSignupEmail(profile.email)) &&
      profile.phone.trim() === "",
  };
}

export function hasProfileGaps(gaps: ProfileGaps): boolean {
  return gaps.avatar || gaps.name || gaps.contact;
}
