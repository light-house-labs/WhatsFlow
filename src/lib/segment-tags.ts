import type { SegmentCondition } from "@/db/schema";

/** The tags a tag condition names. Older segments store one `value`; newer ones store `values`. */
export function conditionTags(x: Extract<SegmentCondition, { field: "tag" }>): string[] {
  return x.values?.length ? x.values : x.value ? [x.value] : [];
}
