import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Field, SelectField, CheckField } from "../src/components/WorkspaceFields.tsx";
import { WorkspaceSubnav } from "../src/components/WorkspaceSubnav.tsx";
import { FeatureCard } from "../src/components/FeatureCard.tsx";
import LegalAcceptanceGate from "../src/components/LegalAcceptanceGate.tsx";
import AppErrorBoundary from "../src/components/AppErrorBoundary.tsx";
import { AnalyticsConsentManager } from "../src/components/AnalyticsConsentManager.tsx";
import AgentDemo from "../src/features/agent-demo/AgentDemo.tsx";
import { AccountStartGate } from "../src/features/home/AccountStartGate.tsx";
import { ApplicationPrepPage } from "../src/features/workspace/pages/ApplicationPrepPage.tsx";
import { CloudSearchPage } from "../src/features/workspace/pages/CloudSearchPage.tsx";
import { DiscoveryPage } from "../src/features/workspace/pages/DiscoveryPage.tsx";
import { EligibilityFiltersPage } from "../src/features/workspace/pages/EligibilityFiltersPage.tsx";
import { OverviewPage } from "../src/features/workspace/pages/OverviewPage.tsx";
import { ScholarshipsPage } from "../src/features/workspace/pages/ScholarshipsPage.tsx";
import { SettingsPage } from "../src/features/workspace/pages/SettingsPage.tsx";
import { ResourcesPage } from "../src/features/resources/ResourcesPage.tsx";
import * as status from "../src/components/StatusPills.tsx";
import * as cards from "../src/components/ScholarshipCards.tsx";
import * as home from "../src/features/home/StartHomePage.tsx";

test("WorkspaceFields bind values, expose validation state, and notify input callbacks", () => {
  const changes = [];
  const field = Field({
    label:"Graduation year", value:"2027", required:true, id:"grad-year",
    requirement:"required", error:"Enter a four-digit year.",
    onChange:(value)=>changes.push(value),
  });
  const select = SelectField({
    label:"State", value:"TX", options:[["TX","Texas"],["OK","Oklahoma"]],
    required:true, onChange:(value)=>changes.push(value),
  });
  const check = CheckField({label:"First generation",checked:false,onChange:(value)=>changes.push(value)});
  const html = [field,select,check].map(renderToStaticMarkup).join("");
  assert.match(html,/aria-invalid="true"/);
  assert.match(html,/Enter a four-digit year/);
  assert.match(html,/Required/);
  field.props.children[1].props.onChange({target:{value:"2028"}});
  select.props.children[1].props.onChange({target:{value:"OK"}});
  check.props.children[0].props.onChange({target:{checked:true}});
  assert.deepEqual(changes,["2028","OK",true]);
});

test("WorkspaceSubnav exposes active selection and reports navigation changes", () => {
  const selected = [];
  const element = WorkspaceSubnav({
    label:"Workspace view", active:"Tracker",
    options:[{value:"Tracker",label:"Tracker"},{value:"Application prep",label:"Application preparation"}],
    onChange:(value)=>selected.push(value),
  });
  const html = renderToStaticMarkup(element);
  assert.match(html,/aria-label="Workspace view"/);
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/Application preparation/);
  element.props.children[1].props.onClick();
  assert.deepEqual(selected,["Application prep"]);
});

test("FeatureCard renders descriptive content as an article", () => {
  const html = renderToStaticMarkup(React.createElement(FeatureCard,{
    title:"Application checklist",description:"Organize the materials required by each sponsor.",
  }));
  assert.match(html,/<article class="feature-card">/);
  assert.match(html,/Application checklist/);
  assert.match(html,/Organize the materials required by each sponsor/);
});

