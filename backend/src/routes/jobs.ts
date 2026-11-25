import { Router } from 'express';
import { z } from 'zod';
import {
  createApplication,
  getAllProfiles,
  getDefaultCandidateProfile,
  getJobById,
  getProfileByType,
  listApplications,
  listJobs,
  saveCandidateProfile,
  syncLocalJobsToSupabase,
  updateJobAiAnalysis,
  updateJobStatus,
  upsertJobs,
} from '../config/supabase.js';
import { analyzeJobCompatibility } from '../services/aiAnalyzer.js';
import { generatePersonalizedProposal } from '../services/applicationGenerator.js';
import { buildJob, scanConfiguredBoards, type ScanProviderId } from '../services/jobScanner.js';
import {
  detectSourceFromUrl,
  getLinkedInQueries,
  getPortalSearchGroups,
  linkedInImportSchema,
  universalImportSchema,
} from '../services/linkedinSearch.js';
import type {
  ApplicationChannel,
  JobKind,
  JobSortBy,
  JobSource,
  JobStatus,
  LanguageCode,
  SenderType,
} from '../types.js';

export const jobsRouter = Router();

const jobSourceEnum = z.enum([
  'linkedin',
  'greenhouse',
  'lever',
  'getonbrd',
  'freelancer',
  'remotive',
  'jobicy',
  'workana',
  'computrabajo',
  'other',
]);
const jobKindEnum = z.enum(['freelance', 'employment']);
const jobStatusEnum = z.enum(['new', 'saved', 'prepared', 'applied', 'discarded']);
const languageEnum = z.enum(['es', 'en']);
const proposalLangEnum = z.enum(['es', 'en', 'auto']);
const senderTypeEnum = z.enum(['individual', 'company']);
const sortByEnum = z.enum(['recent', 'score']);
const channelEnum = z.enum(['proposal', 'cover_letter', 'linkedin_dm', 'email']);
const providerEnum = z.enum(['greenhouse', 'lever', 'getonbrd', 'freelancer', 'remotive', 'jobicy']);

const scanBodySchema = z
  .object({
    providers: z.array(providerEnum).optional(),
    analyzeTop: z.number().int().min(0).max(10).optional(),
    useFallback: z.boolean().optional(),
  })
  .optional();

const analyzeBodySchema = z
  .object({
    useFallback: z.boolean().optional(),
  })
  .optional();

const runFlowBodySchema = z
  .object({
    channel: channelEnum.optional(),
    language: proposalLangEnum.optional(),
    senderType: senderTypeEnum.optional(),
    customInstructions: z.string().max(1000).optional(),
    useFallback: z.boolean().optional(),
  })
  .optional();

const profileUpdateSchema = z.object({
  profileType: senderTypeEnum.optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  companyName: z.string().trim().max(150).nullable().or(z.literal('')).optional(),
  companyWebsite: z.string().trim().url().nullable().or(z.literal('')).optional(),
  headline: z.string().trim().max(240).optional(),
  summary: z.string().trim().max(3000).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  preferredRoles: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  preferredKinds: z.array(jobKindEnum).min(1).max(2).optional(),
  remoteOnly: z.boolean().optional(),
  hourlyRateUsd: z.number().int().min(0).max(1000).nullable().optional(),
  portfolioUrl: z.string().trim().url().nullable().or(z.literal('')).optional(),
  githubUrl: z.string().trim().url().nullable().or(z.literal('')).optional(),
  linkedinUrl: z.string().trim().url().nullable().or(z.literal('')).optional(),
  languages: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  proposalTone: z.string().trim().min(3).max(200).optional(),
});

// ----------------------------------------------------------------------------
// Multi-portal search links (LinkedIn, Workana, Computrabajo, Get on Board, etc.)
// ----------------------------------------------------------------------------
jobsRouter.get('/linkedin/queries', (_req, res) => {
  res.json(getLinkedInQueries());
});

jobsRouter.get('/portals/searches', (_req, res) => {
  res.json(getPortalSearchGroups());
});

