import type { RetirementRequestStatus } from "@clc/api/features/retirement/client";
import { Badge } from "#/components/ui/badge";

export function RetirementStatus({ status }: { status: RetirementRequestStatus }) {
  return (
    <Badge variant="outline" className="font-mono text-xs capitalize">
      {status}
    </Badge>
  );
}