test("LegalAcceptanceGate blocks workspace rendering until its current receipt exists", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {localStorage:{getItem:()=>null}};
  try {
    const html = renderToStaticMarkup(React.createElement(LegalAcceptanceGate,{
      children:React.createElement("div",null,"Private workspace"),
    }));
    assert.match(html,/role="dialog"/);
    assert.match(html,/aria-modal="true"/);
    assert.match(html,/Terms of Service &amp; Privacy Notice/);
    assert.match(html,/Scroll through the entire notice/);
    assert.doesNotMatch(html,/Private workspace/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("AppErrorBoundary renders children and its recovery presentation", () => {
  const boundary = new AppErrorBoundary({children:React.createElement("p",null,"Workspace content")});
  assert.match(renderToStaticMarkup(boundary.render()),/Workspace content/);
  assert.deepEqual(AppErrorBoundary.getDerivedStateFromError(new Error("synthetic")),{hasError:true});
  boundary.state = {hasError:true};
  const fallback = renderToStaticMarkup(boundary.render());
  assert.match(fallback,/could not display this page/);
  assert.match(fallback,/Reload Scholarship Scout/);
});

test("AnalyticsConsentManager has no UI and does not initialize a third-party SDK", () => {
  assert.equal(renderToStaticMarkup(React.createElement(AnalyticsConsentManager)),"");
});

test("AgentDemo renders its test-only warning and initial overview", () => {
  const html = renderToStaticMarkup(React.createElement(AgentDemo));
  assert.match(html,/Agent test environment — synthetic data only/);
  assert.match(html,/Welcome,/);
  assert.match(html,/Find scholarships/);
  assert.match(html,/Changes stay in memory/);
});

test("AccountStartGate renders a safe session-check state before authentication resolves", () => {
  const html = renderToStaticMarkup(React.createElement(AccountStartGate,{
    onAuthenticated:()=>{},onContinueGuest:()=>{},
  }));
  assert.match(html,/role="status"/);
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/Checking your account/);
  assert.doesNotMatch(html,/start-home-email/);
});

test("CloudSearchPage distinguishes loading, empty, and failure states", () => {
  const base = {
    addLiveResult:()=>{},cloudBusy:false,cloudMessage:"",cloudUser:null,
    discoverySummary:null,discoveryWarnings:[],exaResults:[],handleCloudSearch:()=>{},
    isLiveDiscoveryCategorySupported:()=>true,isOnline:true,items:[],liveResults:[],
    profile:{state:"",graduationYear:""},selectedDiscoveryCategories:["local"],
    setSelectedDiscoveryCategories:()=>{},setTab:()=>{},supabaseConfigured:true,
  };
  const loading = renderToStaticMarkup(React.createElement(CloudSearchPage,{model:{...base,discoveryState:"loading"}}));
  const empty = renderToStaticMarkup(React.createElement(CloudSearchPage,{model:{...base,discoveryState:"empty"}}));
  const error = renderToStaticMarkup(React.createElement(CloudSearchPage,{model:{...base,discoveryState:"error"}}));
  assert.match(loading,/Researching/);
  assert.match(empty,/No scholarship matches were found/);
  assert.match(empty,/Add your state and expected graduation year/);
  assert.match(error,/role="alert"/);
});

test("DiscoveryPage renders no-record fallback and its live-search handoff", () => {
  const html = renderToStaticMarkup(React.createElement(DiscoveryPage,{model:{
    candidateAssessments:[],googleSearch:()=>"#",openAdd:()=>{},queryGroups:[],
    setTab:()=>{},SOURCES:[],tracked:()=>false,
  }}));
  assert.match(html,/No sample scholarships are preloaded/);
  assert.match(html,/Open live web discovery/);
});

test("EligibilityFiltersPage renders profile readiness and local persistence errors", () => {
  const profileDraft = new Proxy({}, {get:() => ""});
  const html = renderToStaticMarkup(React.createElement(EligibilityFiltersPage,{model:{
    profileDraft,
    profileReadiness:{
      core:{completedCount:1,totalCount:4,percent:25,missing:[{key:"state",label:"State",reason:"Enter a state."}]},
      supporting:{completedCount:0,totalCount:2,percent:0,missing:[]},
    },
    profileSaveStatus:"unavailable",saveProfile:()=>{},
  }}));
  assert.match(html,/Your profile/);
  assert.match(html,/Could not save your latest profile change/);
  assert.match(html,/Enter a state/);
  assert.match(html,/GPA/);
});

test("OverviewPage renders profile readiness and an honest empty deadline state", () => {
  const html = renderToStaticMarkup(React.createElement(OverviewPage,{model:{
    applicationCounts:{inProgress:0,ready:0,submitted:0,awarded:0},
    assessments:new Map(),candidateAssessments:[],deadlineOverview:[],deadlinesDueSoon:0,
    exportLocalBackup:()=>{},formatDate:()=>"",importLocalBackup:()=>{},items:[],
    openAdd:()=>{},overdueDeadlines:0,profile:{plannedMajor:"",gpa:"",classRank:"",act:""},
    profileReadiness:{core:{completedCount:0,totalCount:4,percent:0,missing:[{label:"State"},{label:"Year"},{label:"School"}]}},
    profileTags:[],setSelected:()=>{},setTab:()=>{},tracked:()=>false,
  }}));
  assert.match(html,/Profile readiness/);
  assert.match(html,/Add: State, Year, and more/);
  assert.match(html,/Add confirmed calendar dates/);
});

test("ScholarshipsPage renders the genuine empty tracker separately from filtered-empty", () => {
  const model = {
    APPLICATION_STATUSES:[],applicationStatusFilter:"All",archiveFilter:"active",
    assessments:new Map(),clearTrackerFilters:()=>{},duplicateSuggestions:[],
    exportTrackerReport:()=>{},filter:"All",filtered:[],formatDate:()=>"",
    getDeadlineMilestones:()=>[],hasFilteredEmptyState:false,items:[],openAdd:()=>{},
    query:"",setApplicationStatusFilter:()=>{},setArchiveFilter:()=>{},setFilter:()=>{},
    setQuery:()=>{},setSelected:()=>{},setTrackerSortBy:()=>{},statuses:[],
    summarizeEligibilityAssessment:()=>({status:"Needs information"}),trackerSortBy:"deadline",
  };
  const html = renderToStaticMarkup(React.createElement(ScholarshipsPage,{model}));
  assert.match(html,/No scholarships in this view/);
  assert.doesNotMatch(html,/No scholarships match these filters/);
});

test("ApplicationPrepPage routes to the tracker when no scholarship workspace is selected", () => {
  const html = renderToStaticMarkup(React.createElement(ApplicationPrepPage,{model:{
    APPLICATION_CHECKLIST_STEPS:[],applicationProgress:{},countApplicationWords:()=>0,
    createWorkspaceItemId:()=>"",formatDate:()=>"",items:[],markPrepScholarshipSubmitted:()=>{},
    prepScholarship:null,prepSummary:{completed:0,total:0,percent:0,requiredDocuments:0,readyDocuments:0,pendingRecommendations:0,overLimitEssays:0},
    prepWorkspace:{customTasks:[]},RECOMMENDATION_STATUSES:[],saveApplicationTask:()=>{},
    savePrepWorkspace:()=>{},setPrepScholarshipId:()=>{},setTab:()=>{},
  }}));
  assert.match(html,/Start an application workspace/);
  assert.match(html,/Add a scholarship to your tracker/);
});

test("SettingsPage explains missing cloud config and disables sign-in", () => {
  const html = renderToStaticMarkup(React.createElement(SettingsPage,{model:{
    authCooldownSeconds:0,cloudBusy:false,cloudEmail:"",cloudMessage:"",cloudUser:null,
    compactView:false,handleCheckCloudSession:()=>{},handleCloudSignIn:()=>{},
    handleCloudSignOut:()=>{},isOnline:true,setCloudEmail:()=>{},setCompactView:()=>{},
    setTheme:()=>{},supabaseConfigured:false,theme:"light",
  }}));
  assert.match(html,/Settings/);
  assert.match(html,/Setup needed/);
  assert.match(html,/Cloud access is not available in this app build/);
});

test("ResourcesPage renders student resources and explains the encrypted local boundary", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location:{hash:"",origin:"https://example.test"},
    addEventListener:()=>{},removeEventListener:()=>{},history:{pushState:()=>{}},
  };
  try {
    const html = renderToStaticMarkup(React.createElement(ResourcesPage,{
      workspace:{essayPlan:{},resumeEntries:[],aidChecklist:{completed:[],comparisons:[]},calendarCompleted:[]},
      scholarships:[],onWorkspaceChange:()=>{},onOpenTracker:()=>{},onOpenApplicationPrep:()=>{},
    }));
    assert.match(html,/Student resources/);
    assert.match(html,/Activities &amp; resume builder/);
    assert.match(html,/Private worksheets/);
    assert.match(html,/encrypted vault/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("StartHomePage preserves email changes and form submission callbacks", () => {
  let changed = "";
  let submitted = false;
  const noop = () => {};
  const root = home.StartHomePage({
    email:"student@example.com",
    onEmailChange:(value)=>{changed=value;},
    onEmailSubmit:(event)=>{submitted=true;event.preventDefault();},
    onGoogleSignIn:noop,onContinueGuest:noop,onReviewLegal:noop,
    message:"",busy:false,online:true,configured:true,authReady:true,
    isAnonymous:false,cooldownSeconds:0,
  });
  const find = (node,predicate) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) { const result=find(child,predicate); if (result) return result; }
      return null;
    }
    if (predicate(node)) return node;
    return find(node.props?.children,predicate);
  };
  const input = find(root,(node)=>node.type==="input" && node.props.id==="start-home-email");
  const form = find(root,(node)=>node.type==="form" && node.props.className==="start-home-email-form");
  assert.ok(input);
  assert.ok(form);
  input.props.onChange({target:{value:"updated@example.com"}});
  form.props.onSubmit({preventDefault(){}});
  assert.equal(changed,"updated@example.com");
  assert.equal(submitted,true);
});

test("StartHomePage visibly reports busy, cooldown, offline and unconfigured states", () => {
  const noop=()=>{};
  const base={email:"student@example.com",onEmailChange:noop,onEmailSubmit:noop,onGoogleSignIn:noop,onContinueGuest:noop,onReviewLegal:noop,message:"",authReady:true,isAnonymous:false};
  const busy=renderToStaticMarkup(React.createElement(home.StartHomePage,{...base,busy:true,online:true,configured:true,cooldownSeconds:0}));
  const cooldown=renderToStaticMarkup(React.createElement(home.StartHomePage,{...base,busy:false,online:true,configured:true,cooldownSeconds:9}));
  const offline=renderToStaticMarkup(React.createElement(home.StartHomePage,{...base,busy:false,online:false,configured:true,cooldownSeconds:0}));
  const unconfigured=renderToStaticMarkup(React.createElement(home.StartHomePage,{...base,busy:false,online:true,configured:false,cooldownSeconds:0}));
  assert.match(busy,/Sending sign-in link/);
  assert.match(cooldown,/Try again in 9s/);
  assert.match(offline,/You are offline/);
  assert.match(unconfigured,/not configured in this deployment/);
});

test("CloudResultCard displays provisional evidence and source provenance without claiming confirmation", () => {
  const html = renderToStaticMarkup(React.createElement(cards.CloudResultCard,{
    item:{
      id:"synthetic-rich",title:"Synthetic Public Award",provider:"Example Sponsor",
      source_url:"https://example.org/scholarship",source_evidence_url:"https://example.org/rules",
      source_domain:"example.org",verification_state:"needs_human_review",
      discovery_category:"general",discovery_categories:["general","local"],
      excerpt:"Search-result snippet only",award_text:"$1,500",deadline_text:"May 1, 2099",
      relevance_score:85,relevance_reasons:["Matches interests: anthropology"],
      extracted_rules:{
        short_source_summary:"Search evidence remains provisional.",
        eligibility_requirements:[
          {requirement:"Texas resident",mandatory:true,evidence:"Residency rules",needs_human_confirmation:true},
          {requirement:"Service preferred",mandatory:false,evidence:"Service section",needs_human_confirmation:false},
        ],
        uncertainties:["Confirm sponsor deadline"],
        application_documents:["Transcript"],application_steps:["Complete sponsor form"],application_fee:true,
      },
    },
    tracked:false,onTrack:()=>{},
  }));
  assert.match(html,/Unverified lead|Needs sponsor review/);
  assert.match(html,/Profile match/);
  assert.match(html,/85\/100/);
  assert.match(html,/provisional/);
  assert.match(html,/Texas resident/);
  assert.match(html,/Service preferred/);
  assert.match(html,/Confirm sponsor deadline/);
  assert.match(html,/Transcript/);
  assert.match(html,/Complete sponsor form/);
  assert.match(html,/application fee/);
  assert.match(html,/Verification not deployed/);
});

test("CandidateCard keeps missing source pages explicit and displays dated provenance when present", () => {
  const missing = renderToStaticMarkup(React.createElement(cards.CandidateCard,{
    item:{id:"missing",name:"No Source Award",provider:"Unknown",award:"",notes:"Fixture",sourceUrl:"",deadline:"",deadlineNotPublished:true},
    assessment:{status:"Needs information",checks:[{label:"Residency",outcome:"unknown"}]},
    added:false,onAdd:()=>{},
  }));
  const sourced = renderToStaticMarkup(React.createElement(cards.CandidateCard,{
    item:{
      id:"sourced",name:"Official Source Award",provider:"Example Sponsor",award:"$2,000",
      notes:"Synthetic",sourceUrl:"https://example.org/award",deadline:"2099-05-01",
      lastCheckedDate:"2026-11-28",discoveredOn:"2026-11-01",recordCreatedAt:"2026-11-27T12:00:00Z",
    },
    assessment:{status:"Eligible",checks:[]},added:true,onAdd:()=>{},
  }));
  assert.match(missing,/A direct scholarship page URL has not been saved/);
  assert.match(sourced,/Open source page/);
  assert.match(sourced,/Sponsor rules last checked: 2026-11-28/);
});

test("StatusPills distinguish every status and evidence quality category", () => {
  const eligibility=["Eligible","Rules match — source unverified","Needs information","Ineligible","Expired","unexpected"];
  const statusHtml=eligibility.map((value)=>renderToStaticMarkup(React.createElement(status.StatusPill,{status:value}))).join("");
  assert.match(statusHtml,/status-eligible/);
  assert.match(statusHtml,/status-rules-match-unverified/);
  assert.match(statusHtml,/status-needs-information/);
  assert.match(statusHtml,/status-ineligible/);
  assert.match(statusHtml,/status-expired/);
  assert.match(statusHtml,/status-unknown/);
  const item={name:"Synthetic award",sourceUrl:"",deadline:""};
  const summaryHtml=renderToStaticMarkup(React.createElement(status.EvidenceCompletenessList,{item}));
  assert.match(summaryHtml,/Sponsor evidence completeness/);
  assert.match(summaryHtml,/Needs review/);
  const deadlineHtml=renderToStaticMarkup(React.createElement(status.DeadlineUrgencyPill,{deadline:"",openDate:"2098-01-01",openDateTimezone:"America/Chicago"}));
  assert.match(deadlineHtml,/Opening date is evaluated/);
});

test("agent demo entrypoint refuses to expose synthetic content outside preview mode", async () => {
  const previousDocument=globalThis.document;
  const previousFlag=globalThis.__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__;
  const root={textContent:""};
  globalThis.document={title:"",getElementById:(id)=>id==="root"?root:null};
  try {
    globalThis.__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__=false;
    await import("../src/agentDemo.tsx?disabled-preview-test");
    assert.match(root.textContent,/available only in local development/);
    assert.match(globalThis.document.title,/Agent demo unavailable/);
  } finally {
    if (previousDocument===undefined) delete globalThis.document;
    else globalThis.document=previousDocument;
    if (previousFlag===undefined) delete globalThis.__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__;
    else globalThis.__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__=previousFlag;
  }
});

test("main entrypoint keeps analytics and workspace behind legal acceptance", async () => {
  const previousDocument=globalThis.document;
  const previousWindow=globalThis.window;
  const root={};
  globalThis.document={getElementById:(id)=>id==="root"?root:null};
  globalThis.window={localStorage:{getItem:()=>null}};
  try {
    globalThis.__SCOUT_TEST_ROOT_CAPTURE__=null;
    await import("../src/main.tsx?coverage-entrypoint-test");
    const captured=globalThis.__SCOUT_TEST_ROOT_CAPTURE__;
    assert.equal(captured.root,root);
    assert.equal(captured.tree.type,React.StrictMode);
    assert.equal(captured.tree.props.children.type,LegalAcceptanceGate);
    assert.equal(captured.tree.props.children.props.children[0].type,AnalyticsConsentManager);
  } finally {
    delete globalThis.__SCOUT_TEST_ROOT_CAPTURE__;
    if (previousDocument===undefined) delete globalThis.document;
    else globalThis.document=previousDocument;
    if (previousWindow===undefined) delete globalThis.window;
    else globalThis.window=previousWindow;
  }
});

test("Empty and FilteredEmpty preserve distinct no-record and no-match states", () => {
  const empty=renderToStaticMarkup(React.createElement(cards.Empty,{onAdd:()=>{}}));
  const filtered=renderToStaticMarkup(React.createElement(cards.FilteredEmpty,{onClear:()=>{}}));
  assert.match(empty,/No scholarships in this view/);
  assert.doesNotMatch(empty,/No scholarships match these filters/);
  assert.match(filtered,/No scholarships match these filters/);
  assert.match(filtered,/role="status"/);
});


test("App initializes its private workspace but holds access behind the account-loading gate", async () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const previousSessionStorage = globalThis.sessionStorage;
  const store = new Map();
  const storage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
  globalThis.localStorage = storage;
  globalThis.sessionStorage = storage;
  globalThis.window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { pathname: "/", search: "", hash: "", origin: "https://example.test" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    scrollY: 0,
    confirm() { return false; },
  };
  try {
    const { default: App } = await import("../src/App.tsx?app-account-gate-test");
    const html = renderToStaticMarkup(React.createElement(App));
    assert.match(html, /account-session-loading/);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Checking your account/);
    assert.doesNotMatch(html, /app-sidebar|app-main|Your scholarship workspace/);
    assert.equal(store.has("scout-profile"), false, "initial SSR must not write a student profile");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previousSessionStorage;
  }
});


class StartupGateElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { removeProperty() {} };
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.scrollTop = 0;
    this.clientHeight = 320;
    this.scrollHeight = 1200;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node && typeof node === "object") {
        node.parentNode = this;
        this.children.push(node);
      }
    }
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  async dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) {
      await listener({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} });
    }
  }
  focus() {}
}

function findStartupElement(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = findStartupElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test("startup preflight requires reading, age eligibility, and guardian approval before entry", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const previousSessionStorage = globalThis.sessionStorage;
  const store = new Map();
  let rejectWrites = true;
  const storage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) {
      if (rejectWrites) throw new Error("synthetic storage unavailable");
      store.set(key, String(value));
    },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
  const root = new StartupGateElement("div");
  const body = new StartupGateElement("body");
  const documentElement = new StartupGateElement("html");
  globalThis.localStorage = storage;
  globalThis.sessionStorage = storage;
  globalThis.document = {
    title: "",
    body,
    documentElement,
    getElementById(id) { return id === "root" ? root : null; },
    createElement(tagName) { return new StartupGateElement(tagName); },
  };
  globalThis.window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { pathname: "/", search: "", hash: "", origin: "https://example.test" },
  };

  try {
    await import("../src/bootstrap.ts?startup-preflight-coverage-test");

    const dialog = findStartupElement(root, (node) => node.getAttribute("role") === "dialog");
    const documentRegion = findStartupElement(root, (node) => node.id === "legal-preflight-document");
    const ageSelect = findStartupElement(root, (node) => node.name === "legal-age-group");
    const status = findStartupElement(root, (node) => node.className === "legal-preflight-status");
    const guardianLabel = findStartupElement(root, (node) => node.className === "legal-preflight-guardian");
    const guardianCheckbox = guardianLabel.children[0];
    const acceptanceLabel = findStartupElement(root, (node) => node.className === "legal-preflight-check");
    const acceptanceCheckbox = acceptanceLabel.children[0];
    const acceptButton = findStartupElement(root, (node) => node.className === "legal-preflight-accept");
    const error = findStartupElement(root, (node) => node.className === "legal-preflight-error");

    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.ok(documentRegion);
    assert.ok(ageSelect);
    assert.equal(acceptButton.disabled, true);
    assert.match(status.textContent, /Scroll to the end/);

    ageSelect.value = "minor";
    await ageSelect.dispatch("change");
    assert.equal(guardianLabel.hidden, false);
    acceptanceCheckbox.checked = true;
    await acceptanceCheckbox.dispatch("change");
    assert.equal(acceptButton.disabled, true, "agreement cannot bypass the scroll requirement");

    documentRegion.scrollTop = documentRegion.scrollHeight - documentRegion.clientHeight;
    await documentRegion.dispatch("scroll");
    assert.match(status.textContent, /reached the end/);
    assert.equal(acceptButton.disabled, true, "a minor requires parent or guardian authorization");

    guardianCheckbox.checked = true;
    await guardianCheckbox.dispatch("change");
    assert.equal(acceptButton.disabled, false);

    ageSelect.value = "under13";
    await ageSelect.dispatch("change");
    assert.equal(guardianLabel.hidden, true);
    assert.equal(acceptanceCheckbox.checked, false);
    assert.equal(acceptButton.disabled, true);
    assert.match(status.textContent, /not available to users under 13/);

    ageSelect.value = "adult";
    await ageSelect.dispatch("change");
    acceptanceCheckbox.checked = true;
    await acceptanceCheckbox.dispatch("change");
    assert.equal(acceptButton.disabled, false);

    await acceptButton.dispatch("click");
    assert.equal(error.hidden, false, "failed durable acceptance must keep the gate in place");
    assert.equal(root.children.length, 2, "the account workspace must not mount after a storage failure");
    assert.equal(store.size, 0, "the synthetic storage failure must not persist an acceptance receipt");
    assert.equal(findStartupElement(root, (node) => node.className === "legal-preflight-accept"), acceptButton);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previousSessionStorage;
  }
});
