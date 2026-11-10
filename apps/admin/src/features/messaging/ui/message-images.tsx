import { cn } from "#/lib/utils";

/** A message's photos as thumbnails, each opening the stored image in a new tab. */
export function MessageImages({
  urls,
  className,
}: {
  urls: readonly string[];
  className?: string;
}) {
  if (urls.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Photos">
      {urls.map((url, index) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-visible:ring-ring block outline-none focus-visible:ring-1"
          >
            <img
              src={url}
              alt={`Photo ${index + 1} of ${urls.length}`}
              loading="lazy"
              className="border-border bg-muted size-24 border object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One line standing in for a message in a queue row. */
export function messagePreview(message: { body: string | null; imageUrls: readonly string[] }) {
  const text = message.body?.trim();
  if (text) return text;
  const count = message.imageUrls.length;
  return count === 1 ? "1 photo" : `${count} photos`;
}
