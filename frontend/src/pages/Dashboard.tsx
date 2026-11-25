import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  UploadCloud,
  UserCircle2,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Application, CandidateProfile, Job, SenderType, SystemHealth } from '../types';

interface DashboardProps {
  health: SystemHealth | null;
  jobs: Job[];
  applications: Application[];
  useFallbackAi: boolean;
  onToggleFallbackAi: (value: boolean) => void;
  onRefreshAll: () => Promise<void>;
  onNavigate: (page: 'dashboard' | 'jobs' | 'applications') => void;
  onNotify: (kind: 'success' | 'error' | 'info', message: string) => void;
}

export function Dashboard({
  health,
  jobs,
  applications,
  useFallbackAi,
  onToggleFallbackAi,
  onRefreshAll,
  onNavigate,
  onNotify,
}: DashboardProps) {
  const [scanning, setScanning] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [flowBusyId, setFlowBusyId] = useState<string | null>(null);

  // SQL Schema modal/panel
  const [showSchema, setShowSchema] = useState(false);
  const [schemaSql, setSchemaSql] = useState<string>('');
  const [copiedSql, setCopiedSql] = useState(false);

  // Candidate & Company Profile editor
  const [profileTab, setProfileTab] = useState<SenderType>('individual');
  const [profiles, setProfiles] = useState<{ individual: CandidateProfile; company: CandidateProfile } | null>(null);
  const [skillsText, setSkillsText] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const profile = profiles ? profiles[profileTab] : null;

  useEffect(() => {
    api
      .getProfiles()
      .then((res) => {
        setProfiles(res);
        setSkillsText(res[profileTab].skills.join(', '));
      })
      .catch(() => {
        // Handled silently if backend is unreachable
      });
  }, [health?.supabaseReady, health?.schemaV2Ready]);

  const handleSwitchProfileTab = (nextTab: SenderType) => {
    setProfileTab(nextTab);
    if (profiles) {
      setSkillsText(profiles[nextTab].skills.join(', '));
    }
  };

  const updateActiveProfile = (patch: Partial<CandidateProfile>) => {
    setProfiles((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [profileTab]: { ...prev[profileTab], ...patch },
      };
    });
  };

  const analyzedJobs = jobs.filter((j) => typeof j.aiScore === 'number');
  const highMatchJobs = jobs.filter((j) => (j.aiScore ?? j.score) >= 75);
  const sentApps = applications.filter((a) => ['sent', 'interview', 'accepted'].includes(a.status));

  const topJobs = [...jobs]
    .sort((a, b) => (b.aiScore ?? b.score) - (a.aiScore ?? a.score))
    .slice(0, 5);

  const handleOpenSchema = async () => {
    setShowSchema((prev) => !prev);
    if (!schemaSql) {
      try {
        const res = await api.getSchemaSql();
        setSchemaSql(health?.supabaseReady && res.migrationV2Sql ? res.migrationV2Sql : res.sql);
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'No se pudo cargar el SQL');
      }
    }
  };

  const handleCopySql = async () => {
    if (!schemaSql) return;
    await navigator.clipboard.writeText(schemaSql);
    setCopiedSql(true);
    onNotify('success', 'SQL copiado. Pegalo en Supabase -> SQL Editor y ejecutalo.');
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleQuickScan = async () => {
    setScanning(true);
    try {
      const result = await api.scanBoards();
      onNotify(
        'success',
        `Escaneo listo: ${result.boardsChecked} tableros revisados, ${result.added} ofertas nuevas (${result.total} en total).`,
      );
      await onRefreshAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al escanear tableros');
    } finally {
      setScanning(false);
    }
  };

  const handleSyncLocalToSupabase = async () => {
    setSyncingLocal(true);
    try {
      const res = await api.syncLocalJobs();
      onNotify(
        'success',
        `Migración completada: ${res.migrated} ofertas nuevas importadas desde jobs.json (${res.totalSupabase} en Supabase).`,
      );
      await onRefreshAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'No se pudo migrar jobs.json');
    } finally {
      setSyncingLocal(false);
    }
  };

  const handleRunFlow = async (job: Job) => {
    setFlowBusyId(job.id);
    try {
      const result = await api.runFullFlow(job.id, { useFallback: useFallbackAi });
      onNotify(
        'success',
        `Flujo completo listo para "${result.job.title}": compatibilidad ${result.job.aiScore}% y propuesta guardada.`,
      );
      await onRefreshAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error ejecutando el flujo completo');
    } finally {
      setFlowBusyId(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      const skills = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await api.saveProfile({
        profileType: profileTab,
        fullName: profile.fullName,
        companyName: profile.companyName || '',
        companyWebsite: profile.companyWebsite || '',
        headline: profile.headline,
        summary: profile.summary,
        skills,
        experienceYears: Number(profile.experienceYears) || 0,
        hourlyRateUsd: profile.hourlyRateUsd ? Number(profile.hourlyRateUsd) : null,
        portfolioUrl: profile.portfolioUrl || '',
        githubUrl: profile.githubUrl || '',
        linkedinUrl: profile.linkedinUrl || '',
        proposalTone: profile.proposalTone,
        remoteOnly: profile.remoteOnly,
      });
      setProfiles((prev) => (prev ? { ...prev, [profileTab]: updated } : prev));
      setSkillsText(updated.skills.join(', '));
      onNotify(
        'success',
        profileTab === 'company'
          ? `Perfil de empresa (${updated.companyName || 'Mannwork Inc.'}) guardado.`
          : 'Perfil de candidato guardado correctamente.',
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'No se pudo guardar el perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const pipelineSteps = [
    {
      step: 1,
      title: 'Encontrar ofertas',
      desc: 'Greenhouse, Lever y búsquedas de LinkedIn',
      done: jobs.length > 0,
      metric: `${jobs.length} ofertas`,
    },
    {
      step: 2,
      title: 'Análisis OpenAI',
      desc: 'Compatibilidad contra tu perfil real',
      done: analyzedJobs.length > 0,
      metric: `${analyzedJobs.length} analizadas`,
    },
    {
      step: 3,
      title: 'Guardar en Supabase',
      desc: 'Tablas jobs, candidate_profiles, applications',
      done: Boolean(health?.supabaseReady),
      metric: health?.supabaseReady ? 'Conectado' : 'Pendiente SQL',
    },
    {
      step: 4,
      title: 'Propuesta personalizada',
      desc: 'Borrador adaptado al puesto y canal',
      done: applications.length > 0,
      metric: `${applications.length} creadas`,
    },
    {
      step: 5,
      title: 'Ver y enviar en Dashboard',
      desc: 'Revisión humana y seguimiento de estado',
      done: sentApps.length > 0 || applications.length > 0,
      metric: `${sentApps.length} enviadas`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard de JobPilot</h1>
          <p className="mt-1 text-sm text-slate-500">
            Flujo completo: descubrimiento de ofertas, análisis de compatibilidad con IA, guardado en Supabase y propuestas personalizadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={scanning}
            onClick={handleQuickScan}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Escanear tableros
          </button>

          {health?.supabaseReady && (
            <button
              type="button"
              disabled={syncingLocal}
              onClick={handleSyncLocalToSupabase}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
            >
              {syncingLocal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4 text-emerald-600" />
              )}
              Migrar jobs.json
            </button>
          )}
        </div>
      </div>

      {/* Supabase setup / v2 migration banner */}
      {health && (!health.supabaseReady || health.schemaV2Ready === false) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-amber-100 p-2 text-amber-700">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-amber-950">
                  {health.supabaseReady
                    ? 'Actualización rápida en Supabase: habilitar idiomas ES/EN, fechas y portales freelance'
                    : 'Paso 1 pendiente: crear las tablas en Supabase'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  {health.supabaseReady
                    ? 'Ejecutá la migración v2 en Supabase SQL Editor para guardar ofertas de Get on Board, Freelancer.com, Workana, Computrabajo y dividir propuestas en Español e Inglés.'
                    : 'Tu conexión a Supabase está configurada, pero todavía faltan tablas en public. Mientras tanto JobPilot mantiene respaldo local.'}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                  {(['jobs', 'candidate_profiles', 'applications'] as const).map((tbl) => (
                    <span
                      key={tbl}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${
                        health.tables[tbl]
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-white text-amber-800 ring-1 ring-amber-300'
                      }`}
                    >
                      {health.tables[tbl] ? '✓' : '○'} {tbl}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenSchema}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-800"
              >
                <Code2 className="h-3.5 w-3.5" />
                {showSchema ? 'Ocultar SQL' : 'Ver / Copiar SQL'}
              </button>
              <button
                type="button"
                onClick={() => onRefreshAll()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reverificar tablas
              </button>
            </div>
          </div>

          {showSchema && (
            <div className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-slate-950 text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
                <span className="text-xs font-medium text-slate-400">
                  backend/supabase/schema.sql · Pegar en Supabase Dashboard → SQL Editor
                </span>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700"
                >
                  {copiedSql ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSql ? 'Copiado' : 'Copiar SQL'}
                </button>
              </div>
              <pre className="max-h-72 overflow-auto p-4 text-xs leading-relaxed text-emerald-200">
                <code>{schemaSql || 'Cargando schema.sql...'}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* OpenAI status notice */}
      {health && !health.openaiConfigured && (
        <div className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-indigo-950">
                OPENAI_API_KEY pendiente o en formato placeholder
              </p>
              <p className="text-xs text-indigo-800">
                Agregá tu clave real (<code className="rounded bg-indigo-100 px-1">sk-...</code>) en{' '}
                <code className="rounded bg-indigo-100 px-1">.env</code> para usar {health.openaiModel}, o activá el modo
                local de prueba para testear el flujo completo ahora mismo.
              </p>
            </div>
          </div>

          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-900">
            <input
              type="checkbox"
              checked={useFallbackAi}
              onChange={(e) => onToggleFallbackAi(e.target.checked)}
              className="h-4 w-4 rounded accent-indigo-600"
            />
            Modo local de prueba
          </label>
        </div>
      )}

      {/* 5-step pipeline visual */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Flujo completo de JobPilot</h2>
          <span className="text-xs text-slate-400">5 pasos integrados</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {pipelineSteps.map((item) => (
            <div
              key={item.step}
              className={`rounded-xl border p-3.5 transition ${
                item.done
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    item.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {item.done ? <Check className="h-3.5 w-3.5" /> : item.step}
                </span>
                <span
                  className={`text-[11px] font-semibold ${
                    item.done ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {item.metric}
                </span>
              </div>
              <p className="mt-2.5 text-xs font-semibold text-slate-900">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Ofertas descubiertas</span>
            <Briefcase className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{jobs.length}</p>
          <p className="mt-1 text-xs text-slate-400">
            {jobs.filter((j) => j.kind === 'freelance').length} freelance ·{' '}
            {jobs.filter((j) => j.language === 'es').length} ES ·{' '}
            {jobs.filter((j) => j.language === 'en').length} EN
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Analizadas con IA</span>
            <Sparkles className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{analyzedJobs.length}</p>
          <p className="mt-1 text-xs text-slate-400">
            {analyzedJobs.filter((j) => j.aiRecommended).length} recomendadas por IA
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Alta compatibilidad (75%+)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{highMatchJobs.length}</p>
          <p className="mt-1 text-xs text-slate-400">Listas para priorizar postulación</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Propuestas generadas</span>
            <FileText className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{applications.length}</p>
          <p className="mt-1 text-xs text-slate-400">
            {applications.filter((a) => a.language === 'es').length} Español ·{' '}
            {applications.filter((a) => a.language === 'en').length} Inglés · {sentApps.length} enviadas
          </p>
        </div>
      </section>

      {/* Main 2-column content */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Top opportunities */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Top oportunidades detectadas</h2>
              <p className="text-xs text-slate-500">Ejecutá el flujo completo (IA + propuesta) en un clic</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Ver todas
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {topJobs.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Todavía no hay ofertas cargadas. Escaneá tableros o importá una publicación de LinkedIn.
              </div>
            ) : (
              topJobs.map((job) => {
                const score = job.aiScore ?? job.score;
                const isAi = typeof job.aiScore === 'number';
                return (
                  <div key={job.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${
                            score >= 75
                              ? 'bg-emerald-50 text-emerald-700'
                              : score >= 50
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isAi && <Sparkles className="h-3 w-3" />}
                          {score}%
                        </span>
                        <span className="truncate text-sm font-semibold text-slate-900">{job.title}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {job.company || 'Empresa no especificada'} · {job.source} ·{' '}
                        {job.kind === 'freelance' ? 'Freelance' : 'Empleo'}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={flowBusyId === job.id}
                      onClick={() => handleRunFlow(job)}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-600 hover:text-white disabled:opacity-50"
                    >
                      {flowBusyId === job.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      Flujo completo
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Recent proposals mini-section */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Últimas propuestas generadas</h3>
              <button
                type="button"
                onClick={() => onNavigate('applications')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Abrir propuestas
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {applications.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">
                Aún no generaste propuestas. Probá el botón &quot;Flujo completo&quot; en cualquiera de tus ofertas.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {applications.slice(0, 3).map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => onNavigate('applications')}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {app.subject || app.job?.title || 'Propuesta sin asunto'}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {app.job?.company || 'Sin empresa'} · canal: {app.channel} · estado: {app.status}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Candidate & Company Profile Card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`rounded-xl p-2 ${
                  profileTab === 'company'
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                {profileTab === 'company' ? (
                  <Building2 className="h-5 w-5" />
                ) : (
                  <UserCircle2 className="h-5 w-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {profileTab === 'company' ? 'Perfil Empresa (Mannwork)' : 'Perfil Candidato'}
                </h2>
                <p className="text-xs text-slate-500">
                  {profileTab === 'company'
                    ? 'Usado al generar propuestas como consultora de software'
                    : 'Usado al postularte como desarrollador individual'}
                </p>
              </div>
            </div>
          </div>

          {/* Profile Switcher Tabs */}
          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleSwitchProfileTab('individual')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                profileTab === 'individual'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCircle2 className="h-3.5 w-3.5" />
              Candidato
            </button>
            <button
              type="button"
              onClick={() => handleSwitchProfileTab('company')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                profileTab === 'company'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Empresa (Mannwork)
            </button>
          </div>

          {!profile ? (
            <div className="py-8 text-center text-xs text-slate-400">Cargando perfil...</div>
          ) : (
            <form onSubmit={handleSaveProfile} className="mt-4 space-y-3.5">
              {profileTab === 'company' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Nombre de la empresa</label>
                    <input
                      type="text"
                      value={profile.companyName || ''}
                      onChange={(e) => updateActiveProfile({ companyName: e.target.value })}
                      placeholder="Mannwork Inc."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Sitio web</label>
                    <input
                      type="url"
                      value={profile.companyWebsite || ''}
                      onChange={(e) => updateActiveProfile({ companyWebsite: e.target.value })}
                      placeholder="https://www.mannwork.com/"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  {profileTab === 'company' ? 'Firma / Responsable comercial' : 'Nombre completo'}
                </label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => updateActiveProfile({ fullName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  {profileTab === 'company' ? 'Propuesta de valor / Titular' : 'Titular profesional'}
                </label>
                <input
                  type="text"
                  value={profile.headline}
                  onChange={(e) => updateActiveProfile({ headline: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  {profileTab === 'company' ? 'Servicios y stack (separados por coma)' : 'Skills (separadas por coma)'}
                </label>
                <input
                  type="text"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {profileTab === 'company' ? 'Años trayectoria' : 'Años de exp.'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={profile.experienceYears}
                    onChange={(e) => updateActiveProfile({ experienceYears: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Tarifa ref (USD/h)</label>
                  <input
                    type="number"
                    min={0}
                    value={profile.hourlyRateUsd ?? ''}
                    onChange={(e) =>
                      updateActiveProfile({
                        hourlyRateUsd: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  {profileTab === 'company' ? 'Descripción de la consultora' : 'Resumen profesional'}
                </label>
                <textarea
                  rows={3}
                  value={profile.summary}
                  onChange={(e) => updateActiveProfile({ summary: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Tono de las propuestas</label>
                <input
                  type="text"
                  value={profile.proposalTone}
                  onChange={(e) => updateActiveProfile({ proposalTone: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
                  profileTab === 'company'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {profileTab === 'company' ? 'Guardar perfil de empresa' : 'Guardar perfil candidato'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
