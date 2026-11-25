import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Database,
  FileText,
  Info,
  LayoutDashboard,
  Loader2,
  Menu,
  Rocket,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from './lib/api';
import { Applications } from './pages/Applications';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import type { Application, Job, SystemHealth } from './types';

type ActivePage = 'dashboard' | 'jobs' | 'applications';

interface ToastMessage {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function App() {
  const [page, setPage] = useState<ActivePage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendOffline, setBackendOffline] = useState(false);

  const [useFallbackAi, setUseFallbackAi] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((kind: ToastMessage['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [h, j, a] = await Promise.all([
        api.getHealth(),
        api.listJobs(),
        api.listApplications(),
      ]);
      setHealth(h);
      setJobs(j);
      setApplications(a);
      setBackendOffline(false);
    } catch {
      setBackendOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const navItems: Array<{
    id: ActivePage;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'jobs', label: 'Ofertas', icon: Briefcase, badge: jobs.length },
    { id: 'applications', label: 'Propuestas', icon: FileText, badge: applications.length },
  ];

  const handleSelectPage = (next: ActivePage) => {
    setPage(next);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-slate-950 text-slate-200 lg:flex">
        <div className="p-5">
          {/* Brand */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight text-white">JobPilot</span>
              <span className="block text-[11px] font-medium text-slate-400">AI Career Copilot</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPage(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {typeof item.badge === 'number' && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        active ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom system status */}
        <div className="border-t border-slate-800 p-4 text-xs">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Estado del sistema
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-400">
                <Database className="h-3.5 w-3.5" />
                Supabase
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  health?.supabaseReady
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {health?.supabaseReady ? 'Conectado' : 'Falta SQL'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-400">
                <Sparkles className="h-3.5 w-3.5" />
                OpenAI
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  health?.openaiConfigured
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : useFallbackAi
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {health?.openaiConfigured ? health.openaiModel : useFallbackAi ? 'Modo local' : 'Sin API key'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Rocket className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-slate-900">JobPilot</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-slate-950 p-3 lg:hidden">
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPage(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                      active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {typeof item.badge === 'number' && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Page body */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {backendOffline && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
                <span>
                  No se pudo conectar con el backend en <code className="rounded bg-rose-100 px-1">http://localhost:3001</code>.
                  Asegurate de ejecutar <code className="rounded bg-rose-100 px-1">bun run dev:backend</code>.
                </span>
              </div>
              <button
                type="button"
                onClick={refreshAll}
                className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Reintentar
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-sm font-medium">Cargando JobPilot...</p>
            </div>
          ) : (
            <>
              {page === 'dashboard' && (
                <Dashboard
                  health={health}
                  jobs={jobs}
                  applications={applications}
                  useFallbackAi={useFallbackAi}
                  onToggleFallbackAi={setUseFallbackAi}
                  onRefreshAll={refreshAll}
                  onNavigate={setPage}
                  onNotify={notify}
                />
              )}
              {page === 'jobs' && (
                <Jobs
                  jobs={jobs}
                  useFallbackAi={useFallbackAi}
                  onJobsChanged={refreshAll}
                  onOpenApplications={() => setPage('applications')}
                  onNotify={notify}
                />
              )}
              {page === 'applications' && (
                <Applications
                  applications={applications}
                  useFallbackAi={useFallbackAi}
                  onApplicationsChanged={refreshAll}
                  onNavigateJobs={() => setPage('jobs')}
                  onNotify={notify}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast Stack */}
      <div className="fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs font-medium shadow-lg ${
              toast.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : toast.kind === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-950'
                  : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : toast.kind === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            )}
            <span className="flex-1 leading-relaxed">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
