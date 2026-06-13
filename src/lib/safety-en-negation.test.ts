import { describe, expect, it } from "vitest";
import { assessRisk } from "./safety";

// Guards the 2026-06-08 English-version safety fixes:
//  (1) apostrophe normalization so negated reassurances are recognized,
//  (2) the "don't want to live anymore" ideation family (was a real-danger MISS),
//  (3) no false positives on benign hyperbole / programmer talk.
// English is the interview-demo language — these must not regress.

describe("EN safety — negated reassurance is NOT a crisis", () => {
  for (const text of [
    "I don't want to kill myself",
    "I do not want to kill myself",
    "I am not suicidal",
    "I'm not suicidal",
    "I have no thoughts of suicide",
    "I don't want to hurt myself",
  ]) {
    it(`safe: ${text}`, () => {
      expect(assessRisk(text).level).not.toBe("high");
    });
  }
});

describe("EN safety — explicit suicidal ideation MUST fire", () => {
  for (const text of [
    "I want to kill myself",
    "I want to die",
    "I don't want to live anymore",
    "I do not want to live anymore",
    "I don't want to live any longer",
    "I don't want to be alive anymore",
    "I have pills next to me and I'm done",
  ]) {
    it(`danger: ${text}`, () => {
      expect(assessRisk(text).level).toBe("high");
    });
  }
});

describe("EN safety — benign sentences must NOT false-trigger", () => {
  for (const text of [
    "I don't want to live in this city anymore",
    "I want to live my best life",
    "I don't want to kill this process",
    "I don't want to be alive at 6am for this meeting",
    "I've been so stressed lately and can't sleep",
  ]) {
    it(`benign: ${text}`, () => {
      expect(assessRisk(text).level).not.toBe("high");
    });
  }
});
