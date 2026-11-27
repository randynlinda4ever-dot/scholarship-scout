import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJsonBody } from "../supabase/functions/_shared/bounded-json-body.mjs";

function requestWithChunks(chunks, headers = {}) {
  let index = 0;
  return {
    headers: new Headers(headers),
    body: new ReadableStream({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(new TextEncoder().encode(chunks[index++]));
      },
    }),
  };
}

test("reads a valid JSON body within the byte limit", async () => {
  const request = requestWithChunks(['{"confirmation":"DELETE_MY_ACCOUNT"}']);
  assert.deepEqual(await readBoundedJsonBody(request, 2048), {
    confirmation: "DELETE_MY_ACCOUNT",
  });
});

test("rejects an oversized streamed body even without Content-Length", async () => {
  const request = requestWithChunks(["x".repeat(1024), "y".repeat(1025)]);
  await assert.rejects(readBoundedJsonBody(request, 2048), RangeError);
});

test("rejects a declared oversized body before parsing", async () => {
  const request = requestWithChunks(["{}"], { "content-length": "2049" });
  await assert.rejects(readBoundedJsonBody(request, 2048), RangeError);
});

test("rejects malformed JSON and invalid UTF-8", async () => {
  await assert.rejects(
    readBoundedJsonBody(requestWithChunks(["{not-json}"]), 2048),
    SyntaxError,
  );
  const invalidUtf8 = {
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]));
        controller.close();
      },
    }),
  };
  await assert.rejects(readBoundedJsonBody(invalidUtf8, 2048), TypeError);
});
