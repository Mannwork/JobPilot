import { createHash } from 'node:crypto';
import type { Job, JobKind, JobSource, LanguageCode } from '../types.js';

const TERMS = [
  'react native',
  'react',
  'typescript',
  'javascript',
  'node.js',
  'node',
  'express',
  'fullstack',
  'full stack',
  'frontend',
  'front end',
  'backend',
  'back end',
  'supabase',
  'postgres',
  'mongodb',
  'expo',
  'mobile',
  'software',
  'desarrollador',
  'developer',
  'programador',
  'api',
  'saas',
  'web',
  'next.js',
  'nextjs',
  'tailwind',
];

const FREELANCE = [
  'freelance',
  'freelancer',
  'proyecto',
  'contratista',
  'contract',
  'contractor',
  'por horas',
  'presupuesto',
  'cotización',
  'mvp',
  'necesito',
  'buscamos',
  'looking for',
  'we need',
];

const NEGATIVE = ['senior java', 'sap abap', 'cobol', 'onsite only', 'presencial excluyente'];

const SPANISH_HINTS = [
  'buscamos',
  'necesitamos',
  'desarrollador',
  'desarrolladora',
  'programador',
  'experiencia',
  'proyecto',
  'remoto',
  'empresa',
  'equipo',
  'requisitos',
  'conocimientos',
  'habilidades',
  'trabajo',
  'puesto',
  'ofrecemos',
  'página web',
  'aplicación',
  'presupuesto',
  'para',
  'con',
];

const ENGLISH_HINTS = [
  'we are looking',
  'requirements',
  'responsibilities',
  'experience with',
  'you will',
  'skills',
  'about the role',
  'what you bring',
  'full-time',
  'software engineer',
  'looking for',
  'strong experience',
  'join our team',
];

const normalize = (s: string) =>
  s
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const includesTerm = (text: string, term: string) => normalize(text).includes(normalize(term));

export function cleanHtmlText(raw: string): string {
  const decoded = raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '...');

  return decoded
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectLanguage(text: string): LanguageCode {
  const sample = text.slice(0, 2500);
  const lower = sample.toLocaleLowerCase('es');

  // Accented Spanish characters are a strong signal
  const spanishChars = (sample.match(/[áéíóúñü¿¡]/gi) || []).length;
  let esScore = Math.min(4, spanishChars);
  let enScore = 0;

  for (const word of SPANISH_HINTS) {
    if (lower.includes(word)) esScore += 1.5;
  }
  for (const word of ENGLISH_HINTS) {
    if (lower.includes(word)) enScore += 1.5;
  }

  return esScore > enScore ? 'es' : 'en';
}

export function assessJobHeuristic(
  title: string,
  description: string,
  source: JobSource,
  kindOverride?: JobKind,
): Pick<Job, 'score' | 'matchedTerms' | 'kind'> {
  const cleanDescription = cleanHtmlText(description);
  const content = `${title} ${cleanDescription}`;
  const matchedTerms = TERMS.filter((t) => includesTerm(content, t));
  const freelanceSignals = FREELANCE.filter((t) => includesTerm(content, t));

  const isFreelance =
    kindOverride === 'freelance' ||
    source === 'freelancer' ||
    source === 'workana' ||
    freelanceSignals.some((t) => !['buscamos', 'necesito', 'looking for', 'we need'].includes(t)) ||
    (source === 'linkedin' && freelanceSignals.length > 0);

  const penalty = NEGATIVE.some((t) => includesTerm(content, t)) ? 30 : 0;
  const remoteBonus =
    includesTerm(content, 'remoto') || includesTerm(content, 'remote') || source === 'freelancer' ? 10 : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      20 + matchedTerms.length * 10 + Math.min(15, freelanceSignals.length * 5) + remoteBonus - penalty,
    ),
  );

  const kind: JobKind = kindOverride ?? (isFreelance ? 'freelance' : 'employment');
  return { score, matchedTerms, kind };
}

