export interface DemoProfile {
  name: string;
  grade: string;
  graduationYear: string;
  state: string;
  interests: string;
  note: string;
}

export interface DemoScholarship {
  id: string;
  name: string;
  provider: string;
  award: string;
  deadline: string;
  stateEligibility: readonly string[];
  category: string;
  summary: string;
  requirements: readonly string[];
}

export interface DemoScholarshipFilters {
  query?: string;
  state?: string;
  category?: string;
}

export const DEMO_PROFILE: Readonly<DemoProfile>;
export const DEMO_SCHOLARSHIPS: readonly DemoScholarship[];

export function filterDemoScholarships(
  records: readonly DemoScholarship[],
  filters?: DemoScholarshipFilters,
): DemoScholarship[];
