import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { vaultStorage, lockLocalVault, flushLocalVault, destroyLocalVault, hasPendingLocalVaultWrites } from './lib/localVault.js';
import { clearReliabilityEvents, installReliabilityMonitoring, readReliabilityEvents, RELIABILITY_CHANGE_EVENT } from './lib/reliabilityMonitor.js';
import { assessEligibility, type EligibilityCriteria, type EligibilityAssessment } from './eligibility.js';
import type { Profile } from './domain/types.js';
import { deriveSourceStatus, getEvidenceCompleteness, getEvidenceExcerptAttributions, getOfficialSourceFreshness, getSourceAttribution, isInactiveCriterionValue, normalizeAndDeduplicateScholarships, normalizeScholarshipRecords, resolveSourceAuthority, sanitizePublicHttpsUrl } from './lib/evidence.js';
import { appendSourceEvidenceHistory, invalidateSourceReviewIfChanged } from './lib/sourceReview.js';
import { getSupabaseClient, stopSupabaseAutoRefreshForVaultLock, supabaseConfigured } from './lib/supabaseClient';
import { buildScoutBackup, validateScoutBackup } from './lib/backup.js';

import { findPotentialDuplicates, getDeadlineMilestones, getDeadlineUrgency } from './lib/trackerInsights.js';
import { APPLICATION_CHECKLIST_STEPS, normalizeApplicationProgress, updateApplicationProgress } from './lib/applicationProgress.js';
import { createApplicationWorkspace, normalizeApplicationWorkspace, getApplicationWorkspaceSummary, countApplicationWords, RECOMMENDATION_STATUSES, type ApplicationWorkspaceEntry } from './lib/applicationWorkspace.js';
import { summarizeEligibilityAssessment } from './lib/eligibilitySummary.js';
import { DISCOVERY_CATEGORY_OPTIONS } from './lib/discovery.js';
import { getSelectableDiscoveryCategories, toggleDiscoveryCategory } from './lib/discoveryCategorySelection.js';
import { extractDocumentText } from './lib/documentFileParser.js';
import { createEssayDraftFromDocument, extractTranscriptSuggestions, type TranscriptSuggestion } from './lib/documentImport.js';
import { getProfileReadiness } from './lib/profileReadiness.js';
import { CURRENT_PROFILE_VERSION, LEGACY_PROFILE_KEYS, mergeProfileWithDefaults } from './lib/profileModel.js';
import { buildManualSearchQueries } from './lib/manualSearchQueries.js';
import { validateProfileChanges } from './lib/profileValidation.js';
import { COUNTRY_OPTIONS, US_STATE_OPTIONS, PROFILE_CITIZENSHIP_OPTIONS } from './lib/profileLocations.js';
import { APPLICATION_STATUSES, TRACKER_PRIORITIES, MAX_TRACKER_RECORDS, filterAndSortTrackerRecords, getApplicationStatusCounts, normalizeTrackerRecord, type ApplicationStatus, type TrackerPriority } from './lib/trackerManagement.js';
import { buildTrackerCsvReport } from './lib/trackerReport.js';
import { getDiscoveryErrorMessage } from './lib/discoveryErrors.js';
import { writeJsonStorage, writeJsonStorageBatch } from './lib/browserStorage.js';
import { isExpiredAuthLinkError } from './lib/authCooldown.js';
import { getCloudUser, listCloudScholarships, runLiveScholarshipDiscovery, saveCloudScholarship, signOutCloudUser, deleteCloudAccount, type LiveScholarship, type LiveDiscoverySummary } from './lib/scholarshipApi';
import { hasPendingAuthCallback, hasPendingAuthCallbackError } from './lib/authRedirect.js';
import { PRIVACY_REQUEST_TYPES, PRIVACY_REQUESTER_TYPES, buildPrivacyRequestMailto } from './lib/privacyRequests.js';
import { BrandMark } from './components/BrandMark';
import { workspacePathToTab, workspaceTabToPath } from './lib/workspaceRoutes.js';
import { createVaultSessionLockCoordinator } from './lib/vaultSessionLock.js';
import './App.css';
import './brand-system.css';

// This module is imported only after legal acceptance, verified email sign-in, and local-vault unlock.
const localStorage = vaultStorage;
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

type Status = EligibilityAssessment['status'];
type CriteriaImportance = 'mandatory' | 'preferred';

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
type Scholarship = {
  id: string; name: string; provider: string; award: string; deadline: string; openDate?: string; openDateTimezone?: string;
  deadlineText?: string; deadlineTime?: string; deadlineTimezone?: string; deadlineTimezoneText?: string; deadlineNotPublished?: boolean;
  priorityDeadline?: string; priorityDeadlineText?: string; priorityDeadlineTimezone?: string;
  sourceUrl: string; evidenceUrl?: string; sourceVerified: boolean; evidenceText: string; notes: string;
  awardEvidenceText?: string; awardEvidenceUrl?: string; awardCurrencyBasis?: string; awardBasis?: string;
  /** Transient editor signal; removed before tracker persistence. */
  sourceReviewConfirmed?: boolean;
  sourceAuthority?: string; sourceStatus?: 'verified' | 'needs-review' | 'expired'; lastCheckedDate?: string;
  discoverySourceUrl?: string; discoverySourceLabel?: string; discoveredOn?: string;
  /** Date this tracker record was created; distinct from discovery and sponsor review. */
  recordCreatedAt?: string;
  backendOpportunityId?: string;
  applicationStatus?: ApplicationStatus; priority?: TrackerPriority; tags?: string[]; archived?: boolean;
  submittedAt?: string; decisionDate?: string;
  criteria: EligibilityCriteria;
  criteriaImportance?: Partial<Record<keyof EligibilityCriteria, CriteriaImportance>>;
  criteriaEvidence?: Record<string, { excerpt?: string; sourceUrl?: string }>;
  sourceEvidenceHistory?: Array<{
    recordedAt: string; sourceUrl?: string; evidenceUrl?: string; evidenceText?: string;
    awardEvidenceText?: string; awardEvidenceUrl?: string; awardCurrencyBasis?: string; awardBasis?: string;
    sourceAuthority?: string; lastCheckedDate?: string;
    criteriaEvidence?: Record<string, { excerpt?: string; sourceUrl?: string }>;
  }>;
};


