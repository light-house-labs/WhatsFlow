/**
 * Harbor's mark, on a 32-unit grid. Drawn in the LightHouse Labs language:
 * solid square-cornered blocks in ink, with one orange square as the light.
 *
 * Two pillars and a crossbar make an H (two harbour walls and the quay between
 * them). The orange square sits in the upper gap, a harbour light above the
 * quay, the way LightHouse Labs' orange square sits in the corner of its L.
 * The lower gap is left open: the harbour mouth.
 *
 * Everything that draws the mark (logo, favicon, app icons) reads these, so
 * they can never drift apart.
 */
export const MARK_VIEWBOX = "0 0 32 32";

/** Ink blocks: left pillar, right pillar, quay. */
export const MARK_INK = "M4 4h8v24H4zM20 4h8v24h-8zM12 16h8v5h-8z";

/** The harbour light. */
export const MARK_LIGHT = { x: 13, y: 6, size: 6 } as const;

export const BRAND_ORANGE = "#ed701d";
export const BRAND_INK = "#18181b";
