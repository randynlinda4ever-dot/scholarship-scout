import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_TEXT_CHARS, normalizeDocumentText } from "./documentImport.js";

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt"]);

function extensionOf(filename) {
  const name = String(filename ?? "");
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export async function extractDocumentText(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Choose a PDF, Word document, or text file.");
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("The document must be between 1 byte and 10 MB.");
  }
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Supported documents are PDF, DOCX, and TXT. Scanned PDFs and images are not processed.");
  }

  let text = "";
  if (extension === "txt") {
    text = await file.text();
  } else {
    const buffer = await file.arrayBuffer();
    if (extension === "docx") {
      const mammothModule = await import("mammoth/mammoth.browser.js");
      const mammoth = mammothModule.default ?? mammothModule;
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      text = result.value ?? "";
    } else {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      if (pdf.numPages > 50) {
        await pdf.destroy();
        throw new Error("PDFs are limited to 50 pages. Split the document and upload only the pages you need.");
      }
      const pages = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          pages.push(content.items
            .map((item) => item && typeof item === "object" && "str" in item ? item.str : "")
            .filter(Boolean)
            .join(" "));
        }
      } finally {
        await pdf.destroy();
      }
      text = pages.join("\n\n");
    }
  }

  const normalized = normalizeDocumentText(text);
  if (!normalized) {
    throw new Error("No selectable text was found. Scanned or image-only documents are not supported; enter the information manually instead.");
  }
  if (normalized.length >= MAX_DOCUMENT_TEXT_CHARS && text.length > normalized.length) {
    throw new Error("This document contains too much text. Split it into smaller files and retry.");
  }
  return normalized;
}
