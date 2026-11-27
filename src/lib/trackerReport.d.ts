export function buildTrackerCsvReport(
  records?: Array<Record<string, unknown>>,
  assessments?: Map<string, { status?: string }> | Record<string, { status?: string }>,
  getSourceStatus?: (record: Record<string, unknown>) => string,
): string;