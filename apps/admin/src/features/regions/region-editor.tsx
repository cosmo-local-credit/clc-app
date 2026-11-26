import {
  regionCountriesQueryOptions,
  regionCountryQueryOptions,
} from "@clc/api/features/regions/queries";
import type { Region, RegionBoundary, RegionInput } from "@clc/core/features/regions/logic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { readRegionBoundary } from "./boundary-upload";
import { RegionMap } from "./region-map.lazy";

type BoundaryMode = "country" | "custom";
const PREVIEW_ID = "preview";
const HIGHLIGHT = [PREVIEW_ID];
const SELECT_STYLE = "h-9 w-full border border-input bg-card px-3 text-sm text-foreground";

export function RegionEditor({
  viewer,
  region,
  onSaved,
  onCancel,
}: {
  viewer: string;
  region?: Region;
  onSaved: (region: Region) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<BoundaryMode>(
    region && !region.countryCode ? "custom" : "country",
  );
  const [name, setName] = useState(region?.name ?? "");
  const [nameEdited, setNameEdited] = useState(false);
  const [countryCode, setCountryCode] = useState(region?.countryCode ?? "");
  const [countrySearch, setCountrySearch] = useState("");
  const [customBoundary, setCustomBoundary] = useState<RegionBoundary | undefined>(
    region && !region.countryCode ? region.boundary : undefined,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const latestUpload = useRef(0);
  const [active, setActive] = useState(region?.active ?? true);
  const [reviewed, setReviewed] = useState(false);
  const [confirmedDeactivation, setConfirmedDeactivation] = useState(false);
  const countries = useQuery({
    ...regionCountriesQueryOptions(clcApi.regions, viewer),
    enabled: mode === "country",
  });
  const needsPreview = mode === "country" && !!countryCode && region?.countryCode !== countryCode;
  const country = useQuery({
    ...regionCountryQueryOptions(clcApi.regions, viewer, countryCode),
    enabled: needsPreview,
  });
  const boundary =
    mode === "custom"
      ? customBoundary
      : needsPreview
        ? country.data?.boundary
        : region?.countryCode === countryCode
          ? region?.boundary
          : undefined;
  const areas = useMemo(() => (boundary ? [{ id: PREVIEW_ID, boundary }] : []), [boundary]);
  const save = useMutation({
    mutationFn: (input: RegionInput) =>
      region
        ? clcApi.regions.update(region.id, { ...input, revision: region.revision })
        : clcApi.regions.create(input),
    onSuccess: onSaved,
  });
  const isDeactivating = !!region?.active && !active;
  const canSave =
    !!boundary &&
    !!name.trim() &&
    reviewed &&
    !save.isPending &&
    (!isDeactivating || confirmedDeactivation);
  const search = countrySearch.trim().toLowerCase();
  const options = countries.data?.filter(
    (item) =>
      item.code === countryCode ||
      item.name.toLowerCase().includes(search) ||
      item.code.toLowerCase().includes(search),
  );

  async function loadBoundary(file: File) {
    const version = ++latestUpload.current;
    setCustomBoundary(undefined);
    setUploadError(null);
    setReviewed(false);
    try {
      const next = await readRegionBoundary(file);
      if (version === latestUpload.current) setCustomBoundary(next);
    } catch (error) {
      if (version === latestUpload.current) setUploadError(errorMessage(error));
    }
  }

  return (
    <section
      aria-labelledby="region-editor-heading"
      className="space-y-4 border border-border bg-card p-4"
    >
      <h2 id="region-editor-heading">{region ? "Edit region" : "Add region"}</h2>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave || !boundary) return;
          const common = { name: name.trim(), active, poolApproval: region?.poolApproval ?? false };
          save.mutate(
            mode === "country"
              ? { ...common, countryCode, boundary }
              : { ...common, countryCode: null, boundary },
          );
        }}
      >
        <fieldset disabled={save.isPending} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Region name
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameEdited(true);
              }}
              required
              maxLength={100}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Boundary source
            <select
              className={SELECT_STYLE}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value === "country" ? "country" : "custom");
                setReviewed(false);
              }}
            >
              <option value="country">Country or territory</option>
              <option value="custom">Upload GeoJSON or KML</option>
            </select>
          </label>
          {mode === "country" ? (
            <div className="space-y-2">
              {countries.isError ? (
                <div role="alert" className="space-y-2 text-sm">
                  <p>Couldn’t load countries. {errorMessage(countries.error)}</p>
                  <Button type="button" variant="outline" onClick={() => void countries.refetch()}>
                    Retry countries
                  </Button>
                </div>
              ) : countries.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading countries…
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Search countries
                    <Input
                      type="search"
                      value={countrySearch}
                      onChange={(event) => setCountrySearch(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Country or territory
                    <select
                      className={SELECT_STYLE}
                      value={countryCode}
                      onChange={(event) => {
                        const option = countries.data?.find(
                          (item) => item.code === event.target.value,
                        );
                        setCountryCode(event.target.value);
                        setReviewed(false);
                        if (option && (!name.trim() || (!region && !nameEdited))) {
                          setName(option.name);
                        }
                      }}
                    >
                      <option value="">Select a country</option>
                      {options?.map(({ code, name }) => (
                        <option key={code} value={code}>
                          {name} ({code})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {needsPreview && country.isError ? (
                <div role="alert" className="space-y-2 text-sm">
                  <p>Couldn’t load the boundary. {errorMessage(country.error)}</p>
                  <Button type="button" variant="outline" onClick={() => void country.refetch()}>
                    Retry boundary
                  </Button>
                </div>
              ) : needsPreview && country.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading boundary…
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Boundary file
                <Input
                  type="file"
                  accept=".geojson,.json,.kml"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void loadBoundary(file);
                  }}
                />
              </label>
              {uploadError ? (
                <p role="alert" className="text-sm text-destructive">
                  {uploadError}
                </p>
              ) : null}
            </div>
          )}
          {boundary ? (
            <div className="space-y-2">
              <RegionMap areas={areas} highlighted={HIGHLIGHT} />
              <p className="text-sm text-muted-foreground">
                {mode === "country"
                  ? `Country boundary · ${countryCode}`
                  : "Uploaded custom boundary"}
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I have reviewed this boundary
              </label>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
                setConfirmedDeactivation(false);
              }}
            />
            Active region
          </label>
          {isDeactivating ? (
            <label className="flex items-start gap-2 border border-border bg-muted p-3 text-sm">
              <input
                type="checkbox"
                checked={confirmedDeactivation}
                onChange={(event) => setConfirmedDeactivation(event.target.checked)}
              />
              Deactivating this region removes its regional admin assignments. I want to continue.
            </label>
          ) : null}
        </fieldset>
        {save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(save.error)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canSave}>
            {save.isPending ? "Saving…" : "Save region"}
          </Button>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