export function buildJob(partial: {
  source: JobSource;
  title: string;
  description: string;
  url: string;
  company?: string | null;
  kindOverride?: JobKind;
  language?: LanguageCode;
  publishedAt?: string | null;
}): Job {
  const cleanDescription = cleanHtmlText(partial.description).slice(0, 10000);
  const assessed = assessJobHeuristic(partial.title, cleanDescription, partial.source, partial.kindOverride);
  const language = partial.language ?? detectLanguage(`${partial.title} ${cleanDescription}`);
  const id = createHash('sha256')
    .update(`${partial.source}:${partial.url}`)
    .digest('hex')
    .slice(0, 20);

  return {
    id,
    source: partial.source,
    company: partial.company ?? null,
    title: partial.title.trim(),
    description: cleanDescription,
    url: partial.url.trim(),
    language,
    ...assessed,
    status: 'new',
    publishedAt: partial.publishedAt ?? new Date().toISOString(),
    discoveredAt: new Date().toISOString(),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'JobPilot/1.0 (+https://github.com/jobpilot)',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export function getConfiguredBoards(envVarName: 'GREENHOUSE_BOARDS' | 'LEVER_BOARDS'): string[] {
  return (process.env[envVarName] || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// ----------------------------------------------------------------------------
// 1. Greenhouse & Lever (company ATS boards from .env)
// ----------------------------------------------------------------------------
export async function scanGreenhouseBoard(slug: string): Promise<Job[]> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  )) as {
    jobs?: Array<{
      id: number;
      title: string;
      absolute_url: string;
      content?: string;
      updated_at?: string;
      location?: { name: string };
    }>;
  };

  return (data.jobs || []).map((j) =>
    buildJob({
      source: 'greenhouse',
      company: slug,
      title: j.title,
      description: `${j.location?.name ? `Ubicación: ${j.location.name}\n` : ''}${j.content || ''}`,
      url: j.absolute_url,
      publishedAt: j.updated_at ? new Date(j.updated_at).toISOString() : null,
    }),
  );
}

export async function scanLeverBoard(slug: string): Promise<Job[]> {
  const data = (await fetchJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  )) as Array<{
    text: string;
    hostedUrl: string;
    descriptionPlain?: string;
    createdAt?: number;
    categories?: { location?: string; commitment?: string };
  }>;

  if (!Array.isArray(data)) {
    throw new Error('Formato Lever inesperado');
  }

  return data.map((j) =>
    buildJob({
      source: 'lever',
      company: slug,
      title: j.text,
      description: `${j.categories?.location ? `Ubicación: ${j.categories.location}\n` : ''}${
        j.categories?.commitment ? `Modalidad: ${j.categories.commitment}\n` : ''
      }${j.descriptionPlain || ''}`,
      url: j.hostedUrl,
      publishedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    }),
  );
}

// ----------------------------------------------------------------------------
// 2. Get on Board (LATAM & Español tech jobs - Official Public JSON API)
// ----------------------------------------------------------------------------
export async function scanGetOnBoard(): Promise<Job[]> {
  const queries = ['react', 'fullstack', 'frontend', 'node', 'desarrollador'];
  const settled = await Promise.allSettled(
    queries.map(
      (q) =>
        fetchJson(
          `https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(q)}&per_page=15&expand=[%22company%22]`,
        ) as Promise<{
          data?: Array<{
            id: string;
            links?: { public_url?: string };
            attributes?: {
              title?: string;
              description?: string;
              projects?: string;
              functions?: string;
              remote?: boolean;
              remote_modality?: string;
              lang?: string;
              min_salary?: number | null;
              max_salary?: number | null;
              published_at?: number;
              modality?: string;
              company?: { data?: { attributes?: { name?: string } } };
            };
          }>;
        }>,
    ),
  );

  const seenUrls = new Set<string>();
  const jobs: Job[] = [];

  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    for (const item of res.value.data || []) {
      const attrs = item.attributes;
      const url = item.links?.public_url || `https://www.getonbrd.com/jobs/${item.id}`;
      if (!attrs?.title || seenUrls.has(url)) continue;
      seenUrls.add(url);

      const salaryStr =
        attrs.min_salary || attrs.max_salary
          ? `Salario ref: USD ${attrs.min_salary || '?'} - ${attrs.max_salary || '?'}\n`
          : '';
      const remoteStr = attrs.remote ? `Modalidad: Remoto (${attrs.remote_modality || 'LATAM'})\n` : '';
      const desc = `${remoteStr}${salaryStr}${attrs.projects || ''}\n${attrs.description || ''}\n${attrs.functions || ''}`;
      const lang: LanguageCode = attrs.lang === 'es' ? 'es' : attrs.lang === 'en' ? 'en' : detectLanguage(`${attrs.title} ${desc}`);
      const publishedAt = attrs.published_at ? new Date(attrs.published_at * 1000).toISOString() : null;

      jobs.push(
        buildJob({
          source: 'getonbrd',
          company: attrs.company?.data?.attributes?.name || 'Get on Board',
          title: attrs.title,
          description: desc,
          url,
          language: lang,
          publishedAt,
        }),
      );
    }
  }

  return jobs;
}

