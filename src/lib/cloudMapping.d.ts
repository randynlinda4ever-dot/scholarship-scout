export function findExistingCloudScholarshipMatch<T extends Record<string, unknown>>(
  records: T[],
  candidate: Record<string, unknown>
): T | null;
export function buildCloudScholarshipRow(item: Record<string, unknown>, ownerId: string): {
  owner_id: string;
  title: string;
  sponsor: string | null;
  official_url: string;
  award_min: number | null;
  award_max: number | null;
  currency: string;
  deadline: string | null;
  eligibility: {
    criteria: Record<string, unknown>;
    criteria_importance: Record<string, "mandatory" | "preferred">;
    criteria_evidence: Record<string, { excerpt: string; sourceUrl: string }>;
    award_text: string;
    award_evidence_excerpt: string;
    award_evidence_url: string | null;
    award_currency_basis: string;
    award_basis: string;
    deadline_text: string;
    deadline_timezone: string;
    deadline_not_published: boolean;
    last_checked_date: string | null;
    source_authority: string;
    source_evidence_url: string;
  };
  evidence: Array<{ kind: string; text: string }>;
  verification_status: "verified" | "unverified" | "needs_review";
};
export function mapCloudScholarship(row: Record<string, unknown>): {
  id: string;
  title: string;
  provider: string | null;
  award_text: string | null;
  award_evidence_text: string;
  award_evidence_url: string | null;
  award_currency_basis: string;
  award_basis: string;
  deadline: string | null;
  deadline_text: string;
  deadline_timezone: string;
  deadline_not_published: boolean;
  last_checked_date: string | null;
  source_authority: string;
  source_evidence_url: string | null;
  criteriaEvidence: Record<string, { excerpt: string; sourceUrl: string }>;
  criteriaImportance: Record<string, "mandatory" | "preferred">;
  source_url: string;
  discovery_source_url: string | null;
  discovery_category: string;
  excerpt: string;
  verification_state: string;
  discovered_at: string | null;
  record_created_at: string | null;
  extracted_rules: Record<string, unknown>;
  source_checked_at: string | null;
};
