import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { assessEligibility, type EligibilityCriteria, type EligibilityAssessment } from './eligibility.js';
import { deriveSourceStatus, getEvidenceExcerptAttributions, getSourceAttribution, normalizeAndDeduplicateScholarships, normalizeScholarshipRecords, resolveSourceAuthority, sanitizePublicHttpsUrl } from './lib/evidence.js';
import { appendSourceEvidenceHistory, invalidateSourceReviewIfChanged } from './lib/sourceReview.js';
import { getSupabaseClient, supabaseConfigured } from './lib/supabaseClient';
import { buildScoutBackup, validateScoutBackup } from './lib/backup.js';

import { findPotentialDuplicates, getDeadlineMilestones, getDeadlineUrgency } from './lib/trackerInsights.js';
import { APPLICATION_CHECKLIST_STEPS, normalizeApplicationProgress, updateApplicationProgress } from './lib/applicationProgress.js';
import { createApplicationWorkspace, normalizeApplicationWorkspace, getApplicationWorkspaceSummary, countApplicationWords, RECOMMENDATION_STATUSES, type ApplicationWorkspaceEntry } from './lib/applicationWorkspace.js';
import { summarizeEligibilityAssessment } from './lib/eligibilitySummary.js';
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
import { CheckField, Field, SelectField } from './components/WorkspaceFields';
import { ApplicationStatusPill, EligibilityMatchSummary, EvidenceCompletenessList, PriorityPill, SourceStatusPill, StatusPill } from './components/StatusPills';
import type { CriteriaImportance, Profile, Scholarship, Status } from './domain/types.js';
import { OverviewPage } from './features/workspace/pages/OverviewPage';
import { SettingsPage } from './features/workspace/pages/SettingsPage';
import { DiscoveryPage } from './features/workspace/pages/DiscoveryPage';
import { CloudSearchPage } from './features/workspace/pages/CloudSearchPage';
import { ScholarshipsPage } from './features/workspace/pages/ScholarshipsPage';
import { EligibilityFiltersPage } from './features/workspace/pages/EligibilityFiltersPage';
import { ApplicationPrepPage } from './features/workspace/pages/ApplicationPrepPage';

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

  const renderWorkspacePage = () => {
    switch (tab) {
    case "Overview":
      return <OverviewPage model={{ applicationCounts, assessments, candidateAssessments, deadlineOverview, deadlinesDueSoon, exportLocalBackup, formatDate, importLocalBackup, items, openAdd, overdueDeadlines, profile, profileReadiness, profileTags, setSelected, setTab, tracked }} />;
    case "Settings":
      return <SettingsPage model={{ authCooldownSeconds, cloudBusy, cloudEmail, cloudMessage, cloudUser, compactView, handleCheckCloudSession, handleCloudSignIn, handleCloudSignOut, isOnline, setCloudEmail, setCompactView, setTheme, supabaseConfigured, theme }} />;
    case "Discovery":
      return <DiscoveryPage model={{ candidateAssessments, googleSearch, openAdd, queryGroups, setTab, SOURCES, tracked }} />;
    case "Cloud Search":
      return <CloudSearchPage model={{ addLiveResult, cloudBusy, cloudMessage, cloudUser, discoveryState, discoverySummary, discoveryWarnings, exaResults, handleCloudSearch, isLiveDiscoveryCategorySupported, isOnline, items, liveResults, profile, selectedDiscoveryCategories, setSelectedDiscoveryCategories, setTab, supabaseConfigured }} />;
    case "Scholarships":
      return <ScholarshipsPage model={{ APPLICATION_STATUSES, applicationStatusFilter, archiveFilter, assessments, clearTrackerFilters, duplicateSuggestions, exportTrackerReport, filter, filtered, formatDate, getDeadlineMilestones, hasFilteredEmptyState, items, openAdd, query, setApplicationStatusFilter, setArchiveFilter, setFilter, setQuery, setSelected, setTrackerSortBy, statuses, summarizeEligibilityAssessment, trackerSortBy }} />;
    case "Eligibility filters":
      return <EligibilityFiltersPage model={{ profileDraft, profileReadiness, profileSaveStatus, saveProfile }} />;
    case "Application prep":
      return <ApplicationPrepPage model={{ APPLICATION_CHECKLIST_STEPS, applicationProgress, countApplicationWords, createWorkspaceItemId, formatDate, items, markPrepScholarshipSubmitted, prepScholarship, prepSummary, prepWorkspace, RECOMMENDATION_STATUSES, saveApplicationTask, savePrepWorkspace, setPrepScholarshipId, setTab }} />;
      default:
        return null;
    }
  };

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

      {renderWorkspacePage()}

      {}

      {}

      {}

      {}

      {}

      {}

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

















export default App;
