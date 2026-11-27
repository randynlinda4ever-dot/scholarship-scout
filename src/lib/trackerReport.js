function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = "'" + text;
  if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}
function readAssessment(assessments, id) {
  if (assessments instanceof Map) return assessments.get(id);
  if (assessments && typeof assessments === "object") return assessments[id];
  return undefined;
}
export function buildTrackerCsvReport(records = [], assessments = new Map(), getSourceStatus = () => "unverified") {
  const headers = ["Scholarship", "Sponsor", "Award", "Deadline", "Application status", "Priority", "Eligibility status", "Source review", "Tags", "Archived"];
  const lines = [headers.map(csvCell).join(",")];
  for (const item of Array.isArray(records) ? records : []) {
    if (!item || typeof item !== "object") continue;
    const assessment = readAssessment(assessments, item.id);
    const cells = [
      item.name, item.provider, item.award, item.deadlineText || item.deadline,
      item.applicationStatus || "Not started", item.priority || "Medium",
      assessment?.status || "Needs information", getSourceStatus(item),
      Array.isArray(item.tags) ? item.tags.join("; ") : "",
      item.archived === true ? "Archived" : "Active",
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}