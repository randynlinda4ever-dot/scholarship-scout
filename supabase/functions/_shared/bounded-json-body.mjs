export async function readBoundedJsonBody(request, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("A positive safe request-body limit is required.");
  }

  const declaredLength = request?.headers?.get?.("content-length");
  if (declaredLength !== null && declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new TypeError("The request Content-Length header is invalid.");
    }
    const declaredBytes = Number(declaredLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      try { await request.body?.cancel(); } catch { /* the body is rejected either way */ }
      throw new RangeError("body-too-large");
    }
  }

  if (!request?.body || typeof request.body.getReader !== "function") {
    throw new SyntaxError("A JSON request body is required.");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new TypeError("The request body stream returned an invalid chunk.");
      }
      size += value.byteLength;
      if (size > maxBytes) {
        try { await reader.cancel(); } catch { /* stop consuming an oversized request */ }
        throw new RangeError("body-too-large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}
