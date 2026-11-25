# JobPilot · AI Career Copilot

Plataforma fullstack (Node.js/Express + TypeScript + Supabase + OpenAI + React/Vite/Tailwind) para automatizar el flujo de búsqueda y preparación de postulaciones con revisión humana:

1. **Descubrir ofertas**: tableros públicos de Greenhouse y Lever + búsquedas booleanas e importación manual de LinkedIn.
2. **Analizar compatibilidad con OpenAI**: compara cada oferta contra tu `candidate_profile` y genera score, resumen, fortalezas y brechas.
3. **Guardar en Supabase**: persiste `jobs`, `candidate_profiles` y `applications` en PostgreSQL (con migración opcional desde `data/jobs.json`).
4. **Generar propuesta personalizada**: redacta propuestas freelance, cartas de presentación, mensajes directos de LinkedIn o emails listos para revisar.
5. **Gestionar desde el Dashboard**: visualizar métricas, filtrar oportunidades, editar propuestas, copiarlas y actualizar el estado de cada postulación.

## Estructura del proyecto

```text
jobpilot/
├── backend/
│   ├── supabase/
│   │   └── schema.sql
│   └── src/
│       ├── config/
│       │   └── supabase.ts
│       ├── services/
│       │   ├── jobScanner.ts
│       │   ├── linkedinSearch.ts
│       │   ├── aiAnalyzer.ts
│       │   └── applicationGenerator.ts
│       ├── routes/
│       │   ├── jobs.ts
│       │   └── applications.ts
│       └── index.ts
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── Jobs.tsx
        │   └── Applications.tsx
        └── components/
            ├── JobCard.tsx
            └── JobFilters.tsx
```

## Paso 1: Crear las tablas en Supabase

Abrí **Supabase Dashboard → SQL Editor → New Query**, pegá el contenido de [`backend/supabase/schema.sql`](backend/supabase/schema.sql) y ejecutalo. Esto crea:

- `public.candidate_profiles` (con un perfil inicial editable desde el Dashboard)
- `public.jobs` (con soporte para scoring heurístico y análisis de OpenAI)
- `public.applications` (propuestas personalizadas vinculadas a cada oferta)

> También podés ver y copiar el SQL directamente desde el banner inicial del Dashboard en el frontend.

## Paso 2: Configurar variables de entorno

Verificá tu `.env` en la raíz (o en `backend/.env`):

```env
PORT=3001
GREENHOUSE_BOARDS=empresa1,empresa2
LEVER_BOARDS=empresa3
DATA_FILE=./data/jobs.json

SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

## Paso 3: Ejecutar Backend y Frontend

```bash
# Instalar dependencias (si aún no están)
bun run install:all

# Terminal 1: Backend (http://localhost:3001)
bun run dev:backend

# Terminal 2: Frontend (http://localhost:5173)
bun run dev:frontend
```

## Endpoints principales (disponibles en `/` y `/api`)

- `GET /health` · estado del backend, tablas de Supabase y OpenAI
- `GET /setup/schema` · devuelve `backend/supabase/schema.sql`
- `GET /linkedin/queries` · consultas booleanas de LinkedIn
- `POST /linkedin/import` · importa publicación de LinkedIn (opcional: `autoAnalyze`, `autoGenerateProposal`)
- `POST /scan` · escanea tableros configurados de Greenhouse y Lever
- `POST /jobs/sync-local` · migra las ofertas de `data/jobs.json` a Supabase
- `GET /jobs` · lista filtrable (`source`, `kind`, `status`, `minScore`, `search`, `analyzedOnly`)
- `PATCH /jobs/:id/status` · actualiza estado (`new`, `saved`, `prepared`, `applied`, `discarded`)
- `POST /jobs/:id/analyze` · analiza compatibilidad con OpenAI y guarda en Supabase
- `POST /jobs/:id/run-flow` · ejecuta el flujo completo (IA + guardar + generar propuesta)
- `GET /profile` / `PUT /profile` · lee o actualiza el perfil del candidato
- `GET /applications` · lista propuestas generadas
- `POST /applications/generate` · genera y guarda una propuesta personalizada
- `PATCH /applications/:id` / `DELETE /applications/:id` · edita o elimina una propuesta