// ----------------------------------------------------------------------------
// 3. Freelancer.com (Proyectos Freelance reales en Español e Inglés - API pública)
// ----------------------------------------------------------------------------
export async function scanFreelancer(): Promise<Job[]> {
  const searches: Array<{ query: string; lang: LanguageCode }> = [
    { query: 'react', lang: 'es' },
    { query: 'web', lang: 'es' },
    { query: 'app', lang: 'es' },
    { query: 'desarrollo', lang: 'es' },
    { query: 'react', lang: 'en' },
    { query: 'fullstack', lang: 'en' },
  ];

  const settled = await Promise.allSettled(
    searches.map(
      ({ query, lang }) =>
        fetchJson(
          `https://www.freelancer.com/api/projects/0.1/projects/active/?query=${encodeURIComponent(
            query,
          )}&limit=12&languages[]=${lang}&full_description=true`,
        ) as Promise<{
          result?: {
            projects?: Array<{
              id: number;
              title: string;
              seo_url?: string;
              description?: string;
              preview_description?: string;
              language?: string;
              type?: string;
              time_submitted?: number;
              currency?: { code?: string; sign?: string };
              budget?: { minimum?: number; maximum?: number };
            }>;
          };
        }>,
    ),
  );

  const seenUrls = new Set<string>();
  const jobs: Job[] = [];

  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    if (res.status !== 'fulfilled') continue;
    const requestedLang = searches[i].lang;

    for (const proj of res.value.result?.projects || []) {
      const url = proj.seo_url
        ? `https://www.freelancer.com/projects/${proj.seo_url}`
        : `https://www.freelancer.com/projects/${proj.id}`;
      if (!proj.title || seenUrls.has(url)) continue;
      seenUrls.add(url);

      const sign = proj.currency?.sign || '$';
      const code = proj.currency?.code || 'USD';
      const budgetStr =
        proj.budget?.minimum || proj.budget?.maximum
          ? `Presupuesto (${proj.type === 'hourly' ? 'por hora' : 'proyecto'}): ${sign}${proj.budget.minimum ?? '?'} - ${sign}${proj.budget.maximum ?? '?'} ${code}\n`
          : '';
      const rawDesc = proj.description || proj.preview_description || proj.title;
      const lang: LanguageCode =
        proj.language === 'es' ? 'es' : proj.language === 'en' ? 'en' : requestedLang;
      const publishedAt = proj.time_submitted ? new Date(proj.time_submitted * 1000).toISOString() : null;

      jobs.push(
        buildJob({
          source: 'freelancer',
          company: 'Proyecto Freelancer.com',
          title: proj.title,
          description: `${budgetStr}${rawDesc}`,
          url,
          kindOverride: 'freelance',
          language: lang,
          publishedAt,
        }),
      );
    }
  }

  return jobs;
}

