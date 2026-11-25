import type {
  Application,
  ApplicationChannel,
  ApplicationStatus,
  CandidateProfile,
  Job,
  JobFilterState,
  JobKind,
  JobSource,
  JobStatus,
  LanguageCode,
  LinkedInQueryItem,
  PortalSearchGroup,
  ProposalLanguageOption,
  ScanResponse,
  SenderType,
  SystemHealth,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    const errObj = (data && typeof data === 'object' ? data : {}) as { error?: string; code?: string };
    throw new ApiError(errObj.error || `Error HTTP ${res.status}`, res.status, errObj.code);
  }

  return data as T;
}

export const api = {
  getHealth: () => request<SystemHealth>('/health'),

  getSchemaSql: () => request<{ sql: string; migrationV2Sql?: string }>('/setup/schema'),

  listJobs: (filters?: Partial<JobFilterState>) => {
    const params = new URLSearchParams();
    if (filters?.source) params.set('source', filters.source);
    if (filters?.kind) params.set('kind', filters.kind);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.language) params.set('language', filters.language);
    if (filters?.sortBy) params.set('sortBy', filters.sortBy);
    if (filters?.maxAgeDays && filters.maxAgeDays > 0) params.set('maxAgeDays', String(filters.maxAgeDays));
    if (filters?.minScore && filters.minScore > 0) params.set('minScore', String(filters.minScore));
    if (filters?.search?.trim()) params.set('search', filters.search.trim());
    if (filters?.analyzedOnly) params.set('analyzedOnly', 'true');
    const qs = params.toString();
    return request<Job[]>(`/jobs${qs ? `?${qs}` : ''}`);
  },

  scanBoards: (options?: {
    providers?: Array<'greenhouse' | 'lever' | 'getonbrd' | 'freelancer' | 'remotive' | 'jobicy'>;
    analyzeTop?: number;
    useFallback?: boolean;
  }) =>
    request<ScanResponse>('/scan', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  syncLocalJobs: () =>
    request<{ migrated: number; totalLocal: number; totalSupabase: number }>('/jobs/sync-local', {
      method: 'POST',
    }),

  updateJobStatus: (jobId: string, status: JobStatus) =>
    request<Job>(`/jobs/${encodeURIComponent(jobId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  analyzeJob: (jobId: string, options?: { useFallback?: boolean }) =>
    request<{ job: Job }>(`/jobs/${encodeURIComponent(jobId)}/analyze`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  runFullFlow: (
    jobId: string,
    options?: {
      channel?: ApplicationChannel;
      language?: ProposalLanguageOption;
      senderType?: SenderType;
      customInstructions?: string;
      useFallback?: boolean;
    },
  ) =>
    request<{ job: Job; application: Application }>(`/jobs/${encodeURIComponent(jobId)}/run-flow`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  getLinkedInQueries: () => request<LinkedInQueryItem[]>('/linkedin/queries'),

  getPortalSearches: () => request<PortalSearchGroup[]>('/portals/searches'),

  importJob: (payload: {
    title: string;
    description: string;
    url: string;
    company?: string;
    source?: JobSource;
    kind?: JobKind;
    language?: LanguageCode;
    autoAnalyze?: boolean;
    autoGenerateProposal?: boolean;
    proposalLanguage?: ProposalLanguageOption;
    senderType?: SenderType;
    useFallback?: boolean;
  }) =>
    request<{
      added: boolean;
      job: Job;
      application: Application | null;
      aiWarning: string | null;
    }>('/jobs/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProfiles: () => request<{ individual: CandidateProfile; company: CandidateProfile }>('/profiles'),

  getProfile: (type: SenderType = 'individual') =>
    request<CandidateProfile>(`/profile?type=${type}`),

  saveProfile: (payload: Partial<CandidateProfile>) =>
    request<CandidateProfile>('/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  listApplications: (filters?: {
    status?: ApplicationStatus | '';
    channel?: ApplicationChannel | '';
    language?: LanguageCode | '';
    senderType?: SenderType | '';
    jobId?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.channel) params.set('channel', filters.channel);
    if (filters?.language) params.set('language', filters.language);
    if (filters?.senderType) params.set('senderType', filters.senderType);
    if (filters?.jobId) params.set('jobId', filters.jobId);
    const qs = params.toString();
    return request<Application[]>(`/applications${qs ? `?${qs}` : ''}`);
  },

  generateApplication: (payload: {
    jobId: string;
    channel?: ApplicationChannel;
    language?: ProposalLanguageOption;
    senderType?: SenderType;
    customInstructions?: string;
    useFallback?: boolean;
  }) =>
    request<{ application: Application; job: Job }>('/applications/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateApplication: (
    id: string,
    payload: Partial<Pick<Application, 'subject' | 'proposalText' | 'status' | 'notes' | 'channel' | 'language'>>,
  ) =>
    request<Application>(`/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteApplication: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/applications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
