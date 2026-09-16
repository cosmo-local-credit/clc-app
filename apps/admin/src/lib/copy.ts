import { toast } from "sonner";

export async function copyText(value: string, label = "Copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
    return true;
  } catch {
    toast.error("Could not copy to clipboard");
    return false;
  }
}
