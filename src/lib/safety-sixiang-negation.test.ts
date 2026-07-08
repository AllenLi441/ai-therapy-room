import { describe, expect, it } from "vitest";
import { assessRisk, getDangerLevel } from "./safety";

// Guards the 2026-06-08 Chinese 想死/不想活着 refinements:
//  (1) 想死 no longer false-fires on idioms (想死我了), rote (不想死记) or lone
//      negation (我不想死) — but real ideation, including ambivalence, still fires;
//  (2) the 不想活着 ideation family (was a real-danger MISS) now fires.
// NEVER weakens danger detection — only drops provably-benign 想死 occurrences.

const isHigh = (text: string) => getDangerLevel(assessRisk(text)) >= 3;

describe("想死 — benign idiom/rote/lone-negation must NOT fire", () => {
  for (const text of [
    "我不想死",
    "这道题想死我了",
    "我不想死记硬背这些公式",
    "想死你了，好久不见",
    "笑死我了想死你了",
  ]) {
    it(`safe: ${text}`, () => {
      expect(isHigh(text)).toBe(false);
    });
  }
});

describe("想死 — real ideation (incl. ambivalence) MUST fire", () => {
  for (const text of [
    "我想死",
    "我真的想死",
    "好想死",
    "我想死了",
    "我有时想死有时又不想死",
    "我又想死又不想死",
  ]) {
    it(`danger: ${text}`, () => {
      expect(isHigh(text)).toBe(true);
    });
  }
});

describe("不想活着 family — was a MISS, MUST fire now", () => {
  for (const text of ["我不想活着", "我不想活着了", "真的不想活下去了"]) {
    it(`danger: ${text}`, () => {
      expect(isHigh(text)).toBe(true);
    });
  }
});

describe("regressions kept", () => {
  it("clear denial stays safe: 我没想过自杀", () => {
    expect(isHigh("我没想过自杀")).toBe(false);
  });
  it("想死 benign but other real risk present still fires: 我不想死，但我有自杀计划", () => {
    expect(isHigh("我不想死，但我有自杀计划")).toBe(true);
  });
});

// §2 over-suppression guard (internal safety review 2026-06-16): the negation fix must NOT
// false-suppress real ideation where 不 belongs to a surrounding word (控制不住).
describe("§2 fix must NOT over-suppress — embedded 不 and real 自杀 still fire", () => {
  for (const text of [
    "我控制不住想死",
    "我控制不住想自杀",
    "我想自杀",
    "我有自杀计划",
    "我没想过自杀，但最近控制不住想死",
  ]) {
    it(`danger: ${text}`, () => {
      expect(isHigh(text)).toBe(true);
    });
  }
});

describe("§2 clear 自杀 / 想死 denials stay safe (incl. 没有 variant)", () => {
  for (const text of [
    "我没想过自杀",
    "我没有自杀的念头",
    "我不会自杀的",
    "我从来没有想过自杀，就是最近压力大",
    "我从来没有想死过",
    "我没有想死的念头"
  ]) {
    it(`safe: ${text}`, () => {
      expect(isHigh(text)).toBe(false);
    });
  }
});
