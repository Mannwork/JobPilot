import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type {
  Application,
  ApplicationChannel,
  ApplicationStatus,
  CandidateProfile,
  Job,
  JobFilterParams,
  JobStatus,
  LanguageCode,
  SenderType,
  SupabaseTableStatus,
} from '../types.js';
import { detectLanguage } from '../services/jobScanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = resolve(__dirname, '..', '..');
const projectRoot = resolve(backendRoot, '..');

for (const envPath of [resolve(backendRoot, '.env'), resolve(projectRoot, '.env')]) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  '';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_KEY && /^https?:\/\//.test(SUPABASE_URL),
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function resolveDataFilePath(): string {
  const configured = process.env.DATA_FILE?.trim();
  if (configured) {
    const fromBackend = resolve(backendRoot, configured);
    if (existsSync(fromBackend)) return fromBackend;
    const fromRoot = resolve(projectRoot, configured);
    if (existsSync(fromRoot)) return fromRoot;
    return fromRoot;
  }
  return resolve(projectRoot, 'data', 'jobs.json');
}

export const LOCAL_JOBS_PATH = resolveDataFilePath();
const LOCAL_APPS_PATH = resolve(dirname(LOCAL_JOBS_PATH), 'applications.json');
const LOCAL_PROFILE_PATH = resolve(dirname(LOCAL_JOBS_PATH), 'profile.json');
const LOCAL_COMPANY_PROFILE_PATH = resolve(dirname(LOCAL_JOBS_PATH), 'company-profile.json');
export const SCHEMA_SQL_PATH = resolve(backendRoot, 'supabase', 'schema.sql');
export const MIGRATION_V2_SQL_PATH = resolve(backendRoot, 'supabase', 'migration_v2_languages_portals.sql');

export const DEFAULT_FALLBACK_PROFILE: CandidateProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  profileType: 'individual',
  fullName: 'Desarrollador Fullstack',
  companyName: null,
  companyWebsite: null,
  headline: 'Fullstack & Mobile Developer · React, React Native, TypeScript, Node.js, Supabase',
  summary:
    'Desarrollador enfocado en construir productos web y móviles escalables con React, React Native, TypeScript, Node.js, Express y PostgreSQL/Supabase. Experiencia en proyectos freelance y equipos remotos entregando MVPs rápidos y código mantenible.',
  skills: [
    'React',
    'React Native',
    'TypeScript',
    'JavaScript',
    'Node.js',
    'Express',
    'Supabase',
    'PostgreSQL',
    'Expo',
    'Tailwind CSS',
    'REST APIs',
  ],
  experienceYears: 3,
  preferredRoles: [
    'Fullstack Developer',
    'Frontend Developer',
    'React Native Developer',
    'Freelance Developer',
  ],
  preferredKinds: ['freelance', 'employment'],
  remoteOnly: true,
  hourlyRateUsd: 40,
  portfolioUrl: null,
  githubUrl: null,
  linkedinUrl: null,
  languages: ['Español', 'Inglés'],
  proposalTone: 'profesional, cercano y orientado a resultados',
  isDefault: true,
};

export const DEFAULT_COMPANY_PROFILE: CandidateProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  profileType: 'company',
  fullName: 'Lautaro · Mannwork Inc.',
  companyName: 'Mannwork Inc.',
  companyWebsite: 'https://www.mannwork.com/',
  headline: 'Mannwork Inc. — Consultora de Software · Desarrollo Web, Mobile, SaaS e IA a medida',
  summary:
    'En Mannwork Inc. somos una consultora de software especializada en diseñar, desarrollar y escalar productos digitales a medida: plataformas web, aplicaciones móviles (React Native / Expo), arquitecturas backend con Node.js, TypeScript y PostgreSQL/Supabase, e integraciones con Inteligencia Artificial. Acompañamos a clientes y empresas desde el descubrimiento y MVP hasta producción con metodología ágil y entregas continuas.',
  skills: [
    'React',
    'React Native',
    'TypeScript',
    'Node.js',
    'Next.js',
    'Supabase',
    'PostgreSQL',
    'Expo',
    'OpenAI / IA',
    'APIs REST',
    'SaaS',
    'MVP Development',
  ],
  experienceYears: 5,
  preferredRoles: [
    'Consultora de Software',
    'Desarrollo de MVP',
    'Equipo Dedicado Fullstack',
    'Desarrollo Web y Mobile',
  ],
  preferredKinds: ['freelance'],
  remoteOnly: true,
  hourlyRateUsd: 55,
  portfolioUrl: 'https://www.mannwork.com/',
  githubUrl: null,
  linkedinUrl: null,
  languages: ['Español', 'Inglés'],
  proposalTone: 'consultivo, ejecutivo, cercano y enfocado en resultados de negocio',
  isDefault: false,
};