const initialProfile: Profile = {
  // Personal student details are intentionally not bundled into the public client.
  // The user fills these in and they remain in this browser's local storage.
  country: '', state: '', county: '', citizenship: '', age: '', school: '', schoolCountry: '', schoolState: '', grade: '', graduationYear: '',
  plannedCollege: '', plannedCollegeCountry: '', plannedCollegeState: '', plannedMajor: '', collegeStatus: '',
  gpa: '', gpaType: '', classRank: '', rankDetails: '', credits: '',
  act: '', sat: '', apCourses: '', dualCreditCourses: '',
  academicHonors: '', interests: '', activities: '', serviceHours: '', service: '',
  employment: '', certifications: '', languages: '', firstGeneration: '',
  district: '', shhMembershipStatus: '', spanishAchievementStatus: '',
  nseMedalYears: '', nseRegistered2027: '', fourHMembershipStatus: '',
  searchKeywords: '',
  profileVersion: 'profile-general-2026-11-v3',
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
const PROFILE_VERSION = CURRENT_PROFILE_VERSION;
const PROFILE_DRAFT_SAVE_ERROR = 'Your profile draft could not be saved in this browser. Export an encrypted backup before closing or reloading.';
const PROFILE_SAVE_ERROR = 'Your profile could not be saved in this browser. Export an encrypted backup before closing or reloading.';
const mergeProfile = (saved: unknown): Profile =>
  mergeProfileWithDefaults(saved, initialProfile, PROFILE_VERSION) as Profile;
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
const splitKeywords = (value: string) => value.split(/[,;\n]/).map((word) => word.trim()).filter(Boolean);
const formatDate = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not listed';
const formatDeadlineTime = (value?: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
};
const googleSearch = (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;
const createWorkspaceItemId = () => `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function App() {
  const [tab, setTab] = useState(() => workspacePathToTab(window.location.pathname));
  useEffect(() => {
    const targetPath = workspaceTabToPath(tab);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ scholarshipScoutTab: tab }, "", targetPath);
    }
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
    window.scrollTo(0, 0);
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
  const [draft, setDraft] = useState<Scholarship>(emptyScholarship);
  const [notice, setNotice] = useState('');
  const [reliabilityEvents, setReliabilityEvents] = useState(() => readReliabilityEvents());
  const [alert, setAlert] = useState('');
  const vaultLockCoordinatorRef = useRef<ReturnType<typeof createVaultSessionLockCoordinator> | null>(null);
  if (!vaultLockCoordinatorRef.current) {
    vaultLockCoordinatorRef.current = createVaultSessionLockCoordinator({
      flush: flushLocalVault,
      stopAutoRefresh: stopSupabaseAutoRefreshForVaultLock,
      signOut: signOutCloudUser,
      lock: lockLocalVault,
      onLocked: () => window.location.replace('/'),
    });
  }
  const lockWorkspace = useCallback(async (signOutFirst: boolean) => {
    try {
      if (signOutFirst) await vaultLockCoordinatorRef.current?.signOutAndLock();
      else await vaultLockCoordinatorRef.current?.lockAfterSignOut();
      return true;
    } catch (reason) {
      setAlert(reason instanceof Error ? reason.message : 'The local workspace could not be saved and locked. Keep this tab open and retry.');
      return false;
    }
  }, []);
  useEffect(() => {
    let timeout: number | undefined;
    let lockStarted = false;
    const scheduleLock = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (lockStarted) return;
        lockStarted = true;
        void lockWorkspace(true).then((locked) => {
          if (locked) return;
          lockStarted = false;
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
  }, [lockWorkspace]);
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
  const [cloudMessage, setCloudMessage] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
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
  const [prepScholarshipId, setPrepScholarshipId] = useState('');
  const [backupDialogMode, setBackupDialogMode] = useState<'closed' | 'export' | 'import'>('closed');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('');
  const [backupImportFile, setBackupImportFile] = useState<File | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const backupBusyRef = useRef(false);
  backupBusyRef.current = backupBusy;
  const [backupPendingRestore, setBackupPendingRestore] = useState<{ data: unknown; encrypted: boolean } | null>(null);
  const [documentImportBusy, setDocumentImportBusy] = useState(false);
  const [transcriptFileName, setTranscriptFileName] = useState('');
  const [transcriptSuggestions, setTranscriptSuggestions] = useState<TranscriptSuggestion[]>([]);
  const [selectedTranscriptFields, setSelectedTranscriptFields] = useState<Record<string, boolean>>({});
  const [transcriptImportMessage, setTranscriptImportMessage] = useState('');
  const [essayImportMessage, setEssayImportMessage] = useState('');
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
    // Bootstrap only imports App after a verified email sign-in and local vault unlock.
    const hasAuthCallback = hasPendingAuthCallback();
    const hasAuthCallbackError = hasPendingAuthCallbackError();
    let active = true;
    let authEventObserved = false;
    let subscription: { unsubscribe: () => void } | null = null;

    void getSupabaseClient().then((client) => {
      if (!active || !client) return;
      const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        authEventObserved = true;
        const user = session?.user;
        const verifiedEmailUser = Boolean(user && !user.is_anonymous && user.email && user.email_confirmed_at);
        setCloudUser(verifiedEmailUser && user ? { id: user.id, email: user.email } : null);
        if (user && !verifiedEmailUser) {
          setLiveResults([]);
          queueMicrotask(() => { void lockWorkspace(true); });
          return;
        }
        if (session?.user && (event === 'SIGNED_IN' || (hasAuthCallback && event === 'INITIAL_SESSION'))) {
          setTab('Settings');
          setCloudMessage('Email account verified. Your encrypted local workspace is open.');
        } else if (!session?.user && hasAuthCallback && event === 'INITIAL_SESSION') {
          setTab('Settings');
          setCloudMessage('Your email sign-in could not be restored. Reload and request a new sign-in link.');
        }
        if (!session?.user) {
          setLiveResults([]);
          if (event === 'SIGNED_OUT') {
            queueMicrotask(() => { void lockWorkspace(false); });
          }
        }
      });
      subscription = authSubscription;

      // The initial user lookup can resolve after a magic-link SIGNED_IN event.
      // Do not let that older lookup overwrite the newer auth state.
      void client.auth.getUser().then(({ data, error }) => {
        if (active && !authEventObserved) {
          const user = !error ? data.user : null;
          setCloudUser(user && !user.is_anonymous && user.email && user.email_confirmed_at
            ? { id: user.id, email: user.email }
            : null);
          if (hasAuthCallback) {
            setTab('Settings');
            setCloudMessage(user
              ? 'Email account restored. Your encrypted local workspace is open.'
              : 'Email sign-in could not be restored. Reload and request a new sign-in link.');
          }
        }
      });
      if (hasAuthCallbackError) {
        setTab('Settings');
        setCloudMessage('Email sign-in was cancelled or could not be completed. Reload to request a new link.');
      }
    }).catch(() => {
      if (active) {
        if (hasAuthCallback) setTab('Settings');
        setCloudMessage(hasAuthCallback
          ? 'Sign-in could not be completed. Check the provider configuration and try again.'
          : 'Your account session could not be initialized. Reload and try signing in again.');
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [lockWorkspace]);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const code = hashParams.get('error_code') || searchParams.get('error_code') || '';
    const description = hashParams.get('error_description') || searchParams.get('error_description') || '';
    if (isExpiredAuthLinkError(code, description)) {
      setTab('Settings');
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

  const handleTranscriptDocumentImport = async (file?: File) => {
    if (!file || documentImportBusy) return;
    setDocumentImportBusy(true);
    setTranscriptImportMessage('Reading transcript on this device?');
    setTranscriptSuggestions([]);
    try {
      const text = await extractDocumentText(file);
      const suggestions = extractTranscriptSuggestions(text);
      setTranscriptFileName(file.name);
      setTranscriptSuggestions(suggestions);
      setSelectedTranscriptFields(Object.fromEntries(suggestions.map((item) => [item.field, true])));
      setTranscriptImportMessage(suggestions.length
        ? 'Review each extracted value below. Nothing changes in your profile until you apply the selected fields.'
        : 'No supported, clearly labeled GPA, rank, ACT, SAT, or credit values were found. You can enter them manually.');
    } catch (reason) {
      setTranscriptImportMessage(reason instanceof Error ? reason.message : 'The transcript could not be read.');
    } finally {
      setDocumentImportBusy(false);
    }
  };

  const applyTranscriptSuggestions = () => {
    const fieldMap: Record<string, keyof Profile> = {
      gpa: 'gpa', gpaType: 'gpaType', classRank: 'classRank', rankDetails: 'rankDetails',
      act: 'act', sat: 'sat', credits: 'credits',
    };
    const updates: Partial<Profile> = {};
    for (const suggestion of transcriptSuggestions) {
      const field = fieldMap[suggestion.field];
      if (field && selectedTranscriptFields[suggestion.field]) updates[field] = suggestion.value;
    }
    if (Object.keys(updates).length === 0) {
      setTranscriptImportMessage('Select at least one value to apply.');
      return;
    }
    saveProfile({ ...profileDraft, ...updates });
    setTranscriptSuggestions([]);
    setSelectedTranscriptFields({});
    setTranscriptImportMessage('Selected values were added to your profile draft. Confirm official transcript values before relying on eligibility results.');
  };

  const handleEssayDocumentImport = async (file?: File) => {
    if (!file || documentImportBusy) return;
    if (!prepScholarship) {
      setEssayImportMessage('Add a scholarship to your tracker before importing an essay draft.');
      return;
    }
    if (prepWorkspace.essays.length >= 20) {
      setEssayImportMessage('This scholarship workspace already has the maximum of 20 essay drafts.');
      return;
    }
    setDocumentImportBusy(true);
    setEssayImportMessage('Reading essay on this device?');
    try {
      const text = await extractDocumentText(file);
      const imported = createEssayDraftFromDocument(file.name, text);
      const essay = {
        id: createWorkspaceItemId(), title: imported.title,
        prompt: 'Imported from a document. Replace this with the exact sponsor prompt before submitting.',
        wordLimit: 0, draft: imported.draft,
      };
      savePrepWorkspace({ ...prepWorkspace, essays: [...prepWorkspace.essays, essay] });
      setEssayImportMessage('Essay draft imported into this scholarship workspace. Review its title and sponsor prompt before use.');
    } catch (reason) {
      setEssayImportMessage(reason instanceof Error ? reason.message : 'The essay document could not be read.');
    } finally {
      setDocumentImportBusy(false);
    }
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
  const saveApplicationTask = (scholarshipId: string, stepIndex: number, checked: boolean) => {
    const next = updateApplicationProgress(applicationProgress, scholarshipId, stepIndex, checked);
    if (!saveJson('scout-application-progress', next)) {
      setAlert('Checklist progress could not be saved. The previously saved checklist was preserved.');
      return;
    }
    setApplicationProgress(next);
    void flushLocalVault().catch(() => setAlert('Checklist progress is active in this tab, but encrypted browser storage could not finish saving. Keep this tab open and retry before locking or reloading.'));
  };
  const saveApplicationWorkspaceEntry = (scholarshipId: string, entry: ApplicationWorkspaceEntry) => {
    const validIds = items.map((item) => item.id);
    const next = normalizeApplicationWorkspace({ ...applicationWorkspace, [scholarshipId]: entry }, validIds);
    if (!saveJson('scout-application-workspace', next)) {
      setAlert('Application workspace could not be saved. The previously saved workspace was preserved.');
      return;
    }
    setApplicationWorkspace(next);
    void flushLocalVault().catch(() => setAlert('Application workspace is active in this tab, but encrypted browser storage could not finish saving. Keep this tab open and retry before locking or reloading.'));
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
      const backup = buildScoutBackup(profile, items, new Date(), applicationProgress, applicationWorkspace, profileDraft);
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
    const validation = validateScoutBackup(parsed, [...Object.keys(initialProfile), ...LEGACY_PROFILE_KEYS]);
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
    setNotice('Backup imported. Your profile, tracker, checklists, and application workspaces were restored locally.');
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
      if (user.is_anonymous || !user.email || !user.email_confirmed_at) {
        setCloudUser(null);
        setCloudMessage('A verified email account is required. Sign in again to reopen the workspace.');
        return;
      }
      setCloudUser({id:user.id,email:user.email});
      setCloudMessage('Your verified email account is connected in this browser.');
    } catch (error) {
      setCloudMessage('Could not check your account session. Refresh the page and try again.');
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
          await destroyLocalVault({ userId: cloudUser.id });
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
      await destroyLocalVault({ userId: cloudUser?.id });
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
      if (profile.country !== "US") {
        setDiscoveryState('error');
        setCloudMessage("Automated live research currently supports U.S. state targeting only. Use the manual search links for opportunities in other countries.");
        return;
      }
      if (!profile.state.trim() || !profile.graduationYear.trim()) {
        setDiscoveryState('error');
        setCloudMessage("Add your U.S. state and expected graduation year in My Profile before running automated research.");
        return;
      }
      if (selectedDiscoveryCategories.length === 0) {
        setDiscoveryState('error');
        setCloudMessage("Choose at least one discovery category.");
        return;
      }
      // The signed-in workspace calls a rate-limited public Edge Function.
      // Only a validated U.S. state, graduation year, and category IDs are sent.
      setExaResults([]);
      setDiscoverySummary(null);
      setDiscoveryState('loading');
      setCloudMessage('Searching the selected categories. Only your state, graduation year, and category choices are used for matching…');
      const run = await runLiveScholarshipDiscovery(
        { state: profile.state, graduationYear: profile.graduationYear },
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
      { tab: 'Overview', label: 'Overview', description: 'Your scholarship home', icon: 'home' },
    ]},
    { title: 'DISCOVER', items: [
      { tab: 'Discovery', label: 'Find scholarships', description: 'Manual and live scholarship search', icon: 'search' },
    ]},
    { title: 'TRACK', items: [
      { tab: 'Scholarships', label: 'My scholarships', description: 'Awards, deadlines, and applications', icon: 'book', count: true },
    ]},
    { title: 'YOUR SETUP', items: [
      { tab: 'Eligibility filters', label: 'My profile', description: 'Personalize search and eligibility', icon: 'user' },
      { tab: 'Settings', label: 'Settings', description: 'Appearance, privacy, and account', icon: 'settings' },
    ]},
  ];
  const activeNavTab = tab === 'Cloud Search' ? 'Discovery' : tab === 'Application prep' ? 'Scholarships' : tab;
  const selectableDiscoveryCategories = useMemo(() => getSelectableDiscoveryCategories(), []);
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
          <span className="local-pill"><i/> {cloudUser ? 'Signed in' : 'Checking account'}</span>
          <div className="avatar" aria-hidden="true"><BrandMark className="logo-mark avatar-mark"/></div>
        </div>
      </header>
      {!isOnline && <div className="offline-notice" role="status" aria-live="polite"><b>You are offline.</b> The currently unlocked workspace can continue saving locally. A new email sign-in or live scholarship search requires a connection.</div>}

      {tab === 'Overview' && <div className="page">
        <div className="welcome"><div><div className="eyebrow">YOUR SCHOLARSHIP WORKSPACE</div><h1>Make your next opportunity count.</h1><p>Find scholarships that fit your story, verify the details, and keep every application organized.</p></div><button className="primary" onClick={() => setTab('Discovery')}>⌕ Find scholarships</button></div>
        <div className="panel profile-overview-readiness">
          <div className="panel-heading"><div><h3>Profile readiness</h3><p className="muted">Coverage for personalized searches, not an eligibility decision.</p></div><span className="source-tag">{profileReadiness.core.completedCount}/{profileReadiness.core.totalCount} core details</span></div>
          <div className="profile-readiness-meter"><strong>{profileReadiness.core.percent}%</strong><progress max={100} value={profileReadiness.core.percent} aria-label="Core profile completeness"/></div>
          <p className="profile-readiness-caption">{profileReadiness.core.missing.length ? `Add: ${profileReadiness.core.missing.slice(0, 2).map((field) => field.label).join(', ')}${profileReadiness.core.missing.length > 2 ? ', and more' : ''}.` : 'Core location and education details are filled in. Sponsor-specific requirements still need review.'}</p>
          <button className="text-button" onClick={() => setTab('Eligibility filters')}>Review profile details →</button>
        </div>
        <div className="section-head"><div><h2>Your pipeline</h2><p>Eligibility is calculated from the criteria recorded for each scholarship.</p></div><div className="section-actions"><button className="secondary" onClick={exportLocalBackup}>↓ Export encrypted backup</button><label className="secondary backup-import">↑ Import backup<input type="file" accept="application/json,.json" onChange={event=>{void importLocalBackup(event.target.files?.[0]);event.currentTarget.value='';}}/></label><button className="text-button" onClick={() => setTab('Scholarships')}>View all →</button></div></div>
        <div className="stats">{[
          {label:'Tracked scholarships',value:items.filter(item=>!item.archived).length,sub:'Active records in your workspace',icon:'book-stack'},
          {label:'Eligible',value:[...assessments.values()].filter(x=>x.status==='Eligible').length,sub:'All recorded rules passed',icon:'check-circle'},
          {label:'Need information',value:[...assessments.values()].filter(x=>x.status==='Needs information').length,sub:'At least one unknown condition',icon:'info'},
          {label:'Deadline milestones in 7 days',value:deadlinesDueSoon,sub:overdueDeadlines ? `${overdueDeadlines} past due · date-only estimates` : 'Date-only estimates; check sponsor cutoff',icon:'calendar-clock'}
        ].map(x=><div className="stat" key={x.label}><div className="stat-top"><span>{x.label}</span><b><NavGlyph name={x.icon as GlyphName}/></b></div><strong>{x.value}</strong><small>{x.sub}</small></div>)}</div>
        <div className="panel application-pipeline-summary">
          <div className="panel-heading"><div><h3>Application progress</h3><p className="muted">Your manual workflow status, separate from scholarship eligibility.</p></div><button className="text-button" onClick={()=>setTab('Scholarships')}>Manage tracker →</button></div>
          <div className="application-pipeline-grid">
            <div><b>{applicationCounts.inProgress}</b><small>Preparing</small></div>
            <div><b>{applicationCounts.ready}</b><small>Ready</small></div>
            <div><b>{applicationCounts.submitted}</b><small>Submitted</small></div>
            <div><b>{applicationCounts.awarded}</b><small>Awarded</small></div>
          </div>
        </div>
        <div className="panel deadline-watch"><div className="panel-heading"><div><h3>Deadline watch</h3><p className="muted">The nearest dates in your tracker.</p></div><span className="source-tag">{deadlineOverview.length} opening/deadline dates shown</span></div>{deadlineOverview.length ? <div className="deadline-list">{deadlineOverview.map(({item,milestone})=><button type="button" className="deadline-item" key={`${item.id}-${milestone.key}`} onClick={()=>setSelected(item)}><span><b>{item.name}</b><small>{milestone.label} · {item.provider} · {milestone.deadlineText || (milestone.deadline ? formatDate(milestone.deadline) : milestone.key === 'opening' ? formatDate(item.openDate) : 'Deadline not confirmed')}</small></span><DeadlineUrgencyPill deadline={milestone.deadline} timeZone={milestone.timeZone} openDate={item.openDate} openDateTimezone={item.openDateTimezone} deadlineTime={milestone.deadlineTime}/></button>)}</div> : <p className="muted">Add confirmed calendar dates to see them here. Unpublished and unknown deadlines are not guessed.</p>}<small className="deadline-footnote">Date-only countdown. A sponsor-stated time zone is used when recorded; cutoff times are never inferred.</small></div>
        <div className="section-head"><div><h2>Recent discoveries</h2><p>Opportunities with upcoming deadlines that need sponsor-level review.</p></div><button className="text-button" onClick={()=>setTab('Discovery')}>Open discovery →</button></div>
        {candidateAssessments.length ? <div className="candidate-grid">{candidateAssessments.slice(0,2).map(({item,assessment})=><CandidateCard key={item.id} item={item} assessment={assessment} added={tracked(item.id)} onAdd={()=>openAdd(item)}/>)}</div> : <div className="panel recent-discoveries-empty"><b>No recent discoveries yet</b><p>Run a scholarship search to find opportunities that may fit your profile.</p><button type="button" className="secondary" onClick={()=>setTab('Discovery')}>Find scholarships</button></div>}
      </div>}

      {tab === 'Settings' && <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Manage appearance, your required email account, local encryption, backups, and privacy controls. Student records remain in the encrypted local workspace unless you export a backup.</p></div></div>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Encrypted local vault</h3><p className="muted">Your profile, tracker, application drafts, and the authentication session are encrypted separately in this browser. After 15 minutes without activity, Scholarship Scout signs you out and locks the local workspace.</p></div><span className="source-tag">PROTECTED</span></div>
          <button type="button" className="secondary" onClick={() => void lockWorkspace(true)}>Lock workspace and sign out</button>
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
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Email account and sign-in</h3><p className="muted">A verified email account is required to open Scholarship Scout. Your student profile, transcript values, essay drafts, and tracker remain in this browser's encrypted local workspace. Only scholarship sponsor records you explicitly save are stored in your private cloud account.</p></div><span className={`status ${cloudUser ? 'status-eligible' : 'status-not-eligible'}`}>{cloudUser ? 'Email verified' : 'Restoring session'}</span></div>
          <div className="settings-account-state">
            <p><b>{cloudUser ? 'Signed in as' : 'Checking your email session'}</b><span>{cloudUser?.email || 'Your account session is being verified.'}</span></p>
            <p className="cloud-config-note">Your local encryption key is stored separately from your email session. Returning sign-ins on this device reopen the encrypted workspace without asking for its old passphrase. A different device needs an encrypted backup restore.</p>
            <div className="settings-account-actions">
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCheckCloudSession()}>Refresh account status</button>
              <button type="button" className="secondary" disabled={cloudBusy || !cloudUser} onClick={() => void lockWorkspace(true)}>Sign out and lock workspace</button>
            </div>
          </div>
          <div className="settings-account-state">
            <p><b>Encrypted backup and recovery</b><span>Move your local information to another device or restore it after clearing browser data.</span></p>
            <p className="muted">Create a password-protected backup before changing devices or browser profiles. On a new device, sign in with the same email and import the encrypted backup. Email sign-in alone does not transfer local student data.</p>
            <div className="settings-account-actions">
              <button type="button" className="secondary" onClick={exportLocalBackup}>Export encrypted backup</button>
              <label className="secondary backup-import">Import backup<input type="file" accept="application/json,.json" onChange={event=>{void importLocalBackup(event.currentTarget.files?.[0]);event.currentTarget.value='';}}/></label>
            </div>
          </div>
          {!supabaseConfigured && <p className="cloud-config-note" role="status">Email authentication is not configured in this app build. The workspace remains locked until the public Supabase project configuration is restored.</p>}

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
        <div className="filter-intro"><b>Search without sharing profile details</b><p>These suggested Google searches use generic scholarship terms only. They do not include your profile, school, grades, activities, location, or application data. Google receives the generic query and ordinary connection information only when you choose to open a link. Automated live research is separate and sends only your U.S. state, graduation year, and selected category IDs.</p></div>

        <div className="section-head"><div><h2>Run broad scholarship searches</h2><p>Each link uses generic search terms and does not read your profile.</p></div></div>
        <div className="search-grid">{queryGroups.map((item)=><div className="search-card" key={item.title}><div className="search-card-icon">⌕</div><div><b>{item.title}</b><p>{item.query}</p></div><a href={googleSearch(item.query)} target="_blank" rel="noreferrer">Search ↗</a></div>)}</div>
        <div className="section-head"><div><h2>Trusted scholarship sources</h2><p>Use official sources first; some portals may contain third-party listings.</p></div></div>
        <div className="source-grid">{SOURCES.map((source)=><div className="source-card" key={source.name}><span>{source.group}</span><b>{source.name}</b><p>{source.detail}</p><a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a></div>)}</div>
        <div className="safety-note"><b>Scholarship safety check</b><p>Do not pay an application or processing fee to receive a scholarship. Be cautious of guaranteed awards or requests for bank/card details. Verify the sponsor independently before sharing information. <a href="https://consumer.ftc.gov/articles/how-avoid-scholarship-and-financial-aid-scams" target="_blank" rel="noreferrer">FTC guidance ↗</a></p></div>
      </div>}

      {tab === 'Cloud Search' && <div className="page">
        <div className="page-heading"><div><div className="eyebrow">FIND OPPORTUNITIES</div><h1>Find scholarships</h1><p>Research scholarship opportunities using your signed-in account, then review and track promising leads.</p></div></div>
        <WorkspaceSubnav label="Scholarship search method" active={tab} options={[{ value: 'Discovery', label: 'Browse search links' }, { value: 'Cloud Search', label: 'Live web discovery' }]} onChange={setTab}/>
        <div className="cloud-run-row"><div><p className="muted">Your email account is required to use Scholarship Scout. Automated live research currently targets U.S. states and sends only your state, graduation year, and selected research categories. Transcript files, essay drafts, and the rest of your student profile are not sent to the search service.</p></div><button className="primary" disabled={!cloudUser || cloudBusy || !isOnline || !supabaseConfigured || profile.country !== 'US' || !profile.state.trim() || !profile.graduationYear.trim() || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>{cloudBusy ? 'Researching…' : 'Run research'}</button></div>
        <div className="panel discovery-category-picker" role="group" aria-labelledby="research-categories-title">
          <div className="panel-heading"><div><h3 id="research-categories-title">Research categories</h3><p className="muted">Select as many categories as are relevant. All currently deployed categories can be combined in one run.</p></div><span className="source-tag">{selectedDiscoveryCategories.length}/{selectableDiscoveryCategories.length} selected</span></div>
          <div className="discovery-category-grid">{DISCOVERY_CATEGORY_OPTIONS.map((category)=><label className="discovery-category-option" key={category.id}>
            <input type="checkbox" checked={selectedDiscoveryCategories.includes(category.id)} disabled={!selectableDiscoveryCategories.some((option) => option.id === category.id)} onChange={(event)=>setSelectedDiscoveryCategories((current)=>toggleDiscoveryCategory(current, category.id, event.target.checked))}/>
            <span><b>{category.label}</b><small>{category.description}{!selectableDiscoveryCategories.some((option) => option.id === category.id) ? ' Not currently selectable.' : ''}</small></span>
          </label>)}</div>
          {profile.country !== 'US' ? <p className="cloud-config-note">Automated live research currently supports U.S. state targeting only. Use Browse search links for other countries.</p> : !profile.state.trim() || !profile.graduationYear.trim() ? <p className="cloud-config-note">Add your U.S. state and expected graduation year in My Profile before running live research.</p> : null}
        </div>
        {cloudMessage && <p className="cloud-message" role="status" aria-live="polite">{cloudMessage}</p>}
        {discoveryState === 'loading' && <div className="cloud-loading" aria-hidden="true">Researching…</div>}
        {discoveryState === 'empty' && <div className="panel cloud-empty" role="status" aria-live="polite"><b>No scholarship matches were found for this search.</b><p>Your search completed, but no usable public leads matched the selected categories. Try different categories or run the search again.</p><button type="button" className="secondary" onClick={()=>void handleCloudSearch()}>Try search again</button></div>}
        {discoveryState === 'error' && <div className="panel cloud-empty" role="alert"><b>Scholarship search could not be completed.</b><p>Review the search status message above for details, then retry the search.</p><button type="button" className="secondary" disabled={cloudBusy || !isOnline || !supabaseConfigured || !cloudUser || profile.country !== 'US' || !profile.state.trim() || !profile.graduationYear.trim() || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>Retry search</button></div>}
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
        <div className="page-heading"><div><div className="eyebrow">MY SCHOLARSHIPS</div><h1>My scholarships</h1><p>Track saved opportunities, deadlines, source reviews, and your application progress.</p></div><div className="tracker-heading-actions"><button className="secondary" onClick={exportTrackerReport}>↓ Export CSV report</button><button className="primary" onClick={()=>openAdd()}>＋ Add scholarship</button></div></div>
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
        {duplicateSuggestions.length > 0 && <div className="panel duplicate-review"><div className="panel-heading"><div><h3>Duplicate suggestions to review</h3><p className="muted">Exact, strong, and possible title matches with the same sponsor and deadline year. Suggestions only; Scout will not merge or delete records.</p></div><span className="source-tag">{duplicateSuggestions.length} pairs</span></div><div className="duplicate-list">{duplicateSuggestions.slice(0,5).map((pair)=><div className="duplicate-row" key={`${pair.firstId}-${pair.secondId}`}><div className="duplicate-names"><span className="source-tag">{pair.matchLabel}</span><b>{pair.firstName}</b><span>and</span><b>{pair.secondName}</b><small>{pair.sponsor} · Deadline year {pair.deadlineYear} · {pair.titleSimilarity}% title similarity</small><small>{pair.reasons.join(' · ')}</small></div><div className="duplicate-actions"><button className="text-button" onClick={()=>setSelected(items[pair.firstIndex])}>Review first</button><button className="text-button" onClick={()=>setSelected(items[pair.secondIndex])}>Review second</button></div></div>)}</div>{duplicateSuggestions.length > 5 && <small className="deadline-footnote">Showing the five strongest suggestions. The remaining {duplicateSuggestions.length - 5} pairs are also retained for review.</small>}</div>}
        <div className="table-card"><div className="table-title"><b>Tracked opportunities</b><span>{filtered.length} shown · eligibility and application status are tracked separately</span></div>{filtered.length===0 && items.length===0 ? <Empty onAdd={()=>openAdd()}/> : hasFilteredEmptyState ? <FilteredEmpty onClear={clearTrackerFilters}/> : <div className="table-wrap"><table><thead><tr><th>OPPORTUNITY</th><th>AWARD AMOUNT / BASIS</th><th>DEADLINE</th><th>URGENCY</th><th>APPLICATION</th><th>PRIORITY</th><th>ELIGIBILITY</th><th>SOURCE REVIEW</th><th scope="col">DETAILS</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td data-label="Opportunity"><button type="button" className="tracker-open" aria-label={'Review ' + item.name} onClick={()=>setSelected(item)}>{item.name}</button><small>{item.provider}</small>{item.tags?.length ? <small>{item.tags.join(' · ')}</small> : null}</td><td data-label="Award amount / basis"><b>{item.award || 'Amount not recorded'}</b>{item.awardBasis ? <small>{item.awardBasis}</small> : null}{item.awardCurrencyBasis ? <small>{item.awardCurrencyBasis}</small> : null}</td><td data-label="Deadline">{getDeadlineMilestones(item).map((milestone)=><small key={milestone.key}>{milestone.label}: {milestone.deadlineText || (milestone.deadline ? formatDate(milestone.deadline) : milestone.key === "opening" ? formatDate(item.openDate) : "Date not confirmed")}</small>)}</td><td data-label="Urgency">{getDeadlineMilestones(item).map((milestone)=><small key={milestone.key}>{milestone.label}: <DeadlineUrgencyPill deadline={milestone.deadline} timeZone={milestone.timeZone} openDate={item.openDate} openDateTimezone={item.openDateTimezone} deadlineTime={milestone.deadlineTime}/></small>)}</td><td data-label="Application"><ApplicationStatusPill status={item.applicationStatus || 'Not started'}/></td><td data-label="Priority"><PriorityPill priority={item.priority || 'Medium'}/></td><td data-label="Eligibility"><StatusPill status={summarizeEligibilityAssessment(assessments.get(item.id)).status as Status}/></td><td data-label="Source review"><SourceStatusPill item={item}/></td><td data-label="Details"><button type="button" className="secondary tracker-details" aria-label={"Open details for " + item.name} onClick={() => setSelected(item)}>›</button></td></tr>)}</tbody></table></div>}</div>
        <p className="footnote">“Eligible” means every structured rule entered in Scout passed and the official source review was marked complete. It is not an award guarantee; sponsor decisions and unentered requirements may still apply.</p>
      </div>}

      {tab === 'Eligibility filters' && <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">PERSONAL MATCHING PROFILE</div><h1>Your profile</h1><p>Set the location and graduation year used for automated research. Add optional details only when they help evaluate a sponsor's published rules.</p></div></div>
        <div className="filter-intro"><b>What gets used where</b><p>Automated scholarship research sends only your U.S. state, expected graduation year, and selected research categories. Other profile details stay in your encrypted local workspace. Only the relevant fields are used for local eligibility checks or on-device result ordering; other entries are reference notes. Manual search links use generic queries and open only when you choose them.</p></div>
        <div className="panel profile-readiness-panel">
          <div className="panel-heading"><div><h3>Profile readiness</h3><p className="muted">Complete the required research setup first. All matching details below are optional.</p></div><span className="source-tag">{profileReadiness.core.completedCount}/{profileReadiness.core.totalCount} required details</span></div>
          <div className="profile-readiness-meter"><strong>{profileReadiness.core.percent}%</strong><progress max={100} value={profileReadiness.core.percent} aria-label="Required profile completeness"/></div>
          <div className="profile-readiness-columns">
            <div><b>Required for automated research</b><p>{profileReadiness.core.completedCount} of {profileReadiness.core.totalCount} entered</p>{profileReadiness.core.missing.length ? <ul className="profile-readiness-list">{profileReadiness.core.missing.map((field) => <li key={field.key}><b>{field.label}:</b> {field.reason}</li>)}</ul> : <p className="profile-ready-message">Required location and graduation details are present.</p>}</div>
            <div><b>Optional matching details</b><p>{profileReadiness.supporting.completedCount} of {profileReadiness.supporting.totalCount} entered</p>{profileReadiness.supporting.missing.length ? <ul className="profile-readiness-list">{profileReadiness.supporting.missing.slice(0, 5).map((field) => <li key={field.key}><b>{field.label}:</b> {field.reason}</li>)}</ul> : <p className="profile-ready-message">Helpful matching details are filled in.</p>}</div>
          </div>
          <small className="profile-readiness-note">Missing optional details do not block saving or searching. Unknown sponsor requirements remain unknown; Scholarship Scout does not infer citizenship, financial need, memberships, or other qualifications.</small>
          {profile.country && profile.country !== "US" ? <p className="profile-search-hint">Your country is saved in the profile, but automated live research currently supports U.S. state targeting only. Use the manual scholarship links for other countries.</p> : null}
        </div>
        <div className={`profile-storage-state ${profileSaveStatus === 'unavailable' ? 'is-unavailable' : 'is-saved'}`} role="status" aria-live="polite">
          {profileSaveStatus === 'unavailable' ? 'Could not save your latest profile change in this browser. Export an encrypted backup before closing or reloading.' : profileSaveStatus === 'draft' ? 'Your unfinished profile is saved as a draft in this browser\u2019s encrypted vault. Complete the required research setup before running automated research.' : profileSaveStatus === 'saved' ? 'Profile changes saved in this browser\u2019s encrypted vault.' : 'Profile drafts stay in this browser\u2019s encrypted vault.'}
        </div>
        <div className="form-card">
          <div className="form-section">
            <div className="section-title-row"><div><h3>Required research setup</h3><p>These details determine which location and graduating class the automated search targets.</p></div><span className="source-tag">REQUIRED</span></div>
            <div className="form-grid">
              <label className="field"><span className="field-label-row"><span>Country of residence</span><ProfileRequirement kind="required"/></span><select required value={profileDraft.country} onChange={e=>saveProfile({...profileDraft,country:e.target.value,state:e.target.value==='US'?profileDraft.state:''})}><option value="">Select country</option>{COUNTRY_OPTIONS.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
              <label className="field"><span className="field-label-row"><span>State of residence</span><ProfileRequirement kind={profileDraft.country==='US'?'required':'optional'}/></span><select required={profileDraft.country==='US'} aria-required={profileDraft.country==='US'} value={profileDraft.state} disabled={profileDraft.country!=='US'} onChange={e=>saveProfile({...profileDraft,state:e.target.value})}><option value="">Select state or territory</option>{US_STATE_OPTIONS.map(([code,name])=><option key={code} value={name}>{name}</option>)}</select><small className="field-help">{profileDraft.country==='US'?'Required for U.S. automated scholarship research.':'Not required for non-U.S. residence. Automated live research currently supports U.S. state targeting only.'}</small></label>
              <Field label="Expected graduation year" value={profileDraft.graduationYear} onChange={v=>saveProfile({...profileDraft,graduationYear:v})} type="number" min={1900} max={2100} step={1} inputMode="numeric" required requirement="required" placeholder="e.g. 2027"/>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title-row"><div><h3>Location and school details</h3><p>Optional details for scholarship rules limited by county, school, district, or college location.</p></div><ProfileRequirement kind="optional"/></div>
            <div className="form-grid">
              <Field label="County" value={profileDraft.county} onChange={v=>saveProfile({...profileDraft,county:v})} requirement="optional"/>
              <label className="field"><span className="field-label-row"><span>Citizenship or eligible status</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.citizenship} onChange={e=>saveProfile({...profileDraft,citizenship:e.target.value})}>{PROFILE_CITIZENSHIP_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <Field label="School name (local result ordering)" value={profileDraft.school} onChange={v=>saveProfile({...profileDraft,school:v})} requirement="optional" placeholder="Enter your school name" helpText="Used only on this device to prioritize returned results that mention your school. It is not included in the search request."/>
              <label className="field"><span className="field-label-row"><span>Country where your school is located (for U.S. state selection)</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.schoolCountry} onChange={e=>saveProfile({...profileDraft,schoolCountry:e.target.value,schoolState:e.target.value==='US'?profileDraft.schoolState:''})}><option value="">Select country</option>{COUNTRY_OPTIONS.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
              <label className="field"><span className="field-label-row"><span>State where your school is located</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.schoolState} disabled={profileDraft.schoolCountry!=='US'} onChange={e=>saveProfile({...profileDraft,schoolState:e.target.value})}><option value="">Select state or territory</option>{US_STATE_OPTIONS.map(([code,name])=><option key={code} value={name}>{name}</option>)}</select></label>
              <Field label="School district" value={profileDraft.district} onChange={v=>saveProfile({...profileDraft,district:v})} requirement="optional" placeholder="Enter your school district" helpText="Used only when a saved scholarship specifies a school-district requirement. It is not sent to automated research."/>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title-row"><div><h3>Education and enrollment</h3><p>Optional details used when a sponsor sets an education-level, age, college destination, or enrollment requirement.</p></div><ProfileRequirement kind="optional"/></div>
            <div className="form-grid">
              <Field label="Age (whole years)" value={profileDraft.age} onChange={v=>saveProfile({...profileDraft,age:v})} type="number" min={0} max={120} step={1} inputMode="numeric" requirement="optional"/>
              <label className="field"><span className="field-label-row"><span>Current education level</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.grade} onChange={e=>saveProfile({...profileDraft,grade:e.target.value})}><option value="">Not provided</option><option>High school freshman (grade 9)</option><option>High school sophomore (grade 10)</option><option>High school junior (grade 11)</option><option>High school senior (grade 12)</option><option>College undergraduate</option><option>College freshman</option><option>College sophomore</option><option>College junior</option><option>College senior</option><option>Graduate student</option><option>Not currently enrolled</option><option>Other / unsure</option></select></label>
              <Field label="Planned college or university" value={profileDraft.plannedCollege} onChange={v=>saveProfile({...profileDraft,plannedCollege:v})} requirement="optional" helpText="Compared locally when a saved scholarship specifies a named intended institution. The state field is used for sponsor location rules."/>
              <label className="field"><span className="field-label-row"><span>Country where your intended college is located (for U.S. state selection)</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.plannedCollegeCountry} onChange={e=>saveProfile({...profileDraft,plannedCollegeCountry:e.target.value,plannedCollegeState:e.target.value==='US'?profileDraft.plannedCollegeState:''})}><option value="">Select country</option>{COUNTRY_OPTIONS.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
              <label className="field"><span className="field-label-row"><span>State where your intended college is located</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.plannedCollegeState} disabled={profileDraft.plannedCollegeCountry!=='US'} onChange={e=>saveProfile({...profileDraft,plannedCollegeState:e.target.value})}><option value="">Select state or territory</option>{US_STATE_OPTIONS.map(([code,name])=><option key={code} value={name}>{name}</option>)}</select></label>
              <Field label="Intended major" value={profileDraft.plannedMajor} onChange={v=>saveProfile({...profileDraft,plannedMajor:v})} requirement="optional"/>
              <label className="field"><span className="field-label-row"><span>College enrollment status</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.collegeStatus} onChange={e=>saveProfile({...profileDraft,collegeStatus:e.target.value})}><option value="">Not provided</option><option value="College planned - not confirmed">College planned - not confirmed</option><option value="Full-time enrolled">Full-time enrolled</option><option value="Part-time enrolled">Part-time enrolled</option><option value="Not enrolled">Not enrolled</option><option value="Unsure - needs review">Unsure - needs review</option></select></label>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title-row"><div><h3>Academic record</h3><p>Optional transcript values. Imported suggestions must be reviewed before they are applied. Coursework and honors help order returned results locally; they are not hard eligibility rules.</p></div><span className="source-tag">OPTIONAL</span></div>
            <div className="document-import-card"><div><b>Import a transcript</b><p>Upload a PDF, Word (.docx), or text file. Scholarship Scout suggests labeled GPA, class rank, ACT, SAT, and credit values for review.</p><small>Processed in this browser only. No document is uploaded to the server. Scanned/image-only PDFs are not supported.</small></div><label className="secondary document-upload-label">{documentImportBusy ? 'Reading...' : 'Choose transcript'}<input type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={documentImportBusy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void handleTranscriptDocumentImport(file);}}/></label></div>
            {transcriptImportMessage && <p className="cloud-message" role="status" aria-live="polite">{transcriptImportMessage}</p>}
            {transcriptSuggestions.length > 0 && <div className="transcript-import-review"><div className="section-title-row"><div><b>Review extracted values</b><p>Confirm these against the original transcript before applying them.</p></div><span className="source-tag">{transcriptFileName}</span></div>{transcriptSuggestions.map(item=><label className="check-row" key={item.field}><input type="checkbox" checked={Boolean(selectedTranscriptFields[item.field])} onChange={event=>setSelectedTranscriptFields(current=>({...current,[item.field]:event.target.checked}))}/><span><b>{item.label}</b><small>{item.value}</small></span></label>)}<button type="button" className="secondary" onClick={applyTranscriptSuggestions}>Apply selected values to profile</button></div>}
            <div className="form-grid">
              <Field label="GPA (0-5 scale)" value={profileDraft.gpa} onChange={v=>saveProfile({...profileDraft,gpa:v})} type="number" min={0} max={5} step="any" inputMode="decimal" requirement="optional" helpText="Sponsor GPA rules currently support comparable values from 0 to 5.0. Leave this blank when your school's scale cannot be compared reliably."/>
              <Field label="GPA scale or type" value={profileDraft.gpaType} onChange={v=>saveProfile({...profileDraft,gpaType:v})} requirement="optional" placeholder="e.g. Unweighted 4.0 scale"/>
              <Field label="Official class rank" value={profileDraft.classRank} onChange={v=>saveProfile({...profileDraft,classRank:v})} requirement="optional" placeholder="e.g. Top 10% or 12 of 300"/>
              <Field label="Credits earned (reference only)" value={profileDraft.credits} onChange={v=>saveProfile({...profileDraft,credits:v})} type="number" min={0} max={500} step="any" inputMode="decimal" requirement="optional"/>
              <Field label="ACT composite" value={profileDraft.act} onChange={v=>saveProfile({...profileDraft,act:v})} type="number" min={1} max={36} step={1} inputMode="numeric" requirement="optional"/>
              <Field label="SAT score" value={profileDraft.sat} onChange={v=>saveProfile({...profileDraft,sat:v})} type="number" min={400} max={1600} step={10} inputMode="numeric" requirement="optional"/>
              <Field label="Rank source and date / clarification (reference only)" value={profileDraft.rankDetails} onChange={v=>saveProfile({...profileDraft,rankDetails:v})} requirement="optional" helpText="Stored as supporting notes; the official class-rank field is the value used for sponsor thresholds."/>
            </div>
            <p className="profile-search-hint">GPA, class rank, ACT, and SAT can be compared when a sponsor publishes a matching rule. Credits are retained for reference only. AP courses, dual-credit courses, and academic honors may prioritize result ordering on this device, but they do not establish eligibility.</p>
            <details className="advanced-profile-fields"><summary>Coursework and honors for local result ordering (optional)</summary><div className="form-grid">
              <label className="field"><span className="field-label-row"><span>AP courses</span><ProfileRequirement kind="optional"/></span><textarea value={profileDraft.apCourses} onChange={e=>saveProfile({...profileDraft,apCourses:e.target.value})}/></label>
              <label className="field"><span className="field-label-row"><span>Dual-credit courses</span><ProfileRequirement kind="optional"/></span><textarea value={profileDraft.dualCreditCourses} onChange={e=>saveProfile({...profileDraft,dualCreditCourses:e.target.value})}/></label>
              <label className="field"><span className="field-label-row"><span>Academic honors and distinctions</span><ProfileRequirement kind="optional"/></span><textarea value={profileDraft.academicHonors} onChange={e=>saveProfile({...profileDraft,academicHonors:e.target.value})}/></label>
            </div></details>
          </div>

          <div className="form-section">
            <div className="section-title-row"><div><h3>Activities, skills and experience</h3><p>Activities support sponsor-specific membership checks. Service hours can be compared with a sponsor's numeric minimum. Activities, service experience, employment, languages, certifications, and interests can also prioritize results locally on this device.</p></div><ProfileRequirement kind="optional"/></div>
            <div className="form-grid">
              <Field label="Academic and career interests" value={profileDraft.interests} onChange={v=>saveProfile({...profileDraft,interests:v})} requirement="optional"/>
              <Field label="Languages (local result ordering)" value={profileDraft.languages} onChange={v=>saveProfile({...profileDraft,languages:v})} requirement="optional" helpText="Used only on this device to prioritize relevant result titles and excerpts. Not included in the search request."/>
              <Field label="Employment experience (local result ordering)" value={profileDraft.employment} onChange={v=>saveProfile({...profileDraft,employment:v})} requirement="optional" helpText="Used only on this device to prioritize relevant result titles and excerpts. Not included in the search request."/>
              <Field label="Community service hours" value={profileDraft.serviceHours} onChange={v=>saveProfile({...profileDraft,serviceHours:v})} type="number" min={0} max={1000000} step="any" inputMode="decimal" requirement="optional" helpText="Used when a saved scholarship specifies a minimum service-hour requirement."/>
            </div>
            <label className="field"><span className="field-label-row"><span>Activities and organization memberships</span><ProfileRequirement kind="optional"/></span><textarea value={profileDraft.activities} onChange={e=>saveProfile({...profileDraft,activities:e.target.value})} placeholder="Separate entries with commas or new lines. For sponsor membership checks, include the organization name and whether membership is in good standing."/></label>
            <label className="field"><span className="field-label-row"><span>Service and volunteer experience (local result ordering)</span><ProfileRequirement kind="optional"/></span><textarea value={profileDraft.service} onChange={e=>saveProfile({...profileDraft,service:e.target.value})}/><small className="field-help">Used only on this device to prioritize relevant result titles and excerpts. The numeric Community service hours field is used for sponsor minimum-hour checks.</small></label>
            <Field label="Certifications (local result ordering)" value={profileDraft.certifications} onChange={v=>saveProfile({...profileDraft,certifications:v})} requirement="optional" helpText="Used only on this device to prioritize relevant result titles and excerpts. Not included in the search request."/>
          </div>

          <div className="form-section">
            <div className="section-title-row"><div><h3>Sponsor-specific qualifications</h3><p>Optional. Only confirm these when you know you meet the exact sponsor definition. Unconfirmed answers stay unknown.</p></div><span className="source-tag">OPTIONAL MATCHING DETAILS</span></div>
            <details className="advanced-profile-fields"><summary>Organization memberships and achievement records</summary>
              <div className="form-grid">
                <label className="field"><span className="field-label-row"><span>First-generation college student status</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.firstGeneration} onChange={e=>saveProfile({...profileDraft,firstGeneration:e.target.value})}><option value="">Not recorded</option><option value="Yes - confirmed">Yes - confirmed by the sponsor's definition</option><option value="No">No</option><option value="Unsure - needs review">Unsure - needs review</option></select></label>
                <label className="field"><span className="field-label-row"><span>SHH membership (Sociedad Honoraria Hispanica)</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.shhMembershipStatus} onChange={e=>saveProfile({...profileDraft,shhMembershipStatus:e.target.value})}><option value="">Not recorded</option><option value="Confirmed member">Confirmed member</option><option value="No">Not a member</option><option value="Unsure - needs review">Unsure - needs review</option></select></label>
                <label className="field"><span className="field-label-row"><span>Spanish achievement</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.spanishAchievementStatus} onChange={e=>saveProfile({...profileDraft,spanishAchievementStatus:e.target.value})}><option value="">Not recorded</option><option value="Confirmed achievement">Confirmed achievement</option><option value="No">No qualifying achievement</option><option value="Unsure - needs review">Unsure - needs review</option></select></label>
                <label className="field"><span className="field-label-row"><span>2026/27 NSE/NPE participation</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.nseRegistered2027} onChange={e=>saveProfile({...profileDraft,nseRegistered2027:e.target.value})}><option value="">Not recorded</option><option value="Confirmed registered">Confirmed registration / participation</option><option value="No">Not participating</option><option value="Unsure - needs review">Unsure - needs review</option></select></label>
                <label className="field"><span className="field-label-row"><span>4-H membership</span><ProfileRequirement kind="optional"/></span><select value={profileDraft.fourHMembershipStatus} onChange={e=>saveProfile({...profileDraft,fourHMembershipStatus:e.target.value})}><option value="">Not recorded</option><option value="Confirmed member">Confirmed member</option><option value="No">Not a member</option><option value="Unsure - needs review">Unsure - needs review</option></select></label>
                <Field label="NSE/NPE medal years" value={profileDraft.nseMedalYears} onChange={v=>saveProfile({...profileDraft,nseMedalYears:v})} requirement="optional" placeholder="e.g. 2025, 2026"/>
              </div>
              <small className="profile-search-hint">These attributes are checked only when a saved scholarship has the corresponding sponsor requirement. A confirmed selection is not independent proof; review the sponsor's definition and supporting documentation before relying on a match.</small>
            </details>
          </div>

          <div className="form-section">
            <div className="section-title-row"><div><h3>Private result-ranking keywords</h3><p>Optional topic phrases used only inside this browser to order returned live results by relevance.</p></div><ProfileRequirement kind="optional"/></div>
            <label className="field"><span className="field-label-row"><span>Topics to prioritize locally</span><ProfileRequirement kind="optional"/></span><textarea value={profileDraft.searchKeywords} onChange={e=>saveProfile({...profileDraft,searchKeywords:e.target.value})} placeholder="e.g. anthropology, public history, first-generation student, community leadership"/></label>
            <p className="profile-search-hint">These terms are compared against returned titles and excerpts after the search finishes. They are not included in the search request. Do not enter names, contact details, or other private identifiers.</p>
          </div>
          <div className="privacy-note"><span><b>Privacy-conscious profile.</b><br/>Your profile is stored in this device's encrypted local vault. Automated research receives only your U.S. state, expected graduation year, and selected research category IDs. School details, citizenship, grades, memberships, activities, coursework, employment, languages, custom ranking keywords, transcripts, and essay drafts are not included in that request. Some optional fields are compared against returned titles and excerpts locally on this device only.</span></div>
        </div>
      </div>}

      {tab === 'Application prep' && <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">APPLICATION PREPARATION</div><h1>My scholarships</h1><p>Prepare each saved opportunity, organize required materials, and keep your drafts together on this device.</p></div></div>
        <WorkspaceSubnav label="Scholarship management view" active={tab} options={[{ value: 'Scholarships', label: 'Tracker' }, { value: 'Application prep', label: 'Application preparation' }]} onChange={setTab}/>
        {!prepScholarship ? <div className="panel prep-panel"><h2>Start an application workspace</h2><p className="muted">Add a scholarship to your tracker before preparing its application.</p><button className="secondary" onClick={()=>setTab('Scholarships')}>Open scholarship tracker</button></div> : <>
          <section className="panel prep-panel">
            <div className="prep-icon">✎</div><h2>{prepScholarship.name}</h2><p>{prepScholarship.provider} · {prepScholarship.award || 'Award amount not listed'} · Deadline: {prepScholarship.deadline ? formatDate(prepScholarship.deadline) : prepScholarship.deadlineText || 'Not listed'}</p>
            <label className="field"><span>Scholarship workspace</span><select value={prepScholarship.id} onChange={event=>setPrepScholarshipId(event.target.value)}>{items.map(item=><option key={item.id} value={item.id}>{item.name} — {item.provider}</option>)}</select></label>
            <div className="application-progress"><div><b>{prepSummary.completed} of {prepSummary.total} preparation items complete</b><strong>{prepSummary.percent}%</strong></div><progress max={100} value={prepSummary.percent}/><small>{prepSummary.requiredDocuments} required documents · {prepSummary.readyDocuments} ready · {prepSummary.pendingRecommendations} recommendation requests pending · {prepSummary.overLimitEssays} essays over word limit</small></div>
            <h3>Core preparation checklist</h3>
            {APPLICATION_CHECKLIST_STEPS.map((step,index)=><label className="check-row" key={step}><input type="checkbox" checked={Boolean(applicationProgress[prepScholarship.id]?.[index])} onChange={event=>saveApplicationTask(prepScholarship.id,index,event.target.checked)}/><span>{step}</span></label>)}
            <small className="deadline-footnote">Progress, prompts, draft text, recommendation details, and document notes are stored locally in this browser and included only in your encrypted backup. They are not sent to cloud sponsor records.</small>
          </section>
          <div className="prep-section-grid">
            <section className="panel prep-section">
              <div className="prep-section-heading"><div><h3>Custom checklist</h3><p>Add steps specific to this scholarship.</p></div><span className="source-tag">{prepWorkspace.customTasks.filter(task=>task.completed).length}/{prepWorkspace.customTasks.length}</span></div>
              <form className="prep-add-form" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const title=String(data.get('title')??'').trim();if(!title)return;savePrepWorkspace({...prepWorkspace,customTasks:[...prepWorkspace.customTasks,{id:createWorkspaceItemId(),title,completed:false,dueDate:String(data.get('dueDate')??'')}]});form.reset();}}>
                <input name="title" aria-label="New checklist task" placeholder="Add a task…" maxLength={160} required/><input type="date" name="dueDate" aria-label="Task due date"/><button type="submit" className="secondary">Add task</button>
              </form>
              {prepWorkspace.customTasks.length===0?<p className="muted">No custom tasks yet.</p>:prepWorkspace.customTasks.map(task=><div className="prep-list-row" key={task.id}><label className="check-row"><input type="checkbox" checked={task.completed} onChange={event=>savePrepWorkspace({...prepWorkspace,customTasks:prepWorkspace.customTasks.map(row=>row.id===task.id?{...row,completed:event.target.checked}:row)})}/><span>{task.title}<small>{task.dueDate ? 'Due ' + formatDate(task.dueDate) : 'No due date'}</small></span></label><button type="button" className="text-button" onClick={()=>savePrepWorkspace({...prepWorkspace,customTasks:prepWorkspace.customTasks.filter(row=>row.id!==task.id)})}>Remove</button></div>)}
            </section>
            <section className="panel prep-section">
              <div className="prep-section-heading"><div><h3>Essay prompts and drafts</h3><p>Keep the exact prompt and check your word count.</p></div><span className="source-tag">{prepWorkspace.essays.length} prompts</span></div>
              <form className="prep-add-form" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const title=String(data.get('title')??'').trim();if(!title)return;const limit=Number(data.get('wordLimit')??0);savePrepWorkspace({...prepWorkspace,essays:[...prepWorkspace.essays,{id:createWorkspaceItemId(),title,prompt:String(data.get('prompt')??''),wordLimit:Number.isInteger(limit)&&limit>0?Math.min(limit,10000):0,draft:''}]});form.reset();}}>
                <input name="title" aria-label="Essay title" placeholder="Prompt title…" maxLength={160} required/><input name="wordLimit" type="number" min="1" max="10000" aria-label="Word limit" placeholder="Word limit"/><button type="submit" className="secondary">Add prompt</button>
              </form>
              <div className="document-import-card"><div><b>Import an existing essay draft</b><p>Bring in a personal statement or scholarship essay from PDF, Word (.docx), or text. It is saved to this scholarship's encrypted local workspace; it is not sent to the sponsor or search service.</p><small>Maximum 10 MB. Scanned/image-only PDFs are not supported.</small></div><label className="secondary document-upload-label">{documentImportBusy ? 'Reading...' : 'Upload essay'}<input type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={documentImportBusy || prepWorkspace.essays.length >= 20} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void handleEssayDocumentImport(file);}}/></label></div>
              {essayImportMessage && <p className="cloud-message" role="status" aria-live="polite">{essayImportMessage}</p>}
              {prepWorkspace.essays.length===0?<p className="muted">No essay prompts saved yet.</p>:prepWorkspace.essays.map(essay=>{const words=countApplicationWords(essay.draft);const over=essay.wordLimit>0&&words>essay.wordLimit;return <div className="prep-entry-card" key={essay.id}>
                <div className="prep-section-heading"><b>{essay.title}</b><button type="button" className="text-button" onClick={()=>savePrepWorkspace({...prepWorkspace,essays:prepWorkspace.essays.filter(row=>row.id!==essay.id)})}>Remove</button></div>
                <label className="field"><span>Essay title</span><input value={essay.title} maxLength={160} onChange={event=>savePrepWorkspace({...prepWorkspace,essays:prepWorkspace.essays.map(row=>row.id===essay.id?{...row,title:event.target.value}:row)})}/></label>
                <label className="field"><span>Exact sponsor prompt</span><textarea rows={3} maxLength={5000} value={essay.prompt} onChange={event=>savePrepWorkspace({...prepWorkspace,essays:prepWorkspace.essays.map(row=>row.id===essay.id?{...row,prompt:event.target.value}:row)})}/></label>
                <label className="field"><span>Word limit (leave blank when there is none)</span><input type="number" min="1" max="10000" value={essay.wordLimit||''} onChange={event=>{const value=Number(event.target.value);savePrepWorkspace({...prepWorkspace,essays:prepWorkspace.essays.map(row=>row.id===essay.id?{...row,wordLimit:Number.isInteger(value)&&value>0?Math.min(value,10000):0}:row)})}}/></label>
                <label className="field"><span>Draft — keep your own voice and experiences</span><textarea rows={6} maxLength={20000} value={essay.draft} onChange={event=>savePrepWorkspace({...prepWorkspace,essays:prepWorkspace.essays.map(row=>row.id===essay.id?{...row,draft:event.target.value}:row)})}/></label>
                <small className={over?'prep-word-count is-over':'prep-word-count'}>{words} words{essay.wordLimit>0?' / ' + essay.wordLimit:' · no word limit entered'}{over?' · over limit':''}</small>
              </div>;})}
            </section>
            <section className="panel prep-section">
              <div className="prep-section-heading"><div><h3>Recommendation requests</h3><p>Track who you asked and when a letter is due.</p></div><span className="source-tag">{prepWorkspace.recommenders.filter(person=>person.status==='Received').length}/{prepWorkspace.recommenders.length} received</span></div>
              <form className="prep-add-form" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const name=String(data.get('name')??'').trim();if(!name)return;savePrepWorkspace({...prepWorkspace,recommenders:[...prepWorkspace.recommenders,{id:createWorkspaceItemId(),name,role:String(data.get('role')??''),status:'Not requested',requestedAt:'',dueDate:String(data.get('dueDate')??''),receivedAt:'',notes:''}]});form.reset();}}>
                <input name="name" aria-label="Recommender name" placeholder="Name…" maxLength={120} required/><input name="role" aria-label="Relationship or role" placeholder="Teacher, counselor…" maxLength={120}/><input type="date" name="dueDate" aria-label="Recommendation due date"/><button type="submit" className="secondary">Add person</button>
              </form>
              {prepWorkspace.recommenders.length===0?<p className="muted">No recommendation requests added.</p>:prepWorkspace.recommenders.map(person=><div className="prep-entry-card" key={person.id}>
                <div className="prep-section-heading"><b>{person.name}</b><button type="button" className="text-button" onClick={()=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.filter(row=>row.id!==person.id)})}>Remove</button></div>
                <div className="form-grid"><label className="field"><span>Name</span><input value={person.name} maxLength={120} onChange={event=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.map(row=>row.id===person.id?{...row,name:event.target.value}:row)})}/></label><label className="field"><span>Role</span><input value={person.role} maxLength={120} onChange={event=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.map(row=>row.id===person.id?{...row,role:event.target.value}:row)})}/></label><label className="field"><span>Status</span><select value={person.status} onChange={event=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.map(row=>row.id===person.id?{...row,status:event.target.value as typeof person.status}:row)})}>{RECOMMENDATION_STATUSES.map(status=><option key={status}>{status}</option>)}</select></label><label className="field"><span>Requested on</span><input type="date" value={person.requestedAt} onChange={event=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.map(row=>row.id===person.id?{...row,requestedAt:event.target.value}:row)})}/></label><label className="field"><span>Due date</span><input type="date" value={person.dueDate} onChange={event=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.map(row=>row.id===person.id?{...row,dueDate:event.target.value}:row)})}/></label><label className="field"><span>Received on</span><input type="date" value={person.receivedAt} onChange={event=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.map(row=>row.id===person.id?{...row,receivedAt:event.target.value}:row)})}/></label></div>
                <label className="field"><span>Notes</span><textarea rows={2} maxLength={1000} value={person.notes} onChange={event=>savePrepWorkspace({...prepWorkspace,recommenders:prepWorkspace.recommenders.map(row=>row.id===person.id?{...row,notes:event.target.value}:row)})}/></label>
              </div>)}
            </section>
            <section className="panel prep-section">
              <div className="prep-section-heading"><div><h3>Required documents and deadlines</h3><p>Choose which suggested materials this sponsor actually requires.</p></div><span className="source-tag">{prepSummary.readyDocuments}/{prepSummary.requiredDocuments} ready</span></div>
              <form className="prep-add-form" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const title=String(data.get('title')??'').trim();if(!title)return;savePrepWorkspace({...prepWorkspace,documents:[...prepWorkspace.documents,{id:createWorkspaceItemId(),title,required:data.get('required')==='on',ready:false,dueDate:String(data.get('dueDate')??''),notes:''}]});form.reset();}}>
                <input name="title" aria-label="Document name" placeholder="Add a document…" maxLength={160} required/><input type="date" name="dueDate" aria-label="Document due date"/><label className="check-field"><input type="checkbox" name="required" defaultChecked/><span>Required</span></label><button type="submit" className="secondary">Add document</button>
              </form>
              {prepWorkspace.documents.length===0?<p className="muted">No document rows. Add the materials listed by the sponsor.</p>:prepWorkspace.documents.map(document=><div className="prep-document-row" key={document.id}>
                <div className="prep-document-title"><b>{document.title}</b><button type="button" className="text-button" onClick={()=>savePrepWorkspace({...prepWorkspace,documents:prepWorkspace.documents.filter(row=>row.id!==document.id)})}>Remove</button></div>
                <div className="prep-document-controls"><label className="check-field"><input type="checkbox" checked={document.required} onChange={event=>savePrepWorkspace({...prepWorkspace,documents:prepWorkspace.documents.map(row=>row.id===document.id?{...row,required:event.target.checked}:row)})}/><span>Required</span></label><label className="check-field"><input type="checkbox" checked={document.ready} onChange={event=>savePrepWorkspace({...prepWorkspace,documents:prepWorkspace.documents.map(row=>row.id===document.id?{...row,ready:event.target.checked}:row)})}/><span>Ready</span></label><label className="field"><span>Due date</span><input type="date" value={document.dueDate} onChange={event=>savePrepWorkspace({...prepWorkspace,documents:prepWorkspace.documents.map(row=>row.id===document.id?{...row,dueDate:event.target.value}:row)})}/></label></div>
                <label className="field"><span>Notes</span><input maxLength={1000} value={document.notes} onChange={event=>savePrepWorkspace({...prepWorkspace,documents:prepWorkspace.documents.map(row=>row.id===document.id?{...row,notes:event.target.value}:row)})}/></label>
              </div>)}
              <small className="deadline-footnote">Suggested materials are not assumed to be required. Confirm the exact document list and due dates on the sponsor's official application page.</small>
            </section>
            <section className="panel prep-section">
              <div className="prep-section-heading"><div><h3>Final application review</h3><p>Complete this check before recording a submission.</p></div></div>
              {prepWorkspace.finalReview.map(item=><label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={event=>savePrepWorkspace({...prepWorkspace,finalReview:prepWorkspace.finalReview.map(row=>row.id===item.id?{...row,done:event.target.checked}:row)})}/><span>{item.label}</span></label>)}
            </section>
            <section className="panel prep-section prep-submission">
              <div className="prep-section-heading"><div><h3>Submission</h3><p>Scholarship Scout does not submit applications for you.</p></div></div>
              {!['Submitted','Awarded','Rejected'].includes(prepScholarship.applicationStatus||'Not started') && <button type="button" className="primary" onClick={markPrepScholarshipSubmitted}>Record as submitted</button>}
              <small className="deadline-footnote">Submission status and decision dates are maintained in the scholarship tracker.</small>
            </section>
          </div>
        </>}

      </div>}

      <footer className="page-footer">
        <div>Scholarship Scout <span>·</span> Personal scholarship assistant</div>
      </footer>
    </main>

    {showAdd && <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="add-dialog-title" tabIndex={-1}>
      <div className="modal-head"><div><div className="eyebrow">{editingId ? 'EDIT OPPORTUNITY' : 'NEW OPPORTUNITY'}</div><h2 id="add-dialog-title">{editingId ? 'Update scholarship rules' : 'Add scholarship rules'}</h2></div><button type="button" className="close" aria-label="Close scholarship form" onClick={()=>setShowAdd(false)}>×</button></div>
      <p className="muted">Enter the sponsor’s mandatory criteria. Scout will compare these structured rules with your profile; it will not guess missing conditions from promotional text.</p>
      <form id="scholarship-editor-form" onSubmit={event => { event.preventDefault(); add(); }} onInvalidCapture={() => setShowAddValidation(true)}>
      <div className="modal-fields">
        <Field id="scholarship-name" label="Scholarship name *" value={draft.name} onChange={v=>setDraft({...draft,name:v})} required error={showAddValidation && !draft.name.trim() ? 'Enter a scholarship name.' : undefined}/><Field id="scholarship-provider" label="Provider *" value={draft.provider} onChange={v=>setDraft({...draft,provider:v})} required error={showAddValidation && !draft.provider.trim() ? 'Enter the scholarship provider.' : undefined}/>
        <div className="form-grid"><Field label="Award amount / details (exact sponsor wording)" value={draft.award} onChange={v=>setDraft({...draft,award:v})} placeholder="Copy the amount and qualifiers as published"/><Field label="Application opening date (only if confirmed)" value={draft.openDate || ""} onChange={v=>setDraft({...draft,openDate:v})} type="date"/><Field label="Opening date time zone (only if stated)" value={draft.openDateTimezone || ""} onChange={v=>setDraft({...draft,openDateTimezone:v})} placeholder="e.g. America/Chicago"/><Field label="Priority deadline date" value={draft.priorityDeadline || ""} onChange={v=>setDraft({...draft,priorityDeadline:v})} type="date"/><Field label="Final deadline date" value={draft.deadline} onChange={v=>setDraft({...draft,deadline:v})} type="date"/></div>
        <label className="field"><span>Exact public sponsor excerpt supporting the award</span><textarea value={draft.awardEvidenceText || ''} onChange={e=>setDraft({...draft,awardEvidenceText:e.target.value})} placeholder="Copy the sentence or table text that states the award amount and conditions."/></label>
        <Field label="Exact official page URL for the award excerpt" value={draft.awardEvidenceUrl || ''} onChange={v=>setDraft({...draft,awardEvidenceUrl:v})} placeholder="https://official-sponsor.example/award-rules#section"/>
        <div className="form-grid"><Field label="Currency wording (only when explicitly stated)" value={draft.awardCurrencyBasis || ''} onChange={v=>setDraft({...draft,awardCurrencyBasis:v})} placeholder="Copy the sponsor's exact currency wording"/><Field label="Award basis (only when explicitly stated)" value={draft.awardBasis || ''} onChange={v=>setDraft({...draft,awardBasis:v})} placeholder="Copy the sponsor's exact award-basis wording"/></div>
        <div className="form-grid"><Field label="Priority deadline as written by sponsor" value={draft.priorityDeadlineText || ""} onChange={v=>setDraft({...draft,priorityDeadlineText:v})} placeholder="Copy the priority-deadline wording exactly"/><Field label="Priority deadline time zone (only if stated)" value={draft.priorityDeadlineTimezone || ""} onChange={v=>setDraft({...draft,priorityDeadlineTimezone:v})} placeholder="e.g. America/Chicago"/></div>
        <Field label="Final deadline as written by sponsor (include year, time and time zone when stated)" value={draft.deadlineText || ''} onChange={v=>setDraft({...draft,deadlineText:v})} placeholder="Copy the final-deadline wording exactly"/>
        <Field label="Final deadline time zone (only if sponsor states one)" value={draft.deadlineTimezone || ''} onChange={v=>setDraft({...draft,deadlineTimezone:v})} placeholder="e.g. America/Chicago; leave blank if not stated"/>
        <div className="form-grid">
          <SelectField label="Application status (your progress)" value={draft.applicationStatus || 'Not started'} onChange={v=>setDraft({...draft,applicationStatus:v as ApplicationStatus})} options={APPLICATION_STATUSES.map((status)=>[status,status])}/>
          <SelectField label="Personal priority" value={draft.priority || 'Medium'} onChange={v=>setDraft({...draft,priority:v as TrackerPriority})} options={TRACKER_PRIORITIES.map((priority)=>[priority,priority])}/>
          <Field label="Submission date (only after you submit)" value={draft.submittedAt || ''} onChange={v=>setDraft({...draft,submittedAt:v})} type="date"/>
          <Field label="Award decision date" value={draft.decisionDate || ''} onChange={v=>setDraft({...draft,decisionDate:v})} type="date"/>
        </div>
        <Field label="Tags (comma separated)" value={(draft.tags || []).join(', ')} onChange={v=>setDraft({...draft,tags:splitKeywords(v).slice(0,20)})} placeholder="e.g. humanities, local, essay"/>
        <Field label="Official sponsor URL" value={draft.sourceUrl} onChange={v=>setDraft({...draft,sourceUrl:v})} placeholder="https://…"/>
        <Field label="Exact official page URL for the general evidence excerpt" value={draft.evidenceUrl || ''} onChange={v=>setDraft({...draft,evidenceUrl:v})} placeholder="https://official-sponsor.example/rules#section"/>
        <SelectField label="Source authority" value={draft.sourceAuthority || 'unverified-lead'} onChange={v=>setDraft({...draft,sourceAuthority:v})} options={[['unverified-lead','Unverified lead'],['secondary-directory','Secondary directory'],['official-sponsor','Official sponsor'],['official-program','Official scholarship program'],['official-school','Official school / district'],['official-government','Official government']]}/> 
        <div className="criteria-builder"><b>Structured eligibility rules</b><p>Leave a field blank when the sponsor does not specify that requirement.</p>
          <div className="form-grid">
            <Field label="Applicant state of residence" value={draft.criteria.state ?? ''} onChange={v=>setCriteria({state:v||undefined})} placeholder="Texas"/>
            <Field label="Current school location state" value={draft.criteria.schoolState ?? ''} onChange={v=>setCriteria({schoolState:v||undefined})} placeholder="Texas"/>
            <Field label="Intended college location state" value={draft.criteria.collegeState ?? ''} onChange={v=>setCriteria({collegeState:v||undefined})} placeholder="Texas"/>
            <SelectField label="Citizenship requirement" value={draft.criteria.citizenship ?? 'any'} onChange={v=>setCriteria({citizenship:v as EligibilityCriteria['citizenship']})} options={[['any','Not specified'],['us-citizen','U.S. citizen'],['eligible-noncitizen','Eligible noncitizen']]}/>
            <SelectField label="Education level" value={draft.criteria.educationLevel ?? ''} onChange={v=>setCriteria({educationLevel:(v||undefined) as EligibilityCriteria['educationLevel']})} options={[['','Not specified'],['high-school-senior','High-school senior'],['high-school-student','Current high-school student'],['incoming-college','Incoming college student'],['undergraduate','Currently enrolled undergraduate']]}/>
            <Field label="Minimum age (years)" value={String(draft.criteria.ageRange?.min ?? '')} onChange={v=>setAgeRange({min:v ? Number(v) : undefined})} type="number"/>
            <SelectField label="Minimum age boundary" value={draft.criteria.ageRange?.minInclusive === true ? 'inclusive' : draft.criteria.ageRange?.minInclusive === false ? 'exclusive' : ''} onChange={v=>setAgeRange({minInclusive:v === '' ? undefined : v === 'inclusive'})} options={[['','Choose boundary'],['inclusive','Inclusive (at least this age)'],['exclusive','Exclusive (older than this age)']]}/>
            <Field label="Maximum age (years)" value={String(draft.criteria.ageRange?.max ?? '')} onChange={v=>setAgeRange({max:v ? Number(v) : undefined})} type="number"/>
            <SelectField label="Maximum age boundary" value={draft.criteria.ageRange?.maxInclusive === true ? 'inclusive' : draft.criteria.ageRange?.maxInclusive === false ? 'exclusive' : ''} onChange={v=>setAgeRange({maxInclusive:v === '' ? undefined : v === 'inclusive'})} options={[['','Choose boundary'],['inclusive','Inclusive (up to this age)'],['exclusive','Exclusive (younger than this age)']]}/>
            <Field label="Graduation year" value={String(draft.criteria.graduationYear ?? '')} onChange={v=>setCriteria({graduationYear:v ? Number(v) : undefined})} placeholder="2027"/>
            <Field label="GPA threshold" value={String(draft.criteria.minGpa ?? '')} onChange={v=>setCriteria({minGpa:v ? Number(v) : undefined})} placeholder="e.g. 3.0"/>
            <Field label="Class-rank cutoff (top %)" value={String(draft.criteria.topPercentMax ?? '')} onChange={v=>setCriteria({topPercentMax:v ? Number(v) : undefined})} placeholder="e.g. 10"/>
            <Field label="ACT threshold" value={String(draft.criteria.minAct ?? '')} onChange={v=>setCriteria({minAct:v ? Number(v) : undefined})} placeholder="e.g. 25"/>
            <Field label="SAT threshold" value={String(draft.criteria.minSat ?? '')} onChange={v=>setCriteria({minSat:v ? Number(v) : undefined})} placeholder="e.g. 1200"/>
            <Field label="Field-of-study keywords (comma separated)" value={(draft.criteria.majorKeywords ?? []).join(', ')} onChange={v=>setCriteria({majorKeywords:splitKeywords(v)})}/>
            <Field label="College or institution" value={draft.criteria.institution ?? ''} onChange={v=>setCriteria({institution:v||undefined})}/>
            <Field label="Community-service hours" value={String(draft.criteria.minServiceHours ?? '')} onChange={v=>setCriteria({minServiceHours:v ? Number(v) : undefined})}/>
            <Field label="Organization membership" value={draft.criteria.requiredMembership ?? ''} onChange={v=>setCriteria({requiredMembership:v||undefined})}/>
          </div>
          <div className="check-options">
            <span className="field-hint">Accepted enrollment routes (any one may satisfy the sponsor rule):</span>
            <CheckField label="Full-time student" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("full-time"))} onChange={v=>updateEnrollmentStatus("full-time",v)}/>
            <CheckField label="Part-time student" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("part-time"))} onChange={v=>updateEnrollmentStatus("part-time",v)}/>
            <CheckField label="Incoming college student" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("incoming"))} onChange={v=>updateEnrollmentStatus("incoming",v)}/>
            <CheckField label="Current student (high school or college)" checked={Boolean(draft.criteria.enrollmentStatuses?.includes("current-student"))} onChange={v=>updateEnrollmentStatus("current-student",v)}/>
            <CheckField label="Financial-need qualification" checked={Boolean(draft.criteria.requiresFinancialNeed)} onChange={v=>setCriteria({requiresFinancialNeed:v})}/>
            <CheckField label="First-generation qualification" checked={Boolean(draft.criteria.requiresFirstGeneration)} onChange={v=>setCriteria({requiresFirstGeneration:v})}/>
            <CheckField label="Listing indicates an application fee (flag for safety review)" checked={draft.criteria.applicationFee===true} onChange={v=>setCriteria({applicationFee:v ? true : null})}/>
          </div>
          <label className="field"><span>Other sponsor requirements not covered above</span><textarea value={draft.criteria.otherRequirement ?? ''} onChange={e=>setCriteria({otherRequirement:e.target.value||undefined})} placeholder="Record additional sponsor rules, then classify them as mandatory or preferred below."/></label>
        </div>
        {activeCriterionEntries.length > 0 && <div className="criteria-builder">
          <b>Public sponsor evidence for each criterion</b>
          <p>Each structured rule needs its own short excerpt and exact HTTPS page URL on the same recognized official sponsor domain. Without both, its result remains Unknown. Classify each rule as mandatory or preferred; preferred results are informational and never disqualify an applicant.</p>
          {activeCriterionEntries.map(([key]) => {
            const entry = draft.criteriaEvidence?.[key] ?? {};
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
            return <div className="criterion-evidence-entry" key={key}>
              <b>{label}</b>
              <label className="field"><span>Requirement classification</span><select aria-label={`${label} requirement classification`} value={draft.criteriaImportance?.[key as keyof EligibilityCriteria] ?? 'mandatory'} onChange={event=>setCriterionImportance(key as keyof EligibilityCriteria, event.target.value as CriteriaImportance)}><option value="mandatory">Mandatory — must be met</option><option value="preferred">Preferred — does not disqualify</option></select></label>
              <Field label="Exact official page URL for this rule" value={entry.sourceUrl ?? ''} onChange={v=>setCriterionEvidence(key,{sourceUrl:v})} placeholder="https://official-sponsor.example/rules#section"/>
              <label className="field"><span>Exact sponsor rule excerpt from this page</span><textarea value={entry.excerpt ?? ''} onChange={e=>setCriterionEvidence(key,{excerpt:e.target.value})} placeholder="Quote or accurately transcribe only the rule supporting this criterion."/></label>
            </div>;
          })}
        </div>}
        <label className="field"><span>General evidence excerpt from official sponsor rules (use the exact text from that page)</span><textarea value={draft.evidenceText} onChange={e=>setDraft({...draft,evidenceText:e.target.value})} placeholder="Copy or accurately transcribe the source-level facts from the exact page URL above."/></label>
        <CheckField label="Sponsor explicitly states there is no fixed deadline" checked={draft.deadlineNotPublished===true} onChange={v=>setDraft({...draft,deadlineNotPublished:v})}/>
        <CheckField label="I reviewed the current official rules and recorded the supporting evidence above" checked={draft.sourceVerified} onChange={v=>setDraft({...draft,sourceVerified:v,lastCheckedDate:v?localToday():'',sourceReviewConfirmed:v})}/>
        <label className="field"><span>Additional notes</span><textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Documents, recommendations, essays, or questions…"/></label>
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
      <div className="modal-actions">{cloudUser && <button className="secondary" disabled={cloudBusy} onClick={()=>void handleCloudSave(selected)}>Save sponsor details to cloud</button>}<button className="secondary" onClick={()=>{const updated={...selected,archived:!selected.archived};if(!saveItems(items.map(x=>x.id===selected.id?updated:x)))return;setSelected(updated);setNotice(updated.archived?'Scholarship archived. Its history remains in your tracker.':'Scholarship restored to active records.')}}>{selected.archived ? 'Restore from archive' : 'Archive scholarship'}</button><button className="secondary" onClick={()=>{if(!saveItems(items.filter(x=>x.id!==selected.id)))return;setSelected(null)}}>Remove from tracker</button><button className="secondary" onClick={()=>{const item=selected;setSelected(null);openAdd(item,true)}}>Edit criteria / application</button><button className="primary" onClick={()=>setSelected(null)}>Done</button></div>
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
  const rules = item.extracted_rules as {
    eligibility_requirements?:Array<{requirement?:string;mandatory?:boolean;evidence?:string;needs_human_confirmation?:boolean}>;
    uncertainties?:string[]; short_source_summary?:string; application_fee?:boolean|null;
    application_documents?:string[]; application_steps?:string[];
  }|undefined;
  return <article className="cloud-result-card" role="listitem">
    <div className="candidate-top"><span className="status status-needs-information">{item.verification_state === 'human_verified' ? 'Sponsor-reviewed record' : item.verification_state === 'needs_human_review' ? 'Needs sponsor review' : 'Unverified lead'}</span><span>{(item.discovery_categories || [item.discovery_category]).map((category)=>category.replace(/_/g,' ')).join(' · ')}</span></div>
    <h3>{item.title}</h3><p className="candidate-provider">{item.provider || 'Sponsor not confirmed'} · {item.source_domain || (()=>{try{return new URL(item.source_url).hostname.replace(/^www[.]/,'')}catch{return 'Source domain unavailable'}})()}</p>
    <div className="cloud-result-meta"><span>{item.award_text || 'Award not extracted'}</span><span>{item.open_date ? `Opens ${item.open_date}` : "Opening date not confirmed"}</span><span>{item.deadline ? `Deadline ${item.deadline}` : "Deadline not confirmed"}</span></div>
    <p className="candidate-description">{rules?.short_source_summary || item.excerpt || 'Open the source page and review the official sponsor rules.'}</p>
    {item.relevance_score !== undefined && <div className="research-relevance"><b>Research relevance: {item.relevance_score}</b>{item.relevance_reasons?.length ? <small>{item.relevance_reasons.join(' · ')}</small> : null}</div>}
    <small className="candidate-source">Discovery date: {item.discovered_at ? new Date(item.discovered_at).toLocaleString() : 'Not recorded'} · Cloud record created: {item.record_created_at ? new Date(item.record_created_at).toLocaleString() : 'Date not recorded'} · Sponsor rules last checked: {item.source_checked_at || 'Not recorded'}</small>
    {sanitizePublicHttpsUrl(item.source_evidence_url || '') && <p><a className="source-link" href={sanitizePublicHttpsUrl(item.source_evidence_url || '') || undefined} target="_blank" rel="noreferrer">Open supporting rules / evidence ↗</a></p>}
    {rules?.eligibility_requirements?.length ? <div className="extracted-rules"><b>Extracted sponsor rules — provisional</b>{rules.eligibility_requirements.map((rule,index)=><div key={index}><span>{rule.mandatory?'Required':'Selection / preference'}{rule.needs_human_confirmation?' · Confirm with sponsor':''}</span><p>{rule.requirement}</p>{rule.evidence&&<small>Evidence: {rule.evidence}</small>}</div>)}</div>:null}
    {rules?.uncertainties?.length ? <div className="uncertainty-list"><b>Still unclear</b><ul>{rules.uncertainties.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_documents?.length ? <div className="extracted-rules"><b>Application documents</b><ul>{rules.application_documents.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_steps?.length ? <div className="extracted-rules"><b>Application steps</b><ol>{rules.application_steps.map((item,index)=><li key={index}>{item}</li>)}</ol></div>:null}
    {rules?.application_fee === true ? <div className="risk-flag">⚠ The sponsor-page extraction indicates an application fee. Verify directly with the sponsor and do not pay to apply.</div>:null}
    <div className="candidate-actions">{sanitizePublicHttpsUrl(item.source_url) && <a href={sanitizePublicHttpsUrl(item.source_url) || undefined} target="_blank" rel="noreferrer">Open source page ↗</a>}<button className="primary" disabled={tracked} onClick={onTrack}>{tracked?'In tracker':'＋ Add to tracker'}</button></div>
    <small className="candidate-source">Cloud records are not automatically refreshed. Re-check the current official sponsor page before relying on any detail.</small>
  </article>;
}

function CandidateCard({item,assessment,added,onAdd}:{item:Scholarship;assessment:EligibilityAssessment;added:boolean;onAdd:()=>void}) {
  const summary = summarizeEligibilityAssessment(assessment);
  return <div className="candidate-card">
    <div className="candidate-top"><StatusPill status={summary.status as Status}/><SourceStatusPill item={item}/></div>
    <div className="candidate-deadline">{item.deadlineText && item.deadlineText !== item.deadline ? item.deadlineText : (item.deadline ? formatDate(item.deadline) : item.deadlineNotPublished ? 'No deadline published by sponsor' : 'Deadline not confirmed')} {item.deadlineTimezone ? `· ${item.deadlineTimezone}` : ''}</div>
    <h3>{item.name}</h3><p className="candidate-provider">{item.provider}</p><div className="candidate-award">{item.award || 'Award details not published'}</div>
    <p className="candidate-description">{item.notes}</p>
    <div className="candidate-match"><b>Profile check</b><span>{summary.passed.length} pass · {summary.unknown.length} unknown · {summary.failed.length} fail</span></div>
    <small className="candidate-source">{summary.caveat}</small>
    <div className="candidate-actions">{sanitizePublicHttpsUrl(item.sourceUrl) && <a href={sanitizePublicHttpsUrl(item.sourceUrl) || undefined} target="_blank" rel="noreferrer">{getSourceAttribution(item.sourceUrl).linkLabel} ↗</a>}<button className={added?'secondary':'primary'} disabled={added} onClick={onAdd}>{added?'Added to tracker':'＋ Track & verify'}</button></div>
    <small className="candidate-source">Sponsor rules last checked: {item.lastCheckedDate || 'Not recorded'} · Discovered: {item.discoveredOn || 'Date not recorded'} · Added to tracker: {item.recordCreatedAt ? new Date(item.recordCreatedAt).toLocaleString() : 'Date not recorded'} · {getSourceAttribution(item.sourceUrl).label}. {item.discoverySourceLabel ? `Discovery source: ${item.discoverySourceLabel}.` : 'No discovery source recorded'}</small>
  </div>;
}
type ProfileRequirementKind = "required" | "optional";

function ProfileRequirement({ kind }: { kind: ProfileRequirementKind }) {
  return <small className="field-requirement" data-requirement={kind}>{kind === "required" ? "Required" : "Optional"}</small>;
}

function Field({
  label, value, onChange, placeholder, type = 'text', id, required = false, error,
  requirement, min, max, step, inputMode, helpText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  id?: string;
  required?: boolean;
  error?: string;
  requirement?: ProfileRequirementKind;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  inputMode?: "numeric" | "decimal" | "text";
  helpText?: string;
}) {
  const errorId = id ? `${id}-error` : undefined;
  return <label className={'field' + (error ? ' field-invalid' : '')}>
    <span className={requirement ? "field-label-row" : undefined}>
      <span>{label}</span>
      {requirement ? <ProfileRequirement kind={requirement}/> : null}
    </span>
    <input id={id} type={type} value={value} placeholder={placeholder} min={min} max={max} step={step}
      inputMode={inputMode} onChange={e=>onChange(e.target.value)} required={required}
      aria-required={required || undefined} aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? errorId : undefined}/>
    {helpText ? <small className="field-help">{helpText}</small> : null}
    {error && errorId ? <small id={errorId} className="field-error" role="alert">{error}</small> : null}
  </label>;
}
function WorkspaceSubnav({label,active,options,onChange}:{label:string;active:string;options:{value:string;label:string}[];onChange:(value:string)=>void}) {
  return <div className="workspace-subnav" role="group" aria-label={label}>
    {options.map(option=><button type="button" key={option.value} className={active === option.value ? 'is-active' : ''} aria-pressed={active === option.value} onClick={()=>onChange(option.value)}>{option.label}</button>)}
  </div>;
}
function SelectField({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:string[][]}) { return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>; }
function CheckField({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}) { return <label className="check-field"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>; }
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
