import { EllipsizedAddress } from "#/components/wallet";

export function RecipientAddressCard({ label, address }: { label: string; address: string }) {
  return (
    <div className="mb-3.5 border border-primary/30 bg-primary/5 p-3">
      <p className="font-semibold text-sm">{label}</p>
      <div className="mt-1 min-w-0 break-all">
        <EllipsizedAddress address={address} />
      </div>
    </div>
  );
}
