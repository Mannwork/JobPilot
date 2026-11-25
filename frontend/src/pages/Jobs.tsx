import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserCircle2,
  X,
  Zap,
} from 'lucide-react';
import { JobCard } from '../components/JobCard';
import { INITIAL_JOB_FILTERS, JobFilters } from '../components/JobFilters';
import { api } from '../lib/api';
import type {
  ApplicationChannel,
  Job,
  JobFilterState,
  JobKind,
  JobStatus,
  PortalSearchGroup,
  ProposalLanguageOption,
  SenderType,
} from '../types';

interface JobsPageProps {
  jobs: Job[];
  useFallbackAi: boolean;
  onJobsChanged: () => Promise<void>;
  onOpenApplications: () => void;
  onNotify: (kind: 'success' | 'error' | 'info', message: string) => void;
}

function cleanDescriptionForModal(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getJobTimestamp(job: Job): number {
  const ts = Date.parse(job.publishedAt || job.discoveredAt);
  return Number.isFinite(ts) ? ts : 0;
}

export function Jobs({
  jobs,
  useFallbackAi,
  onJobsChanged,
  onOpenApplications,
  onNotify,
}: JobsPageProps) {
  const [filters, setFilters] = useState<JobFilterState>(INITIAL_JOB_FILTERS);
  const [defaultSenderType, setDefaultSenderType] = useState<SenderType>('company');
  const [defaultProposalLang, setDefaultProposalLang] = useState<ProposalLanguageOption>('auto');
  const [busyMap, setBusyMap] = useState<Record<string, 'analyze' | 'proposal' | 'flow'>>({});
  const [scanning, setScanning] = useState(false);

  // Multi-portal search & universal import modal
  const [showPortalsModal, setShowPortalsModal] = useState(false);
  const [portalsTab, setPortalsTab] = useState<'portals' | 'import'>('portals');
  const [portalGroups, setPortalGroups] = useState<PortalSearchGroup[]>([]);
  const [importTitle, setImportTitle] = useState('');
  const [importCompany, setImportCompany] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importKind, setImportKind] = useState<'' | JobKind>('');
  const [importDescription, setImportDescription] = useState('');
  const [importProposalLang, setImportProposalLang] = useState<ProposalLanguageOption>('auto');
  const [importSenderType, setImportSenderType] = useState<SenderType>('company');
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [autoGenerateProposal, setAutoGenerateProposal] = useState(true);
  const [importing, setImporting] = useState(false);

  // Job Detail + Custom proposal modal
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [proposalChannel, setProposalChannel] = useState<ApplicationChannel>('proposal');
  const [modalProposalLang, setModalProposalLang] = useState<ProposalLanguageOption>('auto');
  const [modalSenderType, setModalSenderType] = useState<SenderType>('company');
  const [customInstructions, setCustomInstructions] = useState('');

  useEffect(() => {
    if (showPortalsModal && portalGroups.length === 0) {
      api
        .getPortalSearches()
        .then(setPortalGroups)
        .catch(() => {});
    }
  }, [showPortalsModal, portalGroups.length]);

  useEffect(() => {
    if (selectedJob) {
      const fresh = jobs.find((j) => j.id === selectedJob.id);
      if (fresh) setSelectedJob(fresh);
    }
  }, [jobs, selectedJob]);

  const filteredJobs = useMemo(() => {
    const q = filters.search.trim().toLocaleLowerCase('es');
    const cutoff =
      filters.maxAgeDays > 0 ? Date.now() - filters.maxAgeDays * 24 * 60 * 60 * 1000 : null;

    const list = jobs.filter((job) => {
      if (filters.source && job.source !== filters.source) return false;
      if (filters.kind && job.kind !== filters.kind) return false;
      if (filters.status && job.status !== filters.status) return false;
      if (filters.language && job.language !== filters.language) return false;
      if (filters.analyzedOnly && typeof job.aiScore !== 'number') return false;
      const effectiveScore = job.aiScore ?? job.score;
      if (effectiveScore < filters.minScore) return false;
      if (cutoff !== null && getJobTimestamp(job) < cutoff) return false;
      if (q) {
        const hay = `${job.title} ${job.company || ''} ${job.description} ${job.matchedTerms.join(' ')}`.toLocaleLowerCase('es');
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filters.sortBy === 'recent') {
      return list.sort(
        (a, b) =>
          getJobTimestamp(b) - getJobTimestamp(a) ||
          (b.aiScore ?? b.score) - (a.aiScore ?? a.score),
      );
    }

    return list.sort(
      (a, b) =>
        (b.aiScore ?? b.score) - (a.aiScore ?? a.score) ||
        getJobTimestamp(b) - getJobTimestamp(a),
    );
  }, [jobs, filters]);

  const setBusy = (jobId: string, action: 'analyze' | 'proposal' | 'flow' | null) => {
    setBusyMap((prev) => {
      const next = { ...prev };
      if (action) next[jobId] = action;
      else delete next[jobId];
      return next;
    });
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await api.scanBoards();
      onNotify(
        'success',
        `Escaneo listo (${res.boardsChecked} fuentes: Get on Board ES, Freelancer ES+EN, Remotive, Jobicy, Greenhouse/Lever): ${res.added} ofertas nuevas.`,
      );
      await onJobsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al escanear ofertas');
    } finally {
      setScanning(false);
    }
  };

  const handleStatusChange = async (jobId: string, status: JobStatus) => {
    try {
      await api.updateJobStatus(jobId, status);
      await onJobsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'No se pudo actualizar el estado');
    }
  };

  const handleAnalyze = async (job: Job) => {
    setBusy(job.id, 'analyze');
    try {
      const res = await api.analyzeJob(job.id, { useFallback: useFallbackAi });
      onNotify('success', `Análisis listo para "${job.title}": ${res.job.aiScore}% de compatibilidad.`);
      await onJobsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al analizar con IA');
    } finally {
      setBusy(job.id, null);
    }
  };

  const handleGenerateProposal = async (
    job: Job,
    options?: {
      channel?: ApplicationChannel;
      language?: ProposalLanguageOption;
      senderType?: SenderType;
      customInstructions?: string;
    },
  ) => {
    setBusy(job.id, 'proposal');
    try {
      const resolvedSender = options?.senderType ?? defaultSenderType;
      const res = await api.generateApplication({
        jobId: job.id,
        channel: options?.channel,
        language: options?.language ?? defaultProposalLang,
        senderType: resolvedSender,
        customInstructions: options?.customInstructions,
        useFallback: useFallbackAi,
      });
      onNotify(
        'success',
        `Propuesta (${res.application.senderType === 'company' ? 'Mannwork Inc.' : 'Candidato'} · ${
          res.application.language === 'en' ? 'Inglés' : 'Español'
        }) generada para "${job.title}".`,
      );
      await onJobsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al generar propuesta');
    } finally {
      setBusy(job.id, null);
    }
  };

  const handleRunFullFlow = async (
    job: Job,
    overrides?: { language?: ProposalLanguageOption; senderType?: SenderType },
  ) => {
    setBusy(job.id, 'flow');
    try {
      const res = await api.runFullFlow(job.id, {
        language: overrides?.language ?? defaultProposalLang,
        senderType: overrides?.senderType ?? defaultSenderType,
        useFallback: useFallbackAi,
      });
      onNotify(
        'success',
        `Flujo completo listo: ${res.job.aiScore}% match + propuesta (${
          res.application.senderType === 'company' ? 'Mannwork Inc.' : 'Candidato'
        } · ${res.application.language === 'en' ? 'EN' : 'ES'}) para "${res.job.title}".`,
      );
      await onJobsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error ejecutando el flujo completo');
    } finally {
      setBusy(job.id, null);
    }
  };

  const handleImportJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    try {
      const res = await api.importJob({
        title: importTitle,
        company: importCompany || undefined,
        url: importUrl,
        description: importDescription,
        kind: importKind || undefined,
        autoAnalyze,
        autoGenerateProposal,
        proposalLanguage: importProposalLang,
        senderType: importSenderType,
        useFallback: useFallbackAi,
      });

      if (res.aiWarning) {
        onNotify('info', `Oferta guardada, pero hubo un aviso de IA: ${res.aiWarning}`);
      } else if (res.application) {
        onNotify(
          'success',
          `Flujo completo ejecutado: "${res.job.title}" guardada, analizada (${res.job.aiScore}%) y propuesta en ${
            res.application.language === 'en' ? 'Inglés' : 'Español'
          } lista.`,
        );
      } else {
        onNotify('success', `Oferta "${res.job.title}" importada correctamente (${res.job.source}).`);
      }

      setImportTitle('');
      setImportCompany('');
      setImportUrl('');
      setImportKind('');
      setImportDescription('');
      setShowPortalsModal(false);
      await onJobsChanged();
      if (res.application) {
        onOpenApplications();
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al importar la oferta');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ofertas y Proyectos Freelance</h1>
          <p className="mt-1 text-sm text-slate-500">
            Escaneá ofertas en español e inglés (Get on Board, Freelancer.com, Remotive, Jobicy, Greenhouse, Lever) o importá desde Workana, Computrabajo y LinkedIn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Default sender identity selector (Individual vs Mannwork Company) */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDefaultSenderType('individual')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition ${
                defaultSenderType === 'individual'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UserCircle2 className="h-3.5 w-3.5" />
              Candidato
            </button>
            <button
              type="button"
              onClick={() => setDefaultSenderType('company')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition ${
                defaultSenderType === 'company'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Mannwork
            </button>
          </div>

          {/* Default proposal language selector */}
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
            <Globe2 className="h-3.5 w-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Idioma:</span>
            <select
              aria-label="Idioma por defecto de propuestas"
              value={defaultProposalLang}
              onChange={(e) => setDefaultProposalLang(e.target.value as ProposalLanguageOption)}
              className="bg-transparent font-semibold text-indigo-700 focus:outline-none"
            >
              <option value="auto">Auto (según oferta)</option>
              <option value="es">Español (ES)</option>
              <option value="en">Inglés (EN)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setPortalsTab('portals');
              setShowPortalsModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-2.5 text-sm font-semibold text-purple-800 transition hover:bg-purple-100"
          >
            <Globe2 className="h-4 w-4" />
            Workana · Computrabajo · LinkedIn
          </button>

          <button
            type="button"
            disabled={scanning}
            onClick={handleScan}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Escanear ofertas
          </button>
        </div>
      </div>

      {/* Filters */}
      <JobFilters
        filters={filters}
        onChange={setFilters}
        totalCount={jobs.length}
        filteredCount={filteredJobs.length}
      />

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Search className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">No hay ofertas que coincidan</h3>
          <p className="mt-1 text-sm text-slate-500">
            Hacé clic en &quot;Escanear ofertas&quot; para traer vacantes reales de Get on Board (ES), Freelancer.com (ES/EN) y portales remotos, o relajá los filtros.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busyAction={busyMap[job.id] ?? null}
              onStatusChange={handleStatusChange}
              onAnalyze={handleAnalyze}
              onGenerateProposal={(j) => handleGenerateProposal(j)}
              onRunFullFlow={(j) => handleRunFullFlow(j)}
              onInspect={(j) => {
                setSelectedJob(j);
                setProposalChannel(
                  defaultSenderType === 'company' || j.kind === 'freelance' ? 'proposal' : 'cover_letter',
                );
                setModalProposalLang(defaultProposalLang);
                setModalSenderType(defaultSenderType);
                setCustomInstructions('');
              }}
            />
          ))}
        </div>
      )}

      {/* Multi-Portal Search & Universal Import Modal */}
      {showPortalsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-purple-50 p-2 text-purple-600">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Portales en Español & Freelance · Buscar e Importar
                  </h2>
                  <p className="text-xs text-slate-500">
                    Workana, Computrabajo, LinkedIn, Get on Board, Bumeran y Upwork
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPortalsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-6 pt-2">
              <button
                type="button"
                onClick={() => setPortalsTab('portals')}
                className={`rounded-t-xl px-4 py-2 text-xs font-semibold transition ${
                  portalsTab === 'portals'
                    ? 'border-x border-t border-slate-200 bg-white text-indigo-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Búsquedas directas por portal
              </button>
              <button
                type="button"
                onClick={() => setPortalsTab('import')}
                className={`rounded-t-xl px-4 py-2 text-xs font-semibold transition ${
                  portalsTab === 'import'
                    ? 'border-x border-t border-slate-200 bg-white text-indigo-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Importar oferta (cualquier enlace)
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              {portalsTab === 'portals' ? (
                <div className="space-y-4">
                  <p className="text-xs leading-relaxed text-slate-500">
                    Portales como Workana, Computrabajo y LinkedIn bloquean bots automáticos. Abrí cualquiera de estas búsquedas filtradas por <strong>más recientes</strong> y cuando veas una buena oportunidad, pegá su URL y descripción en la pestaña <strong>&quot;Importar oferta&quot;</strong> para analizarla y redactar la propuesta.
                  </p>

                  {portalGroups.map((group) => (
                    <div key={group.portal} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{group.portal}</h3>
                          <p className="text-xs text-slate-500">{group.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-800">
                            {group.language}
                          </span>
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-violet-700">
                            {group.kind}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {group.links.map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700"
                          >
                            <span className="truncate">{link.label}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleImportJob} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Título de la oferta / proyecto *</label>
                      <input
                        required
                        type="text"
                        value={importTitle}
                        onChange={(e) => setImportTitle(e.target.value)}
                        placeholder="Ej: Desarrollador React + Node freelance para MVP"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Empresa / Cliente</label>
                      <input
                        type="text"
                        value={importCompany}
                        onChange={(e) => setImportCompany(e.target.value)}
                        placeholder="Ej: Cliente Workana / Agencia Digital"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700">
                        URL de la oferta (Workana, Computrabajo, LinkedIn, etc.) *
                      </label>
                      <input
                        required
                        type="url"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://www.workana.com/job/... o computrabajo / linkedin"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Modalidad</label>
                      <select
                        value={importKind}
                        onChange={(e) => setImportKind(e.target.value as '' | JobKind)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">Detectar auto</option>
                        <option value="freelance">Freelance / Proyecto</option>
                        <option value="employment">Empleo / Full-time</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700">Descripción completa *</label>
                    <textarea
                      required
                      rows={5}
                      value={importDescription}
                      onChange={(e) => setImportDescription(e.target.value)}
                      placeholder="Pegá el texto de la oferta o proyecto..."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2.5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
                    <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={autoAnalyze}
                        onChange={(e) => {
                          setAutoAnalyze(e.target.checked);
                          if (!e.target.checked) setAutoGenerateProposal(false);
                        }}
                        className="h-4 w-4 rounded accent-indigo-600"
                      />
                      Paso 2: Analizar compatibilidad con OpenAI automáticamente
                    </label>
                    <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={autoGenerateProposal}
                        onChange={(e) => {
                          setAutoGenerateProposal(e.target.checked);
                          if (e.target.checked) setAutoAnalyze(true);
                        }}
                        className="h-4 w-4 rounded accent-indigo-600"
                      />
                      Paso 4: Generar propuesta personalizada y abrir en Propuestas
                    </label>

                    {autoGenerateProposal && (
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-700">Como:</span>
                          <select
                            value={importSenderType}
                            onChange={(e) => setImportSenderType(e.target.value as SenderType)}
                            className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 focus:outline-none"
                          >
                            <option value="company">Empresa (Mannwork Inc.)</option>
                            <option value="individual">Candidato individual</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-700">Idioma:</span>
                          <select
                            value={importProposalLang}
                            onChange={(e) => setImportProposalLang(e.target.value as ProposalLanguageOption)}
                            className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-800 focus:outline-none"
                          >
                            <option value="auto">Automático (según oferta)</option>
                            <option value="es">Español (ES)</option>
                            <option value="en">Inglés (EN)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPortalsModal(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={importing}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {autoGenerateProposal ? 'Importar y ejecutar flujo completo' : 'Importar oferta'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">
                    {selectedJob.source}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold uppercase text-amber-800">
                    {selectedJob.language}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    Score: {selectedJob.aiScore ?? selectedJob.score}%
                  </span>
                </div>
                <h2 className="mt-1.5 text-lg font-bold text-slate-900">{selectedJob.title}</h2>
                {selectedJob.company && (
                  <p className="text-sm capitalize text-slate-500">{selectedJob.company}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto p-6">
              {typeof selectedJob.aiScore === 'number' && selectedJob.aiSummary && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <Sparkles className="h-4 w-4" />
                    Análisis de compatibilidad ({selectedJob.aiScore}% · {selectedJob.aiModel})
                  </span>
                  <p className="mt-2 text-sm text-slate-700">{selectedJob.aiSummary}</p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {selectedJob.aiFitReasons && selectedJob.aiFitReasons.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">Puntos fuertes</p>
                        <ul className="mt-1 space-y-1">
                          {selectedJob.aiFitReasons.map((r, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedJob.aiGaps && selectedJob.aiGaps.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-800">Brechas / Consideraciones</p>
                        <ul className="mt-1 space-y-1">
                          {selectedJob.aiGaps.map((g, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                              {g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Custom Proposal Generator box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Generar propuesta personalizada
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Enviar como</label>
                    <select
                      value={modalSenderType}
                      onChange={(e) => setModalSenderType(e.target.value as SenderType)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="company">Empresa · Mannwork Inc.</option>
                      <option value="individual">Candidato individual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Canal</label>
                    <select
                      value={proposalChannel}
                      onChange={(e) => setProposalChannel(e.target.value as ApplicationChannel)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="proposal">Propuesta Freelance / Comercial</option>
                      <option value="cover_letter">Carta de Presentación</option>
                      <option value="linkedin_dm">Mensaje directo LinkedIn</option>
                      <option value="email">Correo electrónico</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Idioma</label>
                    <select
                      value={modalProposalLang}
                      onChange={(e) => setModalProposalLang(e.target.value as ProposalLanguageOption)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-800 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="auto">Auto ({selectedJob.language.toUpperCase()})</option>
                      <option value="es">Español (ES)</option>
                      <option value="en">Inglés (EN)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-700">
                    Instrucciones opcionales para la IA
                  </label>
                  <input
                    type="text"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="Ej: Proponer un MVP en 4 semanas, destacar casos de Mannwork o disponibilidad inmediata..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busyMap[selectedJob.id])}
                    onClick={() => handleAnalyze(selectedJob)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
                  >
                    {busyMap[selectedJob.id] === 'analyze' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    )}
                    Analizar compatibilidad
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyMap[selectedJob.id])}
                    onClick={() =>
                      handleGenerateProposal(selectedJob, {
                        channel: proposalChannel,
                        language: modalProposalLang,
                        senderType: modalSenderType,
                        customInstructions: customInstructions.trim() || undefined,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busyMap[selectedJob.id] === 'proposal' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    Generar como {modalSenderType === 'company' ? 'Mannwork' : 'Candidato'}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyMap[selectedJob.id])}
                    onClick={() =>
                      handleRunFullFlow(selectedJob, {
                        language: modalProposalLang,
                        senderType: modalSenderType,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busyMap[selectedJob.id] === 'flow' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    Flujo completo (IA + Propuesta)
                  </button>
                </div>
              </div>

              {/* Full clean description */}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Descripción completa
                  </h3>
                  <a
                    href={selectedJob.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    Abrir oferta original
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-sm leading-relaxed text-slate-700">
                  {cleanDescriptionForModal(selectedJob.description)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
