import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { resourceRetirementRequestsQueryOptions } from "@clc/api/features/retirement/queries";
import {
  optionalTermsTextSchema,
  optionalTermsUrlSchema,
  TERMS_TEXT_MAX,
} from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import {
  RiArchiveLine,
  RiArrowRightSLine,
  RiPencilLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  RiUserSharedLine,
} from "react-icons/ri";

import { PublicContactWarning } from "#/components/public-contact-warning";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { RetirementRequestForm } from "#/components/retirement/retirement-request-form";
import { RetirementRequestList } from "#/components/retirement/retirement-request-list";
import { RecipientOwnerNotice } from "#/components/safe/recipient-owner-notice";
import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { DeskPhoneField } from "#/desktop/ui/phone-field";
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";
import { RecipientAddressInput } from "#/components/wallet/recipient-address-input";
import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import {
  type VoucherContractControl,
  useVoucherControls,
  useVoucherMintForm,
  useVoucherOwnershipTransferForm,
} from "#/features/vouchers/hooks/use-voucher-controls";
import { useVoucherProfileForm } from "#/features/vouchers/hooks/use-voucher-profile-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { retirementClient } from "#/lib/api/retirement";
import { cn } from "#/lib/utils";
import { translateValidationError } from "#/lib/validation-i18n";

import { VoucherDialog } from "./voucher-dialog";

type ControlDialog = "details" | "mint" | "ownership" | "retirement";

/**
 * The issuer's controls at the foot of the Info column: Edit details, Safe
 * transactions, Create vouchers, Transfer ownership, and retirement. Each
 * opens a dialog over the same hook its phone sheet uses.
 */
export function VoucherOwnerControls({
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  ownerAddress,
  walletAddress,
  requesterAddress,
  editable,
}: {
  tokenAddress: string | undefined;
  tokenSymbol: string;
  tokenDecimals: number | undefined;
  ownerAddress: string | null;
  walletAddress: string | undefined;
  requesterAddress?: string;
  /** The catalog record, when the viewer may edit it; null for everyone else. */
  editable: MarketVoucherDetail | null;
}) {
  const { t } = useLingui();
  const [dialog, setDialog] = useState<ControlDialog | null>(null);
  const { contract, canRequestRetirement } = useVoucherControls({
    tokenAddress,
    tokenDecimals,
    ownerAddress,
    walletAddress,
    requesterAddress,
  });
  const retirement = editable && requesterAddress && canRequestRetirement ? editable : null;
  const close = () => setDialog(null);

  if (!editable && !contract) return null;

  return (
    <>
      <div
        role="group"
        aria-label={t`Voucher controls`}
        className="flex flex-col border border-border bg-card [&>*+*]:border-border [&>*+*]:border-t"
      >
        {editable ? (
          <ControlRow
            icon={<RiPencilLine aria-hidden="true" />}
            label={t`Edit details`}
            onClick={() => setDialog("details")}
          />
        ) : null}
        {contract?.safeOwned ? (
          <ControlRow
            icon={<RiShieldKeyholeLine aria-hidden="true" />}
            label={t`Safe transactions`}
            onClick={() => useSafeSheet.getState().show(contract.ownerAddress)}
          />
        ) : null}
        {contract ? (
          <>
            <ControlRow
              icon={<RiSparkling2Line aria-hidden="true" />}
              label={t`Create vouchers`}
              onClick={() => setDialog("mint")}
            />
            <ControlRow
              icon={<RiUserSharedLine aria-hidden="true" />}
              label={t`Transfer ownership`}
              onClick={() => setDialog("ownership")}
            />
          </>
        ) : null}
        {retirement && requesterAddress ? (
          <RetirementRow
            voucher={retirement}
            viewer={requesterAddress}
            open={dialog === "retirement"}
            onOpenChange={(open) => setDialog(open ? "retirement" : null)}
          />
        ) : null}
      </div>

      {editable ? (
        <VoucherDialog
          open={dialog === "details"}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title={<Trans>Edit voucher details</Trans>}
          wide
          bodyClassName="p-0"
        >
          {/* Mounted only while open so each visit reads the current record. */}
          {dialog === "details" ? <ProfileForm voucher={editable} onClose={close} /> : null}
        </VoucherDialog>
      ) : null}
      {contract ? (
        <>
          <VoucherDialog
            open={dialog === "mint"}
            onOpenChange={(open) => {
              if (!open) close();
            }}
            title={<Trans>Create vouchers</Trans>}
            bodyClassName="p-0"
          >
            {dialog === "mint" ? (
              <MintForm contract={contract} tokenSymbol={tokenSymbol} onClose={close} />
            ) : null}
          </VoucherDialog>
          <VoucherDialog
            open={dialog === "ownership"}
            onOpenChange={(open) => {
              if (!open) close();
            }}
            title={<Trans>Transfer ownership</Trans>}
            bodyClassName="p-0"
          >
            {dialog === "ownership" ? <OwnershipForm contract={contract} onClose={close} /> : null}
          </VoucherDialog>
        </>
      ) : null}
    </>
  );
}

