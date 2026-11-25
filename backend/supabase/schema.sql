-- ============================================================================
-- JobPilot · Supabase Database Schema (Idempotente / Seguro para re-ejecutar)
-- Tablas: candidate_profiles (individual + empresa), jobs, applications
-- Ejecutar este script en Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. candidate_profiles: Perfil individual y perfil de empresa (Mannwork Inc.)
-- ----------------------------------------------------------------------------
create table if not exists public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_type text not null default 'individual' check (profile_type in ('individual', 'company')),
  full_name text not null,
  company_name text,
  company_website text,
  headline text not null default '',
  summary text not null default '',
  skills text[] not null default '{}',
  experience_years integer not null default 0 check (experience_years >= 0),
  preferred_roles text[] not null default '{}',
  preferred_kinds text[] not null default '{freelance,employment}',
  remote_only boolean not null default true,
  hourly_rate_usd integer check (hourly_rate_usd is null or hourly_rate_usd >= 0),
  portfolio_url text,
  github_url text,
  linkedin_url text,
  languages text[] not null default '{Español,Inglés}',
  proposal_tone text not null default 'profesional, cercano y orientado a resultados',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_profiles add column if not exists profile_type text not null default 'individual';
alter table public.candidate_profiles add column if not exists company_name text;
alter table public.candidate_profiles add column if not exists company_website text;
alter table public.candidate_profiles drop constraint if exists candidate_profiles_type_check;
alter table public.candidate_profiles add constraint candidate_profiles_type_check check (profile_type in ('individual', 'company'));

-- ----------------------------------------------------------------------------
-- 2. jobs: Ofertas descubiertas (Greenhouse, Lever, Get on Board, Freelancer,
--          Remotive, Jobicy, LinkedIn, Workana, Computrabajo, etc.)
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id text primary key,
  source text not null,
  company text,
  title text not null,
  description text not null,
  url text not null unique,
  kind text not null check (kind in ('freelance', 'employment')),
  language text not null default 'en' check (language in ('es', 'en')),
  score integer not null default 0 check (score >= 0 and score <= 100),
  matched_terms text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'saved', 'prepared', 'applied', 'discarded')),
  ai_score integer check (ai_score is null or (ai_score >= 0 and ai_score <= 100)),
  ai_summary text,
  ai_fit_reasons text[] not null default '{}',
  ai_gaps text[] not null default '{}',
  ai_recommended boolean,
  ai_model text,
  ai_analyzed_at timestamptz,
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jobs add column if not exists language text not null default 'en';
alter table public.jobs add column if not exists published_at timestamptz;
alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs add constraint jobs_source_check check (
  source in (
    'linkedin',
    'greenhouse',
    'lever',
    'getonbrd',
    'freelancer',
    'remotive',
    'jobicy',
    'workana',
    'computrabajo',
    'other'
  )
);
alter table public.jobs drop constraint if exists jobs_language_check;
alter table public.jobs add constraint jobs_language_check check (language in ('es', 'en'));

-- ----------------------------------------------------------------------------
-- 3. applications: Propuestas personalizadas (Candidato o Empresa · ES o EN)
-- ----------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  profile_id uuid references public.candidate_profiles(id) on delete set null,
  sender_type text not null default 'individual' check (sender_type in ('individual', 'company')),
  channel text not null default 'proposal' check (channel in ('proposal', 'cover_letter', 'linkedin_dm', 'email')),
  language text not null default 'es' check (language in ('es', 'en')),
  subject text,
  proposal_text text not null,
  highlights text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'sent', 'interview', 'rejected', 'accepted')),
  ai_model text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications add column if not exists language text not null default 'es';
alter table public.applications add column if not exists sender_type text not null default 'individual';
alter table public.applications drop constraint if exists applications_language_check;
alter table public.applications add constraint applications_language_check check (language in ('es', 'en'));
alter table public.applications drop constraint if exists applications_sender_type_check;
alter table public.applications add constraint applications_sender_type_check check (sender_type in ('individual', 'company'));

