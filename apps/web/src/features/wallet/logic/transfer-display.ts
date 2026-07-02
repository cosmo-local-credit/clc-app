export function formatTransferDate(
  dateBlock: string,
  locale?: Intl.LocalesArgument,
  timeZone?: string,
): string {
  const date = new Date(dateBlock);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
