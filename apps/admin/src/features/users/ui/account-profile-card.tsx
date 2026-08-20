import type { AdminUser } from "@clc/api/features/admin/client";

import {
  RecordAbsent,
  RecordData,
  RecordLocation,
  RecordRow,
} from "#/components/admin/record-fields";
import { Card, CardContent } from "#/components/ui/card";

/**
 * The account's record: the rows, then the place they describe, in one column.
 *
 * The map used to sit in a column of its own beside the rows, which made this the
 * only panel in the console that was half reference and half form — it carried a
 * geocoder, a text field and a Save button of its own. Editing moved to the
 * profile sheet, so what is left is a record like the pool's and the voucher's,
 * read the same way: rows first, then the map beneath them at the card's full
 * width, which is more map than the old split gave it.
 *
 * Nothing here repeats the header: name, status, role, id and the join date all
 * live up there, and the figures are a strip of their own above this row.
 *
 * The limits are read-only here and changed in the sheet — the same division the
 * pool card draws, where every fee and dependency is shown but altered elsewhere.
 * Seeing a limit is how an operator answers "why can this user not create another
 * voucher?", which they cannot do from a form they have to open first.
 */
export function AccountProfileCard({ account }: { account: AdminUser }) {
  const point =
    account.geoLat !== null && account.geoLng !== null
      ? { lat: account.geoLat, lng: account.geoLng }
      : null;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4">
        <dl className="flex flex-col">
          <RecordRow label="Email">
            {account.email ? (
              <span className="truncate">{account.email}</span>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
          <RecordRow label="Phone">
            {account.phone ? (
              <RecordData>{account.phone}</RecordData>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
          <RecordRow label="Country">
            {account.country ? (
              <span className="font-mono text-xs uppercase">{account.country}</span>
            ) : (
              <RecordAbsent>None</RecordAbsent>
            )}
          </RecordRow>
          {/* Labelled as the profile sheet labels them, so the row an operator
              reads and the field they change are the same words. */}
          <RecordRow label="Max pools">
            <RecordData>{account.maxPools}</RecordData>
          </RecordRow>
          <RecordRow label="Max vouchers">
            <RecordData>{account.maxTokens}</RecordData>
          </RecordRow>
        </dl>

        {/* Renders nothing at all for an account with no place on record: an empty
            frame suggests a location that failed to load rather than one nobody
            set. The rows above then own the card's height. */}
        <RecordLocation point={point} name={account.locationName} className="min-h-44 flex-1" />
      </CardContent>
    </Card>
  );
}