let cachedTableStatus: { checkedAt: number; tables: SupabaseTableStatus; schemaV2Ready: boolean } | null = null;
const TABLE_CACHE_TTL_MS = 5_000;

export async function checkSupabaseTables(force = false): Promise<SupabaseTableStatus> {
  if (!supabase) {
    return { jobs: false, candidate_profiles: false, applications: false };
  }
  if (!force && cachedTableStatus && Date.now() - cachedTableStatus.checkedAt < TABLE_CACHE_TTL_MS) {
    return cachedTableStatus.tables;
  }

  const tables: SupabaseTableStatus = {
    jobs: false,
    candidate_profiles: false,
    applications: false,
  };

  await Promise.all(
    (['jobs', 'candidate_profiles', 'applications'] as const).map(async (table) => {
      const { error, status } = await supabase.from(table).select('id').limit(1);
      tables[table] = !error && status >= 200 && status < 300;
    }),
  );

  let schemaV2Ready = false;
  if (tables.jobs && tables.applications && tables.candidate_profiles) {
    const [jRes, aRes, pRes] = await Promise.all([
      supabase.from('jobs').select('id, language, published_at').limit(1),
      supabase.from('applications').select('id, language, sender_type').limit(1),
      supabase.from('candidate_profiles').select('id, profile_type, company_name, company_website').limit(1),
    ]);
    schemaV2Ready = !jRes.error && !aRes.error && !pRes.error;
  }

  cachedTableStatus = { checkedAt: Date.now(), tables, schemaV2Ready };
  return tables;
}

export async function isSchemaV2Ready(force = false): Promise<boolean> {
  if (!supabase) return true;
  await checkSupabaseTables(force);
  return cachedTableStatus?.schemaV2Ready ?? false;
}

export async function isSupabaseReady(force = false): Promise<boolean> {
  const tables = await checkSupabaseTables(force);
  return tables.jobs && tables.candidate_profiles && tables.applications;
}

export async function getSchemaSql(): Promise<string> {
  try {
    return await readFile(SCHEMA_SQL_PATH, 'utf8');
  } catch {
    return '-- No se encontró backend/supabase/schema.sql';
  }
}

export async function getMigrationV2Sql(): Promise<string> {
  try {
    return await readFile(MIGRATION_V2_SQL_PATH, 'utf8');
  } catch {
    return '-- No se encontró backend/supabase/migration_v2_languages_portals.sql';
  }
}

// ----------------------------------------------------------------------------
// Row mappers (Supabase snake_case <-> API camelCase)
// ----------------------------------------------------------------------------
interface JobRow {
  id: string;
  source: Job['source'];
  company: string | null;
  title: string;
  description: string;
  url: string;
  kind: Job['kind'];
  language?: LanguageCode | null;
  score: number;
  matched_terms: string[] | null;
  status: JobStatus;
  ai_score: number | null;
  ai_summary: string | null;
  ai_fit_reasons: string[] | null;
  ai_gaps: string[] | null;
  ai_recommended: boolean | null;
  ai_model: string | null;
  ai_analyzed_at: string | null;
  published_at?: string | null;
  discovered_at: string;
  updated_at?: string;
}

function hydrateJob(raw: Job): Job {
  return {
    ...raw,
    language: raw.language === 'es' || raw.language === 'en' ? raw.language : detectLanguage(`${raw.title} ${raw.description}`),
    publishedAt: raw.publishedAt ?? raw.discoveredAt,
    matchedTerms: raw.matchedTerms ?? [],
  };
}

