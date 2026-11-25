export type JobSource =
  | 'linkedin'
  | 'greenhouse'
  | 'lever'
  | 'getonbrd'
  | 'freelancer'
  | 'remotive'
  | 'jobicy'
  | 'workana'
  | 'computrabajo'
  | 'other';

export type JobKind = 'freelance' | 'employment';
export type JobStatus = 'new' | 'saved' | 'prepared' | 'applied' | 'discarded';
export type LanguageCode = 'es' | 'en';
export type ProposalLanguageOption = 'auto' | 'es' | 'en';
export type JobSortBy = 'recent' | 'score';
export type SenderType = 'individual' | 'company';

export type ApplicationChannel = 'proposal' | 'cover_letter' | 'linkedin_dm' | 'email';
export type ApplicationStatus = 'draft' | 'reviewed' | 'sent' | 'interview' | 'rejected' | 'accepted';

export interface Job {
  id: string;
  source: JobSource;
  company?: string | null;
  title: string;
  description: string;
  url: string;
  kind: JobKind;
  language: LanguageCode;
  score: number;
  matchedTerms: string[];
  status: JobStatus;
  aiScore?: number | null;
  aiSummary?: string | null;
  aiFitReasons?: string[];
  aiGaps?: string[];
  aiRecommended?: boolean | null;
  aiModel?: string | null;
  aiAnalyzedAt?: string | null;
  publishedAt?: string | null;
  discoveredAt: string;
  updatedAt?: string;
}

export interface CandidateProfile {
  id: string;
  profileType: SenderType;
  fullName: string;
  companyName?: string | null;
  companyWebsite?: string | null;
  headline: string;
  summary: string;
  skills: string[];
  experienceYears: number;
  preferredRoles: string[];
  preferredKinds: JobKind[];
  remoteOnly: boolean;
  hourlyRateUsd?: number | null;
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  languages: string[];
  proposalTone: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Application {
  id: string;
  jobId: string;
  profileId?: string | null;
  senderType: SenderType;
  channel: ApplicationChannel;
  language: LanguageCode;
  subject?: string | null;
  proposalText: string;
  highlights: string[];
  status: ApplicationStatus;
  aiModel?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
  job?: Pick<
    Job,
    'id' | 'title' | 'company' | 'source' | 'url' | 'kind' | 'language' | 'score' | 'aiScore' | 'status'
  > | null;
}

export interface LinkedInQueryItem {
  query: string;
  url: string;
  category: 'freelance' | 'frontend' | 'mobile' | 'fullstack' | 'backend';
  language: LanguageCode;
}

export interface PortalSearchGroup {
  portal: string;
  source: JobSource;
  description: string;
  language: 'es' | 'en' | 'es/en';
  kind: 'freelance' | 'employment' | 'ambos';
  links: Array<{
    label: string;
    url: string;
    category: string;
  }>;
}

export interface SystemHealth {
  ok: boolean;
  storage: 'supabase' | 'local-fallback';
  supabaseConfigured: boolean;
  supabaseReady: boolean;
  schemaV2Ready?: boolean;
  tables: {
    jobs: boolean;
    candidate_profiles: boolean;
    applications: boolean;
  };
  openaiConfigured: boolean;
  openaiModel: string;
  counts: {
    jobs: number;
    analyzed: number;
    applications: number;
  };
  count: number;
}

export interface JobFilterState {
  search: string;
  source: '' | JobSource;
  kind: '' | JobKind;
  status: '' | JobStatus;
  language: '' | LanguageCode;
  minScore: number;
  maxAgeDays: number;
  sortBy: JobSortBy;
  analyzedOnly: boolean;
}

export interface ScanResponse {
  boardsChecked: number;
  providersChecked?: string[];
  discovered: number;
  added: number;
  total: number;
  storage: 'supabase' | 'local-fallback';
  analyzedCount: number;
  errors: string[];
}
