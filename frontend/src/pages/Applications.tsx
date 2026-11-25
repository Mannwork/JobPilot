import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  Languages,
  Loader2,
  Save,
  Send,
  Sparkles,
  Trash2,
  UserCircle2,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  Application,
  ApplicationChannel,
  ApplicationStatus,
  LanguageCode,
  SenderType,
} from '../types';

interface ApplicationsPageProps {
  applications: Application[];
  useFallbackAi: boolean;
  onApplicationsChanged: () => Promise<void>;
  onNavigateJobs: () => void;
  onNotify: (kind: 'success' | 'error' | 'info', message: string) => void;
}

const STATUS_META: Record<ApplicationStatus, { label: string; classes: string }> = {
  draft: { label: 'Borrador', classes: 'bg-slate-100 text-slate-700' },
  reviewed: { label: 'Revisada', classes: 'bg-indigo-50 text-indigo-700' },
  sent: { label: 'Enviada', classes: 'bg-sky-50 text-sky-700' },
  interview: { label: 'Entrevista', classes: 'bg-violet-50 text-violet-700' },
  accepted: { label: 'Aceptada', classes: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rechazada', classes: 'bg-rose-50 text-rose-700' },
};

const CHANNEL_LABEL: Record<ApplicationChannel, string> = {
  proposal: 'Propuesta',
  cover_letter: 'Carta',
  linkedin_dm: 'LinkedIn DM',
  email: 'Email',
};

export function Applications({
  applications,
  useFallbackAi,
  onApplicationsChanged,
  onNavigateJobs,
  onNotify,
}: ApplicationsPageProps) {
  const [languageTab, setLanguageTab] = useState<'all' | LanguageCode>('all');
  const [senderTab, setSenderTab] = useState<'all' | SenderType>('all');
  const [statusFilter, setStatusFilter] = useState<'' | ApplicationStatus>('');
  const [channelFilter, setChannelFilter] = useState<'' | ApplicationChannel>('');
  const [selectedId, setSelectedId] = useState<string | null>(applications[0]?.id ?? null);

  const [subject, setSubject] = useState('');
  const [proposalText, setProposalText] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('draft');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<'lang' | 'sender' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const esCount = useMemo(() => applications.filter((a) => a.language === 'es').length, [applications]);
  const enCount = useMemo(() => applications.filter((a) => a.language === 'en').length, [applications]);
  const companyCount = useMemo(
    () => applications.filter((a) => a.senderType === 'company').length,
    [applications],
  );
  const individualCount = useMemo(
    () => applications.filter((a) => a.senderType !== 'company').length,
    [applications],
  );

  const filtered = useMemo(
    () =>
      applications.filter((app) => {
        if (languageTab !== 'all' && app.language !== languageTab) return false;
        if (senderTab !== 'all' && (app.senderType || 'individual') !== senderTab) return false;
        if (statusFilter && app.status !== statusFilter) return false;
        if (channelFilter && app.channel !== channelFilter) return false;
        return true;
      }),
    [applications, languageTab, senderTab, statusFilter, channelFilter],
  );

  const selected = useMemo(
    () => filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setSelectedId(selected.id);
      setSubject(selected.subject || '');
      setProposalText(selected.proposalText);
      setNotes(selected.notes || '');
      setStatus(selected.status);
    } else {
      setSelectedId(null);
    }
  }, [selected?.id]);

  const handleSave = async (nextStatus?: ApplicationStatus) => {
    if (!selected) return;
    setSaving(true);
    try {
      const targetStatus = nextStatus ?? status;
      await api.updateApplication(selected.id, {
        subject: subject.trim() || null,
        proposalText,
        notes: notes.trim() || null,
        status: targetStatus,
      });
      setStatus(targetStatus);
      onNotify(
        'success',
        nextStatus === 'sent'
          ? 'Propuesta marcada como enviada y oferta actualizada a "Postulada".'
          : 'Cambios guardados correctamente.',
      );
      await onApplicationsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAlternateLanguage = async () => {
    if (!selected) return;
    const targetLang: LanguageCode = selected.language === 'es' ? 'en' : 'es';
    setRegenerating('lang');
    try {
      const res = await api.generateApplication({
        jobId: selected.jobId,
        channel: selected.channel,
        language: targetLang,
        senderType: selected.senderType || 'individual',
        useFallback: useFallbackAi,
      });
      await onApplicationsChanged();
      setLanguageTab(targetLang);
      setSelectedId(res.application.id);
      onNotify(
        'success',
        `Versión en ${targetLang === 'en' ? 'Inglés' : 'Español'} generada y guardada.`,
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'No se pudo generar la versión en otro idioma');
    } finally {
      setRegenerating(null);
    }
  };

  const handleGenerateAlternateSender = async () => {
    if (!selected) return;
    const targetSender: SenderType = selected.senderType === 'company' ? 'individual' : 'company';
    setRegenerating('sender');
    try {
      const res = await api.generateApplication({
        jobId: selected.jobId,
        channel: targetSender === 'company' ? 'proposal' : selected.channel,
        language: selected.language,
        senderType: targetSender,
        useFallback: useFallbackAi,
      });
      await onApplicationsChanged();
      setSenderTab(targetSender);
      setSelectedId(res.application.id);
      onNotify(
        'success',
        targetSender === 'company'
          ? 'Versión como Empresa (Mannwork Inc.) generada y personalizada.'
          : 'Versión como Candidato individual generada y personalizada.',
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'No se pudo generar la versión alternativa');
    } finally {
      setRegenerating(null);
    }
  };

  const handleCopy = async () => {
    if (!selected) return;
    const textToCopy = subject.trim() ? `Asunto: ${subject.trim()}\n\n${proposalText}` : proposalText;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    onNotify('success', 'Propuesta copiada al portapapeles.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await api.deleteApplication(selected.id);
      onNotify('info', 'Propuesta eliminada.');
      await onApplicationsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al eliminar propuesta');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Propuestas y Postulaciones</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dividí tus propuestas por idioma (Español / Inglés) y por remitente (Candidato / Empresa Mannwork Inc.).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | ApplicationStatus)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todos los estados ({applications.length})</option>
            {(Object.keys(STATUS_META) as ApplicationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por canal"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as '' | ApplicationChannel)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todos los canales</option>
            {(Object.keys(CHANNEL_LABEL) as ApplicationChannel[]).map((ch) => (
              <option key={ch} value={ch}>
                {CHANNEL_LABEL[ch]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter Bar: Language Split + Sender Split (Candidato vs Mannwork) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        {/* Language tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLanguageTab('all')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              languageTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
            Todas ({applications.length})
          </button>

          <button
            type="button"
            onClick={() => setLanguageTab('es')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              languageTab === 'es'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-amber-50 hover:text-amber-800'
            }`}
          >
            <span>🇪🇸</span>
            Español ({esCount})
          </button>

          <button
            type="button"
            onClick={() => setLanguageTab('en')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              languageTab === 'en'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-800'
            }`}
          >
            <span>🇺🇸</span>
            Inglés ({enCount})
          </button>
        </div>

        {/* Sender type tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-3">
          <button
            type="button"
            onClick={() => setSenderTab('all')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              senderTab === 'all'
                ? 'bg-slate-200 text-slate-900'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Todos los perfiles
          </button>
          <button
            type="button"
            onClick={() => setSenderTab('company')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              senderTab === 'company'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Mannwork ({companyCount})
          </button>
          <button
            type="button"
            onClick={() => setSenderTab('individual')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              senderTab === 'individual'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-800'
            }`}
          >
            <UserCircle2 className="h-3.5 w-3.5" />
            Candidato ({individualCount})
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">
            No hay propuestas para este filtro
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Elegí una oferta y generá una propuesta como <strong>Mannwork Inc.</strong> o como{' '}
            <strong>Candidato</strong> en el idioma que prefieras.
          </p>
          <button
            type="button"
            onClick={onNavigateJobs}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Ir a Ofertas
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Left Master List */}
          <div className="space-y-2.5 lg:col-span-4">
            {filtered.map((app) => {
              const isSelected = selected?.id === app.id;
              const badge = STATUS_META[app.status];
              const isCompany = app.senderType === 'company';
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedId(app.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/15'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isCompany
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isCompany ? (
                          <Building2 className="h-2.5 w-2.5" />
                        ) : (
                          <UserCircle2 className="h-2.5 w-2.5" />
                        )}
                        {isCompany ? 'Mannwork' : 'Candidato'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          app.language === 'es'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {app.language === 'es' ? 'ES' : 'EN'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-1 text-sm font-semibold text-slate-900">
                    {app.job?.title || app.subject || 'Propuesta sin título'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {app.job?.company || 'Empresa no especificada'} ·{' '}
                    {new Date(app.createdAt).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">{app.proposalText}</p>
                </button>
              );
            })}
          </div>

          {/* Right Detail Editor */}
          {selected && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        selected.senderType === 'company'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {selected.senderType === 'company' ? (
                        <Building2 className="h-3.5 w-3.5" />
                      ) : (
                        <UserCircle2 className="h-3.5 w-3.5" />
                      )}
                      {selected.senderType === 'company' ? 'Empresa · Mannwork Inc.' : 'Candidato individual'}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        selected.language === 'es'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {selected.language === 'es' ? 'Español (ES)' : 'English (EN)'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {CHANNEL_LABEL[selected.channel]}
                    </span>
                    {selected.aiModel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                        <Sparkles className="h-3 w-3 text-indigo-500" />
                        {selected.aiModel}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-slate-900">
                    {selected.job?.title || 'Propuesta personalizada'}
                  </h2>
                  {selected.job?.company && (
                    <p className="text-sm capitalize text-slate-500">{selected.job.company}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(regenerating)}
                    onClick={handleGenerateAlternateSender}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {regenerating === 'sender' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : selected.senderType === 'company' ? (
                      <UserCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5" />
                    )}
                    {selected.senderType === 'company' ? 'Versión Candidato' : 'Versión Mannwork'}
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(regenerating)}
                    onClick={handleGenerateAlternateLanguage}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {regenerating === 'lang' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Languages className="h-3.5 w-3.5" />
                    )}
                    {selected.language === 'es' ? 'Versión en Inglés' : 'Versión en Español'}
                  </button>

                  {selected.job?.url && (
                    <a
                      href={selected.job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Abrir oferta
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copiada' : 'Copiar texto'}
                  </button>
                </div>
              </div>

              {selected.highlights && selected.highlights.length > 0 && (
                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
                  <p className="text-xs font-semibold text-emerald-900">Puntos destacados incluidos</p>
                  <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {selected.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-800">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700">Asunto</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Estado</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
                    >
                      {(Object.keys(STATUS_META) as ApplicationStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Propuesta personalizada (editable antes de enviar)
                  </label>
                  <textarea
                    rows={12}
                    value={proposalText}
                    onChange={(e) => setProposalText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-3.5 text-sm leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">Notas personales</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contacto del cliente/recruiter, presupuesto enviado, fecha de seguimiento..."
                    className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Eliminar
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Guardar cambios
                  </button>

                  {status !== 'sent' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSave('sent')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Marcar como enviada
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
