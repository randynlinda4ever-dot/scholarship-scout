import test from "node:test";
import assert from "node:assert/strict";
import { toggleDiscoveryCategory, getSelectableDiscoveryCategories } from "../src/lib/discoveryCategorySelection.js";

test("research selection supports every category in the deployed allowlist, not an arbitrary four", () => {
  const supported = getSelectableDiscoveryCategories();
  assert.equal(supported.length, 14);
  let selected = [];
  for (const category of supported.slice(0, 8)) {
    selected = toggleDiscoveryCategory(selected, category.id, true);
  }
  assert.equal(selected.length, 8);
  assert.deepEqual(selected, supported.slice(0, 8).map((category) => category.id));
});

test("research selection ignores unsupported IDs and remains duplicate-free", () => {
  let selected = toggleDiscoveryCategory([], "local", true);
  selected = toggleDiscoveryCategory(selected, "local", true);
  selected = toggleDiscoveryCategory(selected, "not-deployed", true);
  assert.deepEqual(selected, ["local"]);
});

test("research selection removes a category without disturbing the others", () => {
  const selected = ["local", "academic", "humanities", "language", "arts"];
  assert.deepEqual(
    toggleDiscoveryCategory(selected, "humanities", false),
    ["local", "academic", "language", "arts"],
  );
});
