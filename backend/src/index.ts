import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import {
  checkSupabaseTables,
  getMigrationV2Sql,
  getSchemaSql,
  isSchemaV2Ready,
  isSupabaseConfigured,
  listApplications,
  listJobs,
} from './config/supabase.js';
import { AIServiceError, getOpenAIModel, isOpenAIConfigured } from './services/aiAnalyzer.js';
import { jobsRouter } from './routes/jobs.js';
import { applicationsRouter } from './routes/applications.js';
import type { SystemHealthStatus } from './types.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '500kb' }));

async function buildHealthResponse(_req: Request, res: Response, next: NextFunction) {
  try {
    const tables = await checkSupabaseTables(true);
    const supabaseReady = tables.jobs && tables.candidate_profiles && tables.applications;
    const schemaV2Ready = supabaseReady ? await isSchemaV2Ready() : false;
    const { jobs, storage } = await listJobs();
    const { applications } = await listApplications();
    const analyzed = jobs.filter((j) => typeof j.aiScore === 'number').length;

    const payload: SystemHealthStatus = {
      ok: true,
      storage,
      supabaseConfigured: isSupabaseConfigured,
      supabaseReady,
      schemaV2Ready,
      tables,
      openaiConfigured: isOpenAIConfigured(),
      openaiModel: getOpenAIModel(),
      counts: {
        jobs: jobs.length,
        analyzed,
        applications: applications.length,
      },
      count: jobs.length,
    };

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

app.get('/health', buildHealthResponse);
app.get('/api/health', buildHealthResponse);

app.get('/setup/schema', async (_req, res, next) => {
  try {
    const [sql, migrationV2Sql] = await Promise.all([getSchemaSql(), getMigrationV2Sql()]);
    res.json({ sql, migrationV2Sql });
  } catch (err) {
    next(err);
  }
});

app.get('/api/setup/schema', async (_req, res, next) => {
  try {
    const [sql, migrationV2Sql] = await Promise.all([getSchemaSql(), getMigrationV2Sql()]);
    res.json({ sql, migrationV2Sql });
  } catch (err) {
    next(err);
  }
});

// Mount routes at both root (backward compatibility with MVP) and /api
app.use('/', jobsRouter);
app.use('/', applicationsRouter);
app.use('/api', jobsRouter);
app.use('/api', applicationsRouter);

// Error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AIServiceError) {
    res.status(503).json({
      code: err.code,
      error: err.message,
    });
    return;
  }

  console.error('[JobPilot Backend Error]', err);
  const message = err instanceof Error ? err.message : 'Error interno del servidor';
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, async () => {
  const tables = await checkSupabaseTables(true);
  const ready = tables.jobs && tables.candidate_profiles && tables.applications;
  console.log(`JobPilot Backend en http://localhost:${port}`);
  console.log(
    `Supabase: ${
      !isSupabaseConfigured
        ? 'No configurado (modo local)'
        : ready
          ? 'Conectado (tablas listas)'
          : 'Conectado pero faltan tablas -> ejecutá backend/supabase/schema.sql'
    }`,
  );
  console.log(
    `OpenAI: ${isOpenAIConfigured() ? `Listo (${getOpenAIModel()})` : 'API key no configurada o placeholder'}`,
  );
});
