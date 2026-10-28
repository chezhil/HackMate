import type { ChecklistItem } from "./types";

/** Marking a link or file item done never substitutes for supplying its proof. */
export function checklistComplete(item: ChecklistItem): boolean {
  return item.done && (item.kind === "file" ? Boolean(item.file) : item.kind === "link" ? Boolean(item.value || item.file) : true);
}
