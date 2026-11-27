import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { assessEligibility, type EligibilityCriteria, type EligibilityAssessment } from './eligibility.js';
import { deriveSourceStatus, getEvidenceCompleteness, getEvidenceExcerptAttributions, getOfficialSourceFreshness, getSourceAttribution, normalizeAndDeduplicateScholarships, normalizeScholarshipRecords, resolveSourceAuthority, sanitizePublicHttpsUrl } from './lib/evidence.js';
import { appendSourceEvidenceHistory, invalidateSourceReviewIfChanged } from './lib/sourceReview.js';
import { getSupabaseClient, supabaseConfigured } from './lib/supabaseClient';
import { buildScoutBackup, validateScoutBackup } from './lib/backup.js';

import { findPotentialDuplicates, getDeadlineMilestones, getDeadlineUrgency } from './lib/trackerInsights.js';
import { APPLICATION_CHECKLIST_STEPS, normalizeApplicationProgress, updateApplicationProgress } from './lib/applicationProgress.js';
import { createApplicationWorkspace, normalizeApplicationWorkspace, getApplicationWorkspaceSummary, countApplicationWords, RECOMMENDATION_STATUSES, type ApplicationWorkspaceEntry } from './lib/applicationWorkspace.js';
import { summarizeEligibilityAssessment } from './lib/eligibilitySummary.js';
import { DISCOVERY_CATEGORY_OPTIONS } from './lib/discovery.js';
import { isLiveDiscoveryCategorySupported } from './lib/liveDiscoveryCapabilities.js';
import { getProfileReadiness } from './lib/profileReadiness.js';
import { validateProfileChanges } from './lib/profileValidation.js';
import { APPLICATION_STATUSES, TRACKER_PRIORITIES, filterAndSortTrackerRecords, getApplicationStatusCounts, normalizeTrackerRecord, type ApplicationStatus, type TrackerPriority } from './lib/trackerManagement.js';
import { buildTrackerCsvReport } from './lib/trackerReport.js';
import { clearReliabilityEvents, readReliabilityEvents, RELIABILITY_CHANGE_EVENT } from './lib/reliabilityMonitor.js';
import { writeJsonStorage, writeJsonStorageBatch } from './lib/browserStorage.js';
import { AUTH_EMAIL_COOLDOWN_SECONDS, getAuthCooldownRemainingSeconds, isAuthRateLimitError, isExpiredAuthLinkError } from './lib/authCooldown.js';
import { getCloudUser, listCloudScholarships, runLiveScholarshipDiscovery, saveCloudScholarship, sendMagicLink, signOutCloudUser, type LiveScholarship, type LiveDiscoverySummary } from './lib/scholarshipApi';
import './App.css';

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
type Profile = {
  state: string; county: string; citizenship: string; age: string; school: string; schoolState: string; grade: string; graduationYear: string;
  plannedCollege: string; plannedCollegeState: string; plannedMajor: string; degreeGoal: string; collegeStatus: string;
  gpa: string; gpaType: string; classRank: string; rankDetails: string; credits: string; programNotes: string;
  texasGrantNotation: string; act: string; sat: string; apCourses: string; dualCreditCourses: string;
  academicHonors: string; interests: string; activities: string; serviceHours: string; service: string;
  employment: string; certifications: string; languages: string; firstGeneration: string;
  district: string; shhMembershipStatus: string; spanishAchievementStatus: string;
  nseMedalYears: string; nseRegistered2027: string; fourHMembershipStatus: string;
  academicStrengths: string; careerInterests: string; awardsHonors: string;
  preferredCollegeLocation: string; enrollmentPlan: string; searchKeywords: string;
  profileVersion: string;
};

const initialProfile: Profile = {
  // Personal student details are intentionally not bundled into the public client.
  // The user fills these in and they remain in this browser's local storage.
  state: '', county: '', citizenship: '', age: '', school: '', schoolState: '', grade: '', graduationYear: '',
  plannedCollege: '', plannedCollegeState: '', plannedMajor: '', degreeGoal: '', collegeStatus: '',
  gpa: '', gpaType: '', classRank: '', rankDetails: '', credits: '', programNotes: '',
  texasGrantNotation: '', act: '', sat: '', apCourses: '', dualCreditCourses: '',
  academicHonors: '', interests: '', activities: '', serviceHours: '', service: '',
  employment: '', certifications: '', languages: '', firstGeneration: '',
  district: '', shhMembershipStatus: '', spanishAchievementStatus: '',
  nseMedalYears: '', nseRegistered2027: '', fourHMembershipStatus: '',
  academicStrengths: '', careerInterests: '', awardsHonors: '',
  preferredCollegeLocation: '', enrollmentPlan: '', searchKeywords: '',
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
  { name: 'FTC — Avoid Scholarship Scams', group: 'Safety / verification', detail: 'Warning signs include upfront fees, guaranteed awards, and requests for bank or card details.', url: 'https://consumer.ftc.gov/articles/how-avoid-scholarship-and-financial-aid-scams' },
];

