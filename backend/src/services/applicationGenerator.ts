import { z } from 'zod';
import type { ApplicationChannel, CandidateProfile, Job, LanguageCode, SenderType } from '../types.js';
import { AIServiceError, getOpenAIClient, getOpenAIModel, isOpenAIConfigured } from './aiAnalyzer.js';
import { cleanHtmlText, detectLanguage } from './jobScanner.js';

const proposalResponseSchema = z.object({
  subject: z.string().min(3).max(200),
  proposalText: z.string().min(40).max(5000),
  highlights: z.array(z.string().min(2).max(200)).max(5),
});

export interface GeneratedProposal {
  subject: string;
  proposalText: string;
  highlights: string[];
  language: LanguageCode;
  senderType: SenderType;
  aiModel: string;
}

const CHANNEL_GUIDANCE_ES: Record<ApplicationChannel, string> = {
  proposal:
    'Propuesta comercial/freelance estructurada: saludo breve, lectura concreta de lo que busca el cliente en ESTA oferta, experiencia relevante específica, enfoque técnico/metodología propuesta para este proyecto y llamado a la acción.',
  cover_letter: 'Carta de presentación profesional y concisa adaptada al puesto (3-4 párrafos claros).',
  linkedin_dm:
    'Mensaje directo corto para LinkedIn (máximo 120 palabras), humano, directo, mencionando algo concreto de la publicación e invitando a conversar.',
  email: 'Correo electrónico directo y profesional con asunto específico, cuerpo personalizado a la necesidad y cierre con disponibilidad.',
};

const CHANNEL_GUIDANCE_EN: Record<ApplicationChannel, string> = {
  proposal:
    'Structured freelance/consulting proposal: concise greeting, specific understanding of THIS project/role requirements, concrete relevant track record, tailored execution approach, and clear call to action.',
  cover_letter: 'Concise, tailored cover letter for this role (3-4 crisp paragraphs).',
  linkedin_dm:
    'Short LinkedIn direct message (under 120 words), natural and human, referencing a concrete detail from the posting and inviting a quick chat.',
  email: 'Direct, professional email with a specific subject line, tailored body, and availability to connect.',
};

function resolveTargetLanguage(job: Job, requested?: 'es' | 'en' | 'auto'): LanguageCode {
  if (requested === 'es' || requested === 'en') return requested;
  if (job.language === 'es' || job.language === 'en') return job.language;
  return detectLanguage(`${job.title} ${job.description}`);
}

function extractProjectFocusSnippet(job: Job): string {
  const clean = cleanHtmlText(job.description);
  const lines = clean
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 35 && !/^(ubicación|location|modalidad|salario|presupuesto|tipo|región):/i.test(l));
  const picked = lines[0] || clean.slice(0, 220);
  return picked.length > 220 ? `${picked.slice(0, 217).trim()}...` : picked;
}