async function handleImportJob(input: {
  source: JobSource;
  title: string;
  description: string;
  url: string;
  company?: string;
  kind?: JobKind;
  language?: LanguageCode;
  autoAnalyze?: boolean;
  autoGenerateProposal?: boolean;
  proposalLanguage?: 'es' | 'en' | 'auto';
  senderType?: SenderType;
  useFallback?: boolean;
}) {
  const jobDraft = buildJob({
    source: input.source,
    title: input.title,
    description: input.description,
    url: input.url,
    company: input.company,
    kindOverride: input.kind,
    language: input.language,
    publishedAt: new Date().toISOString(),
  });

  const { added, storage } = await upsertJobs([jobDraft]);
  let job = (await getJobById(jobDraft.id)) ?? jobDraft;
  let application = null;
  let aiWarning: string | null = null;

  if (input.autoAnalyze || input.autoGenerateProposal) {
    const senderType: SenderType = input.senderType ?? 'individual';
    const profile = await getProfileByType(senderType);
    try {
      const analysis = await analyzeJobCompatibility(job, profile, { useFallback: input.useFallback });
      job = (await updateJobAiAnalysis(job.id, analysis)) ?? job;

      if (input.autoGenerateProposal) {
        const channel: ApplicationChannel =
          senderType === 'company'
            ? 'proposal'
            : job.source === 'linkedin' && job.kind !== 'freelance'
              ? 'linkedin_dm'
              : job.kind === 'freelance'
                ? 'proposal'
                : 'cover_letter';

        const generated = await generatePersonalizedProposal(job, profile, {
          channel,
          language: input.proposalLanguage ?? 'auto',
          senderType,
          useFallback: input.useFallback,
        });

        application = await createApplication({
          jobId: job.id,
          profileId: profile.id,
          senderType: generated.senderType,
          channel,
          language: generated.language,
          subject: generated.subject,
          proposalText: generated.proposalText,
          highlights: generated.highlights,
          aiModel: generated.aiModel,
        });
        job = (await updateJobStatus(job.id, 'prepared')) ?? job;
      }
    } catch (err) {
      aiWarning = err instanceof Error ? err.message : String(err);
    }
  }

  return { added: Boolean(added), storage, job, application, aiWarning };
}

