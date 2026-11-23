import { Trans, useLingui } from "@lingui/react/macro";

import { TagCombobox } from "#/components/ui/tag-combobox";
import { useTokenTags } from "#/hooks/use-deployment";

export function OfferingTagsField({
  tags,
  onChange,
  error,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  error: string | null | undefined;
}) {
  const { t } = useLingui();
  const vocabulary = useTokenTags();
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">
        <Trans>Tags</Trans>
      </p>
      <TagCombobox
        items={vocabulary.data ?? []}
        value={tags}
        onValueChange={onChange}
        searchLabel={t`Search or add tags`}
        selectedLabel={t`Selected tags`}
        listLabel={t`Available tags`}
        placeholder={t`Add tags`}
        removeLabel={(tag) => t`Remove ${tag}`}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