function buildFallbackProposal(
  job: Job,
  profile: CandidateProfile,
  channel: ApplicationChannel,
  language: LanguageCode,
  senderType: SenderType,
): GeneratedProposal {
  const matched = profile.skills
    .filter((s) => `${job.title} ${job.description}`.toLocaleLowerCase('es').includes(s.toLocaleLowerCase('es')))
    .slice(0, 4);
  const featuredSkills = matched.length > 0 ? matched : profile.skills.slice(0, 4);
  const focusSnippet = extractProjectFocusSnippet(job);

  const companyBrand = profile.companyName?.trim() || 'Mannwork Inc.';
  const companySite = profile.companyWebsite?.trim() || profile.portfolioUrl?.trim() || 'https://www.mannwork.com/';

  if (senderType === 'company') {
    if (language === 'en') {
      const clientLabel = job.company && job.company !== 'Proyecto Freelancer.com' ? ` ${job.company}` : '';
      const subject =
        channel === 'linkedin_dm'
          ? `${companyBrand} · Proposal for ${job.title}`
          : `Software Consulting Proposal: ${job.title}${clientLabel ? ` (${clientLabel.trim()})` : ''} · ${companyBrand}`;

      const proposalText =
        channel === 'linkedin_dm'
          ? `Hi${clientLabel}! We saw your post regarding "${job.title}". At ${companyBrand} (${companySite}), our software engineering team builds custom solutions with ${featuredSkills.join(', ')}. We'd love to discuss your goals and share how we can help deliver this quickly and cleanly. Open to a brief 15-min call this week?`
          : `Hello${clientLabel} team,

We came across your opportunity "${job.title}" and wanted to reach out from ${companyBrand} (${companySite}).

From your description ("${focusSnippet}"), we see a great fit with what our software consultancy delivers every day. Our team specializes in ${featuredSkills.join(', ')}, helping companies and founders move from requirements to production-ready products with clear milestones, clean architecture, and transparent communication.

How ${companyBrand} would approach "${job.title}":
- Discovery & technical alignment during week 1 to validate scope, architecture, and deliverables.
- Iterative sprints with weekly demos so you have full visibility from day one.
- Production-grade code, documentation, and smooth handoff or ongoing support.${
              job.aiFitReasons && job.aiFitReasons.length > 0
                ? `\n\nWhy our team fits this project:\n${job.aiFitReasons.map((r) => `- ${r}`).join('\n')}`
                : ''
            }

You can learn more about our work at ${companySite}. Would you be available for a 15-minute discovery call this week to align on timeline and scope?

Best regards,
${profile.fullName}
${companyBrand} · ${companySite}`;

      return {
        subject,
        proposalText,
        highlights: [
          `Company proposal: ${companyBrand} (${companySite})`,
          `Tailored to: ${job.title}`,
          `Matched stack: ${featuredSkills.join(', ')}`,
          'Language: English (local draft — review before sending)',
        ],
        language: 'en',
        senderType: 'company',
        aiModel: 'local-template-fallback',
      };
    }

    const clientLabel = job.company && job.company !== 'Proyecto Freelancer.com' ? ` de ${job.company}` : '';
    const subject =
      channel === 'linkedin_dm'
        ? `${companyBrand} · Propuesta para ${job.title}`
        : `Propuesta de desarrollo para "${job.title}" · ${companyBrand}`;

    const proposalText =
      channel === 'linkedin_dm'
        ? `¡Hola! Vimos la búsqueda "${job.title}". Desde ${companyBrand} (${companySite}), nuestra consultora de software desarrolla soluciones a medida con ${featuredSkills.join(', ')}. Nos encantaría entender el alcance y contarles cómo podemos ayudarlos a concretarlo con entregas ágiles. ¿Coordinamos una charla breve de 15 min esta semana?`
        : `Hola equipo${clientLabel},

Vimos su publicación "${job.title}" y nos ponemos en contacto desde ${companyBrand} (${companySite}), consultora de desarrollo de software a medida.

Al revisar lo que están buscando ("${focusSnippet}"), vemos una excelente sinergia con la experiencia de nuestro equipo en ${featuredSkills.join(', ')}. ${profile.summary}

Cómo encararíamos "${job.title}" desde ${companyBrand}:
- Alineación inicial de alcance, arquitectura y prioridades para arrancar con claridad desde el día 1.
- Entregas iterativas semanales con demos funcionales y comunicación directa.
- Código mantenible, escalable y listo para producción.${
            job.aiFitReasons && job.aiFitReasons.length > 0
              ? `\n\nPuntos donde nuestro equipo aporta mayor valor:\n${job.aiFitReasons.map((r) => `- ${r}`).join('\n')}`
              : ''
          }

Pueden conocer más sobre nuestra consultora en ${companySite}. ¿Les parece si coordinamos una llamada breve de 15 minutos esta semana para revisar tiempos, alcance y armar un plan a medida?

Saludos,
${profile.fullName}
${companyBrand} · ${companySite}`;

    return {
      subject,
      proposalText,
      highlights: [
        `Propuesta como empresa: ${companyBrand} (${companySite})`,
        `Personalizada para: ${job.title}`,
        `Stack alineado: ${featuredSkills.join(', ')}`,
        'Idioma: Español (borrador local — revisar antes de enviar)',
      ],
      language: 'es',
      senderType: 'company',
      aiModel: 'local-template-fallback',
    };
  }

  // Individual mode
  const links = [
    profile.portfolioUrl ? `Portfolio: ${profile.portfolioUrl}` : null,
    profile.githubUrl ? `GitHub: ${profile.githubUrl}` : null,
    profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (language === 'en') {
    const companyLabel = job.company ? ` at ${job.company}` : '';
    const subject =
      channel === 'linkedin_dm'
        ? `Interested in ${job.title}${companyLabel}`
        : `Application: ${job.title}${companyLabel} · ${profile.fullName}`;

    const proposalText =
      channel === 'linkedin_dm'
        ? `Hi! I came across the "${job.title}" opportunity${companyLabel} and it really caught my eye. I have ${profile.experienceYears}+ years of experience building web and mobile products with ${featuredSkills.join(', ')}. I'd love to learn more about your goals and see how I can contribute. Open to a quick chat this week?`
        : `Hello${companyLabel ? ` ${job.company} team` : ' team'},

I saw the "${job.title}" opportunity and would love to be considered.

Reading through the details ("${focusSnippet}"), this aligns directly with my background. I'm ${profile.fullName}, ${profile.headline}, with ${profile.experienceYears}+ years of hands-on remote experience focused on ${featuredSkills.join(', ')}. I focus on shipping clean, maintainable software quickly while keeping communication transparent and aligned with product goals.${
            job.aiFitReasons && job.aiFitReasons.length > 0
              ? `\n\nKey areas where I can contribute right away:\n${job.aiFitReasons.map((r) => `- ${r}`).join('\n')}`
              : ''
          }

I'd be happy to hop on a brief 15-minute call to walk through the scope and how I can help move this forward.${
            links ? `\n\n${links}` : ''
          }

Best regards,
${profile.fullName}`;

    return {
      subject,
      proposalText,
      highlights: [
        `Candidate proposal · Stack: ${featuredSkills.join(', ')}`,
        `Tailored to: ${job.title}`,
        'Language: English (local draft — review before sending)',
      ],
      language: 'en',
      senderType: 'individual',
      aiModel: 'local-template-fallback',
    };
  }

  const companyLabel = job.company ? ` en ${job.company}` : '';
  const subject =
    channel === 'linkedin_dm'
      ? `Interés en ${job.title}${companyLabel}`
      : `Postulación: ${job.title}${companyLabel} · ${profile.fullName}`;

  const proposalText =
    channel === 'linkedin_dm'
      ? `¡Hola! Vi la búsqueda "${job.title}"${companyLabel} y me llamó mucho la atención. Trabajo hace ${profile.experienceYears}+ años desarrollando productos web y móviles con ${featuredSkills.join(', ')}. Me encantaría conocer un poco más sobre los objetivos del proyecto y ver cómo puedo aportar valor. ¿Te parece si coordinamos una charla breve esta semana?`
      : `Hola equipo${companyLabel},

Vi la oportunidad "${job.title}" y creo que mi perfil puede aportar mucho valor desde el primer día.

Por lo que detallan ("${focusSnippet}"), encaja directamente con mi experiencia. Soy ${profile.fullName}, ${profile.headline}. Cuento con ${profile.experienceYears}+ años de experiencia trabajando en entornos remotos con foco en ${featuredSkills.join(', ')}. ${profile.summary}

En relación con esta búsqueda, puedo ayudarles a acelerar entregas manteniendo código limpio, buena comunicación diaria y foco en objetivos concretos del producto.${
          job.aiFitReasons && job.aiFitReasons.length > 0
            ? `\n\nPuntos donde mejor encajo:\n${job.aiFitReasons.map((r) => `- ${r}`).join('\n')}`
            : ''
        }

Me encantaría conversar 15 minutos para entender mejor el alcance y contarles cómo puedo sumarme.${
          links ? `\n\n${links}` : ''
        }

Saludos,
${profile.fullName}`;

  return {
    subject,
    proposalText,
    highlights: [
      `Propuesta individual · Stack: ${featuredSkills.join(', ')}`,
      `Personalizada para: ${job.title}`,
      'Idioma: Español (borrador local — revisar antes de enviar)',
    ],
    language: 'es',
    senderType: 'individual',
    aiModel: 'local-template-fallback',
  };
}

export async function generatePersonalizedProposal(
  job: Job,
  profile: CandidateProfile,
  options: {
    channel?: ApplicationChannel;
    language?: 'es' | 'en' | 'auto';
    senderType?: SenderType;
    customInstructions?: string;
    useFallback?: boolean;
  } = {},
): Promise<GeneratedProposal> {
  const senderType: SenderType = options.senderType ?? profile.profileType ?? 'individual';
  const channel: ApplicationChannel =
    options.channel ?? (senderType === 'company' || job.kind === 'freelance' ? 'proposal' : 'cover_letter');
  const targetLanguage = resolveTargetLanguage(job, options.language);

  if (!isOpenAIConfigured()) {
    if (options.useFallback) {
      return buildFallbackProposal(job, profile, channel, targetLanguage, senderType);
    }
    throw new AIServiceError(
      'OPENAI_NOT_CONFIGURED',
      'OPENAI_API_KEY no está configurada o parece ser un placeholder. Agregá una clave válida en .env o usá el modo local de prueba.',
    );
  }

  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const cleanDescription = cleanHtmlText(job.description).slice(0, 6000);
  const guidance =
    targetLanguage === 'en' ? CHANNEL_GUIDANCE_EN[channel] : CHANNEL_GUIDANCE_ES[channel];

  const companyBrand = profile.companyName?.trim() || 'Mannwork Inc.';
  const companySite = profile.companyWebsite?.trim() || profile.portfolioUrl?.trim() || 'https://www.mannwork.com/';

  const identityInstruction =
    senderType === 'company'
      ? targetLanguage === 'en'
        ? `SENDER IDENTITY: You are writing ON BEHALF OF THE SOFTWARE CONSULTANCY "${companyBrand}" (${companySite}), signed by ${profile.fullName}.
- Use first-person plural ("we", "our team at ${companyBrand}") positioning ${companyBrand} as a reliable, agile software consulting partner.
- Include the website (${companySite}) naturally.
- Propose a concrete, tailored plan specifically addressing THIS client's project requirements, tech stack, and business goals — NEVER write a generic agency pitch.`
        : `IDENTIDAD DEL REMITENTE: Estás escribiendo EN NOMBRE DE LA CONSULTORA DE SOFTWARE "${companyBrand}" (${companySite}), firmado por ${profile.fullName}.
- Usá primera persona del plural ("en ${companyBrand}", "nuestro equipo", "podemos acompañarlos") posicionando a la consultora como partner tecnológico ágil y confiable.
- Incluí naturalmente el sitio web (${companySite}).
- Personalizá la propuesta al 100% para ESTE proyecto/oferta: mencioná necesidades específicas de la descripción, proponé un enfoque técnico/de entrega concreto y nunca suenes como un texto genérico copiado y pegado.`
      : targetLanguage === 'en'
        ? `SENDER IDENTITY: You are writing as an INDIVIDUAL SOFTWARE DEVELOPER (${profile.fullName}) applying directly.
- Use first-person singular ("I", "my experience").
- Tailor every paragraph specifically to THIS job's requirements, stack, and domain — no generic fluff.`
        : `IDENTIDAD DEL REMITENTE: Estás escribiendo como CANDIDATO INDIVIDUAL (${profile.fullName}) postulándose directamente.
- Usá primera persona del singular ("soy", "mi experiencia", "puedo aportar").
- Personalizá cada párrafo específicamente a los requisitos, stack y contexto de ESTA oferta, sin frases genéricas.`;

  const systemPrompt =
    targetLanguage === 'en'
      ? `You are an expert technical proposal and cover letter strategist for software developers and software consultancies.
${identityInstruction}
Rules:
- MANDATORY LANGUAGE: Write the ENTIRE output (subject, proposalText, and highlights) in natural, professional ENGLISH.
- Never invent experience, case studies, or technologies not present in the provided profile.
- Desired tone: ${profile.proposalTone}.
- Output format: STRICT JSON only:
{
  "subject": string (short compelling subject line in English tailored to this specific opportunity),
  "proposalText": string (ready-to-review tailored text in English with natural paragraph breaks),
  "highlights": string[] (2 to 4 concrete tailored points highlighted, in English)
}`
      : `Sos un estratega experto en redacción de propuestas freelance, comerciales y postulaciones tech.
${identityInstruction}
Reglas:
- IDIOMA OBLIGATORIO: Escribí TODA la salida (subject, proposalText y highlights) en ESPAÑOL natural y profesional.
- No inventes experiencia, casos de éxito ni tecnologías que no estén en el perfil provisto.
- Tono deseado: ${profile.proposalTone}.
- Formato de salida: SIEMPRE JSON estricto con esta estructura:
{
  "subject": string (asunto corto y específico para esta oportunidad, en español),
  "proposalText": string (texto personalizado listo para revisar y enviar, en español, con saltos de línea naturales),
  "highlights": string[] (2 a 4 puntos clave personalizados que destacaste, en español)
}`;

  const userPrompt = `TIPO DE REMITENTE: ${senderType === 'company' ? `EMPRESA / CONSULTORA (${companyBrand})` : 'CANDIDATO INDIVIDUAL'}
CANAL: ${channel}
GUÍA DEL CANAL: ${guidance}
IDIOMA OBJETIVO: ${targetLanguage === 'en' ? 'ENGLISH' : 'ESPAÑOL'}
${options.customInstructions ? `INSTRUCCIONES ADICIONALES DEL USUARIO: ${options.customInstructions}` : ''}

PERFIL UTILIZADO:
- Nombre / Firma: ${profile.fullName}
${senderType === 'company' ? `- Empresa: ${companyBrand}\n- Sitio web: ${companySite}` : ''}
- Titular / Propuesta de valor: ${profile.headline}
- Resumen: ${profile.summary}
- Años de experiencia / trayectoria: ${profile.experienceYears}
- Skills / Servicios: ${profile.skills.join(', ')}
- Idiomas: ${profile.languages.join(', ')}
- Tarifa horaria ref (USD): ${profile.hourlyRateUsd ?? 'No especificada'}
- Portfolio: ${profile.portfolioUrl || 'No especificado'}
- GitHub: ${profile.githubUrl || 'No especificado'}
- LinkedIn: ${profile.linkedinUrl || 'No especificado'}

OFERTA / PROYECTO ESPECÍFICO:
- Título: ${job.title}
- Empresa / Cliente: ${job.company || 'No especificada'}
- Fuente: ${job.source}
- Tipo: ${job.kind}
- Resumen de compatibilidad IA previo: ${job.aiSummary || 'Sin análisis previo'}
- Fortalezas detectadas: ${(job.aiFitReasons || []).join(' | ') || 'N/A'}
- Brechas detectadas: ${(job.aiGaps || []).join(' | ') || 'N/A'}
- Descripción completa:
${cleanDescription}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.55,
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

    const parsed = proposalResponseSchema.parse(JSON.parse(rawContent));
    return {
      subject: parsed.subject,
      proposalText: parsed.proposalText,
      highlights: parsed.highlights,
      language: targetLanguage,
      senderType,
      aiModel: completion.model || model,
    };
  } catch (error) {
    if (options.useFallback) {
      return buildFallbackProposal(job, profile, channel, targetLanguage, senderType);
    }
    if (error instanceof AIServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AIServiceError(
      'OPENAI_REQUEST_FAILED',
      `Error al generar propuesta con OpenAI: ${message}`,
    );
  }
}
