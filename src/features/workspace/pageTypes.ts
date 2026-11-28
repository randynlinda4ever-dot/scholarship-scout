import type { Dispatch, SetStateAction, FormEvent } from 'react';
import type { EligibilityAssessment } from '../../eligibility.js';
import type { ApplicationProgress } from '../../lib/applicationProgress.js';
import type { ApplicationWorkspaceEntry } from '../../lib/applicationWorkspace.js';
import type { EligibilitySummary } from '../../lib/eligibilitySummary.js';
import type { ProfileReadiness } from '../../lib/profileReadiness.js';
import type { PotentialDuplicate, DeadlineMilestone, DeadlineUrgency } from '../../lib/trackerInsights.js';
import type { ApplicationStatus } from '../../lib/trackerManagement.js';
import type { LiveScholarship, LiveDiscoverySummary } from '../../lib/scholarshipApi';
import type { CandidateAssessment, Profile, Scholarship, Status } from '../../domain/types.js';


export interface OverviewPageModel {
  applicationCounts: ReturnType<typeof import('../../lib/trackerManagement.js').getApplicationStatusCounts>;
  assessments: Map<string, EligibilityAssessment>;
  candidateAssessments: CandidateAssessment[];
  deadlineOverview: Array<{ item: Scholarship; milestone: DeadlineMilestone; urgency: DeadlineUrgency }>;
  deadlinesDueSoon: number;
  exportLocalBackup: () => void;
  formatDate: (value?: string) => string;
  importLocalBackup: (file?: File) => Promise<void>;
  items: Scholarship[];
  openAdd: (candidate?: Scholarship, editing?: boolean) => void;
  overdueDeadlines: number;
  profile: Profile;
  profileReadiness: ProfileReadiness;
  profileTags: string[];
  setSelected: Dispatch<SetStateAction<Scholarship | null>>;
  setTab: Dispatch<SetStateAction<string>>;
  tracked: (id: string) => boolean;
}

export interface SettingsPageModel {
  authCooldownSeconds: number;
  cloudBusy: boolean;
  cloudEmail: string;
  cloudMessage: string;
  cloudUser: { id: string; email?: string; is_anonymous?: boolean } | null;
  compactView: boolean;
  handleCheckCloudSession: () => Promise<void>;
  handleCloudSignIn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleCloudSignOut: () => Promise<void>;
  isOnline: boolean;
  setCloudEmail: Dispatch<SetStateAction<string>>;
  setCompactView: Dispatch<SetStateAction<boolean>>;
  setTheme: Dispatch<SetStateAction<'dark' | 'light'>>;
  supabaseConfigured: boolean;
  theme: 'dark' | 'light';
}

export interface DiscoveryPageModel {
  candidateAssessments: CandidateAssessment[];
  googleSearch: (query: string) => string;
  openAdd: (candidate?: Scholarship, editing?: boolean) => void;
  queryGroups: Array<{ title: string; query: string }>;
  setTab: Dispatch<SetStateAction<string>>;
  SOURCES: Array<{ name: string; group: string; detail: string; url: string }>;
  tracked: (id: string) => boolean;
}

export interface CloudSearchPageModel {
  addLiveResult: (row: LiveScholarship) => void;
  cloudBusy: boolean;
  cloudMessage: string;
  cloudUser: { id: string; email?: string; is_anonymous?: boolean } | null;
  discoveryState: 'idle' | 'loading' | 'results' | 'empty' | 'error';
  discoverySummary: LiveDiscoverySummary | null;
  discoveryWarnings: string[];
  exaResults: LiveScholarship[];
  handleCloudSearch: () => Promise<void>;
  isLiveDiscoveryCategorySupported: (category: unknown) => boolean;
  isOnline: boolean;
  items: Scholarship[];
  liveResults: LiveScholarship[];
  profile: Profile;
  selectedDiscoveryCategories: string[];
  setSelectedDiscoveryCategories: Dispatch<SetStateAction<string[]>>;
  setTab: Dispatch<SetStateAction<string>>;
  supabaseConfigured: boolean;
}

export interface ScholarshipsPageModel {
  APPLICATION_STATUSES: readonly ApplicationStatus[];
  applicationStatusFilter: string;
  archiveFilter: 'active' | 'archived' | 'all';
  assessments: Map<string, EligibilityAssessment>;
  clearTrackerFilters: () => void;
  duplicateSuggestions: PotentialDuplicate[];
  exportTrackerReport: () => void;
  filter: string;
  filtered: Scholarship[];
  formatDate: (value?: string) => string;
  getDeadlineMilestones: typeof import('../../lib/trackerInsights.js').getDeadlineMilestones;
  hasFilteredEmptyState: boolean;
  items: Scholarship[];
  openAdd: (candidate?: Scholarship, editing?: boolean) => void;
  query: string;
  setApplicationStatusFilter: Dispatch<SetStateAction<string>>;
  setArchiveFilter: Dispatch<SetStateAction<'active' | 'archived' | 'all'>>;
  setFilter: Dispatch<SetStateAction<string>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setSelected: Dispatch<SetStateAction<Scholarship | null>>;
  setTrackerSortBy: Dispatch<SetStateAction<'deadline' | 'priority' | 'award' | 'applicationStatus' | 'eligibility' | 'name'>>;
  statuses: Status[];
  summarizeEligibilityAssessment: (assessment?: EligibilityAssessment | null) => EligibilitySummary;
  trackerSortBy: 'name' | 'award' | 'deadline' | 'priority' | 'applicationStatus' | 'eligibility';
}

export interface EligibilityFiltersPageModel {
  profileDraft: Profile;
  profileReadiness: ProfileReadiness;
  profileSaveStatus: 'idle' | 'saved' | 'draft' | 'unavailable';
  saveProfile: (next: Profile) => void;
}

export interface ApplicationPrepPageModel {
  APPLICATION_CHECKLIST_STEPS: readonly string[];
  applicationProgress: ApplicationProgress;
  countApplicationWords: (value: unknown) => number;
  createWorkspaceItemId: () => string;
  formatDate: (value?: string) => string;
  items: Scholarship[];
  markPrepScholarshipSubmitted: () => void;
  prepScholarship: Scholarship | null;
  prepSummary: { completed: number; total: number; percent: number; wordCount: number; overLimitEssays: number; pendingRecommendations: number; requiredDocuments: number; readyDocuments: number };
  prepWorkspace: ApplicationWorkspaceEntry;
  RECOMMENDATION_STATUSES: readonly ApplicationWorkspaceEntry['recommenders'][number]['status'][];
  saveApplicationTask: (scholarshipId: string, stepIndex: number, checked: boolean) => void;
  savePrepWorkspace: (next: ApplicationWorkspaceEntry) => void;
  setPrepScholarshipId: Dispatch<SetStateAction<string>>;
  setTab: (tab: string) => void;
}