function ControlRow({
  icon,
  label,
  tone = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tone?: "default" | "destructive";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 w-full items-center gap-3 px-3.5 text-start text-sm font-medium outline-none hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "destructive" && "text-destructive",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <RiArrowRightSLine className="text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** Requesting retirement never removes the active page; the request waits for an admin. */
function RetirementRow({
  voucher,
  viewer,
  open,
  onOpenChange,
}: {
  voucher: MarketVoucherDetail;
  viewer: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const history = useQuery(
    resourceRetirementRequestsQueryOptions(retirementClient, "voucher", voucher.address, viewer),
  );
  const pending = history.data?.some((request) => request.status === "pending") === true;
  const title = pending
    ? t`Retirement requested`
    : voucher.active
      ? t`Request retirement`
      : t`Retirement history`;
  return (
    <>
      <ControlRow
        icon={<RiArchiveLine aria-hidden="true" />}
        label={title}
        tone={pending || !voucher.active ? "default" : "destructive"}
        onClick={() => onOpenChange(true)}
      />
      <VoucherDialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          <>
            {title}: {voucher.name}
          </>
        }
      >
        {history.isPending ? (
          <p role="status" className="text-sm">
            <Trans>Loading retirement requests…</Trans>
          </p>
        ) : history.isError ? (
          <div role="alert" className="grid justify-items-start gap-2 text-sm">
            <p>
              <Trans>Could not load retirement requests.</Trans>
            </p>
            <Button
              variant="outline"
              pending={history.isFetching}
              onClick={() => void history.refetch()}
            >
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : (
          <>
            {pending ? (
              <p role="status" className="text-sm">
                <Trans>
                  Retirement requested — awaiting admin review. This resource stays active until
                  approval.
                </Trans>
              </p>
            ) : voucher.active && open ? (
              <RetirementRequestForm
                type="voucher"
                address={voucher.address}
                viewer={viewer}
                onSubmitted={() => void history.refetch()}
              />
            ) : null}
            {history.data.length > 0 ? (
              <RetirementRequestList requests={history.data} viewer={viewer} />
            ) : null}
          </>
        )}
      </VoucherDialog>
    </>
  );
}

function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 flex justify-end gap-2 border-border border-t bg-card p-4">
      {children}
    </div>
  );
}

function MintForm({
  contract,
  tokenSymbol,
  onClose,
}: {
  contract: VoucherContractControl;
  tokenSymbol: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { form, delegationStatus, pending } = useVoucherMintForm({
    tokenAddress: contract.tokenAddress,
    tokenDecimals: contract.tokenDecimals,
    walletAddress: contract.walletAddress,
    ownerAddress: contract.ownerAddress,
    safeOwned: contract.safeOwned,
    onClose,
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-4 p-4">
        <form.Field name="amount">
          {(field) => (
            <Field
              label={t`Create vouchers`}
              htmlFor="desk-voucher-mint-amount"
              hint={tokenSymbol}
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="desk-voucher-mint-amount"
                dir="ltr"
                inputMode="decimal"
                placeholder="0"
                className="bg-card font-mono"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                disabled={pending}
                aria-invalid={field.state.meta.errors.length > 0}
              />
            </Field>
          )}
        </form.Field>
        {contract.safeOwned ? (
          <form.Field name="recipient">
            {(field) => (
              <Field
                label={t`Recipient`}
                htmlFor="desk-voucher-mint-recipient"
                error={getFieldError(field.state.meta.errors)}
              >
                <RecipientAddressInput
                  id="desk-voucher-mint-recipient"
                  defaultValue={field.state.value}
                  onValueChange={field.handleChange}
                  onRecipientChange={(recipient) => {
                    if (recipient) field.handleChange(recipient.address);
                  }}
                  onBlur={field.handleBlur}
                  ariaLabel={t`Recipient`}
                  ariaInvalid={field.state.meta.errors.length > 0}
                  disabled={pending}
                />
              </Field>
            )}
          </form.Field>
        ) : null}
      </div>
      <FormFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" pending={pending}>
          {delegationStatus === "checking" ? (
            <Trans>Preparing wallet…</Trans>
          ) : pending ? (
            <Trans>Creating vouchers…</Trans>
          ) : (
            <Trans>Create vouchers</Trans>
          )}
        </Button>
      </FormFooter>
    </form>
  );
}

function OwnershipForm({
  contract,
  onClose,
}: {
  contract: VoucherContractControl;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { form, submission, delegationStatus, pending } = useVoucherOwnershipTransferForm({
    tokenAddress: contract.tokenAddress,
    ownerAddress: contract.ownerAddress,
    walletAddress: contract.walletAddress,
    onClose,
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          <Trans>The new owner can create vouchers and transfer ownership.</Trans>
        </p>
        {submission ? (
          <p role="status" className="text-xs break-all">
            <Trans>Check the existing submission before another transfer:</Trans>{" "}
            <span className="font-mono">{submission.trackingId}</span>
          </p>
        ) : null}
        <form.Field name="newOwnerAddress">
          {(field) => (
            <Field
              label={t`New owner address`}
              htmlFor="desk-voucher-new-owner"
              error={getFieldError(field.state.meta.errors)}
            >
              <RecipientAddressInput
                id="desk-voucher-new-owner"
                defaultValue={field.state.value}
                onValueChange={field.handleChange}
                onRecipientChange={(recipient) => {
                  if (recipient) field.handleChange(recipient.address);
                }}
                onBlur={field.handleBlur}
                ariaLabel={t`New owner address`}
                disabled={pending || !!submission}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              <RecipientOwnerNotice address={field.state.value} />
            </Field>
          )}
        </form.Field>
      </div>
      <FormFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" pending={pending}>
          {!submission && delegationStatus === "checking" ? (
            <Trans>Preparing wallet…</Trans>
          ) : pending ? (
            <Trans>Transferring ownership…</Trans>
          ) : submission ? (
            <Trans>Check transfer status</Trans>
          ) : (
            <Trans>Transfer ownership</Trans>
          )}
        </Button>
      </FormFooter>
    </form>
  );
}

/** The phone sheet's fields, two columns where a pair belongs together. */
function ProfileForm({ voucher, onClose }: { voucher: MarketVoucherDetail; onClose: () => void }) {
  const { t, i18n } = useLingui();
  const termsLabelId = useId();
  const { form, update, tagsQuery, iconBusy, setIconBusy } = useVoucherProfileForm(
    voucher,
    onClose,
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-4 p-4">
        <form.Field name="displayName">
          {(field) => (
            <Field
              label={t`Display name`}
              htmlFor="desk-voucher-display-name"
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id="desk-voucher-display-name"
                className="bg-card"
                value={field.state.value}
                maxLength={120}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Field
              label={t`Voucher Description`}
              htmlFor="desk-voucher-description"
              error={getFieldError(field.state.meta.errors)}
            >
              <Textarea
                id="desk-voucher-description"
                className="bg-card"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                maxLength={500}
                aria-invalid={field.state.meta.errors.length > 0}
              />
            </Field>
          )}
        </form.Field>
        <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-3">
          <form.Field name="voucherValue">
            {(field) => (
              <Field
                label={t`Price`}
                htmlFor="desk-voucher-price"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id="desk-voucher-price"
                  dir="ltr"
                  inputMode="decimal"
                  className="bg-card font-mono"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="voucherUoa">
            {(field) => (
              <Field
                label={t`Priced in`}
                htmlFor="desk-voucher-currency"
                error={getFieldError(field.state.meta.errors)}
              >
                <UnitOfAccountCombobox
                  id="desk-voucher-currency"
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  placeholder={t`Search units of account`}
                  emptyMessage={t`No units of account found`}
                />
              </Field>
            )}
          </form.Field>
        </div>
        {isStorageConfigured ? (
          <form.Field name="iconUrl">
            {(field) => (
              <ImageUploadField
                label={t`Logo`}
                hint={t`Optional`}
                purpose="voucher.icon"
                value={field.state.value || null}
                onChange={(url) => field.handleChange(url ?? "")}
                onBusyChange={setIconBusy}
                disabled={update.isPending}
              />
            )}
          </form.Field>
        ) : null}
        <form.Field name="location">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            return (
              <LocationPicker
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
                error={error ? translateValidationError(error, i18n) : undefined}
              />
            );
          }}
        </form.Field>
        <PublicLocationWarning />
        <form.Subscribe selector={(state) => state.values.markerIcon}>
          {(icon) => (
            <div className="border border-border p-4">
              <MarkerStylePicker
                kind={voucher.kind}
                value={icon}
                onChange={(next) => form.setFieldValue("markerIcon", next)}
                disabled={update.isPending}
              />
            </div>
          )}
        </form.Subscribe>
        <form.Field name="tags">
          {(field) => (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">
                <Trans>Tags</Trans>
              </p>
              {tagsQuery.isPending ? (
                <p className="text-xs text-muted-foreground">
                  <Trans>Loading tags…</Trans>
                </p>
              ) : null}
              {tagsQuery.isError ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-destructive">
                    <Trans>Couldn't load voucher tags.</Trans>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    pending={tagsQuery.isFetching}
                    onClick={() => void tagsQuery.refetch()}
                  >
                    <Trans>Retry</Trans>
                  </Button>
                </div>
              ) : null}
              {tagsQuery.data?.length ? (
                <TagCombobox
                  items={tagsQuery.data}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  searchLabel={t`Search voucher tags`}
                  selectedLabel={t`Selected voucher tags`}
                  listLabel={t`Voucher tags`}
                  placeholder={t`Search tags`}
                  removeLabel={(tag) => t`Remove ${tag}`}
                />
              ) : null}
            </div>
          )}
        </form.Field>
        <PublicContactWarning />
        <div className="grid grid-cols-2 items-start gap-3">
          <form.Field name="email">
            {(field) => (
              <Field
                label={t`Contact Email`}
                htmlFor="desk-voucher-email"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id="desk-voucher-email"
                  dir="ltr"
                  type="email"
                  autoComplete="email"
                  className="bg-card"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="you@example.com"
                  aria-invalid={field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="website">
            {(field) => (
              <Field
                label={t`Contact Website`}
                htmlFor="desk-voucher-website"
                error={getFieldError(field.state.meta.errors)}
              >
                <Input
                  id="desk-voucher-website"
                  dir="ltr"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  className="bg-card"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="https://example.com"
                  aria-invalid={field.state.meta.errors.length > 0}
                />
              </Field>
            )}
          </form.Field>
        </div>
        <form.Field name="phone">
          {(field) => (
            <Field
              label={t`Contact Phone`}
              htmlFor="desk-voucher-phone"
              error={getFieldError(field.state.meta.errors)}
            >
              <DeskPhoneField
                id="desk-voucher-phone"
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
                invalid={field.state.meta.errors.length > 0}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name="termsMode">
          {(modeField) => (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  <Trans>Terms</Trans>
                </p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Trans>Write my own</Trans>
                  <Switch
                    checked={modeField.state.value === "text"}
                    onCheckedChange={(checked) => {
                      modeField.handleChange(checked ? "text" : "url");
                      form.setFieldValue("terms", "");
                    }}
                  />
                </label>
              </div>
              {modeField.state.value === "text" ? (
                <form.Field
                  name="terms"
                  validators={{
                    onBlur: optionalTermsTextSchema,
                    onSubmit: optionalTermsTextSchema,
                  }}
                >
                  {(field) => {
                    const error = getFieldError(field.state.meta.errors);
                    return (
                      <div>
                        <label
                          id={termsLabelId}
                          htmlFor="desk-voucher-terms-text"
                          className="mb-1.5 block text-xs text-muted-foreground"
                        >
                          <Trans>Shown to anyone holding this voucher</Trans>
                        </label>
                        <MarkdownEditor
                          id="desk-voucher-terms-text"
                          aria-labelledby={termsLabelId}
                          aria-invalid={field.state.meta.errors.length > 0}
                          maxLength={TERMS_TEXT_MAX}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          placeholder={t`Redeemable at our stall on market days...`}
                        />
                        {error ? <FieldError error={error} /> : null}
                      </div>
                    );
                  }}
                </form.Field>
              ) : (
                <form.Field
                  name="terms"
                  validators={{ onBlur: optionalTermsUrlSchema, onSubmit: optionalTermsUrlSchema }}
                >
                  {(field) => {
                    const error = getFieldError(field.state.meta.errors);
                    return (
                      <div>
                        <Input
                          id="desk-voucher-terms-url"
                          dir="ltr"
                          type="url"
                          inputMode="url"
                          autoComplete="url"
                          className="bg-card"
                          aria-label={t`Terms URL`}
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="https://example.com/terms"
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                        {error ? <FieldError error={error} /> : null}
                      </div>
                    );
                  }}
                </form.Field>
              )}
            </div>
          )}
        </form.Field>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-border border-t bg-card p-4">
        <Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" pending={update.isPending || iconBusy}>
          {iconBusy ? (
            <Trans>Uploading…</Trans>
          ) : update.isPending ? (
            <Trans>Saving…</Trans>
          ) : (
            <Trans>Save changes</Trans>
          )}
        </Button>
      </div>
    </form>
  );
}