function mapJobRow(row: JobRow): Job {
  return hydrateJob({
    id: row.id,
    source: row.source,
    company: row.company,
    title: row.title,
    description: row.description,
    url: row.url,
    kind: row.kind,
    language: row.language === 'es' || row.language === 'en' ? row.language : detectLanguage(`${row.title} ${row.description}`),
    score: row.score,
    matchedTerms: row.matched_terms ?? [],
    status: row.status,
    aiScore: row.ai_score,
    aiSummary: row.ai_summary,
    aiFitReasons: row.ai_fit_reasons ?? [],
    aiGaps: row.ai_gaps ?? [],
    aiRecommended: row.ai_recommended,
    aiModel: row.ai_model,
    aiAnalyzedAt: row.ai_analyzed_at,
    publishedAt: row.published_at ?? row.discovered_at,
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
  });
}

function toJobInsertRow(job: Job, includeV2Columns = true) {
  const hydrated = hydrateJob(job);
  const base = {
    id: hydrated.id,
    source: hydrated.source,
    company: hydrated.company ?? null,
    title: hydrated.title,
    description: hydrated.description,
    url: hydrated.url,
    kind: hydrated.kind,
    score: Math.max(0, Math.min(100, Math.round(hydrated.score))),
    matched_terms: hydrated.matchedTerms ?? [],
    status: hydrated.status ?? 'new',
    ai_score: hydrated.aiScore ?? null,
    ai_summary: hydrated.aiSummary ?? null,
    ai_fit_reasons: hydrated.aiFitReasons ?? [],
    ai_gaps: hydrated.aiGaps ?? [],
    ai_recommended: hydrated.aiRecommended ?? null,
    ai_model: hydrated.aiModel ?? null,
    ai_analyzed_at: hydrated.aiAnalyzedAt ?? null,
    discovered_at: hydrated.discoveredAt || new Date().toISOString(),
  };

  if (!includeV2Columns) return base;
  return {
    ...base,
    language: hydrated.language,
    published_at: hydrated.publishedAt ?? hydrated.discoveredAt ?? new Date().toISOString(),
  };
}

