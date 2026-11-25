import OpenAI from 'openai';
import { z } from 'zod';
import type { CandidateProfile, Job } from '../types.js';
import { cleanHtmlText } from './jobScanner.js';

export class AIServiceError extends Error {
  readonly code: 'OPENAI_NOT_CONFIGURED' | 'OPENAI_REQUEST_FAILED';

  constructor(code: 'OPENAI_NOT_CONFIGURED' | 'OPENAI_REQUEST_FAILED', message: string) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
  }
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

export function isOpenAIConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim() || '';
  return key.startsWith('sk-') && key.length >= 20;
}

export function getOpenAIClient(): OpenAI {
  if (!isOpenAIConfigured()) {
    throw new AIServiceError(
      'OPENAI_NOT_CONFIGURED',
      'OPENAI_API_KEY no está configurada o parece ser un placeholder. Agregá una clave válida (sk-...) en tu archivo .env o activá el modo local de prueba.',
    );
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() });
}

const analysisResponseSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string().min(10).max(600),
  fitReasons: z.array(z.string().min(2).max(200)).max(6),
  gaps: z.array(z.string().min(2).max(200)).max(6),
  recommended: z.boolean(),
});

export interface JobCompatibilityAnalysis {
  aiScore: number;
  aiSummary: string;
  aiFitReasons: string[];
  aiGaps: string[];
  aiRecommended: boolean;
  aiModel: string;
}

function buildFallbackAnalysis(job: Job, profile: CandidateProfile): JobCompatibilityAnalysis {
  const text = `${job.title} ${cleanHtmlText(job.description)}`.toLocaleLowerCase('es');
  const matchedSkills = profile.skills.filter((skill) =>
    text.includes(skill.toLocaleLowerCase('es')),
  );
  const missingCore = profile.skills
    .slice(0, 6)
    .filter((skill) => !text.includes(skill.toLocaleLowerCase('es')));

  const remoteMention = /remot[eo]|anywhere|work from home/i.test(text);
  const baseScore = Math.round(
    Math.min(
      95,
      Math.max(
        20,
        job.score * 0.45 +
          matchedSkills.length * 11 +
          (remoteMention && profile.remoteOnly ? 12 : 0) +
          (profile.preferredKinds.includes(job.kind) ? 8 : 0),
      ),
    ),
  );

  const fitReasons: string[] = [];
  if (matchedSkills.length > 0) {
    fitReasons.push(`Coincidencia directa con tu stack: ${matchedSkills.slice(0, 5).join(', ')}.`);
  }
  if (remoteMention) {
    fitReasons.push('La publicación menciona trabajo remoto, alineado con tu preferencia.');
  }
  if (profile.preferredKinds.includes(job.kind)) {
    fitReasons.push(
      `Modalidad compatible (${job.kind === 'freelance' ? 'Freelance / Proyecto' : 'Relación de dependencia'}).`,
    );
  }
  if (fitReasons.length === 0) {
    fitReasons.push('Oferta en área de desarrollo de software compatible para evaluar en detalle.');
  }

  const gaps: string[] = [];
  if (matchedSkills.length < 2) {
    gaps.push('Pocas menciones explícitas de tu stack principal en la descripción.');
  }
  if (missingCore.length > 0 && matchedSkills.length < 4) {
    gaps.push(`Revisar si requieren tecnologías fuera de tu stack base (${missingCore.slice(0, 3).join(', ')} no figuran).`);
  }
  if (!remoteMention && profile.remoteOnly) {
    gaps.push('No se confirma modalidad 100% remota en el texto analizado.');
  }

  return {
    aiScore: baseScore,
    aiSummary:
      baseScore >= 70
        ? `Buena compatibilidad estimada (${baseScore}/100) con el perfil de ${profile.fullName}. Conviene preparar una propuesta destacando ${matchedSkills.slice(0, 3).join(', ') || 'experiencia fullstack'}.`
        : `Compatibilidad moderada/baja (${baseScore}/100). Conviene verificar los requisitos técnicos antes de invertir tiempo en la postulación.`,
    aiFitReasons: fitReasons,
    aiGaps: gaps,
    aiRecommended: baseScore >= 68,
    aiModel: 'local-heuristic-fallback',
  };
}

export async function analyzeJobCompatibility(
  job: Job,
  profile: CandidateProfile,
  options: { useFallback?: boolean } = {},
): Promise<JobCompatibilityAnalysis> {
  if (!isOpenAIConfigured()) {
    if (options.useFallback) {
      return buildFallbackAnalysis(job, profile);
    }
    throw new AIServiceError(
      'OPENAI_NOT_CONFIGURED',
      'OPENAI_API_KEY no está configurada o parece ser un placeholder. Agregá una clave válida en .env o usá el modo local de prueba.',
    );
  }

  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const cleanDescription = cleanHtmlText(job.description).slice(0, 6500);

  const systemPrompt = `Sos un recruiter técnico senior y asesor de carrera para desarrolladores de software.
Evaluás la compatibilidad real entre un candidato y una oferta laboral o proyecto freelance.
Respondé SIEMPRE en español y estrictamente en formato JSON con esta estructura exacta:
{
  "score": number (0 a 100, entero),
  "summary": string (máximo 2-3 oraciones claras y accionables),
  "fitReasons": string[] (2 a 4 puntos concretos de por qué encaja),
  "gaps": string[] (0 a 4 brechas o riesgos concretos a tener en cuenta),
  "recommended": boolean (true si vale la pena postularse)
}
Sé honesto y crítico: si la oferta pide principalmente otro lenguaje/stack (por ejemplo .NET, Java o SAP) que el candidato no tiene, penalizá el score como corresponde.`;

  const userPrompt = `PERFIL DEL CANDIDATO:
- Nombre: ${profile.fullName}
- Titular: ${profile.headline}
- Resumen: ${profile.summary}
- Años de experiencia: ${profile.experienceYears}
- Skills principales: ${profile.skills.join(', ')}
- Roles buscados: ${profile.preferredRoles.join(', ')}
- Modalidades preferidas: ${profile.preferredKinds.join(', ')}
- Solo remoto: ${profile.remoteOnly ? 'Sí' : 'No'}
- Idiomas: ${profile.languages.join(', ')}

OFERTA A ANALIZAR:
- Título: ${job.title}
- Empresa: ${job.company || 'No especificada'}
- Fuente: ${job.source}
- Tipo detectado: ${job.kind}
- URL: ${job.url}
- Descripción:
${cleanDescription}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('OpenAI devolvió una respuesta vacía.');
    }

    const parsedJson = JSON.parse(rawContent);
    const validated = analysisResponseSchema.parse(parsedJson);

    return {
      aiScore: Math.round(validated.score),
      aiSummary: validated.summary,
      aiFitReasons: validated.fitReasons,
      aiGaps: validated.gaps,
      aiRecommended: validated.recommended,
      aiModel: completion.model || model,
    };
  } catch (error) {
    if (options.useFallback) {
      return buildFallbackAnalysis(job, profile);
    }
    if (error instanceof AIServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AIServiceError(
      'OPENAI_REQUEST_FAILED',
      `Error al analizar compatibilidad con OpenAI: ${message}`,
    );
  }
}
