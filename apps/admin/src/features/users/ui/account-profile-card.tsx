import type { AdminUser } from "@clc/api/features/admin/client";
import type { ReactNode } from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SectionLabel } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Skeleton } from "#/components/ui/skeleton";
import { reverseLocation } from "#/lib/geo-client";
import { useUpdateUserProfile } from "../use-admin-users";

/**
 * The account's own details, as a section panel rather than a page shell.
 *
 * Two columns: the contact details on the left, the account's place on the right.
 *
 * Everything else that used to be here has a better home. Limits are edited in the
 * profile sheet, the address and account ID are in the header, and the last-updated
 * timestamp told an operator nothing they act on — each copy removed is one less
 * thing to keep in step, and the card is now as tall as the map rather than as tall
 * as a list of fields nobody reads twice.
 */
export function AccountProfileCard({ account }: { account: AdminUser }) {
  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle>
          <SectionLabel>Account profile</SectionLabel>
        </CardTitle>
      </CardHeader>

      <CardContent className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
        {/* Every field in one column, so the right one belongs entirely to the map. */}
        <dl className="flex flex-col gap-3">
          <Field label="Email">{account.email || <Muted>None</Muted>}</Field>
          <Field label="Phone">
            {account.phone ? (
              <span className="font-data">{account.phone}</span>
            ) : (
              <Muted>None</Muted>
            )}
          </Field>
          <Field label="Country">
            {account.country ? (
              <span className="font-mono uppercase">{account.country}</span>
            ) : (
              <Muted>None</Muted>
            )}
          </Field>
        </dl>

        <AccountLocation account={account} />
      </CardContent>
    </Card>
  );
}

/**
 * The account's place: the pin is the input, and the name follows it.
 *
 * Clicking the map moves the pin and reverse-geocodes the point, so the name is
 * always the name of where the pin is. That is why the field is not editable: a
 * typed label and a pin are two independent claims about one place, and the pair
 * clc-core stores would then be internally inconsistent with nothing to say which
 * half is right.
 *
 * If the geocoder cannot name a point, the name is cleared and Save stays
 * unavailable. Keeping the previous name would attach the last place's label to
 * this pin, which is the exact mismatch the field is disabled to prevent.
 *
 * The four identity fields ride along on the save because the endpoint assigns them
 * unconditionally; sending only a location would blank the account's name. They are
 * passed through unchanged from the record on screen.
 */
function AccountLocation({ account }: { account: AdminUser }) {
  const updateProfile = useUpdateUserProfile();

  const stored = storedLocation(account);
  const [name, setName] = useState(stored.name);
  const [point, setPoint] = useState(stored.point);
  const [resolving, setResolving] = useState(false);
  const [unnamed, setUnnamed] = useState(false);

  // One in-flight lookup at a time: a second click must win, and an answer for a
  // pin the operator has already moved off must not land in the field.
  const lookupRef = useRef<AbortController | null>(null);
  useEffect(() => () => lookupRef.current?.abort(), []);

  // Re-seeded from the record so a save, or a switch to another account, leaves the
  // controls showing what is stored rather than what was last resolved here.
  useEffect(() => {
    const next = storedLocation(account);
    setName(next.name);
    setPoint(next.point);
    setUnnamed(false);
  }, [account]);

  async function handlePin(lat: number, lng: number) {
    lookupRef.current?.abort();
    const lookup = new AbortController();
    lookupRef.current = lookup;

    setPoint({ lat, lng });
    setName("");
    setUnnamed(false);
    setResolving(true);

    const resolved = await reverseLocation(lat, lng, lookup.signal);
    if (lookup.signal.aborted) return;

    setResolving(false);
    if (resolved) setName(resolved);
    else setUnnamed(true);
  }

  const changed =
    name !== stored.name || point?.lat !== stored.point?.lat || point?.lng !== stored.point?.lng;
  const savable = changed && point !== null && name !== "" && !resolving;

  async function save() {
    if (!point || name === "") return;
    try {
      await updateProfile.mutateAsync({
        address: account.ethereumAddress,
        profile: {
          name: account.name,
          email: account.email,
          phone: account.phone,
          country: account.country,
          locationName: name,
          geoLat: point.lat,
          geoLng: point.lng,
        },
      });
      toast.success("Location updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the location.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* No heading above the map: it is unmistakably a map, and the label was a
          line of height taken from the thing that needed it. */}
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <LocationMap
          lat={point?.lat}
          lng={point?.lng}
          interactive
          onLocationChange={(lat, lng) => void handlePin(lat, lng)}
        />
      </Suspense>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-location-name">Location name</Label>
        <div className="flex items-center gap-2">
          <Input
            id="account-location-name"
            // Not editable on purpose: the value describes wherever the pin is.
            disabled
            value={resolving ? "Finding this place…" : name}
            placeholder="Click the map to set a location"
          />
          <Button
            size="lg"
            disabled={!savable || updateProfile.isPending}
            onClick={() => void save()}
          >
            {updateProfile.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        {unnamed ? (
          <p className="text-xs text-destructive">No place found here. Try a nearby point.</p>
        ) : point ? (
          <p className="font-data text-xs text-muted-foreground">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The stored place, as the controls above start from. */
function storedLocation(account: AdminUser): {
  name: string;
  point: { lat: number; lng: number } | null;
} {
  return {
    name: account.locationName ?? "",
    point:
      account.geoLat !== null && account.geoLng !== null
        ? { lat: account.geoLat, lng: account.geoLng }
        : null,
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
