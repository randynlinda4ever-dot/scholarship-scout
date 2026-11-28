export const MAX_DOCUMENT_BYTES: number;
export const MAX_DOCUMENT_TEXT_CHARS: number;
export type TranscriptSuggestion = { field: string; label: string; value: string };
export function normalizeDocumentText(value: unknown, maxLength?: number): string;
export function extractTranscriptSuggestions(documentText: string): TranscriptSuggestion[];
export function createEssayDraftFromDocument(filename: string, documentText: string): { title: string; draft: string };
