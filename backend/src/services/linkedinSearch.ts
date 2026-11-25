import { z } from 'zod';
import type { JobSource } from '../types.js';

export interface LinkedInQueryItem {
  query: string;
  url: string;
  category: 'freelance' | 'frontend' | 'mobile' | 'fullstack' | 'backend';
  language: 'es' | 'en';
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

const RAW_QUERIES: Array<{
  query: string;
  category: LinkedInQueryItem['category'];
  language: 'es' | 'en';
}> = [
  { query: '"buscamos" AND "freelance"', category: 'freelance', language: 'es' },
  { query: '"buscamos" AND "React"', category: 'frontend', language: 'es' },
  { query: '"buscamos" AND "software"', category: 'fullstack', language: 'es' },
  { query: '"necesitamos" AND "desarrollador"', category: 'fullstack', language: 'es' },
  { query: '"busco" AND "programador"', category: 'freelance', language: 'es' },
  { query: '"necesito" AND "página web"', category: 'freelance', language: 'es' },
  { query: '"buscamos" AND "React Native"', category: 'mobile', language: 'es' },
  { query: '"contratando" AND "fullstack"', category: 'fullstack', language: 'es' },
  { query: '"necesitamos" AND "app móvil"', category: 'mobile', language: 'es' },
  { query: '"busco" AND "desarrollador web"', category: 'frontend', language: 'es' },
  { query: '"buscamos" AND "Node.js"', category: 'backend', language: 'es' },
  { query: '"solicitamos" AND "desarrollo web"', category: 'freelance', language: 'es' },
  { query: '"looking for" AND "freelance developer"', category: 'freelance', language: 'en' },
  { query: '"hiring" AND "React developer"', category: 'frontend', language: 'en' },
  { query: '"looking for" AND "React Native developer"', category: 'mobile', language: 'en' },
];

export function getLinkedInQueries(): LinkedInQueryItem[] {
  return RAW_QUERIES.map(({ query, category, language }) => ({
    query,
    category,
    language,
    url: `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&sortBy=%22date_posted%22`,
  }));
}

export function getPortalSearchGroups(): PortalSearchGroup[] {
  return [
    {
      portal: 'Workana',
      source: 'workana',
      description: 'Proyectos freelance en español (Argentina, LATAM y España). Ordenados por más recientes.',
      language: 'es',
      kind: 'freelance',
      links: [
        {
          label: 'Programación Web (Español · Recientes)',
          category: 'web',
          url: 'https://www.workana.com/jobs?category=it-programming&language=es&subcategory=web-development',
        },
        {
          label: 'Apps Móviles / React Native (Español)',
          category: 'mobile',
          url: 'https://www.workana.com/jobs?category=it-programming&language=es&subcategory=mobile-development',
        },
        {
          label: 'Proyectos con React / TypeScript',
          category: 'react',
          url: 'https://www.workana.com/jobs?category=it-programming&language=es&query=react',
        },
        {
          label: 'Proyectos con Node.js / APIs / SaaS',
          category: 'backend',
          url: 'https://www.workana.com/jobs?category=it-programming&language=es&query=node',
        },
      ],
    },
    {
      portal: 'Computrabajo',
      source: 'computrabajo',
      description: 'Ofertas en español en Argentina y remoto LATAM ordenadas por fecha de publicación.',
      language: 'es',
      kind: 'ambos',
      links: [
        {
          label: 'Desarrollador Fullstack Remoto (AR)',
          category: 'fullstack',
          url: 'https://ar.computrabajo.com/trabajo-de-desarrollador-fullstack?by=publicationtime&iex=1',
        },
        {
          label: 'Desarrollador React / Frontend (AR)',
          category: 'frontend',
          url: 'https://ar.computrabajo.com/trabajo-de-desarrollador-react?by=publicationtime',
        },
        {
          label: 'Programador Freelance / Web (AR)',
          category: 'freelance',
          url: 'https://ar.computrabajo.com/trabajo-de-programador-freelance?by=publicationtime',
        },
        {
          label: 'Desarrollador Node.js / TypeScript (AR)',
          category: 'backend',
          url: 'https://ar.computrabajo.com/trabajo-de-desarrollador-node?by=publicationtime',
        },
      ],
    },
    {
      portal: 'LinkedIn (Publicaciones recientes)',
      source: 'linkedin',
      description: 'Publicaciones directas de clientes y recruiters buscando devs y freelancers (ordenadas por fecha).',
      language: 'es/en',
      kind: 'ambos',
      links: getLinkedInQueries().map((q) => ({
        label: `[${q.language.toUpperCase()}] ${q.query}`,
        category: q.category,
        url: q.url,
      })),
    },
    {
      portal: 'Get on Board',
      source: 'getonbrd',
      description: 'Empresas tech de LATAM y remotas en español (también se escanea automáticamente desde JobPilot).',
      language: 'es/en',
      kind: 'ambos',
      links: [
        {
          label: 'Programación Remota LATAM',
          category: 'fullstack',
          url: 'https://www.getonbrd.com/jobs/programming?remote=true',
        },
        {
          label: 'React / React Native Remoto',
          category: 'react',
          url: 'https://www.getonbrd.com/empleos-programacion?q=react',
        },
      ],
    },
    {
      portal: 'Bumeran / ZonaJobs / Upwork',
      source: 'other',
      description: 'Accesos rápidos adicionales a portales en español y freelance internacional.',
      language: 'es/en',
      kind: 'ambos',
      links: [
        {
          label: 'Bumeran · Desarrollador Remoto (ES)',
          category: 'es',
          url: 'https://www.bumeran.com.ar/empleos-busqueda-desarrollador-remoto.html',
        },
        {
          label: 'Freelancer.com · Proyectos en Español (también escaneado auto)',
          category: 'freelance',
          url: 'https://www.freelancer.com/jobs/spanish/?keyword=react',
        },
        {
          label: 'Upwork · React / Fullstack Freelance (EN)',
          category: 'freelance',
          url: 'https://www.upwork.com/nx/search/jobs/?q=react%20typescript&sort=recency',
        },
      ],
    },
  ];
}

export function detectSourceFromUrl(url: string): JobSource {
  try {
    const host = new URL(url).hostname.toLocaleLowerCase();
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('workana.com')) return 'workana';
    if (host.includes('computrabajo.')) return 'computrabajo';
    if (host.includes('getonbrd.')) return 'getonbrd';
    if (host.includes('freelancer.')) return 'freelancer';
    if (host.includes('remotive.')) return 'remotive';
    if (host.includes('jobicy.')) return 'jobicy';
    if (host.includes('greenhouse.io')) return 'greenhouse';
    if (host.includes('lever.co')) return 'lever';
    return 'other';
  } catch {
    return 'other';
  }
}

