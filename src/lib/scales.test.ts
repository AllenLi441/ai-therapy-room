import { describe, expect, it } from "vitest";
import { suggestScale } from "./scales";

describe("suggestScale", () => {
  it("chooses the strongest matching scale instead of the first one", () => {
    expect(suggestScale("我晚上很困，但每天都拖到凌晨才睡，脑子停不下来。")).toBe("ISI");
  });

  it("suggests anxiety screening for worry-heavy language", () => {
    expect(suggestScale("我最近一直担心，焦虑，心慌，感觉停不下来。")).toBe("GAD-7");
  });
});
