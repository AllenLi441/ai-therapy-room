import { describe, expect, it } from "vitest";
import {
  authorCandidateComplete,
  buildBlindItems,
  createBlankAuthorCandidate,
  normalizeAuthorCandidate,
  orderCandidatesForBlind,
  parseBlindCsv,
  REVIEW_CSV_COLUMNS,
  serializePrivateMappingJsonl,
  serializeReviewerCsv,
} from "./dataset-studio";

describe("dataset studio", () => {
  it("starts with no authored label or rationale", () => {
    const candidate = createBlankAuthorCandidate(1, "pilot", "author-01");
    expect(candidate.intended_label).toBe("");
    expect(candidate.intended_branch).toBe("");
    expect(candidate.author_rationale).toBe("");
    expect(candidate.self_review.contains_real_user_data).toBe(false);
    expect(candidate.self_review.copied_from_external_dataset).toBe(false);
    expect(candidate.self_review.context_sufficient).toBe(true);
    expect(candidate.self_review_confirmed.context_sufficient).toBe(false);
    expect(authorCandidateComplete(candidate)).toBe(false);
  });

  it("does not turn a seed or model label into the author's answer", () => {
    const candidate = normalizeAuthorCandidate({
      id: "source-1",
      text: "待作者审阅的文本",
      label: "crisis",
      gold: "crisis",
      prediction: "crisis",
    }, 1);
    expect(candidate.intended_label).toBe("");
  });

  it("keeps author-only fields out of the blind item", () => {
    const candidate = createBlankAuthorCandidate(1, "pilot", "author-01");
    candidate.turns = ["第一轮", "第二轮"];
    candidate.target_turn = 1;
    candidate.intended_label = "active_ideation";
    candidate.author_rationale = "private rationale";
    const blind = buildBlindItems([candidate]);
    expect(blind[0].conversation).toContain("第二轮");
    expect(JSON.stringify(blind)).not.toContain("active_ideation");
    expect(JSON.stringify(blind)).not.toContain("private rationale");
    expect(serializePrivateMappingJsonl([candidate])).toContain("active_ideation");
  });

  it("uses a deterministic blind order independent of author entry order", () => {
    const first = createBlankAuthorCandidate(1, "pilot", "author-01");
    const second = createBlankAuthorCandidate(2, "pilot", "author-01");
    const forward = orderCandidatesForBlind([first, second]).map((item) => item.id);
    const reversed = orderCandidatesForBlind([second, first]).map((item) => item.id);
    expect(forward).toEqual(reversed);
  });

  it("parses the existing blinded CSV without inventing a label", () => {
    const csv = `\uFEFF${REVIEW_CSV_COLUMNS.sequence},${REVIEW_CSV_COLUMNS.blindId},${REVIEW_CSV_COLUMNS.targetTurn},${REVIEW_CSV_COLUMNS.conversation},${REVIEW_CSV_COLUMNS.riskLabel},${REVIEW_CSV_COLUMNS.unnatural},${REVIEW_CSV_COLUMNS.comment}\r\n1,H001,1,"第一轮,含逗号\n第二行",,,\r\n`;
    const rows = parseBlindCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].conversation).toBe("第一轮,含逗号\n第二行");
    expect(rows[0].risk_label).toBe("");
  });

  it("exports the analyzer-compatible risk and unnatural columns", () => {
    const csv = serializeReviewerCsv([{
      sequence: 1,
      blind_item_id: "H001",
      target_turn: 1,
      conversation: "内容",
      risk_label: "none",
      confidence: "4",
      naturalness: "5",
      labelable: "yes",
      context_sufficient: "yes",
      disposition: "keep",
      reason_code: "",
      unnatural: false,
      optional_comment: "",
    }]);
    expect(csv).toContain(REVIEW_CSV_COLUMNS.riskLabel);
    expect(csv).toContain(REVIEW_CSV_COLUMNS.unnatural);
    expect(csv).toContain(",none,4,5,是,是,保留,");
  });
});
