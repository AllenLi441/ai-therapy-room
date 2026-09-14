import type { KnowledgeCard } from "./types";
import cards from "./knowledge-reference-cards.json";

/** Source verification is distinct from professional approval. These locally
 * curated references may ground general-information replies; they do not grant
 * clinical approval to pending cards received from any other data source.
 */
export type KnowledgeReferenceCard = KnowledgeCard & {
  clinicalStatus: "pending";
  channel: "grounded_information";
  professionalReview: "not_performed";
  applicability: string[];
  evidenceSummary: string;
  sourceSection: string;
  authorship: string;
  sourceReview: {
    status: "verified_primary";
    verifiedAt: string;
    allowedUse: "general_information";
  };
};

export const KNOWLEDGE_REFERENCE_CARDS = cards as KnowledgeReferenceCard[];
