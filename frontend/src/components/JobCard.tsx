import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { Job, JobSource, JobStatus } from '../types';

interface JobCardProps {
  job: Job;
  busyAction?: 'analyze' | 'proposal' | 'flow' | null;
  onStatusChange: (jobId: string, status: JobStatus) => void;
  onAnalyze: (job: Job) => void;
  onGenerateProposal: (job: Job) => void;
  onRunFullFlow: (job: Job) => void;
  onInspect: (job: Job) => void;
}

const SOURCE_STYLE: Record<JobSource, { label: string; classes: string }> = {
  greenhouse: { label: 'Greenhouse', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  lever: { label: 'Lever', classes: 'bg-sky-50 text-sky-700 ring-sky-200' },
  linkedin: { label: 'LinkedIn', classes: 'bg-blue-50 text-blue-700 ring-blue-200' },
  getonbrd: { label: 'Get on Board', classes: 'bg-teal-50 text-teal-700 ring-teal-200' },
  freelancer: { label: 'Freelancer', classes: 'bg-cyan-50 text-cyan-800 ring-cyan-200' },
  workana: { label: 'Workana', classes: 'bg-purple-50 text-purple-700 ring-purple-200' },
  computrabajo: { label: 'Computrabajo', classes: 'bg-orange-50 text-orange-700 ring-orange-200' },
  remotive: { label: 'Remotive', classes: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  jobicy: { label: 'Jobicy', classes: 'bg-pink-50 text-pink-700 ring-pink-200' },
  other: { label: 'Portal', classes: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

const STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: 'new', label: 'Nueva' },
  { value: 'saved', label: 'Guardada' },
  { value: 'prepared', label: 'Propuesta lista' },
  { value: 'applied', label: 'Postulada' },
  { value: 'discarded', label: 'Descartada' },
];

function stripResidualHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRelativeDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Hace minutos';
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function getScoreBadgeClasses(score: number): string {
  if (score >= 75) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (score >= 50) return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-rose-50 text-rose-700 ring-rose-200';
}

export function JobCard({
  job,
  busyAction,
  onStatusChange,
  onAnalyze,
  onGenerateProposal,
  onRunFullFlow,
  onInspect,
}: JobCardProps) {
  const hasAi = typeof job.aiScore === 'number';
  const displayScore = hasAi ? job.aiScore! : job.score;
  const sourceBadge = SOURCE_STYLE[job.source] || SOURCE_STYLE.other;
  const cleanPreview = stripResidualHtml(job.description);
  const dateLabel = formatRelativeDate(job.publishedAt || job.discoveredAt);

  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-200 hover:shadow-md">
      <div>
        {/* Top badges & score */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${sourceBadge.classes}`}
            >
              {sourceBadge.label}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                job.language === 'es'
                  ? 'bg-amber-50 text-amber-800 ring-amber-200'
                  : 'bg-slate-100 text-slate-700 ring-slate-200'
              }`}
            >
              {job.language === 'es' ? 'ES' : 'EN'}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                job.kind === 'freelance'
                  ? 'bg-violet-50 text-violet-700 ring-violet-200'
                  : 'bg-slate-100 text-slate-700 ring-slate-200'
              }`}
            >
              {job.kind === 'freelance' ? 'Freelance' : 'Empleo'}
            </span>
            {dateLabel && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Clock className="h-3 w-3" />
                {dateLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div
              title={hasAi ? `Score de compatibilidad IA (${job.aiModel || 'OpenAI'})` : 'Score heurístico inicial'}
              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getScoreBadgeClasses(
                displayScore,
              )}`}
            >
              {hasAi && <Sparkles className="h-3.5 w-3.5" />}
              <span>{displayScore}%</span>
              <span className="font-normal opacity-75">{hasAi ? 'IA' : 'Base'}</span>
            </div>

            <select
              aria-label="Cambiar estado de la oferta"
              value={job.status}
              onChange={(e) => onStatusChange(job.id, e.target.value as JobStatus)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Title & Company */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => onInspect(job)}
            className="text-left text-base font-semibold text-slate-900 transition hover:text-indigo-600"
          >
            {job.title}
          </button>

          {job.company && (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="capitalize">{job.company}</span>
            </div>
          )}
        </div>

        {/* Description preview */}
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-slate-600">{cleanPreview}</p>

        {/* Matched terms */}
        {job.matchedTerms.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.matchedTerms.slice(0, 6).map((term) => (
              <span
                key={term}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
              >
                {term}
              </span>
            ))}
            {job.matchedTerms.length > 6 && (
              <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">
                +{job.matchedTerms.length - 6}
              </span>
            )}
          </div>
        )}

        {/* AI Compatibility panel */}
        {hasAi && job.aiSummary && (
          <div className="mt-3.5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-800">
                <Sparkles className="h-3.5 w-3.5" />
                Análisis de compatibilidad IA
              </span>
              {job.aiRecommended !== null && job.aiRecommended !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    job.aiRecommended
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {job.aiRecommended ? 'Recomendada' : 'Evaluar'}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{job.aiSummary}</p>

            {((job.aiFitReasons && job.aiFitReasons.length > 0) ||
              (job.aiGaps && job.aiGaps.length > 0)) && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {job.aiFitReasons && job.aiFitReasons.length > 0 && (
                  <ul className="space-y-1">
                    {job.aiFitReasons.slice(0, 2).map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[11px] text-emerald-800">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {job.aiGaps && job.aiGaps.length > 0 && (
                  <ul className="space-y-1">
                    {job.aiGaps.slice(0, 2).map((gap, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => onAnalyze(job)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
          >
            {busyAction === 'analyze' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            )}
            {hasAi ? 'Re-analizar IA' : 'Analizar con IA'}
          </button>

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => onGenerateProposal(job)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
          >
            {busyAction === 'proposal' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-emerald-600" />
            )}
            Generar propuesta
          </button>

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => onRunFullFlow(job)}
            title="Ejecuta análisis IA + guarda en Supabase + genera propuesta personalizada"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busyAction === 'flow' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Flujo completo
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onInspect(job)}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Detalle
          </button>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
          >
            Abrir
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </article>
  );
}
