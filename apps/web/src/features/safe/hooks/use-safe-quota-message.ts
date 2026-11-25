import { useLingui } from "@lingui/react/macro";

export function useSafeQuotaMessage() {
  const { i18n, t } = useLingui();
  return (resetAt?: number) => {
    const message = t`Safe’s monthly request limit has been reached.`;
    if (resetAt === undefined || resetAt <= Date.now()) return message;
    const date = i18n.date(resetAt, { dateStyle: "medium", timeStyle: "short" });
    return `${message} ${t`Try again after ${date}.`}`;
  };
}
