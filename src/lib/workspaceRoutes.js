const TAB_TO_PATH = Object.freeze({
  Overview: "/",
  Discovery: "/discovery",
  "Cloud Search": "/cloud-search",
  Scholarships: "/scholarships",
  "Application prep": "/application-prep",
  "Eligibility filters": "/eligibility",
  Resources: "/resources",
  Settings: "/settings",
});

const PATH_TO_TAB = new Map([
  ["/", "Overview"],
  ["/overview", "Overview"],
  ["/discovery", "Discovery"],
  ["/cloud-search", "Cloud Search"],
  ["/scholarships", "Scholarships"],
  ["/tracker", "Scholarships"],
  ["/application-prep", "Application prep"],
  ["/applications", "Application prep"],
  ["/eligibility", "Eligibility filters"],
  ["/profile", "Eligibility filters"],
  ["/resources", "Resources"],
  ["/settings", "Settings"],
]);

export function workspacePathToTab(pathname) {
  if (typeof pathname !== "string") return "Overview";
  const normalized = pathname.length > 1
    ? pathname.replace(/\/+$/, "").toLowerCase()
    : "/";
  return PATH_TO_TAB.get(normalized) ?? "Overview";
}

export function workspaceTabToPath(tab) {
  return TAB_TO_PATH[tab] ?? "/";
}