export const linkedInImportSchema = z.object({
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(300),
  description: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(15000),
  url: z
    .string()
    .trim()
    .url('Debe ser una URL válida')
    .refine(
      (value) => {
        try {
          return new URL(value).hostname.endsWith('linkedin.com');
        } catch {
          return false;
        }
      },
      { message: 'Debe ser un enlace de LinkedIn' },
    ),
  company: z.string().trim().max(200).optional(),
  autoAnalyze: z.boolean().optional(),
  autoGenerateProposal: z.boolean().optional(),
  proposalLanguage: z.enum(['es', 'en', 'auto']).optional(),
  senderType: z.enum(['individual', 'company']).optional(),
  useFallback: z.boolean().optional(),
});

export const universalImportSchema = z.object({
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(300),
  description: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(15000),
  url: z.string().trim().url('Debe ser una URL válida'),
  company: z.string().trim().max(200).optional(),
  source: z
    .enum([
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
    ])
    .optional(),
  kind: z.enum(['freelance', 'employment']).optional(),
  language: z.enum(['es', 'en']).optional(),
  autoAnalyze: z.boolean().optional(),
  autoGenerateProposal: z.boolean().optional(),
  proposalLanguage: z.enum(['es', 'en', 'auto']).optional(),
  senderType: z.enum(['individual', 'company']).optional(),
  useFallback: z.boolean().optional(),
});

export type LinkedInImportInput = z.infer<typeof linkedInImportSchema>;
export type UniversalImportInput = z.infer<typeof universalImportSchema>;
