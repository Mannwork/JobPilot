import { Router } from 'express';
import { z } from 'zod';
import {
  createApplication,
  deleteApplication,
  getJobById,
  getProfileByType,
  listApplications,
  updateApplication,
  updateJobStatus,
} from '../config/supabase.js';
import { generatePersonalizedProposal } from '../services/applicationGenerator.js';
import type { ApplicationChannel, ApplicationStatus, LanguageCode, SenderType } from '../types.js';

export const applicationsRouter = Router();

const channelEnum = z.enum(['proposal', 'cover_letter', 'linkedin_dm', 'email']);
const statusEnum = z.enum(['draft', 'reviewed', 'sent', 'interview', 'rejected', 'accepted']);
const languageEnum = z.enum(['es', 'en']);
const proposalLangEnum = z.enum(['es', 'en', 'auto']);
const senderTypeEnum = z.enum(['individual', 'company']);

const generateSchema = z.object({
  jobId: z.string().min(1, 'jobId es obligatorio'),
  channel: channelEnum.optional(),
  language: proposalLangEnum.optional(),
  senderType: senderTypeEnum.optional(),
  customInstructions: z.string().trim().max(1000).optional(),
  useFallback: z.boolean().optional(),
});

const patchApplicationSchema = z.object({
  subject: z.string().trim().max(200).nullable().optional(),
  proposalText: z.string().trim().min(10).max(8000).optional(),
  status: statusEnum.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  channel: channelEnum.optional(),
  language: languageEnum.optional(),
});

applicationsRouter.get('/applications', async (req, res, next) => {
  try {
    const status = statusEnum.safeParse(req.query.status).success
      ? (req.query.status as ApplicationStatus)
      : undefined;
    const channel = channelEnum.safeParse(req.query.channel).success
      ? (req.query.channel as ApplicationChannel)
      : undefined;
    const language = languageEnum.safeParse(req.query.language).success
      ? (req.query.language as LanguageCode)
      : undefined;
    const senderType = senderTypeEnum.safeParse(req.query.senderType).success
      ? (req.query.senderType as SenderType)
      : undefined;
    const jobId =
      typeof req.query.jobId === 'string' && req.query.jobId.trim() ? req.query.jobId.trim() : undefined;

    const { applications } = await listApplications({ status, channel, language, senderType, jobId });
    res.json(applications);
  } catch (err) {
    next(err);
  }
});

applicationsRouter.post('/applications/generate', async (req, res, next) => {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const { jobId, channel, language, senderType: reqSenderType, customInstructions, useFallback } =
      parsed.data;
    const job = await getJobById(jobId);
    if (!job) {
      res.status(404).json({ error: 'Oferta no encontrada' });
      return;
    }

    const senderType: SenderType = reqSenderType ?? 'individual';
    const profile = await getProfileByType(senderType);
    const resolvedChannel: ApplicationChannel =
      channel ?? (senderType === 'company' || job.kind === 'freelance' ? 'proposal' : 'cover_letter');

    const generated = await generatePersonalizedProposal(job, profile, {
      channel: resolvedChannel,
      language: language ?? 'auto',
      senderType,
      customInstructions,
      useFallback,
    });

    const application = await createApplication({
      jobId: job.id,
      profileId: profile.id,
      senderType: generated.senderType,
      channel: resolvedChannel,
      language: generated.language,
      subject: generated.subject,
      proposalText: generated.proposalText,
      highlights: generated.highlights,
      aiModel: generated.aiModel,
    });

    const updatedJob =
      job.status === 'new' || job.status === 'saved'
        ? await updateJobStatus(job.id, 'prepared')
        : job;

    res.status(201).json({
      application,
      job: updatedJob ?? job,
    });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.patch('/applications/:id', async (req, res, next) => {
  try {
    const parsed = patchApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }

    const updated = await updateApplication(req.params.id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Propuesta no encontrada' });
      return;
    }

    if (parsed.data.status === 'sent' && updated.jobId) {
      await updateJobStatus(updated.jobId, 'applied');
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

applicationsRouter.delete('/applications/:id', async (req, res, next) => {
  try {
    const deleted = await deleteApplication(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Propuesta no encontrada' });
      return;
    }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});
