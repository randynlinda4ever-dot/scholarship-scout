export const PRIVACY_REQUEST_RECIPIENT = "levi.haidar@outlook.com";

export const PRIVACY_REQUEST_TYPES = Object.freeze([
  { value: "access", label: "Access or a copy of my information" },
  { value: "correction", label: "Correction of information" },
  { value: "deletion", label: "Deletion of information" },
  { value: "opt-out", label: "Opt out of a covered data use" },
  { value: "appeal", label: "Appeal a privacy-request decision" },
  { value: "other", label: "Another privacy or data concern" },
]);

export const PRIVACY_REQUESTER_TYPES = Object.freeze([
  { value: "self", label: "I am making this request for myself" },
  { value: "parent_guardian", label: "I am a parent or legal guardian submitting for a minor" },
  { value: "authorized_representative", label: "I am an authorized representative" },
]);

const MAX_DETAILS_LENGTH = 2000;
const MAX_EMAIL_LENGTH = 254;
const MAX_REFERENCE_LENGTH = 100;

function normalizeLineBreaks(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

export function buildPrivacyRequestMailto({
  requestType,
  requesterType = "self",
  details,
  contactEmail = "",
  previousRequestReference = "",
} = {}) {
  const selected = PRIVACY_REQUEST_TYPES.find((item) => item.value === requestType);
  if (!selected) throw new Error("Choose a valid privacy request type.");

  const requester = PRIVACY_REQUESTER_TYPES.find((item) => item.value === requesterType);
  if (!requester) throw new Error("Choose who is submitting this request.");

  const detailText = normalizeLineBreaks(details).slice(0, MAX_DETAILS_LENGTH);
  if (detailText.length < 10) throw new Error("Describe your request in at least 10 characters.");

  const replyTo = normalizeLineBreaks(contactEmail).slice(0, MAX_EMAIL_LENGTH);
  if (!replyTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    throw new Error("Enter a valid reply email address so the privacy contact can respond.");
  }

  const reference = normalizeLineBreaks(previousRequestReference)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, MAX_REFERENCE_LENGTH);
  if (requestType === "appeal" && !reference) {
    throw new Error("Enter the previous request reference you are appealing.");
  }

  const body = [
    `Request type: ${selected.label}`,
    `Submitting as: ${requester.label}`,
    `Reply email: ${replyTo}`,
    ...(requestType === "appeal" ? [`Previous request reference: ${reference}`] : []),
    "",
    "Request details:",
    detailText,
    "",
    "Do not include passwords, sign-in links, access tokens, vault passphrases, backup passwords, government identification numbers, or unnecessary student records.",
    "",
    "This request is not submitted until you send this email.",
  ].join("\n");

  const subject = requestType === "appeal"
    ? "Scholarship Scout Privacy Appeal"
    : `Scholarship Scout Privacy Request — ${selected.label}`;
  return `mailto:${PRIVACY_REQUEST_RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
