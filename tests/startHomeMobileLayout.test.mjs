import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(new URL("../src/features/home/StartHomePage.css", import.meta.url), "utf8");

test("mobile home prioritizes the sign-in card before secondary feature details", () => {
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*?\.start-home-hero-copy\s*\{[^}]*display:\s*contents/);
  assert.match(styles, /grid-template-areas:\s*"eyebrow"\s*"title"\s*"lead"\s*"auth"\s*"features"/);
  assert.match(styles, /\.start-home-auth\s*\{[^}]*grid-area:\s*auth/);
});

test("mobile sign-in controls use readable text and comfortable touch targets", () => {
  assert.match(styles, /\.start-home-email-form input\s*\{[^}]*min-height:\s*52px/);
  assert.match(styles, /\.start-home-email-form input\s*\{[^}]*font-size:\s*16px/);
  assert.match(styles, /\.start-home-primary,\s*\.start-home-google\s*\{[^}]*min-height:\s*52px/);
  assert.match(styles, /\.start-home-guest\s*\{[^}]*min-height:\s*48px/);
});

test("mobile home respects safe areas and narrow phone widths", () => {
  assert.match(styles, /padding-left:\s*max\(16px,\s*env\(safe-area-inset-left\)\)/);
  assert.match(styles, /padding-right:\s*max\(16px,\s*env\(safe-area-inset-right\)\)/);
  assert.match(styles, /@media \(max-width: 380px\)[\s\S]*?\.start-home-auth\s*\{/);
});