interface ProfileRow {
  id: string;
  profile_type?: SenderType | null;
  full_name: string;
  company_name?: string | null;
  company_website?: string | null;
  headline: string;
  summary: string;
  skills: string[] | null;
  experience_years: number;
  preferred_roles: string[] | null;
  preferred_kinds: Job['kind'][] | null;
  remote_only: boolean;
  hourly_rate_usd: number | null;
  portfolio_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  languages: string[] | null;
  proposal_tone: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

function mapProfileRow(row: ProfileRow): CandidateProfile {
  return {
    id: row.id,
    profileType: row.profile_type === 'company' ? 'company' : 'individual',
    fullName: row.full_name,
    companyName: row.company_name ?? null,
    companyWebsite: row.company_website ?? null,
    headline: row.headline,
    summary: row.summary,
    skills: row.skills ?? [],
    experienceYears: row.experience_years ?? 0,
    preferredRoles: row.preferred_roles ?? [],
    preferredKinds: row.preferred_kinds ?? ['freelance', 'employment'],
    remoteOnly: row.remote_only ?? true,
    hourlyRateUsd: row.hourly_rate_usd,
    portfolioUrl: row.portfolio_url,
    githubUrl: row.github_url,
    linkedinUrl: row.linkedin_url,
    languages: row.languages ?? ['Español', 'Inglés'],
    proposalTone: row.proposal_tone ?? DEFAULT_FALLBACK_PROFILE.proposalTone,
    isDefault: row.is_default ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ApplicationRow {
  id: string;
  job_id: string;
  profile_id: string | null;
  sender_type?: SenderType | null;
  channel: ApplicationChannel;
  language?: LanguageCode | null;
  subject: string | null;
  proposal_text: string;
  highlights: string[] | null;
  status: ApplicationStatus;
  ai_model: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string;
  jobs?: Pick<
    JobRow,
    'id' | 'title' | 'company' | 'source' | 'url' | 'kind' | 'language' | 'score' | 'ai_score' | 'status'
  > | null;
}

function mapApplicationRow(row: ApplicationRow): Application {
  const lang: LanguageCode =
    row.language === 'es' || row.language === 'en'
      ? row.language
      : detectLanguage(`${row.subject || ''} ${row.proposal_text}`);

  const senderType: SenderType =
    row.sender_type === 'company' || row.sender_type === 'individual'
      ? row.sender_type
      : /mannwork/i.test(`${row.subject || ''} ${row.proposal_text}`)
        ? 'company'
        : 'individual';

  return {
    id: row.id,
    jobId: row.job_id,
    profileId: row.profile_id,
    senderType,
    channel: row.channel,
    language: lang,
    subject: row.subject,
    proposalText: row.proposal_text,
    highlights: row.highlights ?? [],
    status: row.status,
    aiModel: row.ai_model,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    job: row.jobs
      ? {
          id: row.jobs.id,
          title: row.jobs.title,
          company: row.jobs.company,
          source: row.jobs.source,
          url: row.jobs.url,
          kind: row.jobs.kind,
          language: row.jobs.language === 'es' || row.jobs.language === 'en' ? row.jobs.language : 'en',
          score: row.jobs.score,
          aiScore: row.jobs.ai_score,
          status: row.jobs.status,
        }
      : null,
  };
}

// ----------------------------------------------------------------------------
// Local JSON fallback helpers
// ----------------------------------------------------------------------------
async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function effectiveScore(job: Job): number {
  return typeof job.aiScore === 'number' ? job.aiScore : job.score;
}

function effectiveTimestamp(job: Job): number {
  const ts = Date.parse(job.publishedAt || job.discoveredAt);
  return Number.isFinite(ts) ? ts : 0;
}

function applyJobFilters(items: Job[], filters: JobFilterParams): Job[] {
  const query = filters.search?.trim().toLocaleLowerCase('es');
  const minScore = typeof filters.minScore === 'number' && !Number.isNaN(filters.minScore) ? filters.minScore : 0;
  const maxAgeCutoff =
    typeof filters.maxAgeDays === 'number' && filters.maxAgeDays > 0
      ? Date.now() - filters.maxAgeDays * 24 * 60 * 60 * 1000
      : null;

  const filtered = items.map(hydrateJob).filter((j) => {
    if (filters.source && j.source !== filters.source) return false;
    if (filters.kind && j.kind !== filters.kind) return false;
    if (filters.status && j.status !== filters.status) return false;
    if (filters.language && j.language !== filters.language) return false;
    if (filters.analyzedOnly && typeof j.aiScore !== 'number') return false;
    if (effectiveScore(j) < minScore) return false;
    if (maxAgeCutoff !== null && effectiveTimestamp(j) < maxAgeCutoff) return false;
    if (query) {
      const hay = `${j.title} ${j.company || ''} ${j.description} ${(j.matchedTerms || []).join(' ')}`.toLocaleLowerCase('es');
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  if (filters.sortBy === 'recent') {
    return filtered.sort((a, b) => effectiveTimestamp(b) - effectiveTimestamp(a) || effectiveScore(b) - effectiveScore(a));
  }

  return filtered.sort((a, b) => effectiveScore(b) - effectiveScore(a) || effectiveTimestamp(b) - effectiveTimestamp(a));
}

// ----------------------------------------------------------------------------
// Jobs Repository
// ----------------------------------------------------------------------------
export async function listJobs(filters: JobFilterParams = {}): Promise<{ jobs: Job[]; storage: 'supabase' | 'local-fallback' }> {
  if (supabase && (await isSupabaseReady())) {
    const v2 = await isSchemaV2Ready();
    let query = supabase.from('jobs').select('*');
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.kind) query = query.eq('kind', filters.kind);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.language && v2) query = query.eq('language', filters.language);
    if (filters.analyzedOnly) query = query.not('ai_score', 'is', null);

    const { data, error } = await query.order('discovered_at', { ascending: false }).limit(1000);
    if (error) throw new Error(`Supabase listJobs error: ${error.message}`);

    const mapped = ((data ?? []) as JobRow[]).map(mapJobRow);
    return { jobs: applyJobFilters(mapped, filters), storage: 'supabase' };
  }

  const localJobs = await readJsonFile<Job[]>(LOCAL_JOBS_PATH, []);
  return { jobs: applyJobFilters(localJobs, filters), storage: 'local-fallback' };
}

export async function getJobById(id: string): Promise<Job | null> {
  if (supabase && (await isSupabaseReady())) {
    const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase getJobById error: ${error.message}`);
    return data ? mapJobRow(data as JobRow) : null;
  }

  const localJobs = await readJsonFile<Job[]>(LOCAL_JOBS_PATH, []);
  const found = localJobs.find((j) => j.id === id);
  return found ? hydrateJob(found) : null;
}

export async function upsertJobs(items: Job[]): Promise<{ added: number; total: number; storage: 'supabase' | 'local-fallback' }> {
  if (items.length === 0) {
    const current = await listJobs();
    return { added: 0, total: current.jobs.length, storage: current.storage };
  }

  if (supabase && (await isSupabaseReady())) {
    const ids = items.map((i) => i.id);
    const existingIds = new Set<string>();
    const chunkSize = 150;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase.from('jobs').select('id').in('id', slice);
      if (error) throw new Error(`Supabase existing check error: ${error.message}`);
      for (const row of data ?? []) {
        existingIds.add(String(row.id));
      }
    }

    const freshItems = items.filter((item) => !existingIds.has(item.id));
    if (freshItems.length > 0) {
      const v2 = await isSchemaV2Ready();
      const hasNewSources = freshItems.some(
        (item) => !['linkedin', 'greenhouse', 'lever'].includes(item.source),
      );
      if (!v2 && hasNewSources) {
        throw new Error(
          'Tu base de Supabase tiene el esquema v1. Ejecutá backend/supabase/migration_v2_languages_portals.sql en Supabase SQL Editor para habilitar los nuevos portales (Get on Board, Freelancer, Workana, Computrabajo, etc.) y el soporte de idiomas ES/EN.',
        );
      }
      const rows = freshItems.map((item) => toJobInsertRow(item, v2));
      for (let i = 0; i < rows.length; i += chunkSize) {
        const batch = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from('jobs').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw new Error(`Supabase upsertJobs error: ${error.message}`);
      }
    }

    const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true });
    return { added: freshItems.length, total: count ?? existingIds.size + freshItems.length, storage: 'supabase' };
  }

  const localJobs = await readJsonFile<Job[]>(LOCAL_JOBS_PATH, []);
  let added = 0;
  for (const item of items) {
    if (!localJobs.some((j) => j.id === item.id)) {
      localJobs.push(hydrateJob(item));
      added++;
    }
  }
  await writeJsonFile(LOCAL_JOBS_PATH, localJobs);
  return { added, total: localJobs.length, storage: 'local-fallback' };
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<Job | null> {
  if (supabase && (await isSupabaseReady())) {
    const { data, error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Supabase updateJobStatus error: ${error.message}`);
    return data ? mapJobRow(data as JobRow) : null;
  }

  const localJobs = await readJsonFile<Job[]>(LOCAL_JOBS_PATH, []);
  const job = localJobs.find((j) => j.id === id);
  if (!job) return null;
  job.status = status;
  job.updatedAt = new Date().toISOString();
  await writeJsonFile(LOCAL_JOBS_PATH, localJobs);
  return hydrateJob(job);
}

export async function updateJobAiAnalysis(
  id: string,
  analysis: {
    aiScore: number;
    aiSummary: string;
    aiFitReasons: string[];
    aiGaps: string[];
    aiRecommended: boolean;
    aiModel: string;
  },
): Promise<Job | null> {
  const analyzedAt = new Date().toISOString();

  if (supabase && (await isSupabaseReady())) {
    const { data, error } = await supabase
      .from('jobs')
      .update({
        ai_score: Math.max(0, Math.min(100, Math.round(analysis.aiScore))),
        ai_summary: analysis.aiSummary,
        ai_fit_reasons: analysis.aiFitReasons,
        ai_gaps: analysis.aiGaps,
        ai_recommended: analysis.aiRecommended,
        ai_model: analysis.aiModel,
        ai_analyzed_at: analyzedAt,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Supabase updateJobAiAnalysis error: ${error.message}`);
    return data ? mapJobRow(data as JobRow) : null;
  }

  const localJobs = await readJsonFile<Job[]>(LOCAL_JOBS_PATH, []);
  const job = localJobs.find((j) => j.id === id);
  if (!job) return null;
  job.aiScore = Math.max(0, Math.min(100, Math.round(analysis.aiScore)));
  job.aiSummary = analysis.aiSummary;
  job.aiFitReasons = analysis.aiFitReasons;
  job.aiGaps = analysis.aiGaps;
  job.aiRecommended = analysis.aiRecommended;
  job.aiModel = analysis.aiModel;
  job.aiAnalyzedAt = analyzedAt;
  job.updatedAt = analyzedAt;
  await writeJsonFile(LOCAL_JOBS_PATH, localJobs);
  return hydrateJob(job);
}

export async function syncLocalJobsToSupabase(): Promise<{ migrated: number; totalLocal: number; totalSupabase: number }> {
  if (!supabase || !(await isSupabaseReady(true))) {
    throw new Error('Las tablas de Supabase todavía no están creadas. Ejecutá backend/supabase/schema.sql primero.');
  }

  const localJobs = await readJsonFile<Job[]>(LOCAL_JOBS_PATH, []);
  if (localJobs.length === 0) {
    const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true });
    return { migrated: 0, totalLocal: 0, totalSupabase: count ?? 0 };
  }

  const { added, total } = await upsertJobs(localJobs.map(hydrateJob));
  return { migrated: added, totalLocal: localJobs.length, totalSupabase: total };
}

// ----------------------------------------------------------------------------
// Candidate Profiles Repository (Individual + Company / Mannwork Inc.)
// ----------------------------------------------------------------------------
export async function getProfileByType(type: SenderType = 'individual'): Promise<CandidateProfile> {
  const defaultSeed = type === 'company' ? DEFAULT_COMPANY_PROFILE : DEFAULT_FALLBACK_PROFILE;
  const localPath = type === 'company' ? LOCAL_COMPANY_PROFILE_PATH : LOCAL_PROFILE_PATH;

  if (supabase && (await isSupabaseReady())) {
    const v2 = await isSchemaV2Ready();
    if (!v2) {
      if (type === 'company') {
        return readJsonFile<CandidateProfile>(localPath, defaultSeed);
      }
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Supabase getDefaultCandidateProfile error: ${error.message}`);
      if (data) return mapProfileRow(data as ProfileRow);
      return defaultSeed;
    }

    const { data, error } = await supabase
      .from('candidate_profiles')
      .select('*')
      .eq('profile_type', type)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Supabase getProfileByType error: ${error.message}`);
    if (data) return mapProfileRow(data as ProfileRow);

    const { data: inserted, error: insertError } = await supabase
      .from('candidate_profiles')
      .insert({
        profile_type: type,
        full_name: defaultSeed.fullName,
        company_name: defaultSeed.companyName ?? null,
        company_website: defaultSeed.companyWebsite ?? null,
        headline: defaultSeed.headline,
        summary: defaultSeed.summary,
        skills: defaultSeed.skills,
        experience_years: defaultSeed.experienceYears,
        preferred_roles: defaultSeed.preferredRoles,
        preferred_kinds: defaultSeed.preferredKinds,
        remote_only: defaultSeed.remoteOnly,
        hourly_rate_usd: defaultSeed.hourlyRateUsd ?? null,
        portfolio_url: defaultSeed.portfolioUrl ?? null,
        languages: defaultSeed.languages,
        proposal_tone: defaultSeed.proposalTone,
        is_default: type === 'individual',
      })
      .select('*')
      .single();

    if (insertError) throw new Error(`Supabase seed ${type} profile error: ${insertError.message}`);
    return mapProfileRow(inserted as ProfileRow);
  }

  return readJsonFile<CandidateProfile>(localPath, defaultSeed);
}

export async function getDefaultCandidateProfile(): Promise<CandidateProfile> {
  return getProfileByType('individual');
}

export async function getAllProfiles(): Promise<{
  individual: CandidateProfile;
  company: CandidateProfile;
}> {
  const [individual, company] = await Promise.all([
    getProfileByType('individual'),
    getProfileByType('company'),
  ]);
  return { individual, company };
}

export async function saveCandidateProfile(
  patch: Partial<Omit<CandidateProfile, 'id' | 'createdAt' | 'updatedAt'>>,
  type: SenderType = 'individual',
): Promise<CandidateProfile> {
  const current = await getProfileByType(type);
  const merged: CandidateProfile = {
    ...current,
    ...patch,
    profileType: type,
    updatedAt: new Date().toISOString(),
  };

  const localPath = type === 'company' ? LOCAL_COMPANY_PROFILE_PATH : LOCAL_PROFILE_PATH;

  if (supabase && (await isSupabaseReady())) {
    const v2 = await isSchemaV2Ready();
    if (!v2 && type === 'company') {
      await writeJsonFile(localPath, merged);
      return merged;
    }

    const updatePayload: Record<string, unknown> = {
      full_name: merged.fullName,
      headline: merged.headline,
      summary: merged.summary,
      skills: merged.skills,
      experience_years: merged.experienceYears,
      preferred_roles: merged.preferredRoles,
      preferred_kinds: merged.preferredKinds,
      remote_only: merged.remoteOnly,
      hourly_rate_usd: merged.hourlyRateUsd ?? null,
      portfolio_url: merged.portfolioUrl ?? null,
      github_url: merged.githubUrl ?? null,
      linkedin_url: merged.linkedinUrl ?? null,
      languages: merged.languages,
      proposal_tone: merged.proposalTone,
    };

    if (v2) {
      updatePayload.profile_type = type;
      updatePayload.company_name = merged.companyName ?? null;
      updatePayload.company_website = merged.companyWebsite ?? null;
    }

    const { data, error } = await supabase
      .from('candidate_profiles')
      .update(updatePayload)
      .eq('id', current.id)
      .select('*')
      .single();

    if (error) throw new Error(`Supabase saveCandidateProfile error: ${error.message}`);
    return mapProfileRow(data as ProfileRow);
  }

  await writeJsonFile(localPath, merged);
  return merged;
}

// ----------------------------------------------------------------------------
// Applications Repository
// ----------------------------------------------------------------------------
export async function listApplications(filters: {
  status?: ApplicationStatus;
  channel?: ApplicationChannel;
  language?: LanguageCode;
  senderType?: SenderType;
  jobId?: string;
} = {}): Promise<{ applications: Application[]; storage: 'supabase' | 'local-fallback' }> {
  if (supabase && (await isSupabaseReady())) {
    const v2 = await isSchemaV2Ready();
    const selectCols = v2
      ? '*, jobs(id, title, company, source, url, kind, language, score, ai_score, status)'
      : '*, jobs(id, title, company, source, url, kind, score, ai_score, status)';
    let query = supabase.from('applications').select(selectCols);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.channel) query = query.eq('channel', filters.channel);
    if (filters.language && v2) query = query.eq('language', filters.language);
    if (filters.senderType && v2) query = query.eq('sender_type', filters.senderType);
    if (filters.jobId) query = query.eq('job_id', filters.jobId);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(`Supabase listApplications error: ${error.message}`);

    const mapped = ((data ?? []) as unknown as ApplicationRow[]).map(mapApplicationRow);
    const finalApps = mapped.filter((a) => {
      if (filters.language && a.language !== filters.language) return false;
      if (filters.senderType && a.senderType !== filters.senderType) return false;
      return true;
    });
    return {
      applications: finalApps,
      storage: 'supabase',
    };
  }

  const localApps = await readJsonFile<Application[]>(LOCAL_APPS_PATH, []);
  const localJobs = (await readJsonFile<Job[]>(LOCAL_JOBS_PATH, [])).map(hydrateJob);
  const jobsMap = new Map(localJobs.map((j) => [j.id, j]));

  const filtered = localApps
    .map((a) => ({
      ...a,
      senderType: (a.senderType === 'company' ? 'company' : 'individual') as SenderType,
      language:
        a.language === 'es' || a.language === 'en'
          ? a.language
          : detectLanguage(`${a.subject || ''} ${a.proposalText}`),
    }))
    .filter((a) => {
      if (filters.status && a.status !== filters.status) return false;
      if (filters.channel && a.channel !== filters.channel) return false;
      if (filters.language && a.language !== filters.language) return false;
      if (filters.senderType && a.senderType !== filters.senderType) return false;
      if (filters.jobId && a.jobId !== filters.jobId) return false;
      return true;
    })
    .map((a) => {
      const job = jobsMap.get(a.jobId);
      return {
        ...a,
        job: job
          ? {
              id: job.id,
              title: job.title,
              company: job.company,
              source: job.source,
              url: job.url,
              kind: job.kind,
              language: job.language,
              score: job.score,
              aiScore: job.aiScore,
              status: job.status,
            }
          : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { applications: filtered, storage: 'local-fallback' };
}

export async function createApplication(input: {
  jobId: string;
  profileId?: string | null;
  senderType: SenderType;
  channel: ApplicationChannel;
  language: LanguageCode;
  subject?: string | null;
  proposalText: string;
  highlights: string[];
  aiModel?: string | null;
  notes?: string | null;
}): Promise<Application> {
  if (supabase && (await isSupabaseReady())) {
    const v2 = await isSchemaV2Ready();
    const selectCols = v2
      ? '*, jobs(id, title, company, source, url, kind, language, score, ai_score, status)'
      : '*, jobs(id, title, company, source, url, kind, score, ai_score, status)';
    const safeProfileId =
      !v2 && input.senderType === 'company' ? null : (input.profileId ?? null);
    const insertPayload: Record<string, unknown> = {
      job_id: input.jobId,
      profile_id: safeProfileId,
      channel: input.channel,
      subject: input.subject ?? null,
      proposal_text: input.proposalText,
      highlights: input.highlights,
      status: 'draft',
      ai_model: input.aiModel ?? null,
      notes: input.notes ?? null,
    };
    if (v2) {
      insertPayload.language = input.language;
      insertPayload.sender_type = input.senderType;
    }

    const { data, error } = await supabase
      .from('applications')
      .insert(insertPayload)
      .select(selectCols)
      .single();

    if (error) throw new Error(`Supabase createApplication error: ${error.message}`);
    const mapped = mapApplicationRow(data as unknown as ApplicationRow);
    return { ...mapped, language: input.language, senderType: input.senderType };
  }

  const localApps = await readJsonFile<Application[]>(LOCAL_APPS_PATH, []);
  const job = await getJobById(input.jobId);
  const now = new Date().toISOString();
  const created: Application = {
    id: randomUUID(),
    jobId: input.jobId,
    profileId: input.profileId ?? null,
    senderType: input.senderType,
    channel: input.channel,
    language: input.language,
    subject: input.subject ?? null,
    proposalText: input.proposalText,
    highlights: input.highlights,
    status: 'draft',
    aiModel: input.aiModel ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    job: job
      ? {
          id: job.id,
          title: job.title,
          company: job.company,
          source: job.source,
          url: job.url,
          kind: job.kind,
          language: job.language,
          score: job.score,
          aiScore: job.aiScore,
          status: job.status,
        }
      : null,
  };
  localApps.unshift(created);
  await writeJsonFile(LOCAL_APPS_PATH, localApps);
  return created;
}

export async function updateApplication(
  id: string,
  patch: Partial<Pick<Application, 'subject' | 'proposalText' | 'status' | 'notes' | 'channel' | 'language'>>,
): Promise<Application | null> {
  if (supabase && (await isSupabaseReady())) {
    const v2 = await isSchemaV2Ready();
    const selectCols = v2
      ? '*, jobs(id, title, company, source, url, kind, language, score, ai_score, status)'
      : '*, jobs(id, title, company, source, url, kind, score, ai_score, status)';
    const updatePayload: Record<string, unknown> = {};
    if (patch.subject !== undefined) updatePayload.subject = patch.subject;
    if (patch.proposalText !== undefined) updatePayload.proposal_text = patch.proposalText;
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;
    if (patch.channel !== undefined) updatePayload.channel = patch.channel;
    if (patch.language !== undefined && v2) updatePayload.language = patch.language;

    const { data, error } = await supabase
      .from('applications')
      .update(updatePayload)
      .eq('id', id)
      .select(selectCols)
      .maybeSingle();

    if (error) throw new Error(`Supabase updateApplication error: ${error.message}`);
    return data ? mapApplicationRow(data as unknown as ApplicationRow) : null;
  }

  const localApps = await readJsonFile<Application[]>(LOCAL_APPS_PATH, []);
  const idx = localApps.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  localApps[idx] = {
    ...localApps[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(LOCAL_APPS_PATH, localApps);
  return localApps[idx];
}

export async function deleteApplication(id: string): Promise<boolean> {
  if (supabase && (await isSupabaseReady())) {
    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) throw new Error(`Supabase deleteApplication error: ${error.message}`);
    return true;
  }

  const localApps = await readJsonFile<Application[]>(LOCAL_APPS_PATH, []);
  const next = localApps.filter((a) => a.id !== id);
  if (next.length === localApps.length) return false;
  await writeJsonFile(LOCAL_APPS_PATH, next);
  return true;
}
