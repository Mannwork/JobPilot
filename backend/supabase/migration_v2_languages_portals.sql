-- ============================================================================
-- JobPilot · Migración v2 (Idioma ES/EN, fechas, nuevos portales y perfil Empresa Mannwork)
-- Ejecutar en Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Soporte de perfiles Individual y Empresa (Mannwork Inc.)
alter table public.candidate_profiles add column if not exists profile_type text not null default 'individual';
alter table public.candidate_profiles add column if not exists company_name text;
alter table public.candidate_profiles add column if not exists company_website text;
alter table public.candidate_profiles drop constraint if exists candidate_profiles_type_check;
alter table public.candidate_profiles add constraint candidate_profiles_type_check check (profile_type in ('individual', 'company'));

-- 2. Idioma ES/EN, fecha de publicación y nuevos portales en jobs
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

-- 3. Idioma ES/EN y tipo de remitente (Candidato vs Empresa) en applications
alter table public.applications add column if not exists language text not null default 'es';
alter table public.applications add column if not exists sender_type text not null default 'individual';
alter table public.applications drop constraint if exists applications_language_check;
alter table public.applications add constraint applications_language_check check (language in ('es', 'en'));
alter table public.applications drop constraint if exists applications_sender_type_check;
alter table public.applications add constraint applications_sender_type_check check (sender_type in ('individual', 'company'));

-- 4. Índices
create index if not exists idx_profiles_type on public.candidate_profiles (profile_type);
create index if not exists idx_jobs_language on public.jobs (language);
create index if not exists idx_jobs_published_at on public.jobs (published_at desc nulls last);
create index if not exists idx_applications_language on public.applications (language);
create index if not exists idx_applications_sender_type on public.applications (sender_type);

-- 5. Perfil inicial de Empresa: Mannwork Inc.
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
