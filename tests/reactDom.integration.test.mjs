import test from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";
import { JSDOM } from "jsdom";

async function withBrowserDom(run) {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "https://scholarship-scout.test/",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.scrollTo = () => {};
  win.confirm = () => false;
  win.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });

  const values = {
    window: win,
    document: win.document,
    navigator: win.navigator,
    HTMLElement: win.HTMLElement,
    Node: win.Node,
    Event: win.Event,
    CustomEvent: win.CustomEvent,
    MouseEvent: win.MouseEvent,
    KeyboardEvent: win.KeyboardEvent,
    MutationObserver: win.MutationObserver,
    File: win.File,
    FileList: win.FileList,
    Blob: win.Blob,
    DOMException: win.DOMException,
    getComputedStyle: win.getComputedStyle.bind(win),
    localStorage: win.localStorage,
    sessionStorage: win.sessionStorage,
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    IS_REACT_ACT_ENVIRONMENT: true,
    __SCHOLARSHIP_SCOUT_ENV__: {
      VITE_SUPABASE_URL: " ",
      VITE_SUPABASE_PUBLISHABLE_KEY: " ",
    },
  };
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }

  try {
    return await run({
      dom,
      window: win,
      document: win.document,
      root: win.document.getElementById("root"),
    });
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    win.close();
  }
}

test("StartHomePage handles browser validation, keyboard submit and busy-state updates", async () => {
  await withBrowserDom(async ({ root, document }) => {
    const { render, within, waitFor, cleanup } = await import("@testing-library/react");
    const userEvent = (await import("@testing-library/user-event")).default;
    const { StartHomePage } = await import("../src/features/home/StartHomePage.tsx");
    let submitCount = 0;
    let guestCount = 0;

    function Harness() {
      const [busy, setBusy] = useState(false);
      const [email, setEmail] = useState("");
      return React.createElement(StartHomePage, {
        email,
        onEmailChange: setEmail,
        onEmailSubmit(event) {
          event.preventDefault();
          submitCount += 1;
          setBusy(true);
        },
        onGoogleSignIn() {},
        onContinueGuest() { guestCount += 1; },
        onReviewLegal() {},
        message: "",
        busy,
        online: true,
        configured: true,
        authReady: true,
        isAnonymous: false,
        cooldownSeconds: 0,
      });
    }

    try {
      const user = userEvent.setup({ document });
      render(React.createElement(Harness), { container: root });
      const ui = within(root);
      const email = ui.getByRole("textbox", { name: /email/i });
      const submit = ui.getByRole("button", { name: /continue with email/i });

      assert.equal(email.required, true);
      await user.type(email, "not-an-email");
      assert.equal(email.checkValidity(), false);
      await user.click(submit);
      assert.equal(submitCount, 0, "invalid email must not reach the submit handler");

      await user.clear(email);
      await user.type(email, "student@example.test");
      assert.equal(email.checkValidity(), true);
      await user.keyboard("{Enter}");
      await waitFor(() => assert.equal(submitCount, 1));
      assert.ok(ui.getByRole("button", { name: /sending sign-in link/i }).disabled);
      assert.equal(email.value, "student@example.test");

      const guest = ui.getByRole("button", { name: /continue without an account/i });
      await user.click(guest);
      assert.equal(guestCount, 1);
    } finally {
      cleanup();
    }
  });
});

