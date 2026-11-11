import type {
  RetirementRequest,
  RetirementRequestStatus,
} from "@clc/api/features/retirement/client";
import { Badge } from "#/components/ui/badge";

export function RetirementStatus({ status }: { status: RetirementRequestStatus }) {
  return (
    <Badge variant="outline" className="font-mono text-xs capitalize">
      {status}
    </Badge>
  );
}

/** Who started a retirement: the owner asking, or an operator retiring directly. */
export function retirementSourceLabel(source: RetirementRequest["source"]): string {
  return source === "ADMIN" ? "Admin direct" : "Owner request";
}

export function RetirementSource({ source }: { source: RetirementRequest["source"] }) {
  return (
    <Badge variant="outline" className="font-mono text-xs uppercase">
      {retirementSourceLabel(source)}
    </Badge>
  );
}
