import { describe, expect, it } from "vitest";
import { SCALES as UI_SCALES } from "../components/jingshi/data";
import { getScaleById } from "./scales";
import type { ScaleId } from "./types";

// P3-c: the UI used to score scales inline (data.ts bands), separate from the
// canonical lib/scales.ts scoreScale. ScaleModal now scores via scoreScale; this
// guards the two definitions from drifting — same item counts, same band cutoffs,
// same number of severity tiers. If anyone edits one set of thresholds and not the
// other, this fails.

const IDS: ScaleId[] = ["PHQ-9", "GAD-7", "ISI"];

describe("scale definitions: UI (data.ts) and lib/scales.ts agree — no scoring drift", () => {
  for (const id of IDS) {
    it(`${id}: item count + band cutoffs match`, () => {
      const ui = UI_SCALES[id];
      const def = getScaleById(id);
      expect(def).toBeTruthy();
      if (!def) return;

      // item counts must match so per-item answers line up
      expect(def.items.length).toBe(ui.items.zh.length);
      expect(def.items.length).toBe(ui.items.en.length);

      const maxTotal = ui.items.zh.length * ui.maxEach;

      // UI band boundaries = each band's max, dropping the final ceiling band
      const uiBounds = ui.bands.slice(0, -1).map((b) => b.max);

      // lib band boundaries = totals where scoring() switches tier
      const libBounds: number[] = [];
      for (let t = 0; t < maxTotal; t++) {
        if (def.scoring(t) !== def.scoring(t + 1)) libBounds.push(t);
      }

      expect(libBounds).toEqual(uiBounds);
      // same number of severity tiers (boundaries + 1)
      expect(ui.bands.length).toBe(libBounds.length + 1);
    });
  }
});