jobsRouter.post('/linkedin/import', async (req, res, next) => {
  try {
    const parsed = linkedInImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }
    const result = await handleImportJob({ ...parsed.data, source: 'linkedin' });
    res.status(result.added ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/jobs/import', async (req, res, next) => {
  try {
    const parsed = universalImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }
    const source = parsed.data.source ?? detectSourceFromUrl(parsed.data.url);
    const result = await handleImportJob({ ...parsed.data, source });
    res.status(result.added ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Multi-source scanner (Get on Board ES, Freelancer ES+EN, Remotive, Jobicy, Greenhouse, Lever)
// ----------------------------------------------------------------------------
jobsRouter.post('/scan', async (req, res, next) => {
  try {
    const parsedBody = scanBodySchema.safeParse(req.body);
    const providers = parsedBody.success ? (parsedBody.data?.providers as ScanProviderId[] | undefined) : undefined;
    const analyzeTop = parsedBody.success ? parsedBody.data?.analyzeTop ?? 0 : 0;
    const useFallback = parsedBody.success ? parsedBody.data?.useFallback ?? false : false;

    const scanResult = await scanConfiguredBoards({ providers });
    const { added, total, storage } = await upsertJobs(scanResult.jobs);

    let analyzedCount = 0;
    const aiErrors: string[] = [];

    if (analyzeTop > 0) {
      const profile = await getDefaultCandidateProfile();
      const { jobs } = await listJobs({ sortBy: 'recent' });
      const candidates = jobs.filter((j) => typeof j.aiScore !== 'number').slice(0, analyzeTop);

      for (const candidate of candidates) {
        try {
          const analysis = await analyzeJobCompatibility(candidate, profile, { useFallback });
          await updateJobAiAnalysis(candidate.id, analysis);
          analyzedCount++;
        } catch (err) {
          aiErrors.push(`${candidate.title}: ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
      }
    }

    res.json({
      boardsChecked: scanResult.boardsChecked,
      providersChecked: scanResult.providersChecked,
      discovered: scanResult.jobs.length,
      added,
      total,
      storage,
      analyzedCount,
      errors: [...scanResult.errors, ...aiErrors],
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Jobs CRUD + AI Compatibility + End-to-End 5-step flow
// ----------------------------------------------------------------------------
jobsRouter.get('/jobs', async (req, res, next) => {
  try {
    const source = jobSourceEnum.safeParse(req.query.source).success
      ? (req.query.source as JobSource)
      : undefined;
    const kind = jobKindEnum.safeParse(req.query.kind).success
      ? (req.query.kind as JobKind)
      : undefined;
    const status = jobStatusEnum.safeParse(req.query.status).success
      ? (req.query.status as JobStatus)
      : undefined;
    const language = languageEnum.safeParse(req.query.language).success
      ? (req.query.language as LanguageCode)
      : undefined;
    const sortBy = sortByEnum.safeParse(req.query.sortBy).success
      ? (req.query.sortBy as JobSortBy)
      : 'score';
    const minScore = Number(req.query.minScore || 0);
    const maxAgeDays = Number(req.query.maxAgeDays || 0);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const analyzedOnly = req.query.analyzedOnly === 'true';

    const { jobs } = await listJobs({
      source,
      kind,
      status,
      language,
      minScore: Number.isFinite(minScore) ? minScore : 0,
      maxAgeDays: Number.isFinite(maxAgeDays) && maxAgeDays > 0 ? maxAgeDays : undefined,
      search,
      analyzedOnly,
      sortBy,
    });

    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/jobs/sync-local', async (_req, res, next) => {
  try {
    const result = await syncLocalJobsToSupabase();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Oferta no encontrada' });
      return;
    }
    const { applications } = await listApplications({ jobId: job.id });
    res.json({ job, applications });
  } catch (err) {
    next(err);
  }
});

jobsRouter.patch('/jobs/:id/status', async (req, res, next) => {
  try {
    const parsed = jobStatusEnum.safeParse(req.body?.status);
    if (!parsed.success) {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }
    const updated = await updateJobStatus(req.params.id, parsed.data as JobStatus);
    if (!updated) {
      res.status(404).json({ error: 'Oferta no encontrada' });
      return;
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/jobs/:id/analyze', async (req, res, next) => {
  try {
    const body = analyzeBodySchema.safeParse(req.body);
    const useFallback = body.success ? body.data?.useFallback ?? false : false;

    const job = await getJobById(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Oferta no encontrada' });
      return;
    }

    const profile = await getDefaultCandidateProfile();
    const analysis = await analyzeJobCompatibility(job, profile, { useFallback });
    const updated = await updateJobAiAnalysis(job.id, analysis);

    res.json({ job: updated, analysis });
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/jobs/:id/run-flow', async (req, res, next) => {
  try {
    const parsed = runFlowBodySchema.safeParse(req.body);
    const channel: ApplicationChannel | undefined = parsed.success ? parsed.data?.channel : undefined;
    const language = parsed.success ? parsed.data?.language : undefined;
    const senderType: SenderType = parsed.success ? parsed.data?.senderType ?? 'individual' : 'individual';
    const customInstructions = parsed.success ? parsed.data?.customInstructions : undefined;
    const useFallback = parsed.success ? parsed.data?.useFallback ?? false : false;

    const existing = await getJobById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Oferta no encontrada' });
      return;
    }

    const profile = await getProfileByType(senderType);

    const analysis = await analyzeJobCompatibility(existing, profile, { useFallback });
    const analyzedJob = (await updateJobAiAnalysis(existing.id, analysis)) ?? existing;

    const resolvedChannel: ApplicationChannel =
      channel ?? (senderType === 'company' || analyzedJob.kind === 'freelance' ? 'proposal' : 'cover_letter');
    const generated = await generatePersonalizedProposal(analyzedJob, profile, {
      channel: resolvedChannel,
      language: language ?? 'auto',
      senderType,
      customInstructions,
      useFallback,
    });

    const application = await createApplication({
      jobId: analyzedJob.id,
      profileId: profile.id,
      senderType: generated.senderType,
      channel: resolvedChannel,
      language: generated.language,
      subject: generated.subject,
      proposalText: generated.proposalText,
      highlights: generated.highlights,
      aiModel: generated.aiModel,
    });

    const finalJob = (await updateJobStatus(analyzedJob.id, 'prepared')) ?? analyzedJob;

    res.status(201).json({
      job: finalJob,
      analysis,
      application,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Candidate & Company Profiles
// ----------------------------------------------------------------------------
jobsRouter.get('/profiles', async (_req, res, next) => {
  try {
    const profiles = await getAllProfiles();
    res.json(profiles);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/profile', async (req, res, next) => {
  try {
    const type: SenderType = req.query.type === 'company' ? 'company' : 'individual';
    const profile = await getProfileByType(type);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

jobsRouter.put('/profile', async (req, res, next) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Perfil inválido', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    const type: SenderType = data.profileType ?? 'individual';
    const saved = await saveCandidateProfile(
      {
        ...data,
        companyName: data.companyName === '' ? null : data.companyName,
        companyWebsite: data.companyWebsite === '' ? null : data.companyWebsite,
        portfolioUrl: data.portfolioUrl === '' ? null : data.portfolioUrl,
        githubUrl: data.githubUrl === '' ? null : data.githubUrl,
        linkedinUrl: data.linkedinUrl === '' ? null : data.linkedinUrl,
      },
      type,
    );

    res.json(saved);
  } catch (err) {
    next(err);
  }
});