test("guest workspace supports real navigation, profile edits, tracker validation and settings state", async () => {
  await withBrowserDom(async ({ root, document, window }) => {
    const { render, within, waitFor, cleanup } = await import("@testing-library/react");
    const userEvent = (await import("@testing-library/user-event")).default;

    window.sessionStorage.setItem("scholarship-scout-guest-session", "true");
    const previousAdapterFlag = globalThis.__SCOUT_TEST_SUPABASE_UNCONFIGURED__;
    globalThis.__SCOUT_TEST_SUPABASE_UNCONFIGURED__ = true;
    try {
      const { default: App } = await import("../src/App.tsx?react-dom-integration");
    try {
      const user = userEvent.setup({ document });
      render(React.createElement(App), { container: root });
      const ui = within(root);
      await waitFor(() => assert.ok(ui.getByRole("navigation", { name: "Main navigation" })));
      const nav = ui.getByRole("navigation", { name: "Main navigation" });

      await waitFor(() => assert.ok(ui.getByRole("heading", { name: "Make your next opportunity count." })));
      assert.equal(ui.getByRole("main").getAttribute("id"), "main-content");

      const menu = ui.getByRole("button", { name: "Open navigation menu" });
      await user.click(menu);
      assert.equal(menu.getAttribute("aria-expanded"), "true");
      assert.equal(nav.getAttribute("data-open"), "true");
      await user.keyboard("{Escape}");
      assert.equal(menu.getAttribute("aria-expanded"), "false");
      assert.equal(document.activeElement, menu, "Escape restores focus to the mobile navigation toggle");

      await user.click(menu);
      await user.click(within(nav).getByRole("button", { name: "Find scholarships" }));
      await waitFor(() => assert.ok(ui.getByRole("heading", { name: "Find scholarships" })));
      assert.equal(menu.getAttribute("aria-expanded"), "false", "navigation selection closes the mobile menu");

      await user.click(within(nav).getByRole("button", { name: "My scholarships" }));
      await waitFor(() => assert.ok(ui.getByText("No scholarships in this view")));
      const addButtons = ui.getAllByRole("button", { name: /add scholarship/i });
      await user.click(addButtons[0]);
      const dialog = ui.getByRole("dialog", { name: "Add scholarship rules" });
      const name = within(dialog).getByRole("textbox", { name: "Scholarship name *" });
      const provider = within(dialog).getByRole("textbox", { name: "Provider *" });
      const form = document.getElementById("scholarship-editor-form");
      const save = within(dialog).getByRole("button", { name: "Save & check eligibility" });

      assert.equal(name.required, true);
      assert.equal(provider.required, true);
      assert.equal(form.checkValidity(), false);
      await user.click(save);
      await waitFor(() => assert.ok(within(dialog).getByText("Enter a scholarship name.")));
      await user.type(name, "Synthetic Community Award");
      await user.type(provider, "Example Foundation");
      assert.equal(form.checkValidity(), true);
      await user.keyboard("{Escape}");
      await waitFor(() => assert.equal(ui.queryByRole("dialog"), null));

      await user.click(within(nav).getByRole("button", { name: "My profile" }));
      await waitFor(() => assert.ok(ui.getByRole("heading", { name: "Your profile" })));
      const country = ui.getByLabelText("Country of residence");
      const state = ui.getByLabelText("State of residence");
      const county = ui.getByRole("textbox", { name: "County" });
      assert.equal(state.disabled, true);
      await user.selectOptions(country, "US");
      await waitFor(() => assert.equal(state.disabled, false));
      await user.selectOptions(state, "Texas");
      await user.type(county, "Synthetic County");
      assert.equal(state.value, "Texas");
      assert.equal(county.value, "Synthetic County");
      assert.equal(
        window.localStorage.getItem("scout-profile"),
        null,
        "profile edits remain an in-memory draft while the local vault is locked",
      );
      assert.equal(
        window.localStorage.getItem("scout-profile-draft"),
        null,
        "the test must not persist synthetic profile information outside the locked vault",
      );

      await user.click(within(nav).getByRole("button", { name: "Settings" }));
      await waitFor(() => assert.ok(ui.getByRole("heading", { name: "Settings" })));
      const shell = root.querySelector(".shell");
      const lightMode = ui.getByRole("button", { name: "Use light mode" });
      await user.click(lightMode);
      assert.equal(shell.getAttribute("data-theme"), "light");
      assert.equal(lightMode.getAttribute("aria-pressed"), "true");
      const compact = ui.getByRole("button", { name: "Switch to compact layout" });
      await user.click(compact);
      assert.equal(shell.getAttribute("data-compact"), "true");
      assert.ok(ui.getByRole("button", { name: "Switch to comfortable layout" }));

      await user.click(within(nav).getByRole("button", { name: "My profile" }));
      await waitFor(() => assert.equal(ui.getByRole("textbox", { name: "County" }).value, "Synthetic County"));
      assert.equal(
        window.localStorage.getItem("scout-profile"),
        null,
        "navigation must not accidentally flush draft PII to unencrypted storage",
      );
    } finally {
      cleanup();
      if (previousAdapterFlag === undefined) delete globalThis.__SCOUT_TEST_SUPABASE_UNCONFIGURED__;
      else globalThis.__SCOUT_TEST_SUPABASE_UNCONFIGURED__ = previousAdapterFlag;
    }
  });
});