// ----------------------------------------------------------------------------
// 4. Remotive (Remote Software Dev & Contract/Freelance - Official Public API)
// ----------------------------------------------------------------------------
export async function scanRemotive(): Promise<Job[]> {
  const data = (await fetchJson(
    'https://remotive.com/api/remote-jobs?category=software-dev&limit=35',
  )) as {
    jobs?: Array<{
      id: number;
      url: string;
      title: string;
      company_name?: string;
      job_type?: string;
      publication_date?: string;
      candidate_required_location?: string;
      salary?: string;
      description?: string;
    }>;
  };

  return (data.jobs || []).map((j) => {
    const isContract = /contract|freelance|part_time/i.test(j.job_type || '');
    const meta = [
      j.candidate_required_location ? `Ubicación: ${j.candidate_required_location}` : '',
      j.job_type ? `Tipo: ${j.job_type}` : '',
      j.salary ? `Salario: ${j.salary}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return buildJob({
      source: 'remotive',
      company: j.company_name || 'Remotive',
      title: j.title,
      description: `${meta ? `${meta}\n\n` : ''}${j.description || ''}`,
      url: j.url,
      kindOverride: isContract ? 'freelance' : 'employment',
      publishedAt: j.publication_date ? new Date(j.publication_date).toISOString() : null,
    });
  });
}

// ----------------------------------------------------------------------------
// 5. Jobicy (Remote Developer & Freelance/Contract - Official Public API)
// ----------------------------------------------------------------------------
export async function scanJobicy(): Promise<Job[]> {
  const data = (await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=25&tag=react')) as {
    jobs?: Array<{
      url: string;
      jobTitle: string;
      companyName?: string;
      jobType?: string[];
      jobGeo?: string;
      pubDate?: string;
      jobDescription?: string;
      jobExcerpt?: string;
    }>;
  };

  return (data.jobs || []).map((j) => {
    const types = (j.jobType || []).join(', ');
    const isContract = /contract|freelance/i.test(types);
    const meta = [j.jobGeo ? `Región: ${j.jobGeo}` : '', types ? `Tipo: ${types}` : '']
      .filter(Boolean)
      .join(' · ');

    return buildJob({
      source: 'jobicy',
      company: j.companyName || 'Jobicy',
      title: j.jobTitle,
      description: `${meta ? `${meta}\n\n` : ''}${j.jobDescription || j.jobExcerpt || ''}`,
      url: j.url,
      kindOverride: isContract ? 'freelance' : 'employment',
      publishedAt: j.pubDate ? new Date(j.pubDate).toISOString() : null,
    });
  });
}

export type ScanProviderId = 'greenhouse' | 'lever' | 'getonbrd' | 'freelancer' | 'remotive' | 'jobicy';

export interface ScanBoardsResult {
  boardsChecked: number;
  providersChecked: string[];
  jobs: Job[];
  errors: string[];
}

export async function scanConfiguredBoards(options?: {
  providers?: ScanProviderId[];
}): Promise<ScanBoardsResult> {
  const activeProviders = new Set<ScanProviderId>(
    options?.providers && options.providers.length > 0
      ? options.providers
      : ['getonbrd', 'freelancer', 'remotive', 'jobicy', 'greenhouse', 'lever'],
  );

  const tasks: Array<{ label: string; run: () => Promise<Job[]> }> = [];

  if (activeProviders.has('getonbrd')) {
    tasks.push({ label: 'getonbrd (LATAM/ES)', run: scanGetOnBoard });
  }
  if (activeProviders.has('freelancer')) {
    tasks.push({ label: 'freelancer (ES+EN)', run: scanFreelancer });
  }
  if (activeProviders.has('remotive')) {
    tasks.push({ label: 'remotive', run: scanRemotive });
  }
  if (activeProviders.has('jobicy')) {
    tasks.push({ label: 'jobicy', run: scanJobicy });
  }
  if (activeProviders.has('greenhouse')) {
    for (const slug of getConfiguredBoards('GREENHOUSE_BOARDS')) {
      tasks.push({ label: `greenhouse/${slug}`, run: () => scanGreenhouseBoard(slug) });
    }
  }
  if (activeProviders.has('lever')) {
    for (const slug of getConfiguredBoards('LEVER_BOARDS')) {
      tasks.push({ label: `lever/${slug}`, run: () => scanLeverBoard(slug) });
    }
  }

  const outcomes = await Promise.allSettled(tasks.map((t) => t.run()));
  const discovered: Job[] = [];
  const errors: string[] = [];

  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      discovered.push(...outcome.value);
    } else {
      errors.push(`${tasks[index].label}: ${String(outcome.reason)}`);
    }
  });

  return {
    boardsChecked: tasks.length,
    providersChecked: tasks.map((t) => t.label),
    jobs: discovered,
    errors,
  };
}