-- ----------------------------------------------------------------------------
-- Índices recomendados
-- ----------------------------------------------------------------------------
create index if not exists idx_profiles_type on public.candidate_profiles (profile_type);
create index if not exists idx_jobs_source on public.jobs (source);
create index if not exists idx_jobs_kind on public.jobs (kind);
create index if not exists idx_jobs_language on public.jobs (language);
create index if not exists idx_jobs_status on public.jobs (status);
create index if not exists idx_jobs_score on public.jobs (score desc);
create index if not exists idx_jobs_ai_score on public.jobs (ai_score desc nulls last);
create index if not exists idx_jobs_published_at on public.jobs (published_at desc nulls last);
create index if not exists idx_jobs_discovered_at on public.jobs (discovered_at desc);

create index if not exists idx_applications_job_id on public.applications (job_id);
create index if not exists idx_applications_status on public.applications (status);
create index if not exists idx_applications_language on public.applications (language);
create index if not exists idx_applications_sender_type on public.applications (sender_type);
create index if not exists idx_applications_created_at on public.applications (created_at desc);

-- ----------------------------------------------------------------------------
-- Trigger automático para mantener updated_at actualizado
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_candidate_profiles_updated_at on public.candidate_profiles;
create trigger trg_candidate_profiles_updated_at
  before update on public.candidate_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_applications_updated_at on public.applications;
create trigger trg_applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Perfiles iniciales: Candidato Individual + Empresa (Mannwork Inc.)
-- ----------------------------------------------------------------------------
insert into public.candidate_profiles (
  profile_type,
  full_name,
  headline,
  summary,
  skills,
  experience_years,
  preferred_roles,
  preferred_kinds,
  remote_only,
  languages,
  proposal_tone,
  is_default
)
select
  'individual',
  'Desarrollador Fullstack',
  'Fullstack & Mobile Developer · React, React Native, TypeScript, Node.js, Supabase',
  'Desarrollador enfocado en construir productos web y móviles escalables con React, React Native, TypeScript, Node.js, Express y PostgreSQL/Supabase. Experiencia en proyectos freelance y equipos remotos entregando MVPs rápidos y código mantenible.',
  array['React', 'React Native', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'Supabase', 'PostgreSQL', 'Expo', 'Tailwind CSS', 'REST APIs'],
  3,
  array['Fullstack Developer', 'Frontend Developer', 'React Native Developer', 'Freelance Developer'],
  array['freelance', 'employment'],
  true,
  array['Español', 'Inglés'],
  'profesional, cercano y orientado a resultados',
  true
where not exists (select 1 from public.candidate_profiles where profile_type = 'individual');

insert into public.candidate_profiles (
  profile_type,
  full_name,
  company_name,
  company_website,
  headline,
  summary,
  skills,
  experience_years,
  preferred_roles,
  preferred_kinds,
  remote_only,
  portfolio_url,
  languages,
  proposal_tone,
  is_default
)
select
  'company',
  'Lautaro · Mannwork Inc.',
  'Mannwork Inc.',
  'https://www.mannwork.com/',
  'Mannwork Inc. — Consultora de Software · Desarrollo Web, Mobile, SaaS e IA a medida',
  'En Mannwork Inc. somos una consultora de software especializada en diseñar, desarrollar y escalar productos digitales a medida: plataformas web, aplicaciones móviles (React Native / Expo), arquitecturas backend con Node.js, TypeScript y PostgreSQL/Supabase, e integraciones con Inteligencia Artificial. Acompañamos a clientes y empresas desde el descubrimiento y MVP hasta producción con metodología ágil y entregas continuas.',
  array['React', 'React Native', 'TypeScript', 'Node.js', 'Next.js', 'Supabase', 'PostgreSQL', 'Expo', 'OpenAI / IA', 'APIs REST', 'SaaS', 'MVP Development'],
  5,
  array['Consultora de Software', 'Desarrollo de MVP', 'Equipo Dedicado Fullstack', 'Desarrollo Web y Mobile'],
  array['freelance'],
  true,
  'https://www.mannwork.com/',
  array['Español', 'Inglés'],
  'consultivo, ejecutivo, cercano y enfocado en resultados de negocio',
  false
where not exists (select 1 from public.candidate_profiles where profile_type = 'company');
