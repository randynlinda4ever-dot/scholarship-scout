import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("toast message is announced without placing its dismiss control inside the live region", () => {
  const toast = app.match(/\{notice && (<div className="toast"[\s\S]*?<\/div>)\}/)?.[1] ?? "";
  assert.match(toast, /<span role="status" aria-live="polite">\{notice\}<\/span>/);
  assert.match(toast, /<button type="button" aria-label="Dismiss notification" onClick=\{\(\)=>setNotice\(''\)\}>/);
  assert.doesNotMatch(toast, /className="toast"[^>]*onClick=/);
});
