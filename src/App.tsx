import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { CriteriaImportance, Profile, Scholarship, Status } from './domain/types.js';
import { vaultStorage, lockLocalVault, flushLocalVault, destroyLocalVault, hasPendingLocalVaultWrites, enableLocalVaultDeviceUnlock, forgetLocalVaultDeviceUnlock, createLocalAccountVaultKeyWrap, getAccountVaultSyncEnvelope, getLocalAccountVaultSyncStatus, setLocalAccountVaultRevision, forgetLocalAccountVaultSync } from './lib/localVault.js';
import { clearReliabilityEvents, installReliabilityMonitoring, readReliabilityEvents, RELIABILITY_CHANGE_EVENT } from './lib/reliabilityMonitor.js';
import { assessEligibility, type EligibilityCriteria, type EligibilityAssessment } from './eligibility.js';
import { deriveSourceStatus, getEvidenceCompleteness, getEvidenceExcerptAttributions, getOfficialSourceFreshness, getScholarshipSourcePageUrl, getSourceAttribution, isInactiveCriterionValue, normalizeAndDeduplicateScholarships, normalizeScholarshipRecords, resolveSourceAuthority, sanitizePublicHttpsUrl } from './lib/evidence.js';
import { appendSourceEvidenceHistory, invalidateSourceReviewIfChanged } from './lib/sourceReview.js';
import { getSupabaseClient, stopSupabaseAutoRefreshForVaultLock, supabaseConfigured } from './lib/supabaseClient';
import { buildScoutBackup, validateScoutBackup } from './lib/backup.js';

import { findPotentialDuplicates, getDeadlineMilestones, getDeadlineUrgency } from './lib/trackerInsights.js';
import { APPLICATION_CHECKLIST_STEPS, normalizeApplicationProgress, updateApplicationProgress } from './lib/applicationProgress.js';
import { createApplicationWorkspace, normalizeApplicationWorkspace, getApplicationWorkspaceSummary, countApplicationWords, RECOMMENDATION_STATUSES, type ApplicationWorkspaceEntry } from './lib/applicationWorkspace.js';
import { summarizeEligibilityAssessment } from './lib/eligibilitySummary.js';
import { DISCOVERY_CATEGORY_OPTIONS } from './lib/discovery.js';
import { isLiveDiscoveryCategorySupported } from './lib/liveDiscoveryCapabilities.js';
import { getProfileReadiness } from './lib/profileReadiness.js';
import { buildManualSearchQueries } from './lib/manualSearchQueries.js';
import { validateProfileChanges } from './lib/profileValidation.js';
import { COUNTRY_OPTIONS, US_STATE_OPTIONS, PROFILE_CITIZENSHIP_OPTIONS } from './lib/profileLocations.js';
import { APPLICATION_STATUSES, TRACKER_PRIORITIES, MAX_TRACKER_RECORDS, filterAndSortTrackerRecords, getApplicationStatusCounts, normalizeTrackerRecord, type ApplicationStatus, type TrackerPriority } from './lib/trackerManagement.js';
import { buildTrackerCsvReport } from './lib/trackerReport.js';
import { getDiscoveryErrorMessage } from './lib/discoveryErrors.js';
import { writeJsonStorage, writeJsonStorageBatch, writeAndFlushJsonState } from './lib/browserStorage.js';
import { AUTH_EMAIL_COOLDOWN_SECONDS, getAuthCooldownRemainingSeconds, isAuthRateLimitError, isExpiredAuthLinkError } from './lib/authCooldown.js';
import { getCloudUser, listCloudScholarships, runLiveScholarshipDiscovery, saveCloudScholarship, sendMagicLink, signInWithGoogle, linkGoogleIdentity, signOutCloudUser, deleteCloudAccount, getAccountVaultBackup, createAccountVaultBackup, updateAccountVaultBackup, deleteAccountVaultBackup, type LiveScholarship, type LiveDiscoverySummary } from './lib/scholarshipApi';
import { registerAccountVaultPasskey } from './lib/accountVaultPasskey.js';
import { getAccountVaultSyncState } from './lib/accountVaultSyncState.js';
import { hasPendingAuthCallback, hasPendingAuthCallbackError } from './lib/authRedirect.js';
import { PRIVACY_REQUEST_TYPES, PRIVACY_REQUESTER_TYPES, buildPrivacyRequestMailto } from './lib/privacyRequests.js';
import { BrandMark } from './components/BrandMark';
import { workspacePathToTab, workspaceTabToPath } from './lib/workspaceRoutes.js';
import { getWorkspaceScrollPosition, saveWorkspaceScrollPosition } from './lib/workspaceScroll.js';
import { createResourceWorkspace, normalizeResourceWorkspace } from './lib/resourceWorkspace.js';
import { ResourcesPage } from './features/resources/ResourcesPage';
import { StartHomePage } from './features/home/StartHomePage';
import { ApplicationPrepPage } from './features/workspace/pages/ApplicationPrepPage';
import { WorkspaceSubnav } from './components/WorkspaceSubnav';
import { Field, SelectField, CheckField } from './components/WorkspaceFields';
import './App.css';
import './brand-system.css';

// This module is imported only after legal acceptance and local-vault unlock.
const localStorage = vaultStorage;
const FORCE_PASSPHRASE_SESSION_KEY = 'scout-vault-force-passphrase';
installReliabilityMonitoring();

function sanitizeScholarshipSourceUrls<T extends Record<string, unknown>>(record: T): T {
  const criteriaEvidence = record.criteriaEvidence && typeof record.criteriaEvidence === 'object'
    ? Object.fromEntries(Object.entries(record.criteriaEvidence as Record<string, { sourceUrl?: string }>).map(([key, entry]) => [
        key,
        { ...entry, sourceUrl: sanitizePublicHttpsUrl(entry?.sourceUrl || '') || '' },
      ]))
    : record.criteriaEvidence;
  return {
    ...record,
    sourceUrl: sanitizePublicHttpsUrl(String(record.sourceUrl || '')) || '',
    evidenceUrl: sanitizePublicHttpsUrl(String(record.evidenceUrl || '')) || '',
    awardEvidenceUrl: sanitizePublicHttpsUrl(String(record.awardEvidenceUrl || '')) || '',
    discoverySourceUrl: sanitizePublicHttpsUrl(String(record.discoverySourceUrl || '')) || undefined,
    ...(criteriaEvidence ? { criteriaEvidence } : {}),
  } as T;
}



type GlyphName =
  | 'home' | 'search' | 'cloud' | 'book' | 'checklist' | 'user' | 'settings'
  | 'book-stack' | 'check-circle' | 'info' | 'calendar-clock'
  | 'menu' | 'close' | 'chevron-left' | 'chevron-right';

function NavGlyph({ name }: { name: GlyphName }) {
  const glyphs: Record<GlyphName, ReactNode> = {
    home: <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5v10h5.2v-5.8h2.6v5.8h5.2v-10" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.5 4.5" /></>,
    cloud: <path d="M6.2 18.5h11.4a4 4 0 0 0 .5-8 6.3 6.3 0 0 0-12.1-1.3 4.7 4.7 0 0 0 .2 9.3Z" />,
    book: <><path d="M3.5 5.5c3.8-1.3 7.1-.6 8.5 1.2 1.4-1.8 4.7-2.5 8.5-1.2v13c-3.8-1.3-7.1-.6-8.5 1.2-1.4-1.8-4.7-2.5-8.5-1.2v-13Z" /><path d="M12 6.7v13" /></>,
    checklist: <><rect x="4" y="3.5" width="16" height="17" rx="2.2" /><path d="m7.2 8 1.2 1.2 2-2.2M12.8 8h4M7.2 13l1.2 1.2 2-2.2M12.8 13h4M7.5 17h9" /></>,
    user: <><circle cx="12" cy="8" r="3.3" /><path d="M5 20c.5-3.6 2.9-5.5 7-5.5s6.5 1.9 7 5.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.1 1.8-1.8 3.1-2.1-.5a7.8 7.8 0 0 1-1.7 1l-.5 2.1h-3.6l-.5-2.1a7.8 7.8 0 0 1-1.7-1l-2.1.5-1.8-3.1 1.1-1.8a7.4 7.4 0 0 1 0-2l-1.1-1.8 1.8-3.1 2.1.5a7.8 7.8 0 0 1 1.7-1l.5-2.1h3.6l.5 2.1a7.8 7.8 0 0 1 1.7 1l2.1-.5 1.8 3.1-1.1 1.8a7.4 7.4 0 0 1 .1 1.9Z" transform="translate(-.7 -1.5) scale(1.06)" /></>,
    'book-stack': <><path d="M4 5.5h13.5a2.5 2.5 0 0 1 2.5 2.5v11H6.5A2.5 2.5 0 0 1 4 16.5v-11Z" /><path d="M4 8H2.8v10a2 2 0 0 0 2 2H18M8 9h8M8 12.5h6" /></>,
    'check-circle': <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.1 2.6 2.6 5.5-5.5" /></>,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.8v5M12 7.4h.01" /></>,
    'calendar-clock': <><rect x="3" y="4.5" width="13" height="15.5" rx="2" /><path d="M7 2.8v3.4M12 2.8v3.4M3 9h13M7 12.5h2M7 16h3" /><circle cx="17.3" cy="16.8" r="4" /><path d="M17.3 14.5v2.5l1.5 1" /></>,
    menu: <><path d="M4 6.5h16M4 12h16M4 17.5h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    'chevron-left': <path d="m14.5 5-7 7 7 7" />,
    'chevron-right': <path d="m9.5 5 7 7-7 7" />,
  };

  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{glyphs[name]}</svg>;
}


const initialProfile: Profile = {
  // Personal student details are intentionally not bundled into the public client.
  // The user fills these in and they remain in this browser's local storage.
  country: 'US', state: '', county: '', citizenship: '', age: '', school: '', schoolCountry: 'US', schoolState: '', grade: '', graduationYear: '',
  plannedCollege: '', plannedCollegeCountry: 'US', plannedCollegeState: '', plannedMajor: '', collegeStatus: '',
  gpa: '', gpaType: '', classRank: '', rankDetails: '', credits: '', programNotes: '',
  texasGrantNotation: '', act: '', sat: '', apCourses: '', dualCreditCourses: '',
  academicHonors: '', interests: '', activities: '', serviceHours: '', service: '',
  employment: '', certifications: '', languages: '', firstGeneration: '',
  district: '', shhMembershipStatus: '', spanishAchievementStatus: '',
  nseMedalYears: '', nseRegistered2027: '', fourHMembershipStatus: '',
  searchKeywords: '',
  profileVersion: 'profile-general-2026-11',
};

const emptyCriteria: EligibilityCriteria = {};
const localToday = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const emptyScholarship = (): Scholarship => ({
  id: '', name: '', provider: '', award: '', deadline: '', deadlineText: '', deadlineTimezone: '', openDate: '', openDateTimezone: '',
  sourceUrl: '', evidenceUrl: '', sourceVerified: false, evidenceText: '', notes: '', sourceReviewConfirmed: false,
  awardEvidenceText: '', awardEvidenceUrl: '', awardCurrencyBasis: '', awardBasis: '',
  sourceAuthority: 'unverified-lead', lastCheckedDate: '', criteria: { ...emptyCriteria },
  applicationStatus: 'Not started', priority: 'Medium', tags: [], archived: false,
  submittedAt: '', decisionDate: '', criteriaImportance: {}, criteriaEvidence: {},
});

const DISCOVERED: Scholarship[] = [];
const DISCOVERED_WITH_EVIDENCE = normalizeAndDeduplicateScholarships(DISCOVERED.map((item) => ({
  ...item,
  lastCheckedDate: item.lastCheckedDate || '',
  sourceAuthority: resolveSourceAuthority(item),
})));

const SOURCES = [
  { name: 'CareerOneStop Scholarship Finder', group: 'Government-supported search', detail: 'A national search tool with study-level and location filters.', url: 'https://www.careeronestop.org/Toolkit/Training/find-scholarships.aspx?curPage=1&studyLevelfilter=High+School' },
  { name: 'College Board BigFuture', group: 'National search', detail: 'Search scholarships and narrow opportunities by your own plans and profile.', url: 'https://bigfuture.collegeboard.org/scholarship-search' },
  { name: 'Federal Student Aid — Scholarship Tips', group: 'Official guidance', detail: 'Where to look, common application materials, deadlines, and ways to organize searches.', url: 'https://studentaid.gov/articles/scholarship-tips/' },
];

