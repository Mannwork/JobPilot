import { ArrowUpDown, CalendarClock, Filter, Globe2, RotateCcw, Search, Sparkles } from 'lucide-react';
import type { JobFilterState, JobKind, JobSortBy, JobSource, JobStatus, LanguageCode } from '../types';

interface JobFiltersProps {
  filters: JobFilterState;
  onChange: (next: JobFilterState) => void;
  totalCount: number;
  filteredCount: number;
}

export const INITIAL_JOB_FILTERS: JobFilterState = {
  search: '',
  source: '',
  kind: '',
  status: '',
  language: '',
  minScore: 0,
  maxAgeDays: 0,
  sortBy: 'recent',
  analyzedOnly: false,
};

export function JobFilters({ filters, onChange, totalCount, filteredCount }: JobFiltersProps) {
  const hasActiveFilters =
    Boolean(filters.search.trim()) ||
    Boolean(filters.source) ||
    Boolean(filters.kind) ||
    Boolean(filters.status) ||
    Boolean(filters.language) ||
    filters.minScore > 0 ||
    filters.maxAgeDays > 0 ||
    filters.analyzedOnly;

  const update = <K extends keyof JobFilterState>(key: K, value: JobFilterState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      {/* Row 1: Search + Sort + Recency */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
            placeholder="Buscar por puesto, empresa o tecnología (ej: React, freelance, remoto, MVP)..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-center">
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-indigo-500" />
            <select
              aria-label="Ordenar ofertas"
              value={filters.sortBy}
              onChange={(e) => update('sortBy', e.target.value as JobSortBy)}
              className="w-full rounded-xl border border-indigo-200 bg-indigo-50/60 py-2.5 pr-3 pl-8 text-xs font-semibold text-indigo-900 focus:border-indigo-500 focus:outline-none"
            >
              <option value="recent">Más recientes primero</option>
              <option value="score">Mayor compatibilidad</option>
            </select>
          </div>

          <div className="relative">
            <CalendarClock className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              aria-label="Filtrar por antigüedad"
              value={filters.maxAgeDays}
              onChange={(e) => update('maxAgeDays', Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3 pl-8 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value={0}>Cualquier fecha</option>
              <option value={1}>Últimas 24 horas</option>
              <option value={3}>Últimos 3 días</option>
              <option value={7}>Última semana</option>
              <option value={30}>Último mes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Row 2: Source, Kind, Language, Status */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <select
          aria-label="Filtrar por fuente"
          value={filters.source}
          onChange={(e) => update('source', e.target.value as '' | JobSource)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Todas las fuentes</option>
          <option value="freelancer">Freelancer.com (Freelance)</option>
          <option value="getonbrd">Get on Board (LATAM/ES)</option>
          <option value="workana">Workana (ES)</option>
          <option value="computrabajo">Computrabajo (ES)</option>
          <option value="linkedin">LinkedIn</option>
          <option value="remotive">Remotive</option>
          <option value="jobicy">Jobicy</option>
          <option value="greenhouse">Greenhouse</option>
          <option value="lever">Lever</option>
          <option value="other">Otros portales</option>
        </select>

        <select
          aria-label="Filtrar por modalidad"
          value={filters.kind}
          onChange={(e) => update('kind', e.target.value as '' | JobKind)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Todas las modalidades</option>
          <option value="freelance">Freelance / Proyecto</option>
          <option value="employment">Empleo / Full-time</option>
        </select>

        <div className="relative">
          <Globe2 className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <select
            aria-label="Filtrar por idioma"
            value={filters.language}
            onChange={(e) => update('language', e.target.value as '' | LanguageCode)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todos los idiomas</option>
            <option value="es">Español (ES)</option>
            <option value="en">Inglés (EN)</option>
          </select>
        </div>

        <select
          aria-label="Filtrar por estado"
          value={filters.status}
          onChange={(e) => update('status', e.target.value as '' | JobStatus)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Todos los estados</option>
          <option value="new">Nueva</option>
          <option value="saved">Guardada</option>
          <option value="prepared">Propuesta lista</option>
          <option value="applied">Postulada</option>
          <option value="discarded">Descartada</option>
        </select>
      </div>

      {/* Row 3: Score slider + AI toggle + counter */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2.5 text-xs font-medium text-slate-600">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span>Score mínimo:</span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={filters.minScore}
              onChange={(e) => update('minScore', Number(e.target.value))}
              className="h-1.5 w-28 cursor-pointer accent-indigo-600"
            />
            <span className="inline-flex min-w-10 justify-center rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-800">
              {filters.minScore}%
            </span>
          </label>

          <button
            type="button"
            onClick={() => update('analyzedOnly', !filters.analyzedOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              filters.analyzedOnly
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Solo analizadas con IA
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            Mostrando <strong className="text-slate-800">{filteredCount}</strong> de{' '}
            <strong className="text-slate-800">{totalCount}</strong> ofertas
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => onChange(INITIAL_JOB_FILTERS)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-indigo-600 hover:bg-indigo-50"
            >
              <RotateCcw className="h-3 w-3" />
              Limpiar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
