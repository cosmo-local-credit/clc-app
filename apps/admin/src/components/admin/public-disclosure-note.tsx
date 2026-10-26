export function PublicDisclosureNote({ kind }: { kind: "location" | "contact" }) {
  return (
    <p className="border border-warning/40 bg-warning/10 p-3 text-sm">
      {kind === "location"
        ? "The exact pin will be public. Choose a safe public meeting place, not a private home."
        : "Contact details entered here are visible to signed-in users. Map pins and coordinates stay public. Profile contact details remain private unless they are explicitly copied or shared."}
    </p>
  );
}