const statuses: Status[] = ['Eligible', 'Rules match — source unverified', 'Needs information', 'Ineligible', 'Expired'];
const PROFILE_VERSION = 'profile-general-2026-11';
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
  const [tab, setTab] = useState('Overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [tab]);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('scout-theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [compactView, setCompactView] = useState(() => {
    try { return localStorage.getItem('scout-compact-view') === 'true'; }
    catch { return false; }
  });
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [reliabilityEvents, setReliabilityEvents] = useState(() => readReliabilityEvents());
  const [items, setItems] = useState<Scholarship[]>(loadScholarships);
  const [profile, setProfile] = useState<Profile>(() => mergeProfile(readLocalJson('scout-profile')));
  const [profileDraft, setProfileDraft] = useState<Profile>(() => mergeProfile(readLocalJson('scout-profile-draft') ?? readLocalJson('scout-profile')));
  const profilePersistenceRef = useRef<Profile>(profile);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [applicationStatusFilter, setApplicationStatusFilter] = useState('All');
  const [archiveFilter, setArchiveFilter] = useState<'active'|'archived'|'all'>('active');
  const [trackerSortBy, setTrackerSortBy] = useState<'deadline'|'priority'|'award'|'applicationStatus'|'eligibility'|'name'>('deadline');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Scholarship | null>(null);
  const [draft, setDraft] = useState<Scholarship>(emptyScholarship);
  const [notice, setNotice] = useState('Discovery and rule-based eligibility checks are ready.');
  const [profileSaveStatus, setProfileSaveStatus] = useState<'idle'|'saved'|'draft'|'unavailable'>('idle');
  const [cloudUser, setCloudUser] = useState<{id:string;email?:string;is_anonymous?:boolean}|null>(null);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudMessage, setCloudMessage] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
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
  const [discoveryWarnings, setDiscoveryWarnings] = useState<string[]>([]);
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
  const [deadlineCalendarDay, setDeadlineCalendarDay] = useState(() => localToday());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!saveJson('scout-profile-draft', profileDraft)) {
        setProfileSaveStatus('unavailable');
        setNotice('Your profile draft could not be saved in this browser. Export an encrypted backup before closing or reloading.');
        return;
      }
      const validation = validateProfileChanges(profilePersistenceRef.current, profileDraft);
      if (!validation.valid) {
        setProfileSaveStatus('draft');
        return;
      }
      if (!saveJson('scout-profile', profileDraft)) {
        setProfileSaveStatus('unavailable');
        setNotice('Your profile could not be saved in this browser. Export an encrypted backup before closing or reloading.');
        return;
      }
      profilePersistenceRef.current = profileDraft;
      setProfile(profileDraft);
      try { localStorage.removeItem('scout-profile-draft'); } catch { /* preserve recoverable draft */ }
      setProfileSaveStatus('saved');
    }, 300);
    return () => window.clearTimeout(timeout);
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
    const refreshDiagnostics = () => setReliabilityEvents(readReliabilityEvents());
    window.addEventListener(RELIABILITY_CHANGE_EVENT, refreshDiagnostics);
    return () => window.removeEventListener(RELIABILITY_CHANGE_EVENT, refreshDiagnostics);
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
    // Avoid loading the Supabase SDK on the local-first landing experience.
    // Auth is initialized only when a cloud-related tab is actually opened.
    if (tab !== 'Settings' && tab !== 'Cloud Search') return;
    let active = true;
    let authEventObserved = false;
    let subscription: { unsubscribe: () => void } | null = null;

    void getSupabaseClient().then((client) => {
      if (!active || !client) return;
      const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        authEventObserved = true;
        setCloudUser(session?.user
          ? { id: session.user.id, email: session.user.email, is_anonymous: session.user.is_anonymous }
          : null);
        if (session?.user && event === 'SIGNED_IN') {
          if (session.user.is_anonymous) {
            setCloudMessage('A private anonymous browser session is ready. No email or password was required.');
          } else {
            setTab('Settings');
            setCloudMessage('Signed in successfully. Your cloud account is connected in this browser.');
          }
          try { sessionStorage.removeItem('scout-auth-email-cooldown-until'); } catch { /* storage may be unavailable */ }
          setAuthCooldownUntil(0);
        }
        if (!session?.user) setLiveResults([]);
      });
      subscription = authSubscription;

      // The initial user lookup can resolve after a magic-link SIGNED_IN event.
      // Do not let that older lookup overwrite the newer auth state.
      void client.auth.getUser().then(({ data, error }) => {
        if (active && !authEventObserved) {
          setCloudUser(!error && data.user
            ? { id: data.user.id, email: data.user.email, is_anonymous: data.user.is_anonymous }
            : null);
        }
      });
    }).catch(() => {
      if (active) setCloudMessage('Cloud authentication could not be initialized. Local tracking remains available.');
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [tab]);

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
      .catch((error) => { if (active) setCloudMessage(error instanceof Error ? error.message : "Could not load saved cloud records."); })
      .finally(() => { if (active) setCloudBusy(false); });
    return () => { active = false; };
  }, [cloudUser?.id]);

  const saveProfile = (next: Profile) => {
    setProfileDraft(next);
  };
  const saveItems = (next: Scholarship[]) => {
    const normalized = normalizeScholarshipRecords(next.map((item) => normalizeTrackerRecord(item))) as Scholarship[];
    setItems(normalized);
    const validIds = normalized.map((item) => item.id);
    const scholarshipsSaved = saveJson('scout-scholarships', normalized);
    const retainedProgress = normalizeApplicationProgress(applicationProgress, validIds);
    setApplicationProgress(retainedProgress);
    const progressSaved = saveJson('scout-application-progress', retainedProgress);
    const retainedWorkspace = normalizeApplicationWorkspace(applicationWorkspace, validIds);
    setApplicationWorkspace(retainedWorkspace);
    const workspaceSaved = saveJson('scout-application-workspace', retainedWorkspace);
    if (!scholarshipsSaved || !progressSaved || !workspaceSaved) setNotice('Your changes are active in this tab, but browser storage could not save them. Export an encrypted backup before closing or reloading.');
  };
  const saveApplicationTask = (scholarshipId: string, stepIndex: number, checked: boolean) => {
    const next = updateApplicationProgress(applicationProgress, scholarshipId, stepIndex, checked);
    setApplicationProgress(next);
    if (!saveJson('scout-application-progress', next)) setNotice('Checklist progress changed in this tab, but browser storage could not save it. Export an encrypted backup before closing or reloading.');
  };
  const saveApplicationWorkspaceEntry = (scholarshipId: string, entry: ApplicationWorkspaceEntry) => {
    const validIds = items.map((item) => item.id);
    const next = normalizeApplicationWorkspace({ ...applicationWorkspace, [scholarshipId]: entry }, validIds);
    setApplicationWorkspace(next);
    if (!saveJson('scout-application-workspace', next)) setNotice('Application workspace changed in this tab, but browser storage could not save it. Export an encrypted backup before closing or reloading.');
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
    if (backupPassword.length < 12) {
      setNotice('Use a backup password with at least 12 characters.');
      return;
    }
    if (backupPassword !== backupPasswordConfirm) {
      setNotice('The backup passwords do not match.');
      return;
    }
    setBackupBusy(true);
    try {
      const backup = buildScoutBackup(profile, items, new Date(), applicationProgress, applicationWorkspace);
      const { encryptBackup } = await import('./lib/backupCrypto.js');
      const encrypted = await encryptBackup(backup, backupPassword);
      downloadBackupFile(JSON.stringify(encrypted, null, 2), `scholarship-scout-encrypted-backup-${localToday()}.json`);
      closeBackupDialog();
      setNotice('Encrypted backup downloaded. Keep the password separate; it is never saved and cannot be recovered.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not encrypt the backup. No file was downloaded.');
    } finally {
      setBackupPassword('');
      setBackupPasswordConfirm('');
      setBackupBusy(false);
    }
  };
  const restoreLocalBackup = (parsed: unknown, encrypted: boolean, confirmed = false): boolean => {
    const validation = validateScoutBackup(parsed, Object.keys(initialProfile));
    if (!validation.ok) {
      setNotice(validation.error);
      return false;
    }
    const imported = validation.value;
    const restoredProfile = mergeProfile(imported.profile);
    const profileValidation = validateProfileChanges(profilePersistenceRef.current, restoredProfile);
    if (!profileValidation.valid) {
      setNotice(profileValidation.errors[0] || 'The backup profile contains invalid values. Nothing was changed.');
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

    const storageResult = writeJsonStorageBatch({
      'scout-profile': restoredProfile,
      'scout-profile-draft': restoredProfile,
      'scout-scholarships': restoredScholarships,
      'scout-application-progress': restoredProgress,
      'scout-application-workspace': restoredWorkspace,
    });
    if (!storageResult.ok) {
      setNotice(storageResult.rollbackSucceeded
        ? 'The browser could not save this restore. The previous local data was rolled back and left in place.'
        : 'The browser could not save the restore or fully roll back its storage writes. Keep this tab open and export the current local state before reloading.');
      return false;
    }

    setProfile(restoredProfile);
    setProfileDraft(restoredProfile);
    profilePersistenceRef.current = restoredProfile;
    setBackupPendingRestore(null);
    setProfileSaveStatus('saved');
    setItems(restoredScholarships);
    setApplicationProgress(restoredProgress);
    setApplicationWorkspace(restoredWorkspace);
    setNotice('Backup imported. Your profile, tracker, checklists, and application workspaces were restored locally.');
    return true;
  };
  const confirmRestoreLocalBackup = () => {
    if (!backupPendingRestore) return;
    if (restoreLocalBackup(backupPendingRestore.data, backupPendingRestore.encrypted, true)) closeBackupDialog();
  };
  const importLocalBackup = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice('Backup is larger than the 2 MB limit. Your current data was not changed.');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const { isEncryptedBackupEnvelope } = await import('./lib/backupCrypto.js');
      if (isEncryptedBackupEnvelope(parsed)) {
        setBackupImportFile(file);
        setBackupPassword('');
        setBackupDialogMode('import');
        return;
      }
      restoreLocalBackup(parsed, false);
    } catch {
      setNotice('Could not read that backup file. Your current data was not changed.');
    }
  };
  const importEncryptedBackup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!backupImportFile) return;
    setBackupBusy(true);
    try {
      const envelope: unknown = JSON.parse(await backupImportFile.text());
      const { decryptBackup, isEncryptedBackupEnvelope } = await import('./lib/backupCrypto.js');
      if (!isEncryptedBackupEnvelope(envelope)) throw new Error('The encrypted backup file is no longer available.');
      const decrypted = await decryptBackup(envelope, backupPassword);
      setBackupPassword('');
      restoreLocalBackup(decrypted, true);
    } catch {
      setNotice('Could not decrypt that backup. Check the password and file integrity. Your current data was not changed.');
    } finally {
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
        setCloudMessage('Supabase is temporarily limiting sign-in emails. Wait for the countdown before trying again.');
      } else if (isExpiredAuthLinkError((error as {code?:string})?.code, error instanceof Error ? error.message : '')) {
        setCloudMessage('That sign-in link was already used or expired. Wait for the timer, request one new link, and use the newest link only once.');
      } else {
        setCloudMessage(error instanceof Error ? error.message : 'Could not send the sign-in link. Check the email address and connection.');
      }
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
        setCloudMessage('No active sign-in session was found in this browser. Open the newest sign-in email link here, then check again.');
        return;
      }
      setCloudUser({id:user.id,email:user.email,is_anonymous:user.is_anonymous});
      setCloudMessage(user.is_anonymous
        ? 'Your private anonymous browser session is active. Keep this browser data to retain access to its cloud records.'
        : 'Signed in successfully. Your cloud account is connected in this browser.');
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : 'Could not check the cloud session.');
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
      setCloudMessage('Signed out of the cloud account. Your local profile and tracker were not changed.');
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setCloudBusy(false);
    }
  };
  const handleCloudSearch = async () => {
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
      setDiscoveryWarnings([]);
      setDiscoveryState('loading');
      setCloudMessage("Searching selected categories and up to two result pages per query. Only state, graduation year, and category choices are sent to SearXNG…");
      const run = await runLiveScholarshipDiscovery(
        { state: profile.state, graduationYear: profile.graduationYear },
        selectedDiscoveryCategories,
      );
      setExaResults(run.results);
      setDiscoverySummary(run.summary);
      setDiscoveryWarnings(run.warnings);
      setDiscoveryState(run.results.length ? 'results' : 'empty');
      setCloudMessage(run.results.length
        ? `Research completed: ${run.results.length} unique leads from ${run.summary.rawResultCount} search results. Every lead still needs official sponsor verification.`
        : "Search completed but found no usable public scholarship leads. Try a different category later.");
    } catch (error) {
      setDiscoveryState('error');
      setCloudMessage(error instanceof Error ? error.message : "Live scholarship search failed. Try again.");
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
      setCloudMessage(error instanceof Error ? error.message : 'Could not save the scholarship to the cloud.');
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
      discoverySourceLabel: `SearXNG research · ${(row.discovery_categories || [row.discovery_category]).join(', ')}`, discoveredOn: row.discovered_at?.slice(0,10),
      recordCreatedAt: new Date().toISOString(),
      notes: 'Saved from a live search. Run sponsor-rule extraction and review every requirement before using an eligibility result.',
      criteria: {},
    };
    saveItems([saved,...items]); setNotice('Live scholarship lead added to your tracker. Sponsor rules remain unverified.');
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
    setShowAdd(true);
  };
  const add = () => {
    if (!draft.name.trim() || !draft.provider.trim()) { setNotice('Add at least a scholarship name and provider.'); return; }
    if (editingId) {
      const previous = items.find((item) => item.id === editingId);
      const { sourceReviewConfirmed, ...draftRecord } = draft;
      const safeDraftRecord = sanitizeScholarshipSourceUrls(draftRecord);
      const withHistory = appendSourceEvidenceHistory(previous ?? {}, { ...safeDraftRecord, id: editingId });
      const updated = invalidateSourceReviewIfChanged(previous ?? {}, withHistory, sourceReviewConfirmed === true);
      saveItems(items.map((item) => item.id === editingId ? updated : item));
      setNotice('Scholarship rules updated. Eligibility was recalculated against your profile.');
    } else {
      const draftRecord = { ...draft };
      delete draftRecord.sourceReviewConfirmed;
      const safeDraftRecord = sanitizeScholarshipSourceUrls(draftRecord);
      const saved = { ...safeDraftRecord, id: crypto.randomUUID(), recordCreatedAt: new Date().toISOString(), lastCheckedDate: draft.sourceVerified ? (draft.lastCheckedDate || localToday()) : draft.lastCheckedDate };
      saveItems([saved, ...items]);
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
    saveItems(items.map((item) => item.id === prepScholarship.id
      ? { ...item, applicationStatus: 'Submitted', submittedAt: localToday() }
      : item));
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
  const queryGroups = useMemo(() => {
    const year = profile.graduationYear.trim();
    const level = profile.grade.trim() || 'student';
    const location = [profile.county, profile.state].map((value) => value.trim()).filter(Boolean).join(' ');
    const compact = (value: string) => value.replace(/[\r\n,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    const topicTerms = [profile.plannedMajor, profile.interests, profile.academicStrengths, profile.careerInterests, profile.awardsHonors, profile.searchKeywords].map(compact).filter(Boolean).join(' ').slice(0, 180);
    const collegeTerms = [profile.plannedCollege, profile.preferredCollegeLocation, profile.enrollmentPlan].map(compact).filter(Boolean).join(' ').slice(0, 160);
    const schoolTerms = [profile.school, profile.district].map(compact).filter(Boolean).join(' ');
    const searches = [
      { title: 'Local and nearby scholarships', query: `${location ? '"' + location + '" ' : ''}local student scholarships community foundations ${level} ${year} official sponsor` },
      { title: 'State scholarship programs', query: `${profile.state ? profile.state + ' ' : ''}state scholarships education grants student financial aid ${year} official sponsor` },
      { title: 'National scholarships', query: `national scholarships for ${level} ${year} official foundations sponsors` },
      { title: 'Academic and subject interests', query: `${topicTerms || 'academic merit and student achievement'} scholarships ${level} ${location} ${year} official sponsor` },
      { title: 'Community service and leadership', query: `student scholarships community service leadership volunteer ${location} ${year} official sponsor` },
      { title: 'School and district resources', query: `${schoolTerms ? '"' + schoolTerms + '" ' : ''}school district counselor scholarship financial aid resources ${year} official` },
      { title: 'College and enrollment options', query: `${collegeTerms ? '"' + collegeTerms + '" ' : ''}incoming college scholarships students ${year} official` },
      { title: 'General scholarships', query: `general scholarships broad eligibility students ${year} official sponsor` },
    ];
    return searches;
  }, [profile.graduationYear, profile.grade, profile.county, profile.state, profile.plannedMajor, profile.interests, profile.academicStrengths, profile.careerInterests, profile.awardsHonors, profile.searchKeywords, profile.plannedCollege, profile.preferredCollegeLocation, profile.enrollmentPlan, profile.district, profile.school]);
  const navGroups = [
    { title: 'START', items: [
      { tab: 'Overview', label: 'Overview', description: 'Your scholarship home', icon: '⌂' },
    ]},
    { title: 'FIND OPPORTUNITIES', items: [
      { tab: 'Discovery', label: 'Find scholarships', description: 'Browse scholarship resources', icon: '⌕' },
      { tab: 'Cloud Search', label: 'Live web search', description: 'Search public scholarship pages', icon: '☁' },
    ]},
    { title: 'STAY ORGANIZED', items: [
      { tab: 'Scholarships', label: 'My scholarships', description: 'Saved awards and deadlines', icon: '▤', count: true },
      { tab: 'Application prep', label: 'Application checklist', description: 'Prepare each application', icon: '☑' },
    ]},
    { title: 'YOUR DETAILS', items: [
      { tab: 'Eligibility filters', label: 'My profile', description: 'Enter your own matching details', icon: '♙' },
    ]},
    { title: 'PREFERENCES', items: [
      { tab: 'Settings', label: 'Settings', description: 'Appearance and account access', icon: '⚙' },
    ]},
  ];
  const currentPage = navGroups.flatMap(group => group.items).find(item => item.tab === tab)?.label ?? tab;
  const profileTags = [profile.state, profile.county, profile.citizenship, `Class of ${profile.graduationYear}`, profile.grade, profile.plannedMajor].filter(Boolean);
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
    key !== 'applicationFee' && value !== undefined && value !== null && value !== '' &&
    value !== 'any' && value !== false && (!Array.isArray(value) || value.length > 0)
  );

  return <div className="shell" data-theme={theme} data-compact={compactView ? 'true' : 'false'}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="sidebar">
      <span className="sidebar-hover-indicator" aria-hidden="true" />
      <div className="sidebar-header">
        <div className="logo"><span className="logo-mark">S</span><span>scholarship<span className="logo-light"> scout</span><small>SCHOLARSHIP WORKSPACE</small></span></div>
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span aria-hidden="true">{mobileNavOpen ? '×' : '☰'}</span>
          {mobileNavOpen ? 'Close' : 'Menu'}
        </button>
      </div>
      <div className="workspace-label"><span className="workspace-label-dot" /> YOUR WORKSPACE</div>
      <nav id="primary-navigation" className="primary-nav" data-open={mobileNavOpen ? 'true' : 'false'} aria-label="Main navigation">
        {navGroups.map(group => <div className="nav-group" key={group.title} role="group" aria-label={group.title}>
          <div className="nav-group-title">{group.title}</div>
          {group.items.map(item => <button type="button" key={item.tab} className={'nav-item ' + (tab === item.tab ? 'active' : '')} onClick={() => { setTab(item.tab); setMobileNavOpen(false); }} aria-current={tab === item.tab ? 'page' : undefined} aria-label={item.label} title={item.label}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-copy"><b>{item.label}</b><small>{item.description}</small></span>
            {'count' in item && item.count && <span className="nav-count">{items.length}</span>}
          </button>)}
        </div>)}
      </nav>
      <div className="side-bottom">
        <div className="secure"><span aria-hidden="true">◈</span><div><b>Private workspace</b><small>Saved on this device</small></div></div>
        <div className="version">SCHOLARSHIP SCOUT · ALPHA 0.8</div>
      </div>
    </aside>

    <main className="main" id="main-content" tabIndex={-1}>
      <header className="topbar">
        <div className="breadcrumb"><span className="breadcrumb-root">WORKSPACE</span><span>/</span><b>{currentPage}</b></div>
        <div className="top-right">
          <span className="local-pill"><i/> {cloudUser ? cloudUser.is_anonymous ? 'Anonymous session' : 'Signed in' : supabaseConfigured ? 'Cloud available' : 'Cloud setup needed'}</span>
          <div className="avatar" aria-hidden="true">S</div>
        </div>
      </header>
      {!isOnline && <div className="offline-notice" role="status" aria-live="polite"><b>You are offline.</b> Local changes still work and stay on this device; cloud sign-in and live search are unavailable until connection returns.</div>}

      {tab === 'Overview' && <div className="page">
        <div className="welcome"><div><div className="eyebrow">YOUR SCHOLARSHIP WORKSPACE</div><h1>Make your next opportunity count.</h1><p>Find scholarships that fit your story, verify the details, and keep every application organized.</p></div><button className="primary" onClick={() => setTab('Discovery')}>⌕ Find scholarships</button></div>
        <div className="notice"><span>✦</span><div><b>Profile-based scholarship discovery</b><p>Searches use the school, district, location, and interests you choose to enter. Leave anything blank for broader matches.</p></div><button onClick={() => setTab('Eligibility filters')}>Review profile →</button></div>
        <div className="panel profile-overview-readiness">
          <div className="panel-heading"><div><h3>Profile readiness</h3><p className="muted">Coverage for personalized searches, not an eligibility decision.</p></div><span className="source-tag">{profileReadiness.core.completedCount}/{profileReadiness.core.totalCount} core details</span></div>
          <div className="profile-readiness-meter"><strong>{profileReadiness.core.percent}%</strong><progress max={100} value={profileReadiness.core.percent} aria-label="Core profile completeness"/></div>
          <p className="profile-readiness-caption">{profileReadiness.core.missing.length ? `Add: ${profileReadiness.core.missing.slice(0, 2).map((field) => field.label).join(', ')}${profileReadiness.core.missing.length > 2 ? ', and more' : ''}.` : 'Core location and education details are filled in. Sponsor-specific requirements still need review.'}</p>
          <button className="text-button" onClick={() => setTab('Eligibility filters')}>Review profile details →</button>
        </div>
        <section className="quick-access" aria-labelledby="quick-access-title">
          <div className="quick-access-heading"><div><span className="eyebrow">WHERE TO GO NEXT</span><h2 id="quick-access-title">Quick access</h2><p>Choose a section to get straight to what you need.</p></div></div>
          <div className="quick-access-grid">
            <button className="quick-link-card" onClick={() => setTab('Discovery')}><span className="quick-link-icon">⌕</span><span><b>Find scholarships</b><small>Explore awards selected around your profile.</small></span><span className="quick-link-arrow">→</span></button>
            <button className="quick-link-card" onClick={() => setTab('Scholarships')}><span className="quick-link-icon">▤</span><span><b>My scholarships</b><small>Review saved opportunities and deadlines.</small></span><span className="quick-link-arrow">→</span></button>
            <button className="quick-link-card" onClick={() => setTab('Application prep')}><span className="quick-link-icon">☑</span><span><b>Application checklist</b><small>Keep track of materials and next steps.</small></span><span className="quick-link-arrow">→</span></button>
            <button className="quick-link-card" onClick={() => setTab('Eligibility filters')}><span className="quick-link-icon">♙</span><span><b>My profile</b><small>Update the details used for matching.</small></span><span className="quick-link-arrow">→</span></button>
          </div>
        </section>
        <div className="section-head"><div><h2>Your pipeline</h2><p>Eligibility is calculated from the criteria recorded for each scholarship.</p></div><div className="section-actions"><button className="secondary" onClick={exportLocalBackup}>↓ Export encrypted backup</button><label className="secondary backup-import">↑ Import backup<input type="file" accept="application/json,.json" onChange={event=>{void importLocalBackup(event.target.files?.[0]);event.currentTarget.value='';}}/></label><button className="text-button" onClick={() => setTab('Scholarships')}>View all →</button></div></div>
        <div className="stats">{[
          {label:'Tracked scholarships',value:items.filter(item=>!item.archived).length,sub:'Active records in your workspace',icon:'▤'},
          {label:'Eligible',value:[...assessments.values()].filter(x=>x.status==='Eligible').length,sub:'All recorded rules passed',icon:'✓'},
          {label:'Need information',value:[...assessments.values()].filter(x=>x.status==='Needs information').length,sub:'At least one unknown condition',icon:'◷'},
          {label:'Deadline milestones in 7 days',value:deadlinesDueSoon,sub:overdueDeadlines ? `${overdueDeadlines} past due · date-only estimates` : 'Date-only estimates; check sponsor cutoff',icon:'◷'}
        ].map(x=><div className="stat" key={x.label}><div className="stat-top"><span>{x.label}</span><b>{x.icon}</b></div><strong>{x.value}</strong><small>{x.sub}</small></div>)}</div>
        <div className="panel application-pipeline-summary">
          <div className="panel-heading"><div><h3>Application progress</h3><p className="muted">Your manual workflow status, separate from scholarship eligibility.</p></div><button className="text-button" onClick={()=>setTab('Scholarships')}>Manage tracker →</button></div>
          <div className="application-pipeline-grid">
            <div><b>{applicationCounts.inProgress}</b><small>Preparing</small></div>
            <div><b>{applicationCounts.ready}</b><small>Ready</small></div>
            <div><b>{applicationCounts.submitted}</b><small>Submitted</small></div>
            <div><b>{applicationCounts.awarded}</b><small>Awarded</small></div>
          </div>
        </div>
        <div className="panel deadline-watch"><div className="panel-heading"><div><h3>Deadline watch</h3><p className="muted">The nearest dates in your tracker.</p></div><span className="source-tag">{deadlineOverview.length} opening/deadline dates shown</span></div>{deadlineOverview.length ? <div className="deadline-list">{deadlineOverview.map(({item,milestone})=><button type="button" className="deadline-item" key={`${item.id}-${milestone.key}`} onClick={()=>setSelected(item)}><span><b>{item.name}</b><small>{milestone.label} · {item.provider} · {milestone.deadlineText || (milestone.deadline ? formatDate(milestone.deadline) : 'Deadline not confirmed')}</small></span><DeadlineUrgencyPill deadline={milestone.deadline} timeZone={milestone.timeZone} openDate={item.openDate} openDateTimezone={item.openDateTimezone} deadlineTime={milestone.deadlineTime}/></button>)}</div> : <p className="muted">Add confirmed calendar dates to see them here. Unpublished and unknown deadlines are not guessed.</p>}<small className="deadline-footnote">Date-only countdown. A sponsor-stated time zone is used when recorded; cutoff times are never inferred.</small></div>
        <div className="section-head"><div><h2>Recent discoveries</h2><p>Opportunities with upcoming deadlines that need sponsor-level review.</p></div><button className="text-button" onClick={()=>setTab('Discovery')}>Open discovery →</button></div>
        <div className="candidate-grid">{candidateAssessments.slice(0,2).map(({item,assessment})=><CandidateCard key={item.id} item={item} assessment={assessment} added={tracked(item.id)} onAdd={()=>openAdd(item)}/>)}</div>
        <div className="bottom-grid"><div className="panel"><div className="panel-heading"><h3>Eligibility profile snapshot</h3><button className="text-button" onClick={()=>setTab('Eligibility filters')}>Edit →</button></div><div className="tag-row">{profileTags.slice(0,4).map(t=><span key={t}>{t}</span>)}</div><p className="muted">{profile.plannedMajor} · GPA {profile.gpa} · Rank {profile.classRank.split('—')[0].trim()} · ACT {profile.act}</p></div><div className="panel"><div className="panel-heading"><h3>How Scout verifies</h3><span className="spark">✦</span></div><div className="mini-steps"><span>01</span><p><b>Discover</b><small>Profile-specific searches and trusted directories.</small></p></div><div className="mini-steps"><span>02</span><p><b>Compare</b><small>Rules engine checks each entered requirement.</small></p></div><div className="mini-steps"><span>03</span><p><b>Audit</b><small>Unknowns and source evidence stay visible.</small></p></div></div></div>
      </div>}

      {tab === 'Settings' && <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Manage how Scholarship Scout looks and how you connect your cloud account. Your profile and tracker stay local unless you choose to save sponsor records to the cloud.</p></div></div>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Appearance</h3><p className="muted">Choose the theme used across your workspace.</p></div><span className="source-tag">DISPLAY</span></div>
          <div className="settings-choice-row">
            <button type="button" className="theme-toggle" onClick={() => setTheme('dark')} aria-label="Use dark mode" aria-pressed={theme === 'dark'}><span aria-hidden="true">☾</span><span>Dark mode</span></button>
            <button type="button" className="theme-toggle" onClick={() => setTheme('light')} aria-label="Use light mode" aria-pressed={theme === 'light'}><span aria-hidden="true">☀</span><span>Light mode</span></button>
          </div>
          <p className="muted settings-footnote">Your current selection is saved in this browser.</p>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Layout density</h3><p className="muted">Choose how much space cards and sections use.</p></div><span className="source-tag">LAYOUT</span></div>
          <button type="button" className="compact-toggle" onClick={() => setCompactView(current => !current)} aria-label={compactView ? 'Switch to comfortable layout' : 'Switch to compact layout'} aria-pressed={compactView}>{compactView ? 'Comfortable view' : 'Compact view'}</button>
          <p className="muted settings-footnote">{compactView ? 'Compact spacing is enabled.' : 'Comfortable spacing is enabled.'}</p>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Account & cloud access</h3><p className="muted">Live scholarship search is public and does not require an account. Email sign-in is only needed to save sponsor records to your cloud account. Your student profile, essays, and local tracker remain on this device.</p></div><span className={`status ${cloudUser ? 'status-eligible' : supabaseConfigured ? 'status-likely-eligible' : 'status-not-eligible'}`}>{cloudUser ? cloudUser.is_anonymous ? 'Anonymous account' : 'Signed in' : supabaseConfigured ? 'Public search configured' : 'Setup needed'}</span></div>
          {cloudUser ? <div className="settings-account-state">
            <p><b>{cloudUser.is_anonymous ? 'Anonymous browser session' : 'Connected account'}</b><span>{cloudUser.is_anonymous ? 'No email attached · private to this browser' : cloudUser.email || 'Signed-in account'}</span></p>
            {cloudUser.is_anonymous ? <p className="cloud-config-note">Keep this browser profile to retain access to cloud records in this anonymous session. Clearing browser data or changing devices can make this session unrecoverable; account linking is not enabled in this version.</p> : null}
            <div className="settings-account-actions">
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCheckCloudSession()}>Check session status</button>
              {!cloudUser.is_anonymous && <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCloudSignOut()}>Sign out</button>}
            </div>
          </div> : <div className="settings-account-state">
            <p><b>No account connected</b><span>Public live search works without signing in.</span></p>
            <p className="muted">Sign in only when you want to save sponsor records to your cloud account. Your student profile and essays are never uploaded by the search feature.</p>
            <form className="cloud-auth-form settings-auth-form" onSubmit={handleCloudSignIn}>
            <label className="field" htmlFor="cloud-email"><span>Email for sign-in link</span><input id="cloud-email" name="email" type="email" autoComplete="email" required value={cloudEmail} onChange={e=>setCloudEmail(e.target.value)} placeholder="you@example.com"/></label>
            <button className="primary" type="submit" disabled={!supabaseConfigured || cloudBusy || !isOnline || !cloudEmail.trim() || authCooldownSeconds > 0}>{cloudBusy ? 'Sending…' : authCooldownSeconds > 0 ? `Try again in ${authCooldownSeconds}s` : 'Send sign-in link'}</button>
            </form>
          </div>}
          {!supabaseConfigured && <p className="cloud-config-note" role="status">Cloud access is not available in this app build because the public Supabase browser configuration is missing. The hosted artifact must include its public publishable key before anonymous search or email sign-in can be used.</p>}
          {cloudMessage && <p className="cloud-message" role="status" aria-live="polite">{cloudMessage}</p>}
          <div className="cloud-steps">
            <div><b>Public live search</b><p>Search public scholarship listings without creating an account. Requests are rate-limited and contain only state, graduation year, and selected categories.</p></div>
            <div><b>Optional cloud account</b><p>Email sign-in connects an account for saving sponsor records across sessions. Your student profile, grades, activities, and essays remain local.</p><button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCheckCloudSession()}>Check session status</button></div>
          </div>
        </section>
      </div>}

      {tab === 'Discovery' && <div className="page">
        <div className="page-heading"><div><div className="eyebrow">PROFILE-TARGETED SEARCH</div><h1>Scholarship discovery</h1><p>Search the places most likely to have relevant awards, then import candidates into your tracker for automatic rule checks.</p></div><span className="status status-likely-eligible">Discovery beta</span></div>
        <div className="filter-intro"><b>Live web discovery is ready</b><p>Scout can search public scholarship pages through your laptop-hosted SearXNG service. Only your state, expected graduation year, and broad search categories are sent for matching. Your school, grades, rank, test scores, activities, contact details, and the rest of your student profile stay on this device. A query is sent to Google only after you click its Search link; those manual links are separate from live discovery. Live results are unverified leads until you check the sponsor's official page.</p><button className="primary" onClick={()=>setTab('Cloud Search')}>Open live web discovery ↗</button></div>
        <div className="section-head"><div><h2>Scholarship opportunities</h2><p>Start with your own profile and verify every opportunity with its official sponsor.</p></div></div>
        {candidateAssessments.length ? <div className="candidate-grid">{candidateAssessments.map(({item,assessment})=><CandidateCard key={item.id} item={item} assessment={assessment} added={tracked(item.id)} onAdd={()=>openAdd(item)}/>)}</div> : <div className="panel empty"><div>⌕</div><b>No sample scholarships are preloaded</b><p>Use the research categories below to find current opportunities, or add a scholarship after checking its official source. School-based searches use only the school name and district you enter in My Profile.</p><button className="secondary" onClick={()=>setTab('Scholarships')}>Add a scholarship</button></div>}
        <div className="section-head"><div><h2>Run profile-specific searches</h2><p>Each search includes your current education year and relevant background.</p></div></div>
        <div className="search-grid">{queryGroups.map((item)=><div className="search-card" key={item.title}><div className="search-card-icon">⌕</div><div><b>{item.title}</b><p>{item.query}</p></div><a href={googleSearch(item.query)} target="_blank" rel="noreferrer">Search ↗</a></div>)}</div>
        <div className="section-head"><div><h2>Trusted scholarship sources</h2><p>Use official sources first; some portals may contain third-party listings.</p></div></div>
        <div className="source-grid">{SOURCES.map((source)=><div className="source-card" key={source.name}><span>{source.group}</span><b>{source.name}</b><p>{source.detail}</p><a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a></div>)}</div>
        <div className="safety-note"><b>Scholarship safety check</b><p>Do not pay an application or processing fee to receive a scholarship. Be cautious of guaranteed awards or requests for bank/card details. Verify the sponsor independently before sharing information. <a href="https://consumer.ftc.gov/articles/how-avoid-scholarship-and-financial-aid-scams" target="_blank" rel="noreferrer">FTC guidance ↗</a></p></div>
      </div>}

      {tab === 'Cloud Search' && <div className="page">
        <div className="page-heading"><div><div className="eyebrow">SEARXNG LIVE WEB DISCOVERY</div><h1>Live scholarship search</h1><p>Search public scholarship pages through your laptop-hosted SearXNG service, then review leads and optionally save sponsor details to your private account.</p></div><span className="status status-likely-eligible">SearXNG discovery</span></div>
        <div className="cloud-run-row"><div><b>Live scholarship research</b><p className="muted">Public search works without signing in or creating an account. Only your state, graduation year, and selected categories are sent to the search service. Results are unverified leads until you review the official sponsor page.</p></div><button className="primary" disabled={cloudBusy || !isOnline || !supabaseConfigured || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>{cloudBusy ? 'Researching…' : 'Run research'}</button></div>
        <div className="panel discovery-category-picker" role="group" aria-labelledby="research-categories-title">
          <div className="panel-heading"><div><h3 id="research-categories-title">Research categories</h3><p className="muted">Choose up to four categories per run. You can run another search with a different selection.</p></div><span className="source-tag">{selectedDiscoveryCategories.length}/4 selected</span></div>
          <div className="discovery-category-grid">{DISCOVERY_CATEGORY_OPTIONS.map((category)=><label className="discovery-category-option" key={category.id}>
            <input type="checkbox" checked={selectedDiscoveryCategories.includes(category.id)} disabled={!selectedDiscoveryCategories.includes(category.id) && (!isLiveDiscoveryCategorySupported(category.id) || selectedDiscoveryCategories.length >= 4)} onChange={(event)=>setSelectedDiscoveryCategories((current)=>event.target.checked ? (current.length < 4 && isLiveDiscoveryCategorySupported(category.id) ? [...current, category.id] : current) : current.filter((id)=>id !== category.id))}/>
            <span><b>{category.label}</b><small>{category.description}{!isLiveDiscoveryCategorySupported(category.id) ? ' Not available in the deployed search yet.' : ''}</small></span>
          </label>)}</div>
          <p className="cloud-config-note">All categories listed here are supported by the current expanded search implementation. Choose up to four per run.</p>
          {!profile.state.trim() || !profile.graduationYear.trim() ? <p className="cloud-config-note">Add your state and expected graduation year in My Profile before running live search.</p> : null}
        </div>
        <div className="panel cloud-auth">
          <div className="panel-heading"><h3>Public search — no account required</h3><span className="status status-likely-eligible">Public access</span></div>
          <p className="muted">Anyone can run live scholarship research without signing in. Search requests are rate-limited and contain only state, graduation year, and selected categories.</p>
          <button type="button" className="secondary" onClick={() => setTab('Settings')}>Optional cloud account settings</button>
        </div>
        {cloudUser && <div className="panel cloud-authenticated">
          <div className="panel-heading"><div><h3>{cloudUser.is_anonymous ? 'Anonymous cloud account' : `Connected as ${cloudUser.email || 'signed-in user'}`}</h3><p className="muted">Cloud sponsor records are private to this account and protected by row-level security.</p></div><button className="secondary" onClick={()=>setTab('Settings')}>Manage account</button></div>
        </div>}
        {cloudMessage && <p className="cloud-message" role="status" aria-live="polite">{cloudMessage}</p>}
        {discoveryState === 'loading' && <div className="cloud-loading" aria-hidden="true">Researching…</div>}
        {discoveryState === 'empty' && <div className="panel cloud-empty" role="status" aria-live="polite"><b>No scholarship matches were found for this search.</b><p>Your search completed, but no usable public leads matched the selected categories. Try different categories or run the search again. Provider warnings, if any, appear in the research summary.</p><button type="button" className="secondary" onClick={()=>void handleCloudSearch()}>Try search again</button></div>}
        {discoveryState === 'error' && <div className="panel cloud-empty" role="alert"><b>Scholarship search could not be completed.</b><p>Review the search status message above for details, then retry the search.</p><button type="button" className="secondary" disabled={cloudBusy || !isOnline || !supabaseConfigured || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>Retry search</button></div>}
        {discoverySummary && <div className="panel search-metrics">
          <div className="panel-heading"><div><h3>Research run summary</h3><p className="muted">Search coverage and deduplicated lead count.</p></div><span className="source-tag">{discoverySummary.uniqueResults} unique leads</span></div>
          <div className="search-metrics-grid">
            <div><b>{discoverySummary.requestedQueries}</b><small>Search requests</small></div>
            <div><b>{discoverySummary.successfulQueries}</b><small>Successful</small></div>
            <div><b>{discoverySummary.failedQueries}</b><small>Failed</small></div>
            <div><b>{discoverySummary.pagesChecked}</b><small>Pages checked</small></div>
            <div><b>{discoverySummary.rawResultCount}</b><small>Raw results</small></div>
          </div>
          {discoveryWarnings.map((warning,index)=><p className="cloud-config-note" key={index}>{warning}</p>)}
        </div>}
        {exaResults.length>0 && <section aria-labelledby="live-search-results-title"><div className="section-head"><div><h2 id="live-search-results-title">Live SearXNG results</h2><p>Ranked and deduplicated research leads. Sponsor, award, deadline, and eligibility remain unverified until you review the official page.</p></div><span className="source-tag">{exaResults.length} leads</span></div>
          <div className="cloud-results" role="list" aria-label="Live scholarship search results">{exaResults.map((row)=><CloudResultCard key={row.id} item={row} tracked={items.some(x=>x.backendOpportunityId===row.id||x.sourceUrl===row.source_url)} onTrack={()=>addLiveResult(row)}/>)}</div>
        </section>}
        {cloudUser && !cloudBusy && liveResults.length === 0 && <div className="panel cloud-empty" role="status" aria-live="polite"><b>No saved cloud records yet.</b><p>Review a live lead and choose whether to save its sponsor details to your account.</p></div>}
        {cloudUser && liveResults.length>0 && <section aria-labelledby="saved-cloud-results-title"><div className="section-head"><div><h2 id="saved-cloud-results-title">Saved cloud records</h2><p>Sponsor details saved to your private account.</p></div><span className="source-tag">{liveResults.length} records</span></div>
          <div className="cloud-results" role="list" aria-label="Saved scholarship records">{liveResults.map((row)=><CloudResultCard key={row.id} item={row} tracked={items.some(x=>x.backendOpportunityId===row.id||x.sourceUrl===row.source_url)} onTrack={()=>addLiveResult(row)}/>)}</div>
        </section>}
      </div>}

      {tab === 'Scholarships' && <div className="page">
        <div className="page-heading"><div><div className="eyebrow">OPPORTUNITY TRACKER</div><h1>Scholarships</h1><p>Every saved opportunity is automatically compared against your current profile.</p></div><div className="tracker-heading-actions"><button className="secondary" onClick={exportTrackerReport}>↓ Export CSV report</button><button className="primary" onClick={()=>openAdd()}>＋ Add scholarship</button></div></div>
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
        <div className="table-card"><div className="table-title"><b>Tracked opportunities</b><span>{filtered.length} shown · eligibility and application status are tracked separately</span></div>{filtered.length===0 && items.length===0 ? <Empty onAdd={()=>openAdd()}/> : hasFilteredEmptyState ? <FilteredEmpty onClear={clearTrackerFilters}/> : <div className="table-wrap"><table><thead><tr><th>OPPORTUNITY</th><th>AWARD AMOUNT / BASIS</th><th>DEADLINE</th><th>URGENCY</th><th>APPLICATION</th><th>PRIORITY</th><th>ELIGIBILITY</th><th>SOURCE REVIEW</th><th></th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td data-label="Opportunity"><button type="button" className="tracker-open" aria-label={'Review ' + item.name} onClick={()=>setSelected(item)}>{item.name}</button><small>{item.provider}</small>{item.tags?.length ? <small>{item.tags.join(' · ')}</small> : null}</td><td data-label="Award amount / basis"><b>{item.award || 'Amount not recorded'}</b><small>Basis: as entered; not separately classified</small></td><td data-label="Deadline">{getDeadlineMilestones(item).map((milestone)=><small key={milestone.key}>{milestone.label}: {milestone.deadlineText || (milestone.deadline ? formatDate(milestone.deadline) : "Date not confirmed")}</small>)}</td><td data-label="Urgency">{getDeadlineMilestones(item).map((milestone)=><small key={milestone.key}>{milestone.label}: <DeadlineUrgencyPill deadline={milestone.deadline} timeZone={milestone.timeZone} openDate={item.openDate} openDateTimezone={item.openDateTimezone} deadlineTime={milestone.deadlineTime}/></small>)}</td><td data-label="Application"><ApplicationStatusPill status={item.applicationStatus || 'Not started'}/></td><td data-label="Priority"><PriorityPill priority={item.priority || 'Medium'}/></td><td data-label="Eligibility"><StatusPill status={summarizeEligibilityAssessment(assessments.get(item.id)).status as Status}/></td><td data-label="Source review"><SourceStatusPill item={item}/></td><td aria-hidden="true">›</td></tr>)}</tbody></table></div>}</div>
        <p className="footnote">“Eligible” means every structured rule entered in Scout passed and the official source review was marked complete. It is not an award guarantee; sponsor decisions and unentered requirements may still apply.</p>
      </div>}

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
          {profileSaveStatus === 'unavailable' ? 'Could not save your latest profile change in this browser. Export an encrypted backup before closing or reloading.' : profileSaveStatus === 'draft' ? 'An unfinished value is saved as a local draft and is not used for eligibility calculations until valid.' : profileSaveStatus === 'saved' ? 'Profile changes saved in this browser only.' : 'Profile information stays in this browser and is not uploaded to your cloud scholarship records.'}
        </div>
        <div className="form-card">
          <div className="form-section"><div className="section-title-row"><div><h3>Geographic and citizenship filters</h3><p>Useful for state, county, local, and national scholarships. School name and district are optional.</p></div><span className="source-tag">APPLICATION</span></div><div className="form-grid"><Field label="State of residence" value={profileDraft.state} onChange={v=>saveProfile({...profileDraft,state:v})}/><Field label="County" value={profileDraft.county} onChange={v=>saveProfile({...profileDraft,county:v})}/><Field label="Citizenship" value={profileDraft.citizenship} onChange={v=>saveProfile({...profileDraft,citizenship:v})}/><Field label="School name (optional)" value={profileDraft.school} onChange={v=>saveProfile({...profileDraft,school:v})} placeholder="Enter your school name"/><Field label="State where your school is located" value={profileDraft.schoolState} onChange={v=>saveProfile({...profileDraft,schoolState:v})} placeholder="Texas"/></div></div>
          <div className="form-section"><div className="section-title-row"><div><h3>Education plans</h3><p>Separates current senior eligibility from future college enrollment.</p></div><span className="source-tag">APPLICATION</span></div><div className="form-grid"><Field label="Age (whole years; optional, stays on this device)" value={profileDraft.age} onChange={v=>saveProfile({...profileDraft,age:v})} type="number"/><Field label="Current education level" value={profileDraft.grade} onChange={v=>saveProfile({...profileDraft,grade:v})}/><Field label="Expected graduation year" value={profileDraft.graduationYear} onChange={v=>saveProfile({...profileDraft,graduationYear:v})}/><Field label="Planned college" value={profileDraft.plannedCollege} onChange={v=>saveProfile({...profileDraft,plannedCollege:v})}/><Field label="State where your intended college is located" value={profileDraft.plannedCollegeState} onChange={v=>saveProfile({...profileDraft,plannedCollegeState:v})} placeholder="Texas"/><Field label="Intended major" value={profileDraft.plannedMajor} onChange={v=>saveProfile({...profileDraft,plannedMajor:v})}/></div><Field label="College status" value={profileDraft.collegeStatus} onChange={v=>saveProfile({...profileDraft,collegeStatus:v})} placeholder="e.g. incoming planned, full-time confirmed, part-time confirmed"/><Field label="Long-term education/career goal" value={profileDraft.degreeGoal} onChange={v=>saveProfile({...profileDraft,degreeGoal:v})}/></div>
          <div className="form-section"><div className="section-title-row"><div><h3>Academic filters</h3><p>Official transcript values override résumé estimates.</p></div><span className="source-tag">OFFICIAL TRANSCRIPT</span></div><div className="form-grid"><Field label="GPA" value={profileDraft.gpa} onChange={v=>saveProfile({...profileDraft,gpa:v})}/><Field label="GPA type and scale" value={profileDraft.gpaType} onChange={v=>saveProfile({...profileDraft,gpaType:v})}/><Field label="Official class standing" value={profileDraft.classRank} onChange={v=>saveProfile({...profileDraft,classRank:v})}/><Field label="State credits earned" value={profileDraft.credits} onChange={v=>saveProfile({...profileDraft,credits:v})}/><Field label="ACT composite" value={profileDraft.act} onChange={v=>saveProfile({...profileDraft,act:v})}/><Field label="SAT score" value={profileDraft.sat} onChange={v=>saveProfile({...profileDraft,sat:v})}/><Field label="AP courses" value={profileDraft.apCourses} onChange={v=>saveProfile({...profileDraft,apCourses:v})}/><Field label="Dual-credit courses" value={profileDraft.dualCreditCourses} onChange={v=>saveProfile({...profileDraft,dualCreditCourses:v})}/></div><small className="profile-search-hint">ACT scores must be 1–36 and SAT scores 400–1600. GPA must be numeric; a maximum is applied only when you enter a numeric GPA scale.</small><label className="field"><span>Academic honors and distinctions</span><textarea value={profileDraft.academicHonors} onChange={e=>saveProfile({...profileDraft,academicHonors:e.target.value})}/></label><Field label="Graduation program, achievement level, and endorsement" value={profileDraft.programNotes} onChange={v=>saveProfile({...profileDraft,programNotes:v})}/><div className="rank-warning"><b>Official transcript rank</b><p>{profileDraft.rankDetails}</p><Field label="Rank source and date / clarification" value={profileDraft.rankDetails} onChange={v=>saveProfile({...profileDraft,rankDetails:v})}/></div><div className="rank-warning"><b>Texas Grant notation — confirm before use</b><p>This transcript notation should be confirmed with the school or financial-aid office; it is not treated as automatic qualification for every Texas grant or scholarship.</p><Field label="Transcript's Texas Grant notation" value={profileDraft.texasGrantNotation} onChange={v=>saveProfile({...profileDraft,texasGrantNotation:v})}/></div></div>
          <div className="form-section"><div className="section-title-row"><div><h3>Activities and scholarship strengths</h3><p>Used for leadership, service, career-interest, and special-interest matching.</p></div><span className="source-tag">ACTIVITIES + RÉSUMÉ</span></div><Field label="Academic and career interests" value={profileDraft.interests} onChange={v=>saveProfile({...profileDraft,interests:v})}/><label className="field"><span>Clubs, leadership, and extracurriculars</span><textarea value={profileDraft.activities} onChange={e=>saveProfile({...profileDraft,activities:e.target.value})}/></label><div className="form-grid"><Field label="Community service hours" value={profileDraft.serviceHours} onChange={v=>saveProfile({...profileDraft,serviceHours:v})}/><Field label="Languages" value={profileDraft.languages} onChange={v=>saveProfile({...profileDraft,languages:v})}/></div><label className="field"><span>Service experience</span><textarea value={profileDraft.service} onChange={e=>saveProfile({...profileDraft,service:e.target.value})}/></label><div className="form-grid"><Field label="Employment" value={profileDraft.employment} onChange={v=>saveProfile({...profileDraft,employment:v})}/><Field label="Certifications" value={profileDraft.certifications} onChange={v=>saveProfile({...profileDraft,certifications:v})}/></div></div>
          <div className="form-section">
            <div className="section-title-row"><div><h3>Additional scholarship matching details</h3><p>Optional general details that make search links more relevant. Use broad topics, not private identifiers.</p></div><span className="source-tag">OPTIONAL SEARCH CONTEXT</span></div>
            <div className="form-grid">
              <Field label="Academic strengths or favorite subjects" value={profileDraft.academicStrengths} onChange={v=>saveProfile({...profileDraft,academicStrengths:v})} placeholder="e.g. history, writing, biology, computer science"/>
              <Field label="Career fields you want to explore" value={profileDraft.careerInterests} onChange={v=>saveProfile({...profileDraft,careerInterests:v})} placeholder="e.g. education, engineering, public service"/>
              <Field label="Awards, honors, and recognitions" value={profileDraft.awardsHonors} onChange={v=>saveProfile({...profileDraft,awardsHonors:v})} placeholder="List awards you have actually received or clearly mark pending"/>
              <Field label="Preferred college location" value={profileDraft.preferredCollegeLocation} onChange={v=>saveProfile({...profileDraft,preferredCollegeLocation:v})} placeholder="e.g. Texas, nearby states, anywhere in the U.S."/>
              <Field label="Expected enrollment plan" value={profileDraft.enrollmentPlan} onChange={v=>saveProfile({...profileDraft,enrollmentPlan:v})} placeholder="e.g. four-year university, community college, technical program"/>
            </div>
            <label className="field"><span>Extra scholarship search keywords</span><textarea value={profileDraft.searchKeywords} onChange={e=>saveProfile({...profileDraft,searchKeywords:e.target.value})} placeholder="Broad topics or award categories you want included in search links"/></label>
            <p className="profile-search-hint">These keywords can appear in Google searches after you click a search link. Do not enter your name, email, phone number, street address, account details, or other private information.</p>
          </div>
          <div className="form-section">
            <div className="section-title-row"><div><h3>School and district information</h3><p>Both fields are optional. Enter your own details to discover school-based awards, or leave them blank for broader results.</p></div><span className="source-tag">OPTIONAL</span></div>
            <div className="form-grid">
              <Field label="School district (optional)" value={profileDraft.district} onChange={v=>saveProfile({...profileDraft,district:v})} placeholder="Enter your school district"/>
            </div>
          </div>
          <div className="form-section"><div className="section-title-row"><div><h3>Optional matching detail</h3><p>Only use these when the scholarship's specific rules require them.</p></div><span className="source-tag">NEEDS CONFIRMATION</span></div><label className="field"><span>First-generation college student status</span><select value={profileDraft.firstGeneration} onChange={e=>saveProfile({...profileDraft,firstGeneration:e.target.value})}><option>Not confirmed — verify sponsor definition and family education details before matching</option><option>Yes — I meet the sponsor's definition</option><option>No</option><option>Unsure — needs review</option></select></label></div>
          <div className="privacy-note">◈ <span><b>Privacy-conscious profileDraft.</b><br/>Contact details, street address, government identifiers, health information, and household financial details are excluded from automated matching. Profile data is stored in this browser only.</span></div>
        </div>
      </div>}

      {tab === 'Application prep' && <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">APPLICATION WORKBENCH</div><h1>Application preparation</h1><p>Organize each scholarship separately, track required materials, and keep your drafts together on this device.</p></div></div>
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
              <div className="prep-section-heading"><div><h3>Submission and decision record</h3><p>This is a personal record only; Scout does not submit applications.</p></div><ApplicationStatusPill status={prepScholarship.applicationStatus||'Not started'}/></div>
              <p>Submission date: <b>{prepScholarship.submittedAt?formatDate(prepScholarship.submittedAt):'Not recorded'}</b> · Decision date: <b>{prepScholarship.decisionDate?formatDate(prepScholarship.decisionDate):'Not recorded'}</b></p>
              {!['Submitted','Awarded','Rejected'].includes(prepScholarship.applicationStatus||'Not started') && <button type="button" className="primary" onClick={markPrepScholarshipSubmitted}>Record as submitted</button>}
              <small className="deadline-footnote">To record an award or decision date, edit the scholarship's application status in the tracker. Keep official confirmation from the sponsor.</small>
            </section>
          </div>
        </>}
        <div className="panel"><h3>Writing principles</h3><p className="muted">Drafts should use your own voice and real experiences, answer the exact sponsor prompt, and never exaggerate achievements. Scholarship Scout counts words but does not invent personal stories or submit applications for you.</p></div>
      </div>}

      <footer className="page-footer">
        <div>Scholarship Scout <span>·</span> Personal scholarship assistant <span>·</span> Alpha 0.7</div>
        <div className="local-health" role="status" aria-live="polite">
          Local diagnostics active · {reliabilityEvents.length} recent client issues
          {reliabilityEvents.length > 0 && <button type="button" className="text-button" onClick={() => { clearReliabilityEvents(); setReliabilityEvents([]); }}>Clear local diagnostics</button>}
        </div>
        <small>Diagnostic history stays on this device. No telemetry is sent.</small>
      </footer>
    </main>

    {showAdd && <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="add-dialog-title" tabIndex={-1}>
      <div className="modal-head"><div><div className="eyebrow">{editingId ? 'EDIT OPPORTUNITY' : 'NEW OPPORTUNITY'}</div><h2 id="add-dialog-title">{editingId ? 'Update scholarship rules' : 'Add scholarship rules'}</h2></div><button className="close" aria-label="Close scholarship form" onClick={()=>setShowAdd(false)}>×</button></div>
      <p className="muted">Enter the sponsor’s mandatory criteria. Scout will compare these structured rules with your profile; it will not guess missing conditions from promotional text.</p>
      <div className="modal-fields">
        <Field label="Scholarship name *" value={draft.name} onChange={v=>setDraft({...draft,name:v})}/><Field label="Provider *" value={draft.provider} onChange={v=>setDraft({...draft,provider:v})}/>
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
            <CheckField label="Full-time college enrollment (legacy rule)" checked={Boolean(draft.criteria.requiresFullTimeEnrollment)} onChange={v=>setCriteria({requiresFullTimeEnrollment:v})}/>
            <span className="field-hint">Alternative enrollment routes (any one may satisfy the sponsor rule):</span>
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
      <div className="modal-actions"><button className="secondary" onClick={()=>setShowAdd(false)}>Cancel</button><button className="primary" onClick={add}>{editingId ? 'Save rule changes' : 'Save & check eligibility'}</button></div>
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
      <div className="modal-actions">{cloudUser && <button className="secondary" disabled={cloudBusy} onClick={()=>void handleCloudSave(selected)}>Save sponsor details to cloud</button>}<button className="secondary" onClick={()=>{const updated={...selected,archived:!selected.archived};saveItems(items.map(x=>x.id===selected.id?updated:x));setSelected(updated);setNotice(updated.archived?'Scholarship archived. Its history remains in your tracker.':'Scholarship restored to active records.')}}>{selected.archived ? 'Restore from archive' : 'Archive scholarship'}</button><button className="secondary" onClick={()=>{saveItems(items.filter(x=>x.id!==selected.id));setSelected(null)}}>Remove from tracker</button><button className="secondary" onClick={()=>{const item=selected;setSelected(null);openAdd(item,true)}}>Edit criteria / application</button><button className="primary" onClick={()=>setSelected(null)}>Done</button></div>
    </div></div>}

    {backupDialogMode !== 'closed' && <div className="overlay" onMouseDown={event=>{if(event.target===event.currentTarget)closeBackupDialog();}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title" tabIndex={-1}>
      <div className="modal-head"><div><div className="eyebrow">PRIVATE LOCAL BACKUP</div><h2 id="backup-dialog-title">{backupDialogMode === 'export' ? 'Encrypt backup' : backupPendingRestore ? 'Confirm backup import' : 'Unlock encrypted backup'}</h2></div><button className="close" aria-label="Close backup dialog" onClick={closeBackupDialog} disabled={backupBusy}>×</button></div>
      {backupDialogMode === 'export' ? <form onSubmit={event=>void exportEncryptedBackup(event)}>
        <p className="muted">Your profile, tracker, and checklist will be encrypted in this browser before download using AES-256-GCM. Use at least 12 characters. Scholarship Scout never saves this password; losing it means the backup cannot be recovered.</p>
        <label className="field"><span>Backup password (12 characters minimum)</span><input type="password" value={backupPassword} onChange={event=>setBackupPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={1024} required/></label>
        <label className="field"><span>Confirm backup password</span><input type="password" value={backupPasswordConfirm} onChange={event=>setBackupPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={12} maxLength={1024} required/></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={closeBackupDialog} disabled={backupBusy}>Cancel</button><button type="submit" className="primary" disabled={backupBusy}>{backupBusy ? 'Encrypting…' : 'Encrypt & download'}</button></div>
      </form> : backupPendingRestore ? <form onSubmit={event=>{event.preventDefault();confirmRestoreLocalBackup();}}>
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
    {item.discovery_pages?.length ? <small className="candidate-source">Search pages checked: {item.discovery_pages.join(', ')} · Found in {item.discovery_queries?.length || 1} query variation(s)</small> : null}
    {sanitizePublicHttpsUrl(item.source_evidence_url || '') && <p><a className="source-link" href={sanitizePublicHttpsUrl(item.source_evidence_url || '') || undefined} target="_blank" rel="noreferrer">Open supporting rules / evidence ↗</a></p>}
    {rules?.eligibility_requirements?.length ? <div className="extracted-rules"><b>Extracted sponsor rules — provisional</b>{rules.eligibility_requirements.map((rule,index)=><div key={index}><span>{rule.mandatory?'Required':'Selection / preference'}{rule.needs_human_confirmation?' · Confirm with sponsor':''}</span><p>{rule.requirement}</p>{rule.evidence&&<small>Evidence: {rule.evidence}</small>}</div>)}</div>:null}
    {rules?.uncertainties?.length ? <div className="uncertainty-list"><b>Still unclear</b><ul>{rules.uncertainties.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_documents?.length ? <div className="extracted-rules"><b>Application documents</b><ul>{rules.application_documents.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_steps?.length ? <div className="extracted-rules"><b>Application steps</b><ol>{rules.application_steps.map((item,index)=><li key={index}>{item}</li>)}</ol></div>:null}
    {rules?.application_fee === true ? <div className="risk-flag">⚠ The sponsor-page extraction indicates an application fee. Verify directly with the sponsor and do not pay to apply.</div>:null}
    <div className="candidate-actions">{sanitizePublicHttpsUrl(item.source_url) && <a href={sanitizePublicHttpsUrl(item.source_url) || undefined} target="_blank" rel="noreferrer">Open source page ↗</a>}<button className="secondary" disabled={true} title="Sponsor verification Edge Function is not deployed">Verification not deployed</button><button className="primary" disabled={tracked} onClick={onTrack}>{tracked?'In tracker':'＋ Add to tracker'}</button></div>
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
function Field({label,value,onChange,placeholder,type='text'}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;type?:string}) { return <label className="field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>; }
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
