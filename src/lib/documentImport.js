export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_CHARS = 60_000;

export function normalizeDocumentText(value, maxLength = MAX_DOCUMENT_TEXT_CHARS) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, Math.max(0, Math.floor(maxLength)));
}

function addSuggestion(suggestions, field, label, value) {
  const normalized = String(value ?? "").trim();
  if (normalized) suggestions.push({ field, label, value: normalized });
}

export function extractTranscriptSuggestions(documentText) {
  const text = normalizeDocumentText(documentText);
  const suggestions = [];
  const gpa = text.match(/\b(?:(weighted|unweighted)\s+)?(?:cumulative\s+)?(?:weighted\s+)?GPA\s*[:=\-]?\s*(\d{1,2}(?:\.\d{1,3})?)(?![\d.])(?:\s*\/\s*(4(?:\.0)?|5(?:\.0)?))?(?!\s*\/\s*\d)/i);
  if (gpa) {
    const value = Number(gpa[2]);
    const scale = gpa[3] ? Number(gpa[3]) : null;
    const type = /\bunweighted\b/i.test(gpa[0]) ? "Unweighted" : /\bweighted\b/i.test(gpa[0]) ? "Weighted" : "";
    if (Number.isFinite(value) && value >= 0 && value <= (scale ?? 5)) {
      addSuggestion(suggestions, "gpa", "GPA", gpa[2]);
      if (type || scale) {
        const descriptor = [type, scale ? `/ ${scale.toFixed(1)}` : ""].filter(Boolean).join(" ");
        addSuggestion(suggestions, "gpaType", "GPA type and scale", descriptor);
      }
    }
  }

  const rank = text.match(/\b(?:class\s+rank|rank)\s*[:#=\-]?\s*(\d{1,4})\s*(?:of|\/)\s*(\d{1,5})\b/i);
  if (rank && Number(rank[1]) > 0 && Number(rank[2]) >= Number(rank[1])) {
    addSuggestion(suggestions, "classRank", "Official class rank", `${rank[1]}/${rank[2]}`);
    addSuggestion(suggestions, "rankDetails", "Rank source and clarification", "Extracted from uploaded transcript; confirm the official rank and date with your school.");
  }

  const act = text.match(/\bACT(?:\s+composite)?(?:\s+score)?\s*[:=\-]?\s*(\d{1,2})\b/i);
  if (act && Number(act[1]) >= 1 && Number(act[1]) <= 36) {
    addSuggestion(suggestions, "act", "ACT composite", act[1]);
  }

  const sat = text.match(/\bSAT(?:\s+total)?(?:\s+score)?\s*[:=\-]?\s*(\d{3,4})\b/i);
  if (sat && Number(sat[1]) >= 400 && Number(sat[1]) <= 1600) {
    addSuggestion(suggestions, "sat", "SAT score", sat[1]);
  }

  const credits = text.match(/\b(?:credits\s+earned|earned\s+credits|total\s+credits)\s*[:=\-]?\s*(\d{1,3}(?:\.\d{1,2})?)\b/i);
  if (credits && Number(credits[1]) >= 0 && Number(credits[1]) <= 500) {
    addSuggestion(suggestions, "credits", "Credits earned", credits[1]);
  }

  return suggestions;
}

export function createEssayDraftFromDocument(filename, documentText) {
  const safeName = String(filename ?? "Imported essay")
    .replace(/\.[^.]+$/, "")
    .replace(/\.(?:final|draft|version\d+|v\d+)$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const draft = normalizeDocumentText(documentText);
  if (draft.length > 20_000) {
    throw new Error("This essay is longer than the 20,000-character draft limit. Split it into separate drafts before importing; no text was saved.");
  }
  return {
    title: safeName || "Imported essay",
    draft,
  };
}