const statuses: Status[] = ['Eligible', 'Rules match — source unverified', 'Needs information', 'Ineligible', 'Expired'];
const PROFILE_VERSION = 'profile-general-2026-11';
const PROFILE_DRAFT_SAVE_ERROR = 'Your profile draft could not be saved in this browser. Export an encrypted backup before closing or reloading.';
const PROFILE_SAVE_ERROR = 'Your profile could not be saved in this browser. Export an encrypted backup before closing or reloading.';
const mergeProfile = (saved: unknown): Profile => {
  const prior = saved && typeof saved === 'object' ? saved as Partial<Profile> : {};
  return { ...initialProfile, ...prior, profileVersion: PROFILE_VERSION };
};
const loadScholarships = (): Scholarship[] => {
  try {
    const raw = localStorage.getItem('scout-scholarships');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeScholarshipRecords(parsed
      .filter((item) => item && item.id !== 'demo-1' && item.id !== 'demo-2')
      .map((item) => normalizeTrackerRecord({ ...emptyScholarship(), ...item, criteria: item.criteria ?? {} }))) as Scholarship[];
  } catch { return []; }
};
const saveJson = (key: string, value: unknown) => writeJsonStorage(key, value);
const readLocalJson = (key: string): unknown => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};
const splitKeywords = (value: string) => value.split(/[,;\r\n]/).map((word) => word.trim()).filter(Boolean);
const formatDate = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not listed';
const formatDeadlineTime = (value?: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
};
const googleSearch = (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;

function trackAnalyticsPageView(tab: string): void {
  const pageTypes: Record<string, string> = {
    Overview: 'overview',
    Discovery: 'discovery',
    'Cloud Search': 'cloud_search',
    Scholarships: 'scholarships',
    'Application prep': 'application_prep',
    Resources: 'resources',
    'Eligibility filters': 'profile',
    Settings: 'settings',
  };
  const pageType = pageTypes[tab];
  if (!pageType) return;
  window.dispatchEvent(new CustomEvent('scholarship-scout:page-view', {
    detail: { pageType },
  }));
}
const createWorkspaceItemId = () => `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function App() {
  const [tab, setTabState] = useState(() => workspacePathToTab(window.location.pathname));
  const activeTabRef = useRef(tab);
  const setTab = (nextTab: typeof tab) => {
    const previousTab = activeTabRef.current;
    if (previousTab !== nextTab) {
      saveWorkspaceScrollPosition(workspaceTabToPath(previousTab), window.scrollY);
    }
    activeTabRef.current = nextTab;
    setTabState(nextTab);
  };
  useEffect(() => {
    const targetPath = workspaceTabToPath(tab);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ scholarshipScoutTab: tab }, "", targetPath);
    }
  }, [tab]);
  useEffect(() => {
    trackAnalyticsPageView(tab);
  }, [tab]);
  useEffect(() => {
    const path = workspaceTabToPath(tab);
    const restoreFrame = window.requestAnimationFrame(() => {
      window.scrollTo(0, getWorkspaceScrollPosition(path));
    });
    const persistScroll = () => saveWorkspaceScrollPosition(path, window.scrollY);
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persistScroll();
    };
    window.addEventListener("pagehide", persistScroll);
    document.addEventListener("visibilitychange", persistWhenHidden);
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.removeEventListener("pagehide", persistScroll);
      document.removeEventListener("visibilitychange", persistWhenHidden);
    };
  }, [tab]);
  useEffect(() => {
    const syncTabFromPath = () => setTab(workspacePathToTab(window.location.pathname));
    window.addEventListener("popstate", syncTabFromPath);
    return () => window.removeEventListener("popstate", syncTabFromPath);
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('scout-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('scout-sidebar-collapsed', String(desktopSidebarCollapsed)); } catch { /* sidebar preference is optional */ }
  }, [desktopSidebarCollapsed]);
  useEffect(() => {
    setMobileNavOpen(false);
  }, [tab]);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const savedTheme = localStorage.getItem('scout-theme');
      const hasExplicitPreference = localStorage.getItem('scout-theme-choice') === 'true';
      return hasExplicitPreference && savedTheme === 'light' ? 'light' : 'dark';
    } catch { return 'dark'; }
  });
  const [compactView, setCompactView] = useState(() => {
    try { return localStorage.getItem('scout-compact-view') === 'true'; }
    catch { return false; }
  });
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [items, setItems] = useState<Scholarship[]>(loadScholarships);
  const [profile, setProfile] = useState<Profile>(() => mergeProfile(readLocalJson('scout-profile')));
  const [profileDraft, setProfileDraft] = useState<Profile>(() => mergeProfile(readLocalJson('scout-profile-draft') ?? readLocalJson('scout-profile')));
  const profilePersistenceRef = useRef<Profile>(profile);
  const profileSaveGenerationRef = useRef(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [applicationStatusFilter, setApplicationStatusFilter] = useState('All');
  const [archiveFilter, setArchiveFilter] = useState<'active'|'archived'|'all'>('active');
  const [trackerSortBy, setTrackerSortBy] = useState<'deadline'|'priority'|'award'|'applicationStatus'|'eligibility'|'name'>('deadline');
  const [showAdd, setShowAdd] = useState(false);
  const [showAddValidation, setShowAddValidation] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Scholarship | null>(null);
  const [removeConfirmationId, setRemoveConfirmationId] = useState<string | null>(null);
  useEffect(() => { setRemoveConfirmationId(null); }, [selected?.id]);
  const [draft, setDraft] = useState<Scholarship>(emptyScholarship);
  const [notice, setNotice] = useState('');
  const [reliabilityEvents, setReliabilityEvents] = useState(() => readReliabilityEvents());
  const [alert, setAlert] = useState('');
  useEffect(() => {
    let timeout: number | undefined;
    let lockStarted = false;
    const scheduleLock = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (lockStarted) return;
        lockStarted = true;
        try { sessionStorage.setItem(FORCE_PASSPHRASE_SESSION_KEY, 'true'); } catch { /* best effort; vault lock still proceeds */ }
        void stopSupabaseAutoRefreshForVaultLock()
          .catch(() => undefined)
          .then(() => lockLocalVault())
          .then(() => window.location.reload())
          .catch((reason) => {
          lockStarted = false;
          setAlert(reason instanceof Error ? reason.message : 'The local vault could not be locked. Keep this tab open and retry.');
          scheduleLock();
        });
      }, 15 * 60 * 1000);
    };
    const onActivity = () => { if (!lockStarted) scheduleLock(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingLocalVaultWrites()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onPageHide = () => { void flushLocalVault().catch(() => undefined); };
    const onVaultPersistenceError = () => setAlert('The latest encrypted local save failed. Keep this tab open and retry before reloading or locking.');
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    for (const eventName of activityEvents) window.addEventListener(eventName, onActivity, { passive: true });
    window.addEventListener('scout:vault-persistence-error', onVaultPersistenceError);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    scheduleLock();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      for (const eventName of activityEvents) window.removeEventListener(eventName, onActivity);
      window.removeEventListener('scout:vault-persistence-error', onVaultPersistenceError);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
  useEffect(() => {
    const refreshDiagnostics = () => setReliabilityEvents(readReliabilityEvents());
    window.addEventListener(RELIABILITY_CHANGE_EVENT, refreshDiagnostics);
    refreshDiagnostics();
    return () => window.removeEventListener(RELIABILITY_CHANGE_EVENT, refreshDiagnostics);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const [profileSaveStatus, setProfileSaveStatus] = useState<'idle'|'saved'|'draft'|'unavailable'>('idle');
  const [cloudUser, setCloudUser] = useState<{id:string;email?:string;is_anonymous?:boolean}|null>(null);
  const [cloudAuthReady, setCloudAuthReady] = useState(false);
  const [guestMode, setGuestMode] = useState(() => {
    try { return sessionStorage.getItem('scholarship-scout-guest-session') === 'true'; }
    catch { return false; }
  });
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudMessage, setCloudMessage] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [accountVaultSyncStatus, setAccountVaultSyncStatus] = useState<'checking'|'not-enabled'|'enabled'|'available'|'syncing'|'error'>('checking');
  const [accountVaultSyncMessage, setAccountVaultSyncMessage] = useState('');
  const [accountVaultSyncConsent, setAccountVaultSyncConsent] = useState(false);
  const [privacyRequestType, setPrivacyRequestType] = useState("access");
  const [privacyRequestRequesterType, setPrivacyRequestRequesterType] = useState("self");
  const [privacyRequestDetails, setPrivacyRequestDetails] = useState("");
  const [privacyRequestEmail, setPrivacyRequestEmail] = useState("");
  const [privacyRequestReference, setPrivacyRequestReference] = useState("");
  const [privacyRequestHref, setPrivacyRequestHref] = useState("");
  const [privacyRequestMessage, setPrivacyRequestMessage] = useState("");
  useEffect(() => {
    const accountEmail = cloudUser?.email;
    if (accountEmail) setPrivacyRequestEmail((current) => current || accountEmail);
  }, [cloudUser?.email]);
  const [deleteCloudConfirmation, setDeleteCloudConfirmation] = useState("");
  const [deleteCloudAcknowledged, setDeleteCloudAcknowledged] = useState(false);
  const [deleteLocalWithCloud, setDeleteLocalWithCloud] = useState(false);
  const [localDeleteConfirmation, setLocalDeleteConfirmation] = useState("");
  const [localDeleteAcknowledged, setLocalDeleteAcknowledged] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState("");
  const [authCooldownUntil, setAuthCooldownUntil] = useState(() => {
    try { return Number(sessionStorage.getItem('scout-auth-email-cooldown-until')) || 0; } catch { return 0; }
  });
  const [authCooldownSeconds, setAuthCooldownSeconds] = useState(() => {
    try { return getAuthCooldownRemainingSeconds(Number(sessionStorage.getItem('scout-auth-email-cooldown-until')) || 0); } catch { return 0; }
  });
  const [liveResults, setLiveResults] = useState<LiveScholarship[]>([]);
  const [exaResults, setExaResults] = useState<LiveScholarship[]>([]);
  const [selectedDiscoveryCategories, setSelectedDiscoveryCategories] = useState<string[]>([
    "local", "academic", "humanities", "community_service",
  ]);
  const [discoverySummary, setDiscoverySummary] = useState<LiveDiscoverySummary | null>(null);
  const [discoveryState, setDiscoveryState] = useState<'idle' | 'loading' | 'results' | 'empty' | 'error'>('idle');
  const [applicationProgress, setApplicationProgress] = useState(() => {
    try {
      const raw = localStorage.getItem('scout-application-progress');
      return normalizeApplicationProgress(raw ? JSON.parse(raw) : {});
    } catch { return {}; }
  });
  const [applicationWorkspace, setApplicationWorkspace] = useState(() => {
    try {
      const raw = localStorage.getItem('scout-application-workspace');
      return normalizeApplicationWorkspace(raw ? JSON.parse(raw) : {});
    } catch { return {}; }
  });
  const [resourceWorkspace, setResourceWorkspace] = useState(() => normalizeResourceWorkspace(readLocalJson('scout-resource-workspace')));
  const [prepScholarshipId, setPrepScholarshipId] = useState('');
  const [backupDialogMode, setBackupDialogMode] = useState<'closed' | 'export' | 'import'>('closed');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('');
  const [backupImportFile, setBackupImportFile] = useState<File | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const backupBusyRef = useRef(false);
  backupBusyRef.current = backupBusy;
  const [backupPendingRestore, setBackupPendingRestore] = useState<{ data: unknown; encrypted: boolean } | null>(null);
  const [deadlineCalendarDay, setDeadlineCalendarDay] = useState(() => localToday());

  useEffect(() => {
    const generation = ++profileSaveGenerationRef.current;
    const isCurrentSave = () => generation === profileSaveGenerationRef.current;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          if (!saveJson('scout-profile-draft', profileDraft)) {
            throw new Error(PROFILE_DRAFT_SAVE_ERROR);
          }
          await flushLocalVault();
          if (!isCurrentSave()) return;

          // Clear only a previous profile-save warning; preserve unrelated alerts.
          setAlert((currentAlert) =>
            currentAlert === PROFILE_DRAFT_SAVE_ERROR || currentAlert === PROFILE_SAVE_ERROR
              ? ''
              : currentAlert
          );

          const validation = validateProfileChanges(profilePersistenceRef.current, profileDraft);
          if (!validation.valid) {
            setProfileSaveStatus('draft');
            return;
          }
          if (!saveJson('scout-profile', profileDraft)) {
            throw new Error(PROFILE_SAVE_ERROR);
          }
          try { localStorage.removeItem('scout-profile-draft'); } catch { /* preserve recoverable draft */ }
          await flushLocalVault();
          if (!isCurrentSave()) return;

          profilePersistenceRef.current = profileDraft;
          setProfile(profileDraft);
          setProfileSaveStatus('saved');
          setAlert((currentAlert) =>
            currentAlert === PROFILE_DRAFT_SAVE_ERROR || currentAlert === PROFILE_SAVE_ERROR
              ? ''
              : currentAlert
          );
        } catch (error) {
          if (!isCurrentSave()) return;
          setProfileSaveStatus('unavailable');
          setAlert(error instanceof Error ? error.message : PROFILE_DRAFT_SAVE_ERROR);
        }
      })();
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      if (profileSaveGenerationRef.current === generation) {
        profileSaveGenerationRef.current += 1;
      }
    };
  }, [profileDraft]);
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 250);
    const timeout = window.setTimeout(() => setDeadlineCalendarDay(localToday()), Math.max(1, nextMidnight.getTime() - now.getTime()));
    return () => window.clearTimeout(timeout);
  }, [deadlineCalendarDay]);

  useEffect(() => {
    try { localStorage.setItem('scout-theme', theme); } catch { /* storage may be unavailable */ }
  }, [theme]);
  const chooseTheme = (nextTheme: 'dark' | 'light') => {
    try { localStorage.setItem('scout-theme-choice', 'true'); } catch { /* storage may be unavailable */ }
    setTheme(nextTheme);
  };
  useEffect(() => {
    try { localStorage.setItem('scout-compact-view', String(compactView)); } catch { /* storage may be unavailable */ }
  }, [compactView]);

  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  useEffect(() => {
    const dialogIsOpen = showAdd || Boolean(selected) || backupDialogMode !== 'closed';
    if (!dialogIsOpen) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>('.overlay [role="dialog"]');
    if (!dialog) return;
    const getFocusable = () => [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
    const focusables = getFocusable();
    (focusables.find((element) => element.hasAttribute('autofocus')) ?? focusables[0] ?? dialog).focus();

    const handleDialogKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (backupDialogMode !== 'closed') {
          if (!backupBusyRef.current) closeBackupDialog();
        } else if (selected) {
          setSelected(null);
        } else {
          setShowAdd(false);
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const current = getFocusable();
      const first = current[0];
      const last = current[current.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeydown, true);
    return () => {
      document.removeEventListener('keydown', handleDialogKeydown, true);
      previousActive?.focus();
    };
  }, [showAdd, selected?.id, backupDialogMode, backupPendingRestore]);


  useEffect(() => {
    // Authentication is checked at the Home entry point. The private workspace
    // remains inaccessible until a real (non-anonymous) account is connected.
    const hasAuthCallback = hasPendingAuthCallback();
    const hasAuthCallbackError = hasPendingAuthCallbackError();
    let active = true;
    let authEventObserved = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const rememberSignedInDevice = (user: { is_anonymous?: boolean } | null) => {
      if (!user || user.is_anonymous) return;
      void enableLocalVaultDeviceUnlock().then(() => {
        if (active) setCloudMessage('Signed in. This browser is remembered, so your local vault will open automatically on future visits.');
      }).catch(() => {
        if (active) setCloudMessage('Signed in successfully. Automatic unlock could not be enabled in this browser; keep your local vault passphrase for future visits.');
      });
    };

    void getSupabaseClient().then((client) => {
      if (!active) return;
      if (!client) {
        setCloudAuthReady(true);
        setCloudMessage('Account sign-in is not configured in this deployment.');
        return;
      }
      const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        authEventObserved = true;
        setCloudAuthReady(true);
        const user = session?.user ?? null;
        setCloudUser(user ? { id: user.id, email: user.email, is_anonymous: user.is_anonymous } : null);
        if (user && !user.is_anonymous) {
          setGuestMode(false);
          try { sessionStorage.removeItem('scholarship-scout-guest-session'); } catch { /* best effort */ }
          rememberSignedInDevice(user);
          if (event === 'SIGNED_IN' || (hasAuthCallback && event === 'INITIAL_SESSION')) {
            setTab('Overview');
            try { sessionStorage.removeItem('scout-auth-email-cooldown-until'); } catch { /* storage may be unavailable */ }
            setAuthCooldownUntil(0);
          }
        } else if (user?.is_anonymous) {
          setCloudMessage('Connect a Google account to keep access to this temporary browser account and its saved sponsor records.');
        } else {
          setLiveResults([]);
          if (hasAuthCallback && event === 'INITIAL_SESSION') {
            setTab('Overview');
            setCloudMessage('Sign-in could not be completed. The link may have expired or the provider may have cancelled the request. Try again here.');
          }
        }
      });
      subscription = authSubscription;

      // Do not let an older initial lookup overwrite a newer auth event.
      void client.auth.getUser().then(({ data, error }) => {
        if (!active || authEventObserved) return;
        const user = !error ? data.user : null;
        setCloudAuthReady(true);
        setCloudUser(user ? { id: user.id, email: user.email, is_anonymous: user.is_anonymous } : null);
        if (user && !user.is_anonymous) {
          setGuestMode(false);
          try { sessionStorage.removeItem('scholarship-scout-guest-session'); } catch { /* best effort */ }
        }
        rememberSignedInDevice(user);
        if (hasAuthCallback) {
          setTab('Overview');
          setCloudMessage(user && !user.is_anonymous
            ? 'Sign-in completed. Your account is ready.'
            : 'Sign-in could not be completed. The link may have expired or the provider may have cancelled the request. Try again here.');
        }
      });
      if (hasAuthCallbackError) {
        setCloudAuthReady(true);
        setTab('Overview');
        setCloudMessage('Sign-in was cancelled or could not be completed. You can try again here.');
      }
    }).catch(() => {
      if (active) {
        setCloudAuthReady(true);
        setCloudMessage(hasAuthCallback
          ? 'Sign-in could not be completed. Check the provider configuration and try again.'
          : 'Account authentication could not be initialized. Refresh the page and try again.');
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const updateCooldown = () => {
      const remaining = getAuthCooldownRemainingSeconds(authCooldownUntil);
      setAuthCooldownSeconds(remaining);
      if (authCooldownUntil && remaining === 0) {
        try { sessionStorage.removeItem('scout-auth-email-cooldown-until'); } catch { /* storage may be unavailable */ }
      }
    };
    updateCooldown();
    if (!authCooldownUntil) return;
    const interval = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(interval);
  }, [authCooldownUntil]);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const code = hashParams.get('error_code') || searchParams.get('error_code') || '';
    const description = hashParams.get('error_description') || searchParams.get('error_description') || '';
    if (isExpiredAuthLinkError(code, description)) {
      setTab('Overview');
      setCloudMessage('That sign-in link was already used or expired. Wait for the timer, request one new link, and use the newest link only once.');
    }
  }, []);

  useEffect(() => {
    if (!cloudUser) return;
    let active = true;
    setCloudBusy(true);
    void listCloudScholarships()
      .then((rows) => { if (active) setLiveResults(rows); })
      .catch(() => { if (active) setCloudMessage('Could not load saved scholarship records. Try again later.'); })
      .finally(() => { if (active) setCloudBusy(false); });
    return () => { active = false; };
  }, [cloudUser?.id]);

  const saveProfile = (next: Profile) => {
    setProfileDraft(next);
  };
  const saveItems = (next: Scholarship[]): boolean => {
    if (!Array.isArray(next) || next.length > MAX_TRACKER_RECORDS) {
      setAlert(`Your tracker is limited to ${MAX_TRACKER_RECORDS.toLocaleString()} scholarships. Remove an existing record before adding another.`);
      return false;
    }
    const normalized = normalizeScholarshipRecords(next.map((item) => normalizeTrackerRecord(item))) as Scholarship[];
    const validIds = normalized.map((item) => item.id);
    const retainedProgress = normalizeApplicationProgress(applicationProgress, validIds);
    const retainedWorkspace = normalizeApplicationWorkspace(applicationWorkspace, validIds);
    const storageResult = writeJsonStorageBatch({
      'scout-scholarships': normalized,
      'scout-application-progress': retainedProgress,
      'scout-application-workspace': retainedWorkspace,
    });
    if (!storageResult.ok) {
      setAlert(storageResult.rollbackSucceeded
        ? 'Your changes could not be saved. Previously saved tracker data was preserved. Export an encrypted backup before trying again.'
        : 'Your changes could not be saved, and browser storage could not fully restore the previous data. Keep this tab open and export an encrypted backup.');
      return false;
    }
    setItems(normalized);
    setApplicationProgress(retainedProgress);
    setApplicationWorkspace(retainedWorkspace);
    void flushLocalVault().catch(() => setAlert('Your changes are active in this tab, but encrypted browser storage could not finish saving. Keep this tab open and retry before locking or reloading.'));
    return true;
  };
  const persistLocalJsonState = <T,>(
    key: string,
    value: T,
    updateState: (value: T) => void,
    writeError: string,
    flushError: string,
  ) => {
    void writeAndFlushJsonState({
      key,
      value,
      updateState,
      flush: flushLocalVault,
    }).then(({ ok, durable }) => {
      if (!ok) setAlert(writeError);
      else if (!durable) setAlert(flushError);
    });
  };
  const saveApplicationTask = (scholarshipId: string, stepIndex: number, checked: boolean) => {
    const next = updateApplicationProgress(applicationProgress, scholarshipId, stepIndex, checked);
    persistLocalJsonState(
      'scout-application-progress',
      next,
      setApplicationProgress,
      'Checklist progress could not be saved. The previously saved checklist was preserved.',
      'Checklist progress is active in this tab, but encrypted browser storage could not finish saving. Keep this tab open and retry before locking or reloading.',
    );
  };
  const saveApplicationWorkspaceEntry = (scholarshipId: string, entry: ApplicationWorkspaceEntry) => {
    const validIds = items.map((item) => item.id);
    const next = normalizeApplicationWorkspace({ ...applicationWorkspace, [scholarshipId]: entry }, validIds);
    persistLocalJsonState(
      'scout-application-workspace',
      next,
      setApplicationWorkspace,
      'Application workspace could not be saved. The previously saved workspace was preserved.',
      'Application workspace is active in this tab, but encrypted browser storage could not finish saving. Keep this tab open and retry before locking or reloading.',
    );
  };
  const saveResourceWorkspace = (next: ReturnType<typeof createResourceWorkspace>) => {
    const normalized = normalizeResourceWorkspace(next);
    persistLocalJsonState(
      'scout-resource-workspace',
      normalized,
      setResourceWorkspace,
      'Resource changes could not be saved. Previously saved resource data was preserved.',
      'Resource changes are active in this tab, but encrypted browser storage could not finish saving. Retry before locking or reloading.',
    );
  };
  const closeBackupDialog = () => {
    setBackupDialogMode('closed');
    setBackupPassword('');
    setBackupPasswordConfirm('');
    setBackupImportFile(null);
    setBackupPendingRestore(null);
  };
  const downloadBackupFile = (contents: string, filename: string) => {
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportLocalBackup = () => {
    setBackupPassword('');
    setBackupPasswordConfirm('');
    setBackupDialogMode('export');
  };
  const exportEncryptedBackup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (backupBusyRef.current) return;
    if (backupPassword.length < 12) {
      setNotice('Use a backup password with at least 12 characters.');
      return;
    }
    if (backupPassword !== backupPasswordConfirm) {
      setNotice('The backup passwords do not match.');
      return;
    }
    backupBusyRef.current = true;
    setBackupBusy(true);
    try {
      const backup = buildScoutBackup(profile, items, new Date(), applicationProgress, applicationWorkspace, profileDraft, resourceWorkspace);
      const validation = validateScoutBackup(backup, Object.keys(initialProfile));
      if (!validation.ok) {
        setAlert(validation.error);
        return;
      }
      const validatedBackup = { ...backup, ...validation.value };
      const { encryptBackup } = await import('./lib/backupCrypto.js');
      const encrypted = await encryptBackup(validatedBackup, backupPassword);
      downloadBackupFile(JSON.stringify(encrypted, null, 2), `scholarship-scout-encrypted-backup-${localToday()}.json`);
      closeBackupDialog();
      setNotice('Encrypted backup downloaded. Keep the password separate; it is never saved and cannot be recovered.');
    } catch (error) {
      setAlert('Could not create the encrypted backup. Check your password and browser security settings, then try again. No file was downloaded.');
    } finally {
      backupBusyRef.current = false;
      setBackupPassword('');
      setBackupPasswordConfirm('');
      setBackupBusy(false);
    }
  };
  const restoreLocalBackup = async (parsed: unknown, encrypted: boolean, confirmed = false): Promise<boolean> => {
    const validation = validateScoutBackup(parsed, Object.keys(initialProfile));
    if (!validation.ok) {
      setAlert(validation.error);
      return false;
    }
    const imported = validation.value;
    const restoredProfile = mergeProfile(imported.profile);
    const restoredProfileDraft = mergeProfile(imported.profileDraft ?? imported.profile);
    const profileValidation = validateProfileChanges(profilePersistenceRef.current, restoredProfile);
    if (!profileValidation.valid) {
      setAlert(profileValidation.errors[0] || 'The backup profile contains invalid values. Nothing was changed.');
      return false;
    }

    if (!confirmed) {
      setBackupPendingRestore({ data: imported, encrypted });
      setBackupPassword('');
      setBackupPasswordConfirm('');
      setBackupDialogMode('import');
      return false;
    }

    const restoredScholarships = normalizeScholarshipRecords(
      imported.scholarships.map((item) => normalizeTrackerRecord({
        ...emptyScholarship(),
        ...item,
        criteria: item.criteria ?? {},
      })),
    ) as Scholarship[];
    const restoredScholarshipIds = restoredScholarships
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const restoredProgress = normalizeApplicationProgress(imported.applicationProgress, restoredScholarshipIds);
    const restoredWorkspace = normalizeApplicationWorkspace(imported.applicationWorkspace, restoredScholarshipIds);

    const storageKeys = [
      'scout-profile',
      'scout-profile-draft',
      'scout-scholarships',
      'scout-application-progress',
      'scout-application-workspace',
      'scout-resource-workspace',
    ];
    let previousStorage: Record<string, string | null>;
    try {
      previousStorage = Object.fromEntries(storageKeys.map((key) => [key, localStorage.getItem(key)]));
    } catch {
      setAlert('The browser could not read the current local data before restoring. Nothing was changed.');
      return false;
    }

    const storageResult = writeJsonStorageBatch({
      'scout-profile': restoredProfile,
      'scout-profile-draft': restoredProfileDraft,
      'scout-scholarships': restoredScholarships,
      'scout-application-progress': restoredProgress,
      'scout-application-workspace': restoredWorkspace,
      'scout-resource-workspace': normalizeResourceWorkspace(imported.resourceWorkspace),
    });
    if (!storageResult.ok) {
      setAlert(storageResult.rollbackSucceeded
        ? 'The browser could not save this restore. The previous local data was rolled back and left in place.'
        : 'The browser could not save the restore or fully roll back its storage writes. Keep this tab open and export the current local state before reloading.');
      return false;
    }

    try {
      await flushLocalVault();
    } catch {
      let rollbackWritesSucceeded = true;
      for (const key of storageKeys) {
        try {
          const previousValue = previousStorage[key];
          if (previousValue === null || previousValue === undefined) localStorage.removeItem(key);
          else localStorage.setItem(key, previousValue);
        } catch {
          rollbackWritesSucceeded = false;
        }
      }
      let rollbackPersisted = false;
      try {
        await flushLocalVault();
        rollbackPersisted = true;
      } catch { /* report that durable rollback could not be confirmed */ }
      setAlert(rollbackWritesSucceeded && rollbackPersisted
        ? 'The encrypted backup restore could not be saved. Your previous local data was restored.'
        : 'The encrypted backup restore failed and durable rollback could not be confirmed. Keep this tab open and export the current local state before reloading.');
      return false;
    }

    setProfile(restoredProfile);
    setProfileDraft(restoredProfileDraft);
    profilePersistenceRef.current = restoredProfile;
    setBackupPendingRestore(null);
    const restoredDraftHasChanges = Object.keys(initialProfile).some((key) =>
      restoredProfileDraft[key as keyof Profile] !== restoredProfile[key as keyof Profile]
    );
    setProfileSaveStatus(restoredDraftHasChanges ? 'draft' : 'saved');
    setItems(restoredScholarships);
    setApplicationProgress(restoredProgress);
    setApplicationWorkspace(restoredWorkspace);
    setResourceWorkspace(normalizeResourceWorkspace(imported.resourceWorkspace));
    setNotice('Backup imported. Your profile, tracker, checklists, application workspaces, and resources were restored locally.');
    return true;
  };
  const confirmRestoreLocalBackup = async () => {
    if (!backupPendingRestore || backupBusyRef.current) return;
    backupBusyRef.current = true;
    setBackupBusy(true);
    try {
      if (await restoreLocalBackup(backupPendingRestore.data, backupPendingRestore.encrypted, true)) closeBackupDialog();
    } catch {
      setAlert('The encrypted backup restore could not be completed. Your current workspace was not reported as restored.');
    } finally {
      backupBusyRef.current = false;
      setBackupBusy(false);
    }
  };
  const importLocalBackup = async (file?: File) => {
    if (!file) return;
    try {
      const { isEncryptedBackupEnvelope, MAX_ENCRYPTED_BACKUP_FILE_BYTES } = await import('./lib/backupCrypto.js');
      if (!Number.isSafeInteger(file.size) || file.size > MAX_ENCRYPTED_BACKUP_FILE_BYTES) {
        setAlert('Backup file exceeds the supported 3 MB limit. Your current data was not changed.');
        return;
      }
      const parsed: unknown = JSON.parse(await file.text());
      if (isEncryptedBackupEnvelope(parsed)) {
        setBackupImportFile(file);
        setBackupPassword('');
        setBackupDialogMode('import');
        return;
      }
      await restoreLocalBackup(parsed, false);
    } catch {
      setAlert('Could not read that backup file. Your current data was not changed.');
    }
  };
  const importEncryptedBackup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!backupImportFile || backupBusyRef.current) return;
    backupBusyRef.current = true;
    setBackupBusy(true);
    try {
      const envelope: unknown = JSON.parse(await backupImportFile.text());
      const { decryptBackup, isEncryptedBackupEnvelope } = await import('./lib/backupCrypto.js');
      if (!isEncryptedBackupEnvelope(envelope)) throw new Error('The encrypted backup file is no longer available.');
      const decrypted = await decryptBackup(envelope, backupPassword);
      setBackupPassword('');
      await restoreLocalBackup(decrypted, true);
    } catch {
      setAlert('Could not decrypt that backup. Check the password and file integrity. Your current data was not changed.');
    } finally {
      backupBusyRef.current = false;
      setBackupPassword('');
      setBackupBusy(false);
    }
  };
  const beginAuthCooldown = () => {
    const until = Date.now() + AUTH_EMAIL_COOLDOWN_SECONDS * 1000;
    setAuthCooldownUntil(until);
    setAuthCooldownSeconds(AUTH_EMAIL_COOLDOWN_SECONDS);
    try { sessionStorage.setItem('scout-auth-email-cooldown-until', String(until)); } catch { /* storage may be unavailable */ }
  };
  const handleCloudSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authCooldownSeconds > 0) {
      setCloudMessage(`Please wait ${authCooldownSeconds} seconds before requesting another email.`);
      return;
    }
    if (!supabaseConfigured || !isOnline) {
      setCloudMessage('Cloud sign-in is unavailable until the app is configured and online.');
      return;
    }
    setCloudBusy(true);
    setCloudMessage('Sending a secure sign-in link…');
    try {
      await sendMagicLink(cloudEmail.trim());
      beginAuthCooldown();
      setCloudMessage('Sign-in email sent. Use the newest link only once and open it in this same browser profile. Wait for the timer before requesting another link.');
    } catch (error) {
      if (isAuthRateLimitError(error)) {
        beginAuthCooldown();
        setCloudMessage('Sign-in emails are temporarily rate-limited. Wait for the countdown before trying again.');
      } else if (isExpiredAuthLinkError((error as {code?:string})?.code, error instanceof Error ? error.message : '')) {
        setCloudMessage('That sign-in link was already used or expired. Wait for the timer, request one new link, and use the newest link only once.');
      } else {
        setCloudMessage('Could not send the sign-in link. Check the email address and connection, then try again.');
      }
    } finally {
      setCloudBusy(false);
    }
  };
  const handleGoogleSignIn = async () => {
    if (!supabaseConfigured || !isOnline) {
      setCloudMessage('Google sign-in is unavailable until cloud services are configured and the app is online.');
      return;
    }
    const linkingAnonymousAccount = cloudUser?.is_anonymous === true;
    setCloudBusy(true);
    setCloudMessage(linkingAnonymousAccount
      ? 'Connecting Google to your existing cloud account…'
      : 'Redirecting to Google sign-in…');
    try {
      if (linkingAnonymousAccount) {
        await linkGoogleIdentity();
      } else {
        await signInWithGoogle();
      }
    } catch (error) {
      const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (code.includes('manual_linking_disabled') || message.includes('manual linking is disabled')) {
        setCloudMessage('Google account linking is disabled in Supabase. Enable manual identity linking in the Auth provider settings, then retry.');
      } else if (code.includes('identity_already_exists') || code.includes('identity_exists') || message.includes('identity already exists')) {
        setCloudMessage('That Google identity is already linked to a different Scholarship Scout account. Accounts and saved records are not merged automatically.');
      } else if (code.includes('provider_disabled') || code.includes('unsupported_provider') || message.includes('provider is not enabled')) {
        setCloudMessage('Google sign-in is not enabled for this project yet. Complete the Google provider setup in Supabase Auth settings.');
      } else {
        setCloudMessage('Google sign-in could not be started. Check the Google provider configuration and try again.');
      }
    } finally {
      setCloudBusy(false);
    }
  };
  const readAccountVaultSyncSnapshot = async () => {
    if (!cloudUser || cloudUser.is_anonymous || guestMode) {
      return { state: 'not-enabled' as const, localStatus: null };
    }
    const localStatus = getLocalAccountVaultSyncStatus({ ownerId: cloudUser.id });
    if (!localStatus.enabled || localStatus.revision < 1) {
      return { state: 'not-enabled' as const, localStatus };
    }
    const remoteBackup = await getAccountVaultBackup();
    return {
      state: getAccountVaultSyncState(localStatus, remoteBackup),
      localStatus,
    };
  };

  const refreshAccountVaultSyncStatus = async (isActive: () => boolean = () => true) => {
    const snapshot = await readAccountVaultSyncSnapshot();
    if (!isActive()) return;
    if (snapshot.state === 'not-enabled') {
      setAccountVaultSyncStatus('not-enabled');
      setAccountVaultSyncMessage('');
      return;
    }
    if (snapshot.state === 'remote-ahead') {
      setAccountVaultSyncStatus('available');
      setAccountVaultSyncMessage('A newer encrypted account backup exists from another device. This device was not overwritten and automatic syncing is paused to protect your local records. Export your current local vault before restoring the newer backup on a clean browser profile. Vault histories are not merged automatically.');
      return;
    }
    if (snapshot.state === 'missing') {
      throw new Error('The account backup is missing. Your local vault remains unchanged. Do not recreate the cloud copy until you have confirmed which device has the latest records.');
    }
    if (snapshot.state === 'invalid-remote') {
      throw new Error('The account backup metadata is invalid. Automatic syncing is paused and your local vault remains unchanged.');
    }
    if (snapshot.state === 'local-ahead') {
      throw new Error('This device has a revision newer than the account backup. Automatic syncing is paused instead of rolling the cloud copy backward. Export your local vault before resolving the backup state.');
    }
    if (snapshot.state === 'dirty') {
      setAccountVaultSyncStatus('syncing');
      setAccountVaultSyncMessage('Uploading the latest encrypted local changes…');
      await syncAccountVaultNow();
      if (!isActive()) return;
      const afterSync = await readAccountVaultSyncSnapshot();
      if (!isActive()) return;
      if (afterSync.state === 'remote-ahead') {
        setAccountVaultSyncStatus('available');
        setAccountVaultSyncMessage('A newer encrypted account backup exists from another device. Your local records were not overwritten; automatic syncing is paused.');
        return;
      }
      if (afterSync.state !== 'current') {
        throw new Error('The encrypted backup changed while this device was syncing. Your local records remain saved; check the backup status before continuing.');
      }
    }
    setAccountVaultSyncStatus('enabled');
    setAccountVaultSyncMessage('Your encrypted account vault is up to date.');
  };

  useEffect(() => {
    if (!cloudUser || cloudUser.is_anonymous || guestMode) {
      setAccountVaultSyncStatus('not-enabled');
      setAccountVaultSyncMessage('');
      return;
    }
    let active = true;
    let timer: number | null = null;
    let running = false;
    let rerun = false;

    const runSync = async () => {
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      try {
        do {
          rerun = false;
          await refreshAccountVaultSyncStatus(() => active);
        } while (rerun && active);
      } catch (error) {
        if (active) {
          setAccountVaultSyncStatus('error');
          setAccountVaultSyncMessage(error instanceof Error
            ? error.message
            : 'Encrypted account backup sync failed. Your local records remain saved on this device.');
        }
      } finally {
        running = false;
      }
    };

    const onLocalPersisted = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void runSync();
      }, 900);
    };
    const onResume = () => {
      if (document.visibilityState === 'hidden') return;
      void runSync();
    };

    window.addEventListener('scout:vault-local-persisted', onLocalPersisted);
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    void runSync();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('scout:vault-local-persisted', onLocalPersisted);
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [cloudUser?.id, guestMode]);

  const handleRefreshCrossDeviceVault = async () => {
    if (!cloudUser || cloudUser.is_anonymous || guestMode || cloudBusy) return;
    setCloudBusy(true);
    setAccountVaultSyncStatus('syncing');
    try {
      await refreshAccountVaultSyncStatus();
    } catch (error) {
      setAccountVaultSyncStatus('error');
      setAccountVaultSyncMessage(error instanceof Error
        ? error.message
        : 'The encrypted account backup status could not be checked.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleForgetRememberedDevice = async () => {
    try {
      await forgetLocalVaultDeviceUnlock();
      setNotice('This browser will ask for your local vault passphrase next time. Your encrypted data and recovery passphrase are unchanged.');
    } catch {
      setAlert('This browser could not remove remembered-device access. Your vault is still protected by its recovery passphrase.');
    }
  };

  const handleEnableCrossDeviceVault = async () => {
    if (!cloudUser || cloudUser.is_anonymous || guestMode || cloudBusy) return;
    setCloudBusy(true);
    setAccountVaultSyncStatus('syncing');
    setAccountVaultSyncMessage('Setting up an account-linked passkey. Your authenticator may ask you to verify your identity.');
    try {
      const existing = await getAccountVaultBackup();
      if (existing) {
        const localStatus = getLocalAccountVaultSyncStatus({ ownerId: cloudUser.id });
        if (!localStatus.enabled || localStatus.revision !== existing.revision) {
          throw new Error('An account vault backup already exists at a different revision. To avoid replacing newer records, restore it on a clean browser using the synced passkey instead of attaching this separate local vault.');
        }
        setAccountVaultSyncStatus('enabled');
        setAccountVaultSyncMessage('This device is connected to your existing encrypted account vault. New changes will sync automatically.');
      } else {
        const passkey = await registerAccountVaultPasskey({
          userId: cloudUser.id,
          displayName: cloudUser.email || 'Scholarship Scout account',
        });
        await createLocalAccountVaultKeyWrap(passkey.wrappingKey, { ownerId: cloudUser.id });
        const syncSnapshot = await getAccountVaultSyncEnvelope({ ownerId: cloudUser.id });
        const created = await createAccountVaultBackup({
          credentialId: passkey.credentialId,
          prfSalt: passkey.prfSalt,
          encryptedEnvelope: syncSnapshot.envelope,
        });
        await setLocalAccountVaultRevision(created.revision, {
          ownerId: cloudUser.id,
          expectedGeneration: syncSnapshot.generation,
        });
        setAccountVaultSyncStatus('enabled');
        setAccountVaultSyncMessage('Cross-device encrypted backup is enabled. Future local changes will sync automatically; the server receives ciphertext only.');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Passkey setup could not be completed.';
      setAccountVaultSyncStatus('error');
      setAccountVaultSyncMessage(detail);
    } finally {
      setCloudBusy(false);
    }
  };

  const syncAccountVaultNow = async () => {
    if (!cloudUser || cloudUser.is_anonymous || guestMode) return;
    const localStatus = getLocalAccountVaultSyncStatus({ ownerId: cloudUser.id });
    if (!localStatus.enabled || localStatus.revision < 1 || !localStatus.dirty) return;
    const backup = await getAccountVaultBackup();
    if (!backup) {
      throw new Error('The account backup is missing. Re-enable cross-device backup before continuing.');
    }
    if (backup.revision !== localStatus.revision) {
      throw new Error('A newer account vault exists on another device. This device has paused syncing to avoid overwriting it. Use the synced passkey to restore the newer vault on a clean device, or export this device’s encrypted backup before resolving the conflict.');
    }
    const syncSnapshot = await getAccountVaultSyncEnvelope({ ownerId: cloudUser.id });
    const revision = await updateAccountVaultBackup({
      encryptedEnvelope: syncSnapshot.envelope,
      expectedRevision: localStatus.revision,
    });
    await setLocalAccountVaultRevision(revision, {
      ownerId: cloudUser.id,
      expectedGeneration: syncSnapshot.generation,
    });
  };

  const handleDisableCrossDeviceVault = async () => {
    if (!cloudUser || cloudUser.is_anonymous || cloudBusy) return;
    const confirmed = window.confirm('Delete the encrypted cross-device backup from your account? This keeps the local vault on this browser and turns off cloud syncing.');
    if (!confirmed) return;
    setCloudBusy(true);
    setAccountVaultSyncStatus('syncing');
    try {
      await deleteAccountVaultBackup();
      await forgetLocalAccountVaultSync({ ownerId: cloudUser.id });
      setAccountVaultSyncStatus('not-enabled');
      setAccountVaultSyncMessage('The encrypted cloud backup was deleted. Your local vault and same-device automatic unlock are unchanged.');
      setAccountVaultSyncConsent(false);
    } catch (error) {
      setAccountVaultSyncStatus('error');
      setAccountVaultSyncMessage(error instanceof Error ? error.message : 'The cross-device backup could not be disabled.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCheckCloudSession = async () => {
    setCloudBusy(true);
    setCloudMessage('Checking your sign-in session…');
    try {
      const user = await getCloudUser();
      if (!user) {
        setCloudUser(null);
        setCloudMessage('No active sign-in session was found. Complete Google sign-in or open the newest email sign-in link in this browser, then check again.');
        return;
      }
      setCloudUser({id:user.id,email:user.email,is_anonymous:user.is_anonymous});
      if (!user.is_anonymous) {
        await enableLocalVaultDeviceUnlock();
        setCloudMessage('Signed in successfully. This browser is remembered, so your local vault will open automatically on future visits.');
      } else {
        setCloudMessage('Your private anonymous browser session is active. Connect Google to keep access to its cloud records.');
      }
    } catch (error) {
      setCloudMessage('Could not check your account session. Refresh the page and try again.');
    } finally {
      setCloudBusy(false);
    }
  };
  const handleCloudSignOut = async () => {
    setCloudBusy(true);
    try {
      await signOutCloudUser();
      setCloudUser(null);
      setLiveResults([]);
      setExaResults([]);
      try { sessionStorage.removeItem('scholarship-scout-guest-session'); } catch { /* best effort */ }
      setCloudMessage('Signed out. Your local encrypted vault remains on this device.');
      window.location.reload();
    } catch (error) {
      setCloudMessage('Could not sign out right now. Check your connection and try again.');
    } finally {
      setCloudBusy(false);
    }
  };
  const handlePrivacyRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const href = buildPrivacyRequestMailto({
        requestType: privacyRequestType,
        requesterType: privacyRequestRequesterType,
        details: privacyRequestDetails,
        contactEmail: privacyRequestEmail,
        previousRequestReference: privacyRequestReference,
      });
      setPrivacyRequestHref(href);
      setPrivacyRequestMessage("Your email draft is ready. Open it below and press Send. Scholarship Scout has not received the request yet.");
    } catch (error) {
      setPrivacyRequestHref("");
      setPrivacyRequestMessage(error instanceof Error ? error.message : "Check the request details and try again.");
    }
  };

  const handleCloudAccountDeletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cloudUser || deleteCloudConfirmation !== "DELETE MY ACCOUNT" || !deleteCloudAcknowledged) return;

    setDeletionBusy(true);
    setDeletionMessage("Deleting the signed-in account and its cloud records…");
    try {
      await deleteCloudAccount();
      setCloudUser(null);
      setLiveResults([]);
      setExaResults([]);
      setDeleteCloudConfirmation("");
      setDeleteCloudAcknowledged(false);

      if (deleteLocalWithCloud) {
        setDeletionMessage("The cloud account was deleted. Removing this browser’s local workspace…");
        try {
          await destroyLocalVault();
          window.location.replace("/");
          return;
        } catch {
          setDeletionMessage("The cloud account was deleted, but this browser’s local vault could not be fully removed. Use the separate local-data removal form below and contact support if the issue continues.");
        }
      } else {
        setDeletionMessage("The cloud account and associated cloud records were deleted. The encrypted local workspace in this browser remains. You can remove it separately below.");
      }
    } catch {
      setDeletionMessage("The cloud account could not be deleted. No local data was removed. Confirm that you are signed in and try again, or email privacy support.");
    } finally {
      setDeletionBusy(false);
    }
  };

  const handleLocalDataDeletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (localDeleteConfirmation !== "DELETE LOCAL DATA" || !localDeleteAcknowledged) return;
    setDeletionBusy(true);
    setDeletionMessage("Removing this browser’s encrypted workspace…");
    try {
      await destroyLocalVault();
      window.location.replace("/");
      return;
    } catch {
      setDeletionMessage("This browser’s local data could not be fully removed. Keep this tab open, retry once, and contact privacy support if it continues.");
    } finally {
      setDeletionBusy(false);
    }
  };

  const handleCloudSearch = async () => {
    setExaResults([]);
    setDiscoverySummary(null);
    setDiscoveryState('idle');
    setCloudBusy(true);
    try {
      if (!profile.state.trim() || !profile.graduationYear.trim()) {
        setDiscoveryState('error');
        setCloudMessage("Add your state and expected graduation year to your local profile before searching.");
        return;
      }
      if (selectedDiscoveryCategories.length === 0) {
        setDiscoveryState('error');
        setCloudMessage("Choose at least one discovery category.");
        return;
      }
      // Public discovery is deliberately independent of Supabase Auth.
      // The Edge Function accepts only broad search filters and rate-limits requests.
      setExaResults([]);
      setDiscoverySummary(null);
      setDiscoveryState('loading');
      setCloudMessage('Searching the selected categories. Only your state, graduation year, and category choices are sent to the search service; additional profile details stay on this device for matching.');
      const run = await runLiveScholarshipDiscovery(
        profile,
        selectedDiscoveryCategories,
      );
      setExaResults(run.results);
      setDiscoverySummary(run.summary);
      setDiscoveryState(run.results.length ? 'results' : 'empty');
      setCloudMessage(run.results.length
        ? `Found ${run.results.length} scholarship leads. Review each official sponsor page before relying on its details.`
        : "Search completed but found no usable public scholarship leads. Try a different category later.");
    } catch (error) {
      setDiscoveryState('error');
      setCloudMessage(getDiscoveryErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudSave = async (item: Scholarship) => {
    setCloudBusy(true);
    setCloudMessage('Saving scholarship sponsor details only; student profile and eligibility results stay on this device…');
    try {
      const saved = await saveCloudScholarship(item as unknown as Record<string, unknown>);
      setLiveResults((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
      setCloudMessage('Scholarship details saved to your private cloud workspace. No student profile or eligibility result was uploaded.');
      setNotice('Scholarship sponsor details saved to your cloud workspace.');
    } catch (error) {
      setCloudMessage('Could not save this scholarship to your account. Check your connection and try again.');
    } finally { setCloudBusy(false); }
  };
  const addLiveResult = (row: LiveScholarship) => {
    if (items.some((item) => item.backendOpportunityId === row.id || item.sourceUrl === row.source_url)) {
      setNotice('This opportunity is already in your tracker.'); return;
    }
    const saved: Scholarship = {
      ...emptyScholarship(), id: crypto.randomUUID(), backendOpportunityId: row.id,
      name: row.title, provider: row.provider || 'Sponsor not yet confirmed', award: row.award_text || '',
      awardEvidenceText: row.award_evidence_text || '', awardEvidenceUrl: row.award_evidence_url || '',
      awardCurrencyBasis: row.award_currency_basis || '', awardBasis: row.award_basis || '',
      deadline: row.deadline || '', deadlineText: row.deadline_text || '', deadlineTimezone: row.deadline_timezone || '',
      openDate: row.open_date || '', openDateTimezone: row.open_date_timezone || '',
      priorityDeadline: row.priority_deadline || '', priorityDeadlineText: row.priority_deadline_text || '', priorityDeadlineTimezone: row.priority_deadline_timezone || '',
      deadlineNotPublished: row.deadline_not_published === true, sourceUrl: row.source_url, sourceVerified: false,
      evidenceUrl: row.source_evidence_url || '', lastCheckedDate: row.last_checked_date || '',
      sourceAuthority: row.source_authority || 'unverified-lead',
      evidenceText: row.excerpt || '', discoverySourceUrl: row.discovery_source_url || undefined,
      discoverySourceLabel: `Live web research · ${(row.discovery_categories || [row.discovery_category]).join(', ')}`, discoveredOn: row.discovered_at?.slice(0,10),
      recordCreatedAt: new Date().toISOString(),
      notes: 'Saved from a live search. Run sponsor-rule extraction and review every requirement before using an eligibility result.',
      criteria: {},
    };
    if (!saveItems([saved,...items])) return;
    setNotice('Live scholarship lead added to your tracker. Sponsor rules remain unverified.');
  };
  const openAdd = (candidate?: Scholarship, editing = false) => {
    setDraft(candidate ? {
      ...candidate,
      id: editing ? candidate.id : '',
      criteria: { ...candidate.criteria },
      criteriaEvidence: Object.fromEntries(Object.entries(candidate.criteriaEvidence ?? {}).map(([key, value]) => [key, { ...value }])),
      sourceReviewConfirmed: false,
    } : emptyScholarship());
    setEditingId(editing && candidate ? candidate.id : null);
    setShowAddValidation(false);
    setShowAdd(true);
  };
  const add = () => {
    if (!draft.name.trim() || !draft.provider.trim()) {
      setShowAddValidation(true);
      return;
    }
    setShowAddValidation(false);
    if (editingId) {
      const previous = items.find((item) => item.id === editingId);
      const { sourceReviewConfirmed, ...draftRecord } = draft;
      const safeDraftRecord = sanitizeScholarshipSourceUrls(draftRecord);
      const withHistory = appendSourceEvidenceHistory(previous ?? {}, { ...safeDraftRecord, id: editingId });
      const updated = invalidateSourceReviewIfChanged(previous ?? {}, withHistory, sourceReviewConfirmed === true);
      if (!saveItems(items.map((item) => item.id === editingId ? updated : item))) return;
      setNotice('Scholarship rules updated. Eligibility was recalculated against your profile.');
    } else {
      const draftRecord = { ...draft };
      delete draftRecord.sourceReviewConfirmed;
      const safeDraftRecord = sanitizeScholarshipSourceUrls(draftRecord);
      const saved = { ...safeDraftRecord, id: crypto.randomUUID(), recordCreatedAt: new Date().toISOString(), lastCheckedDate: draft.sourceVerified ? (draft.lastCheckedDate || localToday()) : draft.lastCheckedDate };
      if (!saveItems([saved, ...items])) return;
      setNotice('Scholarship added. Run the eligibility check to see which requirements pass or need attention.');
    }
    setShowAdd(false);
    setEditingId(null);
  };
  const assessments = useMemo(() => new Map<string, EligibilityAssessment>(items.map((item): [string, EligibilityAssessment] => [item.id, assessEligibility(item, profile)])), [items, profile]);
  const exportTrackerReport = () => {
    const report = buildTrackerCsvReport(items, assessments, (item) => deriveSourceStatus(item));
    const blob = new Blob([report], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scholarship-scout-tracker-${localToday()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Tracker report exported to this device. No tracker data was uploaded.');
  };
  const filtered = useMemo(() => filterAndSortTrackerRecords(items, {
    search: query,
    eligibilityFilter: filter,
    applicationStatusFilter,
    archiveFilter,
    sortBy: trackerSortBy,
    assessments,
  }) as Scholarship[], [items, filter, query, applicationStatusFilter, archiveFilter, trackerSortBy, assessments]);
  const hasFilteredEmptyState = items.length > 0 && filtered.length === 0;
  const clearTrackerFilters = () => {
    setQuery('');
    setFilter('All');
    setApplicationStatusFilter('All');
    setArchiveFilter('active');
    setTrackerSortBy('deadline');
  };
  const applicationCounts = useMemo(() => getApplicationStatusCounts(items), [items]);
  const duplicateSuggestions = useMemo(() => findPotentialDuplicates(items), [items]);
  const prepScholarship = items.find((item) => item.id === prepScholarshipId) ?? items[0] ?? null;
  const prepWorkspace = prepScholarship
    ? applicationWorkspace[prepScholarship.id] ?? createApplicationWorkspace()
    : createApplicationWorkspace();
  const prepSummary = prepScholarship
    ? getApplicationWorkspaceSummary(prepWorkspace, applicationProgress[prepScholarship.id] ?? [])
    : { completed: 0, total: 0, percent: 0, wordCount: 0, overLimitEssays: 0, pendingRecommendations: 0, requiredDocuments: 0, readyDocuments: 0 };
  const savePrepWorkspace = (next: ApplicationWorkspaceEntry) => {
    if (prepScholarship) saveApplicationWorkspaceEntry(prepScholarship.id, next);
  };
  const markPrepScholarshipSubmitted = () => {
    if (!prepScholarship) return;
    const confirmed = window.confirm('Record ' + prepScholarship.name + ' as submitted on ' + formatDate(localToday()) + '? This updates Scholarship Scout only; it does not send an application to the sponsor.');
    if (!confirmed) return;
    if (!saveItems(items.map((item) => item.id === prepScholarship.id
      ? { ...item, applicationStatus: 'Submitted', submittedAt: localToday() }
      : item))) return;
    setNotice('Submission recorded locally. Scholarship Scout did not send your application.');
  };
  const deadlineOverview = useMemo(() => items
    .filter((item) => !item.archived)
    .flatMap((item) => getDeadlineMilestones(item).map((milestone) => ({
      item,
      milestone,
      urgency: getDeadlineUrgency(milestone.deadline, new Date(), milestone.timeZone, item.openDate, item.openDateTimezone),
    })))
    .filter(({ urgency }) => urgency.daysRemaining !== null)
    .sort((left, right) => Math.abs(left.urgency.daysRemaining ?? 0) - Math.abs(right.urgency.daysRemaining ?? 0))
    .slice(0, 5), [items, deadlineCalendarDay]);
  const deadlineMilestones = useMemo(() => items
    .filter((item) => !item.archived)
    .flatMap((item) => getDeadlineMilestones(item).map((milestone) => ({ item, milestone }))), [items]);
  const deadlinesDueSoon = useMemo(() => deadlineMilestones.filter(({ item, milestone }) => {
    const status = getDeadlineUrgency(milestone.deadline, new Date(), milestone.timeZone, item.openDate, item.openDateTimezone).status;
    return status === 'today' || status === 'due-soon';
  }).length, [deadlineMilestones, deadlineCalendarDay]);
  const overdueDeadlines = useMemo(() => deadlineMilestones.filter(({ item, milestone }) =>
    getDeadlineUrgency(milestone.deadline, new Date(), milestone.timeZone, item.openDate, item.openDateTimezone).status === 'overdue'
  ).length, [deadlineMilestones, deadlineCalendarDay]);
  const candidateAssessments = useMemo(() => DISCOVERED_WITH_EVIDENCE
    .map((item) => ({ item, assessment: assessEligibility(item, profile) }))
    .sort((a, b) => {
      const rank = (item: Scholarship) => item.sourceStatus === 'verified' ? 0 : item.sourceStatus === 'needs-review' ? 1 : 2;
      return rank(a.item) - rank(b.item) || (a.item.deadline || '9999-12-31').localeCompare(b.item.deadline || '9999-12-31');
    }), [profile]);
  const queryGroups = useMemo(() => buildManualSearchQueries(), []);
  const navGroups: { title: string; items: { tab: string; label: string; description: string; icon: GlyphName; count?: boolean }[] }[] = [
    { title: 'WORKSPACE', items: [
      { tab: 'Overview', label: 'Home', description: 'Your scholarship dashboard', icon: 'home' },
    ]},
    { title: 'DISCOVER', items: [
      { tab: 'Discovery', label: 'Find scholarships', description: 'Manual and live scholarship search', icon: 'search' },
    ]},
    { title: 'TRACK', items: [
      { tab: 'Scholarships', label: 'My scholarships', description: 'Awards, deadlines, and applications', icon: 'book', count: true },
    ]},
    { title: 'RESOURCES', items: [
      { tab: 'Resources', label: 'Resources', description: 'Worksheets, checklists, and guides', icon: 'book-stack' },
    ]},
    { title: 'YOUR SETUP', items: [
      { tab: 'Eligibility filters', label: 'My profile', description: 'Personalize search and eligibility', icon: 'user' },
      { tab: 'Settings', label: 'Settings', description: 'Appearance, privacy, and account', icon: 'settings' },
    ]},
  ];
  const activeNavTab = tab === 'Cloud Search' ? 'Discovery' : tab === 'Application prep' ? 'Scholarships' : tab;
  const currentPage = navGroups.flatMap(group => group.items).find(item => item.tab === activeNavTab)?.label ?? activeNavTab;
  const profileReadiness = getProfileReadiness(profile);
  const tracked = (id: string) => items.some((item) => item.id === id || item.name === DISCOVERED_WITH_EVIDENCE.find((x) => x.id === id)?.name);
  const selectedAssessment = selected ? assessEligibility(selected, profile) : null;
  const selectedSummary = selectedAssessment ? summarizeEligibilityAssessment(selectedAssessment) : null;
  const setCriteria = (patch: Partial<EligibilityCriteria>) => setDraft((current) => {
    const criteria = { ...current.criteria, ...patch };
    const criteriaImportance = { ...(current.criteriaImportance ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === '' || value === false ||
        (Array.isArray(value) && value.length === 0)) delete criteriaImportance[key as keyof EligibilityCriteria];
    }
    return { ...current, criteria, criteriaImportance };
  });
  const setActOrSatThreshold = (key: 'act' | 'sat', value: string) => {
    const thresholds = { ...(draft.criteria.minActOrSat ?? {}) };
    if (value === '') delete thresholds[key];
    else thresholds[key] = Number(value);
    setCriteria({
      minActOrSat: thresholds.act === undefined && thresholds.sat === undefined
        ? undefined
        : thresholds,
    });
  };
  const updateEnrollmentStatus = (status: NonNullable<EligibilityCriteria['enrollmentStatuses']>[number], enabled: boolean) => {
    const current = draft.criteria.enrollmentStatuses ?? [];
    setCriteria({ enrollmentStatuses: enabled ? [...new Set([...current, status])] : current.filter((value) => value !== status) });
  };
  const setAgeRange = (patch: Partial<NonNullable<EligibilityCriteria['ageRange']>>) => {
    const ageRange = { ...(draft.criteria.ageRange ?? {}), ...patch };
    if (ageRange.min === undefined || ageRange.min === null) delete ageRange.minInclusive;
    if (ageRange.max === undefined || ageRange.max === null) delete ageRange.maxInclusive;
    setCriteria({ ageRange: ageRange.min === undefined && ageRange.max === undefined ? undefined : ageRange });
  };
  const setCriterionImportance = (key: keyof EligibilityCriteria, importance: CriteriaImportance) =>
    setDraft((current) => ({ ...current, criteriaImportance: { ...(current.criteriaImportance ?? {}), [key]: importance } }));
  const setCriterionEvidence = (key: string, patch: { excerpt?: string; sourceUrl?: string }) => setDraft((current) => ({
    ...current,
    criteriaEvidence: {
      ...(current.criteriaEvidence ?? {}),
      [key]: { ...(current.criteriaEvidence?.[key] ?? {}), ...patch },
    },
  }));
  const activeCriterionEntries = Object.entries(draft.criteria).filter(([key, value]) =>
    key !== 'applicationFee' && !isInactiveCriterionValue(value)
  );

  if (!cloudAuthReady) {
    return (
      <main className="account-session-loading" role="status" aria-live="polite" aria-busy="true">
        <span className="account-session-loading-mark" aria-hidden="true">S</span>
        <p>Checking your account…</p>
      </main>
    );
  }

  if ((!cloudUser && !guestMode) || cloudUser?.is_anonymous) {
    return (
      <StartHomePage
        email={cloudEmail}
        onEmailChange={setCloudEmail}
        onEmailSubmit={handleCloudSignIn}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onContinueGuest={() => {
          try { sessionStorage.setItem('scholarship-scout-guest-session', 'true'); } catch { /* handled by bootstrap */ }
          window.location.reload();
        }}
        onReviewLegal={() => window.dispatchEvent(new Event('scholarship-scout:review-legal'))}
        message={cloudMessage}
        busy={cloudBusy}
        online={isOnline}
        configured={supabaseConfigured}
        authReady={cloudAuthReady}
        isAnonymous={cloudUser?.is_anonymous === true}
        cooldownSeconds={authCooldownSeconds}
      />
    );
  }

  return <div className="shell" data-theme={theme} data-compact={compactView ? 'true' : 'false'}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={'sidebar' + (desktopSidebarCollapsed ? ' is-collapsed' : '')} data-collapsed={desktopSidebarCollapsed ? 'true' : 'false'}>
      <div className="sidebar-header">
        <div className="logo"><BrandMark className="logo-mark"/><span>scholarship<span className="logo-light"> scout</span><small>SCHOLARSHIP WORKSPACE</small></span></div>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          aria-label={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!desktopSidebarCollapsed}
          aria-controls="primary-navigation"
          onClick={() => setDesktopSidebarCollapsed((collapsed) => !collapsed)}
          title={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <NavGlyph name={desktopSidebarCollapsed ? 'chevron-right' : 'chevron-left'} />
        </button>
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <NavGlyph name={mobileNavOpen ? 'close' : 'menu'} />
          {mobileNavOpen ? 'Close' : 'Menu'}
        </button>
      </div>
      <div className="workspace-label"><span className="workspace-label-dot" /> YOUR WORKSPACE</div>
      <nav id="primary-navigation" className="primary-nav" data-open={mobileNavOpen ? 'true' : 'false'} aria-label="Main navigation">
        {navGroups.map(group => <div className="nav-group" key={group.title} role="group" aria-label={group.title}>
          <div className="nav-group-title">{group.title}</div>
          {group.items.map(item => <button type="button" key={item.tab} className={'nav-item ' + (activeNavTab === item.tab ? 'active' : '')} onClick={() => { setTab(item.tab); setMobileNavOpen(false); }} aria-current={activeNavTab === item.tab ? 'page' : undefined} aria-label={item.label} title={item.label}>
            <span className="nav-icon"><NavGlyph name={item.icon} /></span>
            <span className="nav-copy"><b>{item.label}</b><small>{item.description}</small></span>
            {'count' in item && item.count && <span className="nav-count">{items.length}</span>}
          </button>)}
        </div>)}
      </nav>
      <div className="side-bottom">
        <div className="secure"><span aria-hidden="true">◈</span><div><b>Private workspace</b><small>Saved on this device</small></div></div>
      </div>
    </aside>

    <main className="main" id="main-content" tabIndex={-1}>
      {alert && <div className="app-alert" role="alert"><span>{alert}</span><button type="button" aria-label="Dismiss important alert" onClick={() => setAlert('')}>Dismiss</button></div>}
      <header className="topbar">
        <div className="breadcrumb"><span className="breadcrumb-root">WORKSPACE</span><span>/</span><b>{currentPage}</b></div>
        <div className="top-right">
          <span className="local-pill"><i/> {cloudUser ? cloudUser.is_anonymous ? 'Anonymous session' : 'Signed in' : supabaseConfigured ? 'Cloud available' : 'Cloud setup needed'}</span>
          <div className="avatar" aria-hidden="true"><BrandMark className="logo-mark avatar-mark"/></div>
        </div>
      </header>
      {!isOnline && <div className="offline-notice" role="status" aria-live="polite"><b>You are offline.</b> Local changes still work and stay on this device; cloud sign-in and live search are unavailable until connection returns.</div>}

      {tab === 'Overview' && <div className="page">
        <div className="welcome"><div><div className="eyebrow">YOUR SCHOLARSHIP WORKSPACE</div><h1>Make your next opportunity count.</h1><p>Search public awards, check sponsor rules, and track each application.</p></div><button className="primary" onClick={() => setTab('Discovery')}>⌕ Find scholarships</button></div>
        <div className="panel profile-overview-readiness">
          <div className="panel-heading"><div><h3>Profile readiness</h3><p className="muted">Profile completeness guides searches; it does not determine eligibility.</p></div><span className="source-tag">{profileReadiness.core.completedCount}/{profileReadiness.core.totalCount} core details</span></div>
          <div className="profile-readiness-meter"><strong>{profileReadiness.core.percent}%</strong><progress max={100} value={profileReadiness.core.percent} aria-label="Core profile completeness"/></div>
          <p className="profile-readiness-caption">{profileReadiness.core.missing.length ? `Add: ${profileReadiness.core.missing.slice(0, 2).map((field) => field.label).join(', ')}${profileReadiness.core.missing.length > 2 ? ', and more' : ''}.` : 'Core location and education details are filled in. Sponsor-specific requirements still need review.'}</p>
          <button className="text-button" onClick={() => setTab('Eligibility filters')}>Review profile details →</button>
        </div>
        <div className="section-head"><div><h2>Your pipeline</h2><p>Based on the rules saved for each scholarship.</p></div><div className="section-actions"><button className="secondary" onClick={exportLocalBackup}>↓ Export encrypted backup</button><label className="secondary backup-import">↑ Import backup<input type="file" accept="application/json,.json" onChange={event=>{void importLocalBackup(event.target.files?.[0]);event.currentTarget.value='';}}/></label><button className="text-button" onClick={() => setTab('Scholarships')}>View all →</button></div></div>
        <div className="stats">{[
          {label:'Tracked scholarships',value:items.filter(item=>!item.archived).length,sub:'Active records',icon:'book-stack'},
          {label:'Eligible',value:[...assessments.values()].filter(x=>x.status==='Eligible').length,sub:'All saved rules passed',icon:'check-circle'},
          {label:'Need information',value:[...assessments.values()].filter(x=>x.status==='Needs information').length,sub:'At least one rule needs review',icon:'info'},
          {label:'Deadline milestones in 7 days',value:deadlinesDueSoon,sub:overdueDeadlines ? `${overdueDeadlines} past due · date-only estimates` : 'Date-only estimates; confirm sponsor cutoff',icon:'calendar-clock'}
        ].map(x=><div className="stat" key={x.label}><div className="stat-top"><span>{x.label}</span><b><NavGlyph name={x.icon as GlyphName}/></b></div><strong>{x.value}</strong><small>{x.sub}</small></div>)}</div>
        <div className="panel application-pipeline-summary">
          <div className="panel-heading"><div><h3>Application progress</h3><p className="muted">Application status is separate from eligibility.</p></div><button className="text-button" onClick={()=>setTab('Scholarships')}>Manage tracker →</button></div>
          <div className="application-pipeline-grid">
            <div><b>{applicationCounts.inProgress}</b><small>Preparing</small></div>
            <div><b>{applicationCounts.ready}</b><small>Ready</small></div>
            <div><b>{applicationCounts.submitted}</b><small>Submitted</small></div>
            <div><b>{applicationCounts.awarded}</b><small>Awarded</small></div>
          </div>
        </div>
        <div className="panel deadline-watch"><div className="panel-heading"><div><h3>Deadline watch</h3><p className="muted">Upcoming dates saved in your tracker.</p></div><span className="source-tag">{deadlineOverview.length} opening/deadline dates shown</span></div>{deadlineOverview.length ? <div className="deadline-list">{deadlineOverview.map(({item,milestone})=><button type="button" className="deadline-item" key={`${item.id}-${milestone.key}`} onClick={()=>setSelected(item)}><span><b>{item.name}</b><small>{milestone.label} · {item.provider} · {milestone.deadlineText || (milestone.deadline ? formatDate(milestone.deadline) : milestone.key === 'opening' ? formatDate(item.openDate) : 'Deadline not confirmed')}</small></span><DeadlineUrgencyPill deadline={milestone.deadline} timeZone={milestone.timeZone} openDate={item.openDate} openDateTimezone={item.openDateTimezone} deadlineTime={milestone.deadlineTime}/></button>)}</div> : <p className="muted">Add confirmed calendar dates to see them here. Unpublished and unknown deadlines are not guessed.</p>}<small className="deadline-footnote">Dates only. Sponsor time zones are shown when available; cutoff times are not inferred.</small></div>
        <div className="section-head"><div><h2>Recent discoveries</h2><p>Recent leads to review with each sponsor.</p></div><button className="text-button" onClick={()=>setTab('Discovery')}>Open discovery →</button></div>
        {candidateAssessments.length ? <div className="candidate-grid">{candidateAssessments.slice(0,2).map(({item,assessment})=><CandidateCard key={item.id} item={item} assessment={assessment} added={tracked(item.id)} onAdd={()=>openAdd(item)}/>)}</div> : <div className="panel recent-discoveries-empty"><b>No recent discoveries yet</b><p>Run a scholarship search to find opportunities that may fit your profile.</p><button type="button" className="secondary" onClick={()=>setTab('Discovery')}>Find scholarships</button></div>}
      </div>}

      {tab === 'Settings' && <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Manage how Scholarship Scout looks and how you connect your cloud account. Your profile and tracker stay local unless you choose to save sponsor records to the cloud.</p></div></div>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Encrypted local vault</h3><p className="muted">Your profile, tracker, application drafts, Resources worksheets, and sign-in session are encrypted in this browser. The vault locks after 15 minutes without activity. This browser can unlock automatically after you sign in; your passphrase remains the recovery method.</p></div><span className="source-tag">PROTECTED</span></div>
          <div className="settings-account-actions">
            <button type="button" className="secondary" onClick={async () => {
              try {
                sessionStorage.setItem(FORCE_PASSPHRASE_SESSION_KEY, 'true');
                await stopSupabaseAutoRefreshForVaultLock().catch(() => undefined);
                await lockLocalVault();
                window.location.reload();
              } catch (reason) {
                try { sessionStorage.removeItem(FORCE_PASSPHRASE_SESSION_KEY); } catch { /* best effort */ }
                setAlert(reason instanceof Error ? reason.message : 'The local vault could not be locked. Keep this tab open and retry.');
              }
            }}>Lock vault now</button>
            <button type="button" className="secondary" onClick={() => void handleForgetRememberedDevice()}>Forget this device</button>
          </div>
          <p className="muted settings-footnote">“Forget this device” removes only the remembered-device key. You will enter your local vault passphrase again next time. Your encrypted records and recovery passphrase remain unchanged.</p>
        </section>
        <section className="panel settings-section" aria-labelledby="local-diagnostics-title">
          <div className="panel-heading"><div><h3 id="local-diagnostics-title">Local diagnostics active</h3><p className="muted">A small count of generic reliability events is stored only in this browser. No telemetry is sent, and no profile, scholarship, or error-message content is recorded.</p></div><span className="source-tag">{reliabilityEvents.length} / 25 events</span></div>
          <button type="button" className="secondary" onClick={() => { clearReliabilityEvents(); setReliabilityEvents(readReliabilityEvents()); }}>Clear local diagnostics</button>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Appearance</h3><p className="muted">Choose the theme used across your workspace.</p></div><span className="source-tag">DISPLAY</span></div>
          <div className="settings-choice-row">
            <button type="button" className="theme-toggle" onClick={() => chooseTheme('dark')} aria-label="Use dark mode" aria-pressed={theme === 'dark'}><span aria-hidden="true">☾</span><span>Dark mode</span></button>
            <button type="button" className="theme-toggle" onClick={() => chooseTheme('light')} aria-label="Use light mode" aria-pressed={theme === 'light'}><span aria-hidden="true">☀</span><span>Light mode</span></button>
          </div>
          <p className="muted settings-footnote">Your current selection is saved in this browser.</p>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Layout density</h3><p className="muted">Choose how much space cards and sections use.</p></div><span className="source-tag">LAYOUT</span></div>
          <button type="button" className="compact-toggle" onClick={() => setCompactView(current => !current)} aria-label={compactView ? 'Switch to comfortable layout' : 'Switch to compact layout'} aria-pressed={compactView}>{compactView ? 'Comfortable view' : 'Compact view'}</button>
          <p className="muted settings-footnote">{compactView ? 'Compact spacing is enabled.' : 'Comfortable spacing is enabled.'}</p>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Legal & privacy</h3><p className="muted">Read the current Terms of Service and full Privacy Notice, including data handling and service limitations.</p></div><span className="source-tag">LEGAL</span></div>
          <button type="button" className="secondary" onClick={() => window.dispatchEvent(new Event('scholarship-scout:review-legal'))}>Review Terms of Service & Privacy Notice</button>
        </section>
        <section className="panel settings-section" aria-labelledby="analytics-privacy-title">
          <div className="panel-heading"><div><h3 id="analytics-privacy-title">Optional site analytics</h3><p className="muted">Analytics is off until you explicitly enable it. Only broad page categories are measured; student profile, eligibility, scholarship search, form, and account details are excluded. Advertising and ad personalization remain disabled.</p></div><span className="source-tag">OPTIONAL</span></div>
          <button type="button" className="secondary" onClick={() => window.dispatchEvent(new Event('scholarship-scout:manage-analytics'))}>Manage analytics privacy choices</button>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Connected account</h3><p className="muted">Your account is required to enter the workspace. Student profile, tracker, essays, and Resources work remain encrypted in this browser.</p></div><span className="status status-eligible">SIGNED IN</span></div>
          <div className="settings-account-state">
            <p><b>{cloudUser?.email || "Signed-in account"}</b><span>Connected to Scholarship Scout</span></p>
            <p className="muted">Your student profile and application drafts stay in your local encrypted vault by default. Only when you explicitly enable cross-device backup does the app upload a separately encrypted vault copy; the server cannot read that copy.</p>
            <div className="settings-account-actions">
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCheckCloudSession()}>Check session status</button>
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCloudSignOut()}>Sign out</button>
            </div>
          </div>
          {cloudMessage && <p className="cloud-message" role="status" aria-live="polite">{cloudMessage}</p>}
        </section>

        <section className="panel settings-section" aria-labelledby="account-vault-sync-title">
          <div className="panel-heading">
            <div>
              <h3 id="account-vault-sync-title">Cross-device encrypted vault</h3>
              <p className="muted">Keep this browser automatic, or optionally make an end-to-end encrypted copy that can be restored on another device using a synced passkey.</p>
            </div>
            <span className={`status ${accountVaultSyncStatus === 'enabled' ? 'status-eligible' : accountVaultSyncStatus === 'error' ? 'status-not-eligible' : 'status-likely-eligible'}`}>
              {accountVaultSyncStatus === 'enabled' ? 'SYNC ENABLED' : accountVaultSyncStatus === 'syncing' ? 'SYNCING' : accountVaultSyncStatus === 'available' ? 'NEWER BACKUP' : accountVaultSyncStatus === 'error' ? 'ACTION NEEDED' : 'OPTIONAL'}
            </span>
          </div>
          <p className="muted">Cross-device backup is off by default. When enabled, Scholarship Scout uploads only an encrypted vault copy to Supabase. Your passphrase and unencrypted student records are never sent. Your account sign-in session and PKCE verifier are not included, so sign in separately on each device. You choose a passkey that can sync through your device provider; only authenticators supporting WebAuthn PRF can restore it on another device. Your recovery passphrase remains the fallback.</p>
          {accountVaultSyncStatus === 'enabled' ? (
            <div className="settings-account-state">
              <p><b>Encrypted account backup is active</b><span>Changes are synchronized after local saves.</span></p>
              <p className="cloud-message" role="status" aria-live="polite">{accountVaultSyncMessage || 'Your encrypted account vault is connected.'}</p>
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleRefreshCrossDeviceVault()}>Check status and sync changes</button>
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleDisableCrossDeviceVault()}>Delete cloud backup and turn off sync</button>
            </div>
          ) : (accountVaultSyncStatus === 'available' ||
              (accountVaultSyncStatus === 'error' && Boolean(cloudUser && getLocalAccountVaultSyncStatus({ ownerId: cloudUser.id }).enabled))) ? (
            <div className="settings-account-state">
              <p><b>{accountVaultSyncStatus === 'available' ? 'A newer encrypted backup is available' : 'Backup status needs attention'}</b><span>Your current local vault remains intact. Scholarship Scout will not overwrite it or merge two device histories automatically.</span></p>
              {accountVaultSyncMessage && <p className="cloud-message" role="status" aria-live="polite">{accountVaultSyncMessage}</p>}
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleRefreshCrossDeviceVault()}>Check backup status</button>
            </div>
          ) : (
            <div className="settings-account-state">
              <label className="privacy-request-check">
                <input
                  type="checkbox"
                  checked={accountVaultSyncConsent}
                  onChange={(event) => setAccountVaultSyncConsent(event.target.checked)}
                />
                <span>I understand that an encrypted copy of my local vault will be stored in my Scholarship Scout account so it can be restored on another device. The server cannot read the encrypted contents.</span>
              </label>
              <button
                type="button"
                className="primary"
                disabled={!accountVaultSyncConsent || cloudBusy || !cloudUser || cloudUser.is_anonymous || guestMode}
                onClick={() => void handleEnableCrossDeviceVault()}
              >
                {accountVaultSyncStatus === 'syncing' || cloudBusy ? 'Preparing secure passkey…' : 'Enable cross-device passkey backup'}
              </button>
              <p className="muted settings-footnote">If your authenticator does not support PRF or does not sync the passkey, cross-device unlock will not be available. You can still use your local recovery passphrase. Guest mode cannot enable cloud backup.</p>
            </div>
          )}
          {accountVaultSyncMessage && accountVaultSyncStatus !== 'enabled' && (
            <p className="cloud-message" role="status" aria-live="polite">{accountVaultSyncMessage}</p>
          )}
        </section>

        <section className="panel settings-section" aria-labelledby="privacy-request-title">
          <div className="panel-heading">
            <div><h3 id="privacy-request-title">Privacy request</h3><p className="muted">Request access, correction, deletion, an applicable opt-out, or an appeal. Scholarship Scout prepares an email for you to review and send.</p></div>
            <span className="source-tag">PRIVACY</span>
          </div>
          <form className="privacy-request-form" onSubmit={handlePrivacyRequest}>
            <label className="field" htmlFor="privacy-request-type">
              <span>What would you like to request?</span>
              <select id="privacy-request-type" name="requestType" value={privacyRequestType} onChange={(event) => { setPrivacyRequestType(event.target.value); setPrivacyRequestHref(""); setPrivacyRequestMessage(""); }}>
                {PRIVACY_REQUEST_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="privacy-request-requester">
              <span>Who is submitting this request?</span>
              <select id="privacy-request-requester" name="requesterType" value={privacyRequestRequesterType} onChange={(event) => { setPrivacyRequestRequesterType(event.target.value); setPrivacyRequestHref(""); setPrivacyRequestMessage(""); }}>
                {PRIVACY_REQUESTER_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="privacy-request-email">
              <span>Email address for our response</span>
              <input id="privacy-request-email" name="replyEmail" type="email" autoComplete="email" maxLength={254} required value={privacyRequestEmail} onChange={(event) => { setPrivacyRequestEmail(event.target.value); setPrivacyRequestHref(""); setPrivacyRequestMessage(""); }} placeholder="you@example.com" />
            </label>
            {privacyRequestType === "appeal" && (
              <label className="field" htmlFor="privacy-request-reference">
                <span>Reference for the earlier privacy request</span>
                <input id="privacy-request-reference" name="previousRequestReference" type="text" maxLength={100} required value={privacyRequestReference} onChange={(event) => { setPrivacyRequestReference(event.target.value); setPrivacyRequestHref(""); setPrivacyRequestMessage(""); }} placeholder="Enter the reference from the earlier response" />
              </label>
            )}
            <label className="field privacy-request-details" htmlFor="privacy-request-details">
              <span>Describe what you are requesting</span>
              <textarea id="privacy-request-details" name="details" rows={5} minLength={10} maxLength={2000} required value={privacyRequestDetails} onChange={(event) => { setPrivacyRequestDetails(event.target.value); setPrivacyRequestHref(""); setPrivacyRequestMessage(""); }} placeholder="Describe the information or action involved. Do not include passwords, sign-in links, vault passphrases, or unnecessary student records." />
              <span className="privacy-form-counter">{privacyRequestDetails.length}/2000 characters</span>
            </label>
            <p className="privacy-form-note">Do not include passwords, sign-in links, access tokens, vault or backup passphrases, government ID numbers, or unnecessary student records. This form does not save or send your details to Scholarship Scout. It opens your email app with a draft addressed to the privacy contact.</p>
            <div className="privacy-form-actions">
              <button type="submit" className="secondary" disabled={!privacyRequestDetails.trim() || !privacyRequestEmail.trim() || (privacyRequestType === "appeal" && !privacyRequestReference.trim())}>Prepare email</button>
              {privacyRequestHref && <a className="primary privacy-mail-link" href={privacyRequestHref} onClick={() => setPrivacyRequestMessage("Your email app should open. Review the draft and press Send; the request is not received until then.")}>Open email draft</a>}
            </div>
            {privacyRequestMessage && <p className="cloud-message" role="status" aria-live="polite">{privacyRequestMessage}</p>}
            <p className="muted settings-footnote">Privacy contact: levi.haidar@outlook.com. A parent or legal guardian may submit for a minor where applicable law permits. Preparing a draft does not submit a request.</p>
          </form>
        </section>

        <section className="panel settings-section" aria-labelledby="account-deletion-title">
          <div className="panel-heading">
            <div><h3 id="account-deletion-title">Delete account and data</h3><p className="muted">Permanently remove a signed-in cloud account and its associated cloud records. Local workspace data is handled separately.</p></div>
            <span className="source-tag">DESTRUCTIVE</span>
          </div>
          {cloudUser ? <>
            <div className="deletion-warning" role="note">
              <b>This cannot be undone.</b>
              <p>Deleting this account permanently removes its linked cloud profile, scholarship sources, saved scholarship records, and eligibility records. It does not delete downloaded backups or the local workspace on other devices or browser profiles.</p>
              <p>The deletion process revokes refresh-token sessions on all devices. Previously issued access tokens may remain valid until their scheduled expiry, but they cannot be refreshed. The account and its cloud records cannot be restored.</p>
            </div>
            <form className="deletion-form" onSubmit={handleCloudAccountDeletion}>
              <label className="acknowledgement-check">
                <input type="checkbox" checked={deleteCloudAcknowledged} onChange={(event) => setDeleteCloudAcknowledged(event.target.checked)} />
                <span>I understand that deleting this cloud account permanently removes its account-linked cloud data.</span>
              </label>
              <label className="acknowledgement-check">
                <input type="checkbox" checked={deleteLocalWithCloud} onChange={(event) => setDeleteLocalWithCloud(event.target.checked)} />
                <span>Also erase the encrypted workspace and app-owned sign-in data in this browser. I understand other devices and separately downloaded backups are not affected.</span>
              </label>
              <label className="field" htmlFor="delete-cloud-confirmation">
                <span>Type DELETE MY ACCOUNT to confirm</span>
                <input id="delete-cloud-confirmation" name="confirmation" type="text" autoComplete="off" spellCheck={false} value={deleteCloudConfirmation} onChange={(event) => setDeleteCloudConfirmation(event.target.value)} />
              </label>
              <button type="submit" className="danger-button" disabled={deletionBusy || cloudBusy || !deleteCloudAcknowledged || deleteCloudConfirmation !== "DELETE MY ACCOUNT"}>{deletionBusy ? "Deleting…" : "Permanently delete cloud account"}</button>
            </form>
          </> : <p className="muted">No cloud account is connected in this browser. You can still remove the local workspace below.</p>}
          <div className="local-deletion-divider">
            <h4>Remove local data from this browser</h4>
            <p className="muted">This permanently erases the encrypted profile, tracker, application drafts, and stored sign-in session from this browser profile. It does not remove cloud records, downloaded backups, or local data on another device.</p>
            <form className="deletion-form" onSubmit={handleLocalDataDeletion}>
              <label className="acknowledgement-check">
                <input type="checkbox" checked={localDeleteAcknowledged} onChange={(event) => setLocalDeleteAcknowledged(event.target.checked)} />
                <span>I understand this permanently erases the current browser’s local Scholarship Scout workspace.</span>
              </label>
              <label className="field" htmlFor="delete-local-confirmation">
                <span>Type DELETE LOCAL DATA to confirm</span>
                <input id="delete-local-confirmation" name="localConfirmation" type="text" autoComplete="off" spellCheck={false} value={localDeleteConfirmation} onChange={(event) => setLocalDeleteConfirmation(event.target.value)} />
              </label>
              <button type="submit" className="danger-button" disabled={deletionBusy || localDeleteConfirmation !== "DELETE LOCAL DATA" || !localDeleteAcknowledged}>{deletionBusy ? "Removing…" : "Permanently remove local data"}</button>
            </form>
          </div>
          {deletionMessage && <p className="cloud-message" role="status" aria-live="polite">{deletionMessage}</p>}
        </section>
      </div>}

      {tab === 'Discovery' && <div className="page">
        <div className="page-heading"><div><div className="eyebrow">FIND OPPORTUNITIES</div><h1>Find scholarships</h1><p>Search broad scholarship topics or research public scholarship pages. Your profile and application data stay on this device.</p></div></div>
        <WorkspaceSubnav label="Scholarship search method" active={tab} options={[{ value: 'Discovery', label: 'Browse search links' }, { value: 'Cloud Search', label: 'Live web discovery' }]} onChange={setTab}/>
        <div className="filter-intro"><b>Search without sharing profile details</b><p>Google links use generic scholarship terms only and do not include your profile. Google is contacted only when you open a search link. Live discovery separately sends your state, graduation year, and selected categories.</p></div>

        <div className="section-head"><div><h2>Run broad scholarship searches</h2><p>Each link uses generic search terms and does not read your profile.</p></div></div>
        <div className="search-grid">{queryGroups.map((item)=><div className="search-card" key={item.title}><div className="search-card-icon">⌕</div><div><b>{item.title}</b><p>{item.query}</p></div><a href={googleSearch(item.query)} target="_blank" rel="noreferrer">Search ↗</a></div>)}</div>
        <div className="section-head"><div><h2>Trusted scholarship sources</h2><p>Use official sources first; some portals may contain third-party listings.</p></div></div>
        <div className="source-grid">{SOURCES.map((source)=><div className="source-card" key={source.name}><span>{source.group}</span><b>{source.name}</b><p>{source.detail}</p><a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a></div>)}</div>
        <div className="safety-note"><b>Scholarship safety check</b><p>Do not pay an application or processing fee to receive a scholarship. Be cautious of guaranteed awards or requests for bank/card details. Verify the sponsor independently before sharing information. <a href="https://consumer.ftc.gov/articles/how-avoid-scholarship-and-financial-aid-scams" target="_blank" rel="noreferrer">FTC guidance ↗</a></p></div>
      </div>}

      {tab === 'Cloud Search' && <div className="page">
        <div className="page-heading"><div><div className="eyebrow">FIND OPPORTUNITIES</div><h1>Find scholarships</h1><p>Research public scholarship pages, review potential awards, and optionally save sponsor details to your private account.</p></div></div>
        <WorkspaceSubnav label="Scholarship search method" active={tab} options={[{ value: 'Discovery', label: 'Browse search links' }, { value: 'Cloud Search', label: 'Live web discovery' }]} onChange={setTab}/>
        <div className="cloud-run-row"><div><p className="muted">Search without an account. Only your state, graduation year, and selected categories are sent. Sign in only if you want to save sponsor records to your account.</p></div><button className="primary" disabled={cloudBusy || !isOnline || !supabaseConfigured || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>{cloudBusy ? 'Researching…' : 'Run research'}</button></div>
        <div className="panel discovery-category-picker" role="group" aria-labelledby="research-categories-title">
          <div className="panel-heading"><div><h3 id="research-categories-title">Research categories</h3><p className="muted">Choose any combination of the available search categories.</p></div><span className="source-tag">{selectedDiscoveryCategories.length}/{DISCOVERY_CATEGORY_OPTIONS.length} selected</span></div>
          <div className="discovery-category-grid">{DISCOVERY_CATEGORY_OPTIONS.map((category)=><label className="discovery-category-option" key={category.id}>
            <input type="checkbox" checked={selectedDiscoveryCategories.includes(category.id)} disabled={!selectedDiscoveryCategories.includes(category.id) && !isLiveDiscoveryCategorySupported(category.id)} onChange={(event)=>setSelectedDiscoveryCategories((current)=>event.target.checked ? (isLiveDiscoveryCategorySupported(category.id) ? [...current, category.id] : current) : current.filter((id)=>id !== category.id))}/>
            <span><b>{category.label}</b><small>{category.description}{!isLiveDiscoveryCategorySupported(category.id) ? ' Not available yet.' : ''}</small></span>
          </label>)}</div>
          <p className="cloud-config-note">All 14 categories can be selected. Each search covers every selected category first, within a 24-request gateway budget.</p>
          {!profile.state.trim() || !profile.graduationYear.trim() ? <p className="cloud-config-note">Add your state and expected graduation year in My Profile before running live search.</p> : null}
        </div>
        {cloudMessage && <p className="cloud-message" role="status" aria-live="polite">{cloudMessage}</p>}
        {discoveryState === 'loading' && <div className="cloud-loading" aria-hidden="true">Researching…</div>}
        {discoveryState === 'empty' && <div className="panel cloud-empty" role="status" aria-live="polite"><b>No scholarship matches were found for this search.</b><p>Your search completed, but no usable public leads matched the selected categories. Try different categories or run the search again.</p><button type="button" className="secondary" onClick={()=>void handleCloudSearch()}>Try search again</button></div>}
        {discoveryState === 'error' && <div className="panel cloud-empty" role="alert"><b>Scholarship search could not be completed.</b><p>Review the search status message above for details, then retry the search.</p><button type="button" className="secondary" disabled={cloudBusy || !isOnline || !supabaseConfigured || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>Retry search</button></div>}
        {discoverySummary && <p className="cloud-config-note">{discoverySummary.uniqueResults} scholarship leads found. Verify eligibility, award details, and deadlines on each official sponsor page.</p>}
        {exaResults.length>0 && <section aria-labelledby="live-search-results-title"><div className="section-head"><div><h2 id="live-search-results-title">Live scholarship results</h2><p>Ranked and deduplicated research leads. Sponsor, award, deadline, and eligibility remain unverified until you review the official page.</p></div><span className="source-tag">{exaResults.length} leads</span></div>
          <div className="cloud-results" role="list" aria-label="Live scholarship search results">{exaResults.map((row)=><CloudResultCard key={row.id} item={row} tracked={items.some(x=>x.backendOpportunityId===row.id||x.sourceUrl===row.source_url)} onTrack={()=>addLiveResult(row)}/>)}</div>
        </section>}
        {cloudUser && !cloudBusy && liveResults.length === 0 && <div className="panel cloud-empty" role="status" aria-live="polite"><b>No saved cloud records yet.</b><p>Review a live lead and choose whether to save its sponsor details to your account.</p></div>}
        {cloudUser && liveResults.length>0 && <section aria-labelledby="saved-cloud-results-title"><div className="section-head"><div><h2 id="saved-cloud-results-title">Saved cloud records</h2><p>Sponsor details saved to your private account.</p></div><span className="source-tag">{liveResults.length} records</span></div>
          <div className="cloud-results" role="list" aria-label="Saved scholarship records">{liveResults.map((row)=><CloudResultCard key={row.id} item={row} tracked={items.some(x=>x.backendOpportunityId===row.id||x.sourceUrl===row.source_url)} onTrack={()=>addLiveResult(row)}/>)}</div>
        </section>}
      </div>}

      {tab === 'Scholarships' && <div className="page">
        <div className="page-heading"><div><div className="eyebrow">MY SCHOLARSHIPS</div><h1>My scholarships</h1><p>Track awards, deadlines, eligibility, and application status.</p></div><div className="tracker-heading-actions"><button className="secondary" onClick={exportTrackerReport}>↓ Export CSV report</button><button className="primary" onClick={()=>openAdd()}>＋ Add scholarship</button></div></div>
        <WorkspaceSubnav label="Scholarship management view" active={tab} options={[{ value: 'Scholarships', label: 'Tracker' }, { value: 'Application prep', label: 'Application preparation' }]} onChange={setTab}/>
        <div className="toolbar tracker-toolbar">
          <input aria-label="Search tracked scholarships" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search names, sponsors, or tags…"/>
          <select aria-label="Eligibility status filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="All">Any eligibility</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
          <select aria-label="Application status filter" value={applicationStatusFilter} onChange={e=>setApplicationStatusFilter(e.target.value)}><option value="All">All application statuses</option>{APPLICATION_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
          <select aria-label="Archive filter" value={archiveFilter} onChange={e=>setArchiveFilter(e.target.value as 'active'|'archived'|'all')}><option value="active">Active records</option><option value="archived">Archived records</option><option value="all">All records</option></select>
          <select aria-label="Sort tracker records" value={trackerSortBy} onChange={e=>setTrackerSortBy(e.target.value as typeof trackerSortBy)}>
            <option value="deadline">Sort: Deadline</option><option value="priority">Sort: Priority</option><option value="award">Sort: Award amount</option><option value="applicationStatus">Sort: Application status</option><option value="eligibility">Sort: Eligibility</option><option value="name">Sort: Name</option>
          </select>
        </div>
        {duplicateSuggestions.length > 0 && <div className="panel duplicate-review"><div className="panel-heading"><div><h3>Duplicate suggestions to review</h3><p className="muted">Possible duplicates. Review each pair; Scout never merges or deletes records.</p></div><span className="source-tag">{duplicateSuggestions.length} pairs</span></div><div className="duplicate-list">{duplicateSuggestions.slice(0,5).map((pair)=><div className="duplicate-row" key={`${pair.firstId}-${pair.secondId}`}><div className="duplicate-names"><span className="source-tag">{pair.matchLabel}</span><b>{pair.firstName}</b><span>and</span><b>{pair.secondName}</b><small>{pair.sponsor} · Deadline year {pair.deadlineYear} · {pair.titleSimilarity}% title similarity</small><small>{pair.reasons.join(' · ')}</small></div><div className="duplicate-actions"><button className="text-button" onClick={()=>setSelected(items[pair.firstIndex])}>Review first</button><button className="text-button" onClick={()=>setSelected(items[pair.secondIndex])}>Review second</button></div></div>)}</div>{duplicateSuggestions.length > 5 && <small className="deadline-footnote">Showing the five strongest suggestions. The remaining {duplicateSuggestions.length - 5} pairs are also retained for review.</small>}</div>}
        <div className="table-card"><div className="table-title"><b>Tracked opportunities</b><span>{filtered.length} shown · eligibility and application status are separate</span></div>{filtered.length===0 && items.length===0 ? <Empty onAdd={()=>openAdd()}/> : hasFilteredEmptyState ? <FilteredEmpty onClear={clearTrackerFilters}/> : <div className="table-wrap"><table><thead><tr><th>OPPORTUNITY</th><th>AWARD AMOUNT / BASIS</th><th>DEADLINE</th><th>URGENCY</th><th>APPLICATION</th><th>PRIORITY</th><th>ELIGIBILITY</th><th>SOURCE REVIEW</th><th scope="col">DETAILS</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td data-label="Opportunity"><button type="button" className="tracker-open" aria-label={'Review ' + item.name} onClick={()=>setSelected(item)}>{item.name}</button><small>{item.provider}</small>{item.tags?.length ? <small>{item.tags.join(' · ')}</small> : null}</td><td data-label="Award amount / basis"><b>{item.award || 'Amount not recorded'}</b>{item.awardBasis ? <small>{item.awardBasis}</small> : null}{item.awardCurrencyBasis ? <small>{item.awardCurrencyBasis}</small> : null}</td><td data-label="Deadline">{getDeadlineMilestones(item).map((milestone)=><small key={milestone.key}>{milestone.label}: {milestone.deadlineText || (milestone.deadline ? formatDate(milestone.deadline) : milestone.key === "opening" ? formatDate(item.openDate) : "Date not confirmed")}</small>)}</td><td data-label="Urgency">{getDeadlineMilestones(item).map((milestone)=><small key={milestone.key}>{milestone.label}: <DeadlineUrgencyPill deadline={milestone.deadline} timeZone={milestone.timeZone} openDate={item.openDate} openDateTimezone={item.openDateTimezone} deadlineTime={milestone.deadlineTime}/></small>)}</td><td data-label="Application"><ApplicationStatusPill status={item.applicationStatus || 'Not started'}/></td><td data-label="Priority"><PriorityPill priority={item.priority || 'Medium'}/></td><td data-label="Eligibility"><StatusPill status={summarizeEligibilityAssessment(assessments.get(item.id)).status as Status}/></td><td data-label="Source review"><SourceStatusPill item={item}/></td><td data-label="Details"><button type="button" className="secondary tracker-details" aria-label={"Open details for " + item.name} onClick={() => setSelected(item)}>›</button></td></tr>)}</tbody></table></div>}</div>
        <p className="footnote">“Eligible” means all saved rules passed and the source review is complete. It is not an award guarantee; sponsors may have other requirements.</p>
      </div>}

      {tab === 'Resources' && <ResourcesPage
        workspace={resourceWorkspace}
        scholarships={items}
        onWorkspaceChange={saveResourceWorkspace}
        onOpenTracker={() => setTab('Scholarships')}
        onOpenApplicationPrep={(id) => { setPrepScholarshipId(id); setTab('Application prep'); }}
      />}

      {tab === 'Eligibility filters' && <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">PERSONAL MATCHING PROFILE</div><h1>Your profile</h1><p>These details guide scholarship discovery and eligibility checks. Update anything that is missing or outdated.</p></div></div>
        <div className="filter-intro"><b>How the filters work</b><p>Location, citizenship, school year, GPA, and class rank are hard eligibility comparisons when a sponsor specifies them. Activities, service, work, and interests help find strong matches. Financial need and other sensitive factors are not inferred; unknown conditions are flagged.</p></div>
        <div className="panel profile-readiness-panel">
          <div className="panel-heading"><div><h3>Profile readiness</h3><p className="muted">Complete the core details first. The rest are optional ways to improve discovery.</p></div><span className="source-tag">{profileReadiness.core.completedCount}/{profileReadiness.core.totalCount} core details</span></div>
          <div className="profile-readiness-meter"><strong>{profileReadiness.core.percent}%</strong><progress max={100} value={profileReadiness.core.percent} aria-label="Core profile completeness"/></div>
          <div className="profile-readiness-columns">
            <div><b>Core details</b><p>{profileReadiness.core.completedCount} of {profileReadiness.core.totalCount} entered</p>{profileReadiness.core.missing.length ? <ul className="profile-readiness-list">{profileReadiness.core.missing.map((field) => <li key={field.key}><b>{field.label}:</b> {field.reason}</li>)}</ul> : <p className="profile-ready-message">Core location and education details are present.</p>}</div>
            <div><b>Optional matching details</b><p>{profileReadiness.supporting.completedCount} of {profileReadiness.supporting.totalCount} entered</p>{profileReadiness.supporting.missing.length ? <ul className="profile-readiness-list">{profileReadiness.supporting.missing.slice(0, 4).map((field) => <li key={field.key}><b>{field.label}:</b> {field.reason}</li>)}</ul> : <p className="profile-ready-message">Helpful matching details are filled in.</p>}</div>
          </div>
          <small className="profile-readiness-note">These indicators do not change eligibility results. Citizenship, financial need, organization membership, and other sponsor-specific qualifications remain unknown unless you explicitly confirm them.</small>
        </div>
        <div className={`profile-storage-state ${profileSaveStatus === 'unavailable' ? 'is-unavailable' : 'is-saved'}`} role="status" aria-live="polite">
          {profileSaveStatus === 'unavailable' ? 'Could not save your latest profile change in this browser. Export an encrypted backup before closing or reloading.' : profileSaveStatus === 'draft' ? 'Your unfinished profile is saved as a draft in this browser’s encrypted vault and is not used for eligibility calculations until valid. No account sign-in is required.' : profileSaveStatus === 'saved' ? 'Profile changes saved in this browser’s encrypted vault. No account sign-in is required.' : 'Profile drafts stay in this browser’s encrypted vault. Sign-in is only needed for optional cloud scholarship records.'}
        </div>
        <div className="form-card">
          <div className="form-section"><div className="section-title-row"><div><h3>Geographic and citizenship filters</h3><p>Useful for state, county, local, and national scholarships. School name and district are optional.</p></div><span className="source-tag">LOCATION</span></div><div className="form-grid"><label className="field"><span>Country of residence</span><select value={profileDraft.country} onChange={e=>saveProfile({...profileDraft,country:e.target.value,state:e.target.value==='US'?profileDraft.state:''})}><option value="">Select country</option>{COUNTRY_OPTIONS.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label className="field"><span>State of residence</span><select value={profileDraft.state} disabled={profileDraft.country!=='US'} onChange={e=>saveProfile({...profileDraft,state:e.target.value})}><option value="">Select state or territory</option>{US_STATE_OPTIONS.map(([code,name])=><option key={code} value={name}>{name}</option>)}</select></label><Field label="County" value={profileDraft.county} onChange={v=>saveProfile({...profileDraft,county:v})}/><label className="field"><span>Citizenship</span><select value={profileDraft.citizenship} onChange={e=>saveProfile({...profileDraft,citizenship:e.target.value})}>{PROFILE_CITIZENSHIP_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><Field label="School name (optional)" value={profileDraft.school} onChange={v=>saveProfile({...profileDraft,school:v})} placeholder="Enter your school name"/><label className="field"><span>Country where your school is located</span><select value={profileDraft.schoolCountry} onChange={e=>saveProfile({...profileDraft,schoolCountry:e.target.value,schoolState:e.target.value==='US'?profileDraft.schoolState:''})}><option value="">Select country</option>{COUNTRY_OPTIONS.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label className="field"><span>State where your school is located</span><select value={profileDraft.schoolState} disabled={profileDraft.schoolCountry!=='US'} onChange={e=>saveProfile({...profileDraft,schoolState:e.target.value})}><option value="">Select state or territory</option>{US_STATE_OPTIONS.map(([code,name])=><option key={code} value={name}>{name}</option>)}</select></label></div></div>
          <div className="form-section"><div className="section-title-row"><div><h3>Education plans</h3><p>Separates current senior eligibility from future college enrollment.</p></div><span className="source-tag">LOCATION</span></div><div className="form-grid"><Field label="Age (optional)" value={profileDraft.age} onChange={v=>saveProfile({...profileDraft,age:v})} type="number" min={0} max={120} step={1}/><Field label="Current education level" value={profileDraft.grade} onChange={v=>saveProfile({...profileDraft,grade:v})}/><Field label="Expected graduation year" value={profileDraft.graduationYear} onChange={v=>saveProfile({...profileDraft,graduationYear:v})} type="number" min={1900} max={2100} step={1}/><Field label="Planned college" value={profileDraft.plannedCollege} onChange={v=>saveProfile({...profileDraft,plannedCollege:v})}/><label className="field"><span>Country where your intended college is located</span><select value={profileDraft.plannedCollegeCountry} onChange={e=>saveProfile({...profileDraft,plannedCollegeCountry:e.target.value,plannedCollegeState:e.target.value==='US'?profileDraft.plannedCollegeState:''})}><option value="">Select country</option>{COUNTRY_OPTIONS.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label className="field"><span>State where your intended college is located</span><select value={profileDraft.plannedCollegeState} disabled={profileDraft.plannedCollegeCountry!=='US'} onChange={e=>saveProfile({...profileDraft,plannedCollegeState:e.target.value})}><option value="">Select state or territory</option>{US_STATE_OPTIONS.map(([code,name])=><option key={code} value={name}>{name}</option>)}</select></label><Field label="Intended major" value={profileDraft.plannedMajor} onChange={v=>saveProfile({...profileDraft,plannedMajor:v})}/></div><Field label="College status" value={profileDraft.collegeStatus} onChange={v=>saveProfile({...profileDraft,collegeStatus:v})} placeholder="e.g. incoming planned, full-time confirmed, part-time confirmed"/></div>
          <div className="form-section"><div className="section-title-row"><div><h3>Academic filters</h3><p>Use official transcript values when available.</p></div><span className="source-tag">OFFICIAL TRANSCRIPT</span></div><div className="form-grid"><Field label="GPA" value={profileDraft.gpa} onChange={v=>saveProfile({...profileDraft,gpa:v})} type="number" min={0} step="any"/><Field label="GPA type and scale" value={profileDraft.gpaType} onChange={v=>saveProfile({...profileDraft,gpaType:v})}/><Field label="Official class standing" value={profileDraft.classRank} onChange={v=>saveProfile({...profileDraft,classRank:v})}/><Field label="State credits earned" value={profileDraft.credits} onChange={v=>saveProfile({...profileDraft,credits:v})}/><Field label="ACT composite" value={profileDraft.act} onChange={v=>saveProfile({...profileDraft,act:v})} type="number" min={1} max={36} step={1}/><Field label="SAT score" value={profileDraft.sat} onChange={v=>saveProfile({...profileDraft,sat:v})} type="number" min={400} max={1600} step={10}/><Field label="AP courses" value={profileDraft.apCourses} onChange={v=>saveProfile({...profileDraft,apCourses:v})}/><Field label="Dual-credit courses" value={profileDraft.dualCreditCourses} onChange={v=>saveProfile({...profileDraft,dualCreditCourses:v})}/></div><small className="profile-search-hint">ACT scores must be 1–36 and SAT scores 400–1600. GPA must be numeric; a maximum is applied only when you enter a numeric GPA scale.</small><label className="field"><span>Academic honors and distinctions</span><textarea value={profileDraft.academicHonors} onChange={e=>saveProfile({...profileDraft,academicHonors:e.target.value})}/></label><Field label="Graduation program, achievement level, and endorsement" value={profileDraft.programNotes} onChange={v=>saveProfile({...profileDraft,programNotes:v})}/><div className="rank-warning"><b>Official transcript rank</b><Field label="Rank source and date / clarification" value={profileDraft.rankDetails} onChange={v=>saveProfile({...profileDraft,rankDetails:v})}/></div><div className="rank-warning"><b>Texas Grant notation — confirm before use</b><p>This transcript notation should be confirmed with the school or financial-aid office; it is not treated as automatic qualification for every Texas grant or scholarship.</p><Field label="Transcript's Texas Grant notation" value={profileDraft.texasGrantNotation} onChange={v=>saveProfile({...profileDraft,texasGrantNotation:v})}/></div></div>
          <div className="form-section"><div className="section-title-row"><div><h3>Activities and scholarship strengths</h3><p>Used for leadership, service, career-interest, and special-interest matching.</p></div><span className="source-tag">EXPERIENCE + INTERESTS</span></div><Field label="Academic and career interests" value={profileDraft.interests} onChange={v=>saveProfile({...profileDraft,interests:v})}/><label className="field"><span>Clubs, leadership, and extracurriculars</span><textarea value={profileDraft.activities} onChange={e=>saveProfile({...profileDraft,activities:e.target.value})}/></label><div className="form-grid"><Field label="Community service hours" value={profileDraft.serviceHours} onChange={v=>saveProfile({...profileDraft,serviceHours:v})} type="number" min={0} step="any"/><Field label="Languages" value={profileDraft.languages} onChange={v=>saveProfile({...profileDraft,languages:v})}/></div><label className="field"><span>Service experience</span><textarea value={profileDraft.service} onChange={e=>saveProfile({...profileDraft,service:e.target.value})}/></label><div className="form-grid"><Field label="Employment" value={profileDraft.employment} onChange={v=>saveProfile({...profileDraft,employment:v})}/><Field label="Certifications" value={profileDraft.certifications} onChange={v=>saveProfile({...profileDraft,certifications:v})}/></div></div>
          <div className="form-section">
            <div className="section-title-row"><div><h3>Extra search keywords</h3><p>Add broad topics not already covered by your profile to refine manual search links.</p></div><span className="source-tag">OPTIONAL SEARCH CONTEXT</span></div>
            <label className="field"><span>Extra scholarship search keywords</span><textarea value={profileDraft.searchKeywords} onChange={e=>saveProfile({...profileDraft,searchKeywords:e.target.value})} placeholder="Broad topics or award categories you want included in search links"/></label>
            <p className="profile-search-hint">These keywords can appear in Google searches after you click a search link. Do not enter your name, email, phone number, street address, account details, or other private information.</p>
          </div>
          <div className="form-section">
            <div className="section-title-row"><div><h3>School and district information</h3><p>Add your district to help find school-based awards. School name and school location are listed above.</p></div><span className="source-tag">OPTIONAL</span></div>
            <div className="form-grid">
              <Field label="School district (optional)" value={profileDraft.district} onChange={v=>saveProfile({...profileDraft,district:v})} placeholder="Enter your school district"/>
            </div>
          </div>
          <div className="form-section"><div className="section-title-row"><div><h3>Optional matching detail</h3><p>Only use these when the scholarship's specific rules require them.</p></div><span className="source-tag">NEEDS CONFIRMATION</span></div><label className="field"><span>First-generation college student status</span><select value={profileDraft.firstGeneration} onChange={e=>saveProfile({...profileDraft,firstGeneration:e.target.value})}><option>Not confirmed — verify sponsor definition and family education details before matching</option><option>Yes — I meet the sponsor's definition</option><option>No</option><option>Unsure — needs review</option></select></label></div>
          <div className="privacy-note">◈ <span><b>Privacy-conscious profile.</b><br/>Contact details, street address, government identifiers, health information, and household financial details are excluded from automated matching. Profile data is stored in this browser only.</span></div>
        </div>
      </div>}

      {tab === 'Application prep' && <ApplicationPrepPage model={{
        APPLICATION_CHECKLIST_STEPS,
        applicationProgress,
        countApplicationWords,
        createWorkspaceItemId,
        formatDate,
        items,
        markPrepScholarshipSubmitted,
        prepScholarship,
        prepSummary,
        prepWorkspace,
        RECOMMENDATION_STATUSES,
        saveApplicationTask,
        savePrepWorkspace,
        setPrepScholarshipId,
        setTab,
      }} />}

      <footer className="page-footer">
        <div>Scholarship Scout <span>·</span> Personal scholarship assistant</div>
      </footer>
    </main>

    {showAdd && <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="add-dialog-title" tabIndex={-1}>
      <div className="modal-head"><div><div className="eyebrow">{editingId ? 'EDIT OPPORTUNITY' : 'NEW OPPORTUNITY'}</div><h2 id="add-dialog-title">{editingId ? 'Update scholarship rules' : 'Add scholarship rules'}</h2></div><button type="button" className="close" aria-label="Close scholarship form" onClick={()=>setShowAdd(false)}>×</button></div>

      <p className="muted">Only scholarship name and provider are required. All remaining fields are optional; leave them blank unless the sponsor’s current rules or reliable public evidence support them. Personal progress is separate from sponsor eligibility.</p>
      <form id="scholarship-editor-form" onSubmit={event => { event.preventDefault(); add(); }} onInvalidCapture={() => setShowAddValidation(true)}>
      <div className="modal-fields tracker-editor-fields">
        <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Scholarship details</h3><p>Identify the award and sponsoring organization.</p></div>
          <div className="form-grid">
            <Field id="scholarship-name" label="Scholarship name *" value={draft.name} onChange={v=>setDraft({...draft,name:v})} required requirement="required" error={showAddValidation && !draft.name.trim() ? 'Enter a scholarship name.' : undefined}/>
            <Field id="scholarship-provider" label="Provider *" value={draft.provider} onChange={v=>setDraft({...draft,provider:v})} required requirement="required" error={showAddValidation && !draft.provider.trim() ? 'Enter the scholarship provider.' : undefined}/>
          </div>
        </section>
        <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Award and deadlines</h3><p>Copy the sponsor’s wording. Leave unknown dates and amounts blank rather than estimating them.</p></div>
          <div className="form-grid">
            <Field label="Award amount / details (exact sponsor wording)" value={draft.award} onChange={v=>setDraft({...draft,award:v})} placeholder="Copy the amount and qualifiers as published"/>
            <Field label="Application opening date (only if confirmed)" value={draft.openDate || ""} onChange={v=>setDraft({...draft,openDate:v})} type="date"/>
            <Field label="Opening date time zone (only if stated)" value={draft.openDateTimezone || ""} onChange={v=>setDraft({...draft,openDateTimezone:v})} placeholder="e.g. America/Chicago"/>
            <Field label="Priority deadline date" value={draft.priorityDeadline || ""} onChange={v=>setDraft({...draft,priorityDeadline:v})} type="date"/>
            <Field label="Final deadline date" value={draft.deadline} onChange={v=>setDraft({...draft,deadline:v})} type="date"/>
            <Field label="Priority deadline as written by sponsor" value={draft.priorityDeadlineText || ""} onChange={v=>setDraft({...draft,priorityDeadlineText:v})} placeholder="Copy the priority-deadline wording exactly"/>
            <Field label="Priority deadline time zone (only if stated)" value={draft.priorityDeadlineTimezone || ""} onChange={v=>setDraft({...draft,priorityDeadlineTimezone:v})} placeholder="e.g. America/Chicago"/>
            <Field label="Final deadline as written by sponsor (include year, time and time zone when stated)" value={draft.deadlineText || ''} onChange={v=>setDraft({...draft,deadlineText:v})} placeholder="Copy the final-deadline wording exactly"/>
            <Field label="Final deadline time zone (only if sponsor states one)" value={draft.deadlineTimezone || ''} onChange={v=>setDraft({...draft,deadlineTimezone:v})} placeholder="e.g. America/Chicago; leave blank if not stated"/>
          </div>
          <div className="form-grid">
            <Field label="Currency wording (only when explicitly stated)" value={draft.awardCurrencyBasis || ''} onChange={v=>setDraft({...draft,awardCurrencyBasis:v})} placeholder="Copy the sponsor's exact currency wording"/>
            <Field label="Award basis (only when explicitly stated)" value={draft.awardBasis || ''} onChange={v=>setDraft({...draft,awardBasis:v})} placeholder="Copy the sponsor's exact award-basis wording"/>
          </div>
          <label className="field"><span>Exact public sponsor excerpt supporting the award</span><textarea value={draft.awardEvidenceText || ''} onChange={e=>setDraft({...draft,awardEvidenceText:e.target.value})} placeholder="Copy the sentence or table text that states the award amount and conditions."/></label>
          <Field label="Exact official page URL for the award excerpt" value={draft.awardEvidenceUrl || ''} onChange={v=>setDraft({...draft,awardEvidenceUrl:v})} type="url" placeholder="https://official-sponsor.example/award-rules#section"/>
          <CheckField label="Sponsor explicitly states there is no fixed deadline" checked={draft.deadlineNotPublished===true} onChange={v=>setDraft({...draft,deadlineNotPublished:v})}/>
        </section>
        <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Application progress</h3><p>These fields describe your work, not the sponsor’s eligibility requirements.</p></div>
          <div className="form-grid">
            <SelectField label="Application status (your progress)" value={draft.applicationStatus || 'Not started'} onChange={v=>setDraft({...draft,applicationStatus:v as ApplicationStatus})} options={APPLICATION_STATUSES.map((status)=>[status,status])}/>
            <SelectField label="Personal priority" value={draft.priority || 'Medium'} onChange={v=>setDraft({...draft,priority:v as TrackerPriority})} options={TRACKER_PRIORITIES.map((priority)=>[priority,priority])}/>
            <Field label="Submission date (only after you submit)" value={draft.submittedAt || ''} onChange={v=>setDraft({...draft,submittedAt:v})} type="date"/>
            <Field label="Award decision date" value={draft.decisionDate || ''} onChange={v=>setDraft({...draft,decisionDate:v})} type="date"/>
            <Field label="Tags (comma separated)" value={(draft.tags || []).join(', ')} onChange={v=>setDraft({...draft,tags:splitKeywords(v).slice(0,20)})} placeholder="e.g. humanities, local, essay"/>
          </div>
        </section>
        <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Sponsor source and evidence</h3><p>Record the public sponsor page and the exact source text used to verify the listing.</p></div>
          <div className="form-grid">
            <Field label="Official sponsor URL" value={draft.sourceUrl} onChange={v=>setDraft({...draft,sourceUrl:v})} type="url" placeholder="https://"/>
            <Field label="Exact official page URL for the general evidence excerpt" value={draft.evidenceUrl || ''} onChange={v=>setDraft({...draft,evidenceUrl:v})} type="url" placeholder="https://official-sponsor.example/rules#section"/>
            <SelectField label="Source authority" value={draft.sourceAuthority || 'unverified-lead'} onChange={v=>setDraft({...draft,sourceAuthority:v})} options={[['unverified-lead','Unverified lead'],['secondary-directory','Secondary directory'],['official-sponsor','Official sponsor'],['official-program','Official scholarship program'],['official-school','Official school / district'],['official-government','Official government']]}/>
          </div>
          <label className="field"><span>General evidence excerpt from official sponsor rules (use the exact text from that page)</span><textarea value={draft.evidenceText} onChange={e=>setDraft({...draft,evidenceText:e.target.value})} placeholder="Copy or accurately transcribe the source-level facts from the exact page URL above."/></label>
        </section>
        <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Structured eligibility rules</h3><p>Enter a requirement only when the sponsor’s published rules support it. Leave a field blank when the sponsor does not specify that requirement.</p></div>
          <div className="form-grid">
            <Field label="Applicant state of residence" value={draft.criteria.state ?? ''} onChange={v=>setCriteria({state:v||undefined})} placeholder="Texas"/>
            <Field label="Current school location state" value={draft.criteria.schoolState ?? ''} onChange={v=>setCriteria({schoolState:v||undefined})} placeholder="Texas"/>
            <Field label="Intended college location state" value={draft.criteria.collegeState ?? ''} onChange={v=>setCriteria({collegeState:v||undefined})} placeholder="Texas"/>
            <SelectField label="Citizenship requirement" value={draft.criteria.citizenship ?? 'any'} onChange={v=>setCriteria({citizenship:v as EligibilityCriteria['citizenship']})} options={[['any','Not specified'],['us-citizen','U.S. citizen'],['eligible-noncitizen','Eligible noncitizen']]}/>
            <SelectField label="Education level" value={draft.criteria.educationLevel ?? ''} onChange={v=>setCriteria({educationLevel:(v||undefined) as EligibilityCriteria['educationLevel']})} options={[['','Not specified'],['high-school-senior','High-school senior'],['high-school-student','Current high-school student'],['incoming-college','Incoming college student'],['undergraduate','Currently enrolled undergraduate']]}/>
            <Field label="Minimum age (years)" value={String(draft.criteria.ageRange?.min ?? '')} onChange={v=>setAgeRange({min:v ? Number(v) : undefined})} type="number" min={0} max={120} step={1}/>
            <SelectField label="Minimum age boundary" value={draft.criteria.ageRange?.minInclusive === true ? 'inclusive' : draft.criteria.ageRange?.minInclusive === false ? 'exclusive' : ''} onChange={v=>setAgeRange({minInclusive:v === '' ? undefined : v === 'inclusive'})} options={[['','Choose boundary'],['inclusive','Inclusive (at least this age)'],['exclusive','Exclusive (older than this age)']]} required={draft.criteria.ageRange?.min != null}/>
            <Field label="Maximum age (years)" value={String(draft.criteria.ageRange?.max ?? '')} onChange={v=>setAgeRange({max:v ? Number(v) : undefined})} type="number" min={0} max={120} step={1}/>
            <SelectField label="Maximum age boundary" value={draft.criteria.ageRange?.maxInclusive === true ? 'inclusive' : draft.criteria.ageRange?.maxInclusive === false ? 'exclusive' : ''} onChange={v=>setAgeRange({maxInclusive:v === '' ? undefined : v === 'inclusive'})} options={[['','Choose boundary'],['inclusive','Inclusive (up to this age)'],['exclusive','Exclusive (younger than this age)']]} required={draft.criteria.ageRange?.max != null}/>
            <Field label="Graduation year" value={String(draft.criteria.graduationYear ?? '')} onChange={v=>setCriteria({graduationYear:v ? Number(v) : undefined})} type="number" min={1900} max={2100} step={1} placeholder="2027"/>
            <Field label="GPA threshold" value={String(draft.criteria.minGpa ?? '')} onChange={v=>setCriteria({minGpa:v ? Number(v) : undefined})} type="number" min={0} max={5} step="any" placeholder="e.g. 3.0"/>
            <Field label="Class-rank cutoff (top %)" value={String(draft.criteria.topPercentMax ?? '')} onChange={v=>setCriteria({topPercentMax:v ? Number(v) : undefined})} type="number" min={0} max={100} step="any" placeholder="e.g. 10"/>
            <Field label="Field-of-study keywords (comma separated)" value={(draft.criteria.majorKeywords ?? []).join(', ')} onChange={v=>setCriteria({majorKeywords:splitKeywords(v)})}/>
            <Field label="College or institution" value={draft.criteria.institution ?? ''} onChange={v=>setCriteria({institution:v||undefined})}/>
            <Field label="Community-service hours" value={String(draft.criteria.minServiceHours ?? '')} onChange={v=>setCriteria({minServiceHours:v ? Number(v) : undefined})} type="number" min={0} max={1000000} step="any"/>
            <Field label="Organization membership" value={draft.criteria.requiredMembership ?? ''} onChange={v=>setCriteria({requiredMembership:v||undefined})}/>
          </div>
          <div className="tracker-editor-subgroup">
            <b>Independent test-score requirements</b>
            <p>Use separate ACT and SAT minimums only when the sponsor independently requires each recorded score.</p>
            <div className="form-grid">
              <Field label="ACT threshold" value={String(draft.criteria.minAct ?? '')} onChange={v=>setCriteria({minAct:v ? Number(v) : undefined})} type="number" min={1} max={36} step={1} placeholder="e.g. 25"/>
              <Field label="SAT threshold" value={String(draft.criteria.minSat ?? '')} onChange={v=>setCriteria({minSat:v ? Number(v) : undefined})} type="number" min={400} max={1600} step={10} placeholder="e.g. 1200"/>
            </div>
          </div>
          <div className="tracker-editor-subgroup">
            <b>Alternative test-score requirement: ACT or SAT</b>
            <p>Use this when the sponsor accepts either test. Meeting either entered minimum satisfies this one alternative rule.</p>
            <div className="form-grid">
              <Field label="ACT minimum (alternative route)" value={String(draft.criteria.minActOrSat?.act ?? '')} onChange={v=>setActOrSatThreshold('act', v)} type="number" min={1} max={36} step={1} placeholder="e.g. 25"/>
              <Field label="SAT minimum (alternative route)" value={String(draft.criteria.minActOrSat?.sat ?? '')} onChange={v=>setActOrSatThreshold('sat', v)} type="number" min={400} max={1600} step={10} placeholder="e.g. 1200"/>
            </div>
          </div>
          <div className="tracker-editor-subgroup"><b>Student enrollment and qualifications</b><p>Multiple enrollment routes may apply. Mark only requirements the sponsor publishes.</p>
            <div className="check-options">
              <CheckField label="Full-time student" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("full-time"))} onChange={v=>updateEnrollmentStatus("full-time",v)}/>
              <CheckField label="Part-time student" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("part-time"))} onChange={v=>updateEnrollmentStatus("part-time",v)}/>
              <CheckField label="Incoming college student" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("incoming"))} onChange={v=>updateEnrollmentStatus("incoming",v)}/>
              <CheckField label="Current student (high school or college)" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("current-student"))} onChange={v=>updateEnrollmentStatus("current-student",v)}/>
              <CheckField label="Financial-need qualification" checked={Boolean(draft.criteria.requiresFinancialNeed)} onChange={v=>setCriteria({requiresFinancialNeed:v})}/>
              <CheckField label="First-generation qualification" checked={Boolean(draft.criteria.requiresFirstGeneration)} onChange={v=>setCriteria({requiresFirstGeneration:v})}/>
            </div>
          </div>
          <label className="field"><span>Other sponsor requirements not covered above</span><textarea value={draft.criteria.otherRequirement ?? ''} onChange={e=>setCriteria({otherRequirement:e.target.value||undefined})} placeholder="Record additional sponsor rules, then classify them as mandatory or preferred below."/></label>
        </section>
        {activeCriterionEntries.length > 0 && <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Requirement evidence and verification</h3><p>Each rule needs its own excerpt and exact HTTPS page URL on the same recognized official sponsor domain. Without both, its result remains Unknown. A preferred rule is informational and never disqualifies an applicant.</p></div>
          {activeCriterionEntries.map(([key]) => {
            const entry = draft.criteriaEvidence?.[key] ?? {};
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
            return <div className="criterion-evidence-entry" key={key}>
              <b>{label}</b>
              <label className="field"><span>Requirement classification</span><select aria-label={label + ' requirement classification'} value={draft.criteriaImportance?.[key as keyof EligibilityCriteria] ?? 'mandatory'} onChange={event=>setCriterionImportance(key as keyof EligibilityCriteria, event.target.value as CriteriaImportance)}><option value="mandatory">Mandatory — must be met</option><option value="preferred">Preferred — does not disqualify</option></select></label>
              <Field label="Exact official page URL for this rule" value={entry.sourceUrl ?? ''} onChange={v=>setCriterionEvidence(key,{sourceUrl:v})} type="url" placeholder="https://official-sponsor.example/rules#section"/>
              <label className="field"><span>Exact sponsor rule excerpt from this page</span><textarea value={entry.excerpt ?? ''} onChange={e=>setCriterionEvidence(key,{excerpt:e.target.value})} placeholder="Quote or accurately transcribe only the rule supporting this criterion."/></label>
            </div>;
          })}
        </section>}
        <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Safety review</h3><p>This is a caution flag, not an eligibility rule. Verify any requested payment directly with the official sponsor before taking action.</p></div>
          <CheckField label="Listing indicates an application fee (flag for safety review)" checked={draft.criteria.applicationFee===true} onChange={v=>setCriteria({applicationFee:v ? true : null})}/>
        </section>
        <section className="tracker-editor-section">
          <div className="tracker-editor-section-heading"><h3>Notes and verification</h3><p>Keep personal reminders separate from sponsor facts.</p></div>
          <CheckField label="I reviewed the current official rules and recorded the supporting evidence above" checked={draft.sourceVerified} onChange={v=>setDraft({...draft,sourceVerified:v,lastCheckedDate:v?localToday():'',sourceReviewConfirmed:v})}/>
          <label className="field"><span>Additional notes</span><textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Documents, recommendations, essays, or questions…"/></label>
        </section>
      </div>
      </form>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowAdd(false)}>Cancel</button><button type="submit" form="scholarship-editor-form" className="primary">{editingId ? 'Save rule changes' : 'Save & check eligibility'}</button></div>
    </div></div>}

    {selected && selectedAssessment && <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="selected-dialog-title" tabIndex={-1}>
      <div className="modal-head"><div><div className="eyebrow">AUTOMATED ELIGIBILITY REPORT</div><h2 id="selected-dialog-title">{selected.name}</h2><p className="muted">{selected.provider}</p></div><button className="close" aria-label="Close scholarship details" onClick={()=>setSelected(null)}>×</button></div>
      <div className="assessment-banner"><StatusPill status={selectedSummary!.status as Status}/><SourceStatusPill item={selected}/><span>{selectedSummary!.passed.length} mandatory passed · {selectedSummary!.failed.length} mandatory failed · {selectedSummary!.unknown.length} mandatory need review</span></div>
      <section className="evidence-box" aria-label="Award and deadline comparison details"><div className="panel-heading"><b>Award amount and deadline milestones</b></div><p><strong>{selected.award || 'Award amount not recorded'}</strong></p><small className="muted">Award amount, currency, and basis are not inferred. Only sponsor-stated wording is recorded.</small>{selected.awardCurrencyBasis && <p><b>Currency:</b> {selected.awardCurrencyBasis}</p>}{selected.awardBasis && <p><b>Award basis:</b> {selected.awardBasis}</p>}{selected.awardEvidenceText && <blockquote>{selected.awardEvidenceText}</blockquote>}{selected.awardEvidenceText && <small className="muted">Award excerpt attribution: {getEvidenceExcerptAttributions(selected).award?.label || 'No excerpt source recorded'}</small>}{sanitizePublicHttpsUrl(selected.awardEvidenceUrl || '') && <p><a className="source-link" href={sanitizePublicHttpsUrl(selected.awardEvidenceUrl || '') || undefined} target="_blank" rel="noreferrer">Open award evidence source ↗</a></p>}<p><b>Application opens:</b> {selected.openDate ? formatDate(selected.openDate) : 'Not confirmed'}{selected.openDateTimezone ? ' · ' + selected.openDateTimezone : ''}</p><p><b>Final deadline:</b> {selected.deadlineText && selected.deadlineText !== selected.deadline ? selected.deadlineText : (selected.deadline ? formatDate(selected.deadline) : selected.deadlineNotPublished ? 'No deadline published by sponsor' : 'Deadline not confirmed')}{selected.deadlineTimezone ? ` · ${selected.deadlineTimezone}` : ''}</p>{selected.priorityDeadline || selected.priorityDeadlineText ? <p><b>Priority deadline:</b> {selected.priorityDeadlineText || (selected.priorityDeadline ? formatDate(selected.priorityDeadline) : "Date not confirmed")}{selected.priorityDeadlineTimezone ? ` · ${selected.priorityDeadlineTimezone}` : ""}</p> : null}</section>
      <EligibilityMatchSummary assessment={selectedAssessment}/>
      {selectedAssessment.riskFlags.map(flag=><div className="risk-flag" key={flag}>⚠ {flag}</div>)}
      <div className="evidence-box"><div className="panel-heading"><b>Source evidence</b><SourceStatusPill item={selected}/></div><p>{selected.evidenceText || 'No official eligibility evidence has been saved. Keep this record in needs-review.'}</p><div className="evidence-meta">Sponsor rules last checked: {selected.lastCheckedDate || 'Not recorded'} · Record added to tracker: {selected.recordCreatedAt ? new Date(selected.recordCreatedAt).toLocaleString() : 'Date not recorded'} · Evidence excerpt attribution: {getEvidenceExcerptAttributions(selected).general?.label || 'No excerpt source recorded'} · Deadline: {selected.deadlineText && selected.deadlineText !== selected.deadline ? selected.deadlineText : (selected.deadline ? formatDate(selected.deadline) : selected.deadlineNotPublished ? 'No deadline published by sponsor' : 'Deadline not confirmed')}{selected.deadlineTimezone ? ` · ${selected.deadlineTimezone}` : ''}{selected.deadlineTime ? ` · Sponsor cutoff: ${formatDeadlineTime(selected.deadlineTime)}${selected.deadlineTimezoneText ? ` ${selected.deadlineTimezoneText}` : selected.deadlineTimezone ? ` ${selected.deadlineTimezone}` : ' (time zone not stated)'}` : ''}</div>{sanitizePublicHttpsUrl(selected.sourceUrl) && <a className="source-link" href={sanitizePublicHttpsUrl(selected.sourceUrl) || undefined} target="_blank" rel="noreferrer">{getSourceAttribution(selected.sourceUrl).linkLabel} ↗</a>}{sanitizePublicHttpsUrl(selected.evidenceUrl || '') && <p><a className="source-link" href={sanitizePublicHttpsUrl(selected.evidenceUrl || '') || undefined} target="_blank" rel="noreferrer">Open exact general excerpt source ↗</a></p>}{Object.entries(getEvidenceExcerptAttributions(selected).criteria).map(([key, attribution]) => <p key={key}><b>{key} excerpt attribution:</b> {attribution.label}{attribution.url ? <> · <a className="source-link" href={sanitizePublicHttpsUrl(attribution.url) || undefined} target="_blank" rel="noreferrer">Open exact source ↗</a></> : null}</p>)}{sanitizePublicHttpsUrl(selected.discoverySourceUrl || '') && <p className="muted">Discovery lead: <a href={sanitizePublicHttpsUrl(selected.discoverySourceUrl || '') || undefined} target="_blank" rel="noreferrer">{selected.discoverySourceLabel || 'source listing'} ↗</a> on {selected.discoveredOn || 'unknown date'}.</p>}</div>
      <EvidenceCompletenessList item={selected}/>
      {selected.sourceEvidenceHistory?.length ? <details className="evidence-box">
        <summary><b>Previous source evidence ({selected.sourceEvidenceHistory.length})</b></summary>
        <p className="muted">Earlier source URLs and excerpts are retained locally for auditability. They are not uploaded to cloud records.</p>
        {[...selected.sourceEvidenceHistory].reverse().map((entry, index) => <div className="criterion-evidence-entry" key={entry.recordedAt + index}>
          <small className="muted">Evidence saved {new Date(entry.recordedAt).toLocaleString()} · {entry.sourceAuthority || 'Authority not recorded'} · sponsor rules checked {entry.lastCheckedDate || 'date not recorded'}</small>
          {entry.sourceUrl && <p><b>Previous sponsor URL:</b> {sanitizePublicHttpsUrl(entry.sourceUrl) || 'Stored URL is not safe to open'}</p>}
          {entry.evidenceUrl && <p><b>Previous supporting URL:</b> {sanitizePublicHttpsUrl(entry.evidenceUrl) || 'Stored URL is not safe to open'}</p>}
          {entry.awardEvidenceUrl && <p><b>Previous award evidence URL:</b> {sanitizePublicHttpsUrl(entry.awardEvidenceUrl) || 'Stored URL is not safe to open'}</p>}
          {entry.evidenceText && <p><b>Previous source excerpt:</b> {entry.evidenceText}</p>}
          {entry.awardEvidenceText && <p><b>Previous award excerpt:</b> {entry.awardEvidenceText}</p>}
          {entry.criteriaEvidence && Object.entries(entry.criteriaEvidence).map(([key, evidence]) => <p key={key}><b>{key}:</b> {evidence.excerpt || 'No excerpt recorded'}{evidence.sourceUrl ? ` · ${evidence.sourceUrl}` : ''}</p>)}
        </div>)}
      </details> : null}
      <div className="application-tracking-box">
        <div className="panel-heading"><b>Application tracking</b><span className={selected.archived ? 'source-status source-status-expired' : 'source-status source-status-needs-review'}>{selected.archived ? 'Archived' : 'Active'}</span></div>
        <div className="application-tracking-row"><span>Application status</span><ApplicationStatusPill status={selected.applicationStatus || 'Not started'}/></div>
        <div className="application-tracking-row"><span>Personal priority</span><PriorityPill priority={selected.priority || 'Medium'}/></div>
        <div className="application-tracking-row"><span>Submitted</span><b>{selected.submittedAt ? formatDate(selected.submittedAt) : 'Not recorded'}</b></div>
        <div className="application-tracking-row"><span>Decision date</span><b>{selected.decisionDate ? formatDate(selected.decisionDate) : 'Not recorded'}</b></div>
        {selected.tags?.length ? <div className="application-tag-list">{selected.tags.map((tag)=><span key={tag}>{tag}</span>)}</div> : null}
      </div>
      {selected.notes && <div className="detail-notes"><b>Notes</b><p>{selected.notes}</p></div>}
      <div className="modal-actions">{cloudUser && <button className="secondary" disabled={cloudBusy} onClick={()=>void handleCloudSave(selected)}>Save sponsor details to cloud</button>}<button className="secondary" onClick={()=>{const updated={...selected,archived:!selected.archived};if(!saveItems(items.map(x=>x.id===selected.id?updated:x)))return;setSelected(updated);setNotice(updated.archived?'Scholarship archived. Its history remains in your tracker.':'Scholarship restored to active records.')}}>{selected.archived ? 'Restore from archive' : 'Archive scholarship'}</button>{removeConfirmationId === selected.id ? <div className="tracker-remove-confirmation" role="alertdialog" aria-labelledby="remove-scholarship-title">
        <h3 id="remove-scholarship-title">Remove scholarship and its application workspace?</h3>
        <p>This permanently removes the tracker record and its associated checklist and application workspace from this browser. Export an encrypted backup first if you may need them later.</p>
        <div className="tracker-remove-actions">
          <button type="button" className="secondary" onClick={()=>setRemoveConfirmationId(null)}>Cancel removal</button>
          <button type="button" className="danger-button" onClick={()=>{if(!saveItems(items.filter(x=>x.id!==selected.id)))return;setRemoveConfirmationId(null);setSelected(null);setNotice('Scholarship and its associated application materials were removed from this device.')}}>Remove scholarship and application data</button>
        </div>
      </div> : null}<button className="secondary" onClick={()=>setRemoveConfirmationId(selected.id)}>Remove from tracker</button><button className="secondary" onClick={()=>{const item=selected;setSelected(null);openAdd(item,true)}}>Edit criteria / application</button><button className="primary" onClick={()=>setSelected(null)}>Done</button></div>
    </div></div>}

    {backupDialogMode !== 'closed' && <div className="overlay" onMouseDown={event=>{if(event.target===event.currentTarget)closeBackupDialog();}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title" tabIndex={-1}>
      <div className="modal-head"><div><div className="eyebrow">PRIVATE LOCAL BACKUP</div><h2 id="backup-dialog-title">{backupDialogMode === 'export' ? 'Encrypt backup' : backupPendingRestore ? 'Confirm backup import' : 'Unlock encrypted backup'}</h2></div><button className="close" aria-label="Close backup dialog" onClick={closeBackupDialog} disabled={backupBusy}>×</button></div>
      {backupDialogMode === 'export' ? <form onSubmit={event=>void exportEncryptedBackup(event)}>
        <p className="muted">Your profile, tracker, and checklist will be encrypted in this browser before download using AES-256-GCM. Use at least 12 characters. Scholarship Scout never saves this password; losing it means the backup cannot be recovered.</p>
        <label className="field"><span>Backup password (12 characters minimum)</span><input type="password" value={backupPassword} onChange={event=>setBackupPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={1024} required/></label>
        <label className="field"><span>Confirm backup password</span><input type="password" value={backupPasswordConfirm} onChange={event=>setBackupPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={12} maxLength={1024} required/></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={closeBackupDialog} disabled={backupBusy}>Cancel</button><button type="submit" className="primary" disabled={backupBusy}>{backupBusy ? 'Encrypting…' : 'Encrypt & download'}</button></div>
      </form> : backupPendingRestore ? <form onSubmit={event=>{event.preventDefault();void confirmRestoreLocalBackup();}}>
        <p className="muted">This restore replaces the current local profile, tracker, checklists, and application workspaces on this device. This cannot be undone unless you have another backup.</p>
        <p><b>Backup preview:</b> {Object.keys((backupPendingRestore.data as {profile?:Record<string,unknown>}).profile || {}).length} profile fields, {((backupPendingRestore.data as {scholarships?:unknown[]}).scholarships || []).length} scholarships, {Object.keys((backupPendingRestore.data as {applicationProgress?:Record<string,unknown>}).applicationProgress || {}).length} checklists, and {Object.keys((backupPendingRestore.data as {applicationWorkspace?:Record<string,unknown>}).applicationWorkspace || {}).length} workspaces.</p>
        {!backupPendingRestore.encrypted && <p className="risk-flag">This backup is not encrypted. Only import it if you trust the file and its source.</p>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={closeBackupDialog}>Cancel</button><button type="submit" className="primary">Replace local data</button></div>
      </form> : <form onSubmit={event=>void importEncryptedBackup(event)}>
        <p className="muted">Enter the password used when this backup was exported. The password is used only in memory for this import and is not saved.</p>
        <label className="field"><span>Backup password</span><input type="password" value={backupPassword} onChange={event=>setBackupPassword(event.target.value)} autoComplete="current-password" minLength={12} maxLength={1024} required/></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={closeBackupDialog} disabled={backupBusy}>Cancel</button><button type="submit" className="primary" disabled={backupBusy || !backupPassword}>{backupBusy ? 'Decrypting…' : 'Decrypt & review'}</button></div>
      </form>}
    </div></div>}
    {notice && <div className="toast"><span role="status" aria-live="polite">{notice}</span><button type="button" aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}
  </div>;
}

function CloudResultCard({item,tracked,onTrack}:{item:LiveScholarship;tracked:boolean;onTrack:()=>void}) {
  const sourcePageUrl = getScholarshipSourcePageUrl(item.source_url);
  const rules = item.extracted_rules as {
    eligibility_requirements?:Array<{requirement?:string;mandatory?:boolean;evidence?:string;needs_human_confirmation?:boolean}>;
    uncertainties?:string[]; short_source_summary?:string; application_fee?:boolean|null;
    application_documents?:string[]; application_steps?:string[];
  }|undefined;
  return <article className="cloud-result-card" role="listitem">
    <div className="candidate-top"><span className="status status-needs-information">{item.verification_state === 'human_verified' ? 'Sponsor-reviewed record' : item.verification_state === 'needs_human_review' ? 'Needs sponsor review' : 'Unverified lead'}</span><span>{(item.discovery_categories || [item.discovery_category]).map((category)=>category.replace(/_/g,' ')).join(' · ')}</span></div>
    <h3>{item.title}</h3><p className="candidate-provider">{item.provider || 'Sponsor not confirmed'} · {item.source_domain || (()=>{try{return new URL(item.source_url).hostname.replace(/^www[.]/,'')}catch{return 'Source domain unavailable'}})()}</p>
    <div className="cloud-result-meta" aria-label="Award and deadline clues from search snippets">
      <span><b>Award</b> {item.award_text || 'Not found in snippet'}</span>
      <span><b>Deadline</b> {item.deadline_text || 'Not found in snippet'}</span>
    </div>
    {(item.award_text || item.deadline_text) && <small className="candidate-source">Snippet details only. Confirm on the sponsor page.</small>}
    <p className="candidate-description">{rules?.short_source_summary || item.excerpt || 'Open the source page and review the official sponsor rules.'}</p>
    {item.relevance_score !== undefined && (() => {
      const score = Math.max(0, Math.min(100, Math.round(item.relevance_score)));
      const level = score >= 70 ? 'Strong' : score >= 40 ? 'Moderate' : 'Limited';
      return <section className="research-relevance" aria-label={`Profile match: ${score} out of 100, ${level}`}>
        <div className="research-relevance-head"><b>Profile match</b><strong>{score}/100 · {level}</strong></div>
        <div className="research-relevance-track" role="meter" aria-label="Profile match score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`${score} out of 100, ${level} profile match`}>
          <span style={{ width: `${score}%` }} />
        </div>
        <small>Calculated on this device from available profile details and search evidence. 0–39 limited · 40–69 moderate · 70–100 strong. Not an eligibility decision.</small>
        {item.relevance_reasons?.length ? <details><summary>Why this matched</summary><small>{item.relevance_reasons.join(' · ')}</small></details> : null}
      </section>;
    })()}

    {getScholarshipSourcePageUrl(item.source_evidence_url || '') && <p><a className="source-link" href={getScholarshipSourcePageUrl(item.source_evidence_url || '') || undefined} target="_blank" rel="noopener noreferrer">Open supporting rules / evidence ↗</a></p>}
    {rules?.eligibility_requirements?.length ? <div className="extracted-rules"><b>Extracted sponsor rules — provisional</b>{rules.eligibility_requirements.map((rule,index)=><div key={index}><span>{rule.mandatory?'Required':'Selection / preference'}{rule.needs_human_confirmation?' · Confirm with sponsor':''}</span><p>{rule.requirement}</p>{rule.evidence&&<small>Evidence: {rule.evidence}</small>}</div>)}</div>:null}
    {rules?.uncertainties?.length ? <div className="uncertainty-list"><b>Still unclear</b><ul>{rules.uncertainties.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_documents?.length ? <div className="extracted-rules"><b>Application documents</b><ul>{rules.application_documents.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_steps?.length ? <div className="extracted-rules"><b>Application steps</b><ol>{rules.application_steps.map((item,index)=><li key={index}>{item}</li>)}</ol></div>:null}
    {rules?.application_fee === true ? <div className="risk-flag">⚠ The sponsor-page extraction indicates an application fee. Verify directly with the sponsor and do not pay to apply.</div>:null}
    <div className="candidate-actions">{sourcePageUrl && <a href={sourcePageUrl} target="_blank" rel="noopener noreferrer">Open scholarship page ↗</a>}<button className="primary" disabled={tracked} onClick={onTrack}>{tracked?'In tracker':'＋ Add to tracker'}</button></div>
    {!sourcePageUrl && <small className="candidate-source">A direct scholarship page URL was not returned. The sponsor homepage is intentionally not shown as the scholarship page.</small>}
    <small className="candidate-source">Cloud records are not automatically refreshed. Re-check the current official sponsor page before relying on any detail.</small>
  </article>;
}

function CandidateCard({item,assessment,added,onAdd}:{item:Scholarship;assessment:EligibilityAssessment;added:boolean;onAdd:()=>void}) {
  const summary = summarizeEligibilityAssessment(assessment);
  const sourcePageUrl = getScholarshipSourcePageUrl(item.sourceUrl);
  return <div className="candidate-card">
    <div className="candidate-top"><StatusPill status={summary.status as Status}/><SourceStatusPill item={item}/></div>
    <div className="candidate-deadline">{item.deadlineText && item.deadlineText !== item.deadline ? item.deadlineText : (item.deadline ? formatDate(item.deadline) : item.deadlineNotPublished ? 'No deadline published by sponsor' : 'Deadline not confirmed')} {item.deadlineTimezone ? `· ${item.deadlineTimezone}` : ''}</div>
    <h3>{item.name}</h3><p className="candidate-provider">{item.provider}</p><div className="candidate-award">{item.award || 'Award details not published'}</div>
    <p className="candidate-description">{item.notes}</p>
    <div className="candidate-match"><b>Profile check</b><span>{summary.passed.length} pass · {summary.unknown.length} unknown · {summary.failed.length} fail</span></div>
    <small className="candidate-source">{summary.caveat}</small>
    <div className="candidate-actions">{sourcePageUrl && <a href={sourcePageUrl} target="_blank" rel="noopener noreferrer">{getSourceAttribution(item.sourceUrl).linkLabel} ↗</a>}<button className={added?'secondary':'primary'} disabled={added} onClick={onAdd}>{added?'Added to tracker':'＋ Track & verify'}</button></div>
    {!sourcePageUrl && <small className="candidate-source">A direct scholarship page URL has not been saved for this record.</small>}
    <small className="candidate-source">Sponsor rules last checked: {item.lastCheckedDate || 'Not recorded'} · Discovered: {item.discoveredOn || 'Date not recorded'} · Added to tracker: {item.recordCreatedAt ? new Date(item.recordCreatedAt).toLocaleString() : 'Date not recorded'} · {getSourceAttribution(item.sourceUrl).label}. {item.discoverySourceLabel ? `Discovery source: ${item.discoverySourceLabel}.` : 'No discovery source recorded'}</small>
  </div>;
}
const STATUS_CLASS_MAP: Record<string, string> = {
  'Eligible': 'eligible',
  'Rules match — source unverified': 'rules-match-unverified',
  'Needs information': 'needs-information',
  'Ineligible': 'ineligible',
  'Expired': 'expired',
};
function StatusPill({status}:{status:Status}) {
  return <span className={'status status-' + (STATUS_CLASS_MAP[status] || 'unknown')}>{status}</span>;
}
function ApplicationStatusPill({status}:{status:ApplicationStatus}) { return <span className={'application-status-pill application-status-'+status.toLowerCase().replace(/ /g,'-')}>{status}</span>; }
function PriorityPill({priority}:{priority:TrackerPriority}) { return <span className={'priority-pill priority-'+priority.toLowerCase()}>{priority}</span>; }
function SourceStatusPill({item}:{item:Scholarship}) {
  const freshness = getOfficialSourceFreshness(item);
  const label = freshness === 'fresh' ? 'Fresh' : freshness === 'stale' ? 'Stale' : 'Unverified';
  const tone = freshness === 'fresh' ? 'verified' : 'needs-review';
  return <span className={'source-status source-status-'+tone} aria-label={'Official source freshness: '+label}>{label}</span>;
}
function DeadlineUrgencyPill({deadline,timeZone,openDate,openDateTimezone,deadlineTime}:{deadline?:string;timeZone?:string;openDate?:string;openDateTimezone?:string;deadlineTime?:string}) {
  const urgency = getDeadlineUrgency(deadline, new Date(), timeZone, openDate, openDateTimezone, deadlineTime);
  const explanation = openDate
    ? "Opening date is evaluated as a date-only sponsor window" + (openDateTimezone ? " in " + openDateTimezone : "") + "; the deadline is not treated as overdue before the opportunity opens."
    : timeZone
      ? "Date-only estimate using the sponsor-stated time zone (" + timeZone + "); no cutoff time is inferred."
      : "Date-only estimate; no sponsor time zone or cutoff time is inferred.";
  return <span className={`deadline-urgency deadline-urgency-${urgency.status}`} title={explanation}>{urgency.label}</span>;
}
function EvidenceCompletenessList({item}:{item:Scholarship}) {
  const review = getEvidenceCompleteness(item);
  return <div className="evidence-completeness"><div className="panel-heading"><div><b>Sponsor evidence completeness</b><small>{review.completedCount} of {review.totalCount} source checks complete. This is not a personal eligibility result.</small></div><span className={review.complete ? 'source-status source-status-verified' : 'source-status source-status-needs-review'}>{review.complete ? 'Complete' : 'Needs review'}</span></div><ul>{review.checks.map((check)=><li key={check.label}><span className={check.complete ? 'evidence-check-done' : 'evidence-check-missing'}>{check.complete ? '✓' : '•'}</span>{check.label}</li>)}</ul></div>;
}
function EligibilityMatchSummary({assessment}:{assessment:EligibilityAssessment}) {
  const summary = summarizeEligibilityAssessment(assessment);
  const groups = [
    { title: 'Matches recorded rules', items: summary.passed, tone: 'pass' },
    { title: 'Does not meet', items: summary.failed, tone: 'fail' },
    { title: 'Still needs confirmation', items: summary.unknown, tone: 'unknown' },
    { title: 'Preferred qualifications (informational)', items: summary.preferred, tone: 'unknown' },
  ].filter((group) => group.items.length > 0);
  return <div className="match-summary"><div className="match-summary-heading"><b>{summary.headline}</b><span>{summary.passed.length} mandatory passed · {summary.failed.length} mandatory not met · {summary.unknown.length} mandatory unknown · {summary.preferred.length} preferred informational</span></div>{groups.length ? groups.map((group)=><section className={`match-summary-group match-summary-${group.tone}`} key={group.title}><h4>{group.title}</h4><ul>{group.items.map((item)=><li key={item.label}><b>{item.label}</b>{item.importance === 'preferred' && <small>{item.outcome === 'pass' ? 'Preferred match' : item.outcome === 'fail' ? 'Preferred not met — not disqualifying' : 'Preferred — confirmation pending'}</small>}<span>{item.detail || 'No additional detail recorded.'}</span>{item.evidence?.state === 'linked' ? <div className="criterion-evidence"><small>Source excerpt: {item.evidence.excerpt}</small>{sanitizePublicHttpsUrl(item.evidence.sourceUrl) && <a className="source-link" href={sanitizePublicHttpsUrl(item.evidence.sourceUrl) || undefined} target="_blank" rel="noreferrer">Open criterion source ↗</a>}</div> : item.criterionKey ? <small className="criterion-evidence-missing">Criterion evidence is not linked yet; confirm this rule on the sponsor's official page.</small> : null}</li>)}</ul></section>) : <p className="muted">Add structured sponsor criteria to compare this scholarship.</p>}<small>{summary.caveat} Sponsor decisions and requirements not recorded in Scout may still apply.</small></div>;
}
function Empty({onAdd}:{onAdd:()=>void}) { return <div className="empty"><div>▤</div><b>No scholarships in this view</b><p>Add an opportunity from discovery or enter its sponsor criteria.</p><button className="secondary" onClick={onAdd}>＋ Add scholarship</button></div>; }
function FilteredEmpty({onClear}:{onClear:()=>void}) { return <div className="empty" role="status"><div>⌕</div><b>No scholarships match these filters</b><p>Saved opportunities are available, but your search or selected filters hide them.</p><button type="button" className="secondary" onClick={onClear}>Clear filters</button></div>; }
export default App;
