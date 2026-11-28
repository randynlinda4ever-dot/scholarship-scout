export type ExtractedProfileDetails = Partial<Record<
  | 'school'
  | 'graduationYear'
  | 'gpa'
  | 'gpaType'
  | 'classRank'
  | 'act'
  | 'sat'
  | 'apCourses'
  | 'dualCreditCourses'
  | 'academicHonors'
  | 'activities'
  | 'serviceHours'
  | 'service'
  | 'employment'
  | 'certifications'
  | 'languages'
  | 'plannedMajor'
  | 'interests',
  string
>>;

export function extractProfileDetails(sourceText: string): ExtractedProfileDetails;
export function mergeExtractedProfileDetails<T extends Record<string, unknown>>(
  profile: T,
  extracted: ExtractedProfileDetails | Record<string, unknown>,
): T & Record<string, string>;
