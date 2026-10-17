import {
  REPORT_ATTACHMENT_FILENAME_MAX,
  formatByteSize,
  type ReportAttachmentKind,
  type ReportAttachmentWrite,
} from "@clc/core/features/reports/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { FaTrash } from "react-icons/fa";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

/**
 * Links as URL records.
 *
 * There is no file picker: storage-server uploads images only, so a local
 * document has nowhere to go. What this does support is what the backend can
 * already record — a new `EMBED` URL, and an existing `FILE` row kept, edited,
 * reordered or removed.
 *
 * That last part is the load-bearing half. `PUT` is assign-all, so an imported
 * post's attachments have to survive an edit that never opens this section, and
 * they do because the form hydrates them and sends them back untouched.
 */
export function PostAttachmentFields({
  attachments,
  onChange,
  disabled,
  max,
}: {
  attachments: ReportAttachmentWrite[];
  onChange: (attachments: ReportAttachmentWrite[]) => void;
  disabled?: boolean;
  max: number;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remaining = max - attachments.length;

  function add() {
    const url = draft.trim();
    if (url === "") return;
    if (!/^https?:\/\//i.test(url)) {
      setError(t`Enter a link starting with http:// or https://`);
      return;
    }
    if (attachments.some((attachment) => attachment.kind === "EMBED" && attachment.url === url)) {
      setError(t`That link has already been added.`);
      return;
    }

    setError(null);
    setDraft("");
    onChange([...attachments, { kind: "EMBED", url, filename: null, byteSize: null }]);
  }

  function replaceAt(index: number, attachment: ReportAttachmentWrite) {
    onChange(attachments.map((current, position) => (position === index ? attachment : current)));
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? null : (
        <ul className="space-y-3">
          {attachments.map((attachment, index) => (
            <li
              key={`${attachment.kind}:${attachment.url}`}
              className="space-y-2 border border-border bg-card p-3"
            >
              <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
                <span>{kindLabel(attachment.kind, { file: t`File`, embed: t`Link` })}</span>
                {formatByteSize(attachment.byteSize) ? (
                  <span className="tabular-nums">{formatByteSize(attachment.byteSize)}</span>
                ) : null}
              </p>

              <Input
                className="bg-card font-mono text-xs"
                aria-label={t`Link ${index + 1}`}
                value={attachment.url}
                disabled={disabled}
                onChange={(event) => replaceAt(index, { ...attachment, url: event.target.value })}
              />

              {/* Only an upload records a filename, so this is shown for FILE
                  rows and left alone for embeds. */}
              {attachment.kind === "FILE" ? (
                <Input
                  className="bg-card"
                  aria-label={t`Link ${index + 1} file name`}
                  placeholder={t`File name (optional)`}
                  maxLength={REPORT_ATTACHMENT_FILENAME_MAX}
                  value={attachment.filename ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    replaceAt(index, { ...attachment, filename: event.target.value || null })
                  }
                />
              ) : null}

              <Button
                type="button"
                variant="outline"
                tap
                className="text-destructive"
                disabled={disabled}
                aria-label={t`Remove link ${index + 1}`}
                onClick={() => onChange(attachments.filter((_, position) => position !== index))}
              >
                <FaTrash aria-hidden className="me-2 size-3" />
                <Trans>Remove</Trans>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 ? (
        <div className="space-y-2">
          <Input
            className="bg-card"
            inputMode="url"
            aria-label={t`Add a link`}
            dir="ltr"
            placeholder="https://"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            tap
            disabled={disabled || draft.trim() === ""}
            onClick={add}
          >
            <Trans>Add link</Trans>
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function kindLabel(kind: ReportAttachmentKind, labels: { file: string; embed: string }): string {
  return kind === "FILE" ? labels.file : labels.embed;
}
