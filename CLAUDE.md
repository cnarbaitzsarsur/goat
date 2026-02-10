# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GOAT is an open-source WebGIS platform for integrated planning, built as a monorepo with a FastAPI/Python backend and React/Next.js/TypeScript frontend. It provides GIS tools, geospatial data management, and accessibility analyses.

## Monorepo Structure

**JavaScript/TypeScript** (managed by pnpm + Turborepo):
- `apps/web` — Next.js 14 frontend (MUI, MapLibre GL, Redux Toolkit, SWR, i18next)
- `apps/docs` — Docusaurus documentation site
- `apps/storybook` — UI component development
- `packages/js/` — Shared configs (eslint, prettier, tsconfig), types, UI components, keycloak-theme

**Python** (managed by uv workspaces, Python 3.11):
- `apps/core` — Main FastAPI backend: user management, projects, folders, scenarios, metadata. Uses SQLAlchemy/SQLModel + PostgreSQL/PostGIS, Alembic migrations, Celery+Redis for background tasks
- `apps/geoapi` — FastAPI service for OGC API Features/Tiles: layer uploads, serving geospatial data, DuckDB/DuckLake storage
- `apps/processes` — FastAPI service for OGC API Processes: async tool execution via Windmill, sync analytics queries, job management
- `apps/routing` — FastAPI routing/navigation service
- `packages/python/goatlib` — Shared library: all analytics tools, analysis algorithms, data I/O, Pydantic models

**Key architectural separation**: Layer metadata lives in PostgreSQL (managed by `core`), layer data lives in DuckLake (managed by `geoapi`). The `processes` service is separated from `geoapi` to prevent long-running analytics jobs from blocking tile/feature requests.

## Common Commands

### Frontend (web)
```bash
pnpm web                          # Dev server on port 3000 (uses dotenv + turbo)
pnpm build --filter=web           # Production build
pnpm lint                         # ESLint across all JS packages
pnpm lint:fix                     # ESLint autofix
pnpm typecheck                    # TypeScript type checking
pnpm format                       # Prettier format all TS/TSX/MD files

# Tests (vitest)
cd apps/web && pnpm test          # Run all tests
cd apps/web && pnpm test:watch    # Watch mode
cd apps/web && npx vitest run path/to/test.ts  # Single test file
```

### Backend (Python)
```bash
# Run individual services with uvicorn:
uv run uvicorn core.main:app --reload --port 8000       # from apps/core
uv run uvicorn geoapi.main:app --reload --port 8100     # from apps/geoapi
uv run uvicorn processes.main:app --reload --port 8300   # from apps/processes
uv run uvicorn routing.main:app --reload --port 8200     # from apps/routing

# Linting
ruff check .                      # Lint Python (rules: F, E, W, N, I, ANN)
ruff format . --check             # Check formatting
ruff format .                     # Format Python
mypy .                            # Type checking (strict mode)
sh scripts/lint-python.sh         # Run all Python linting (mypy + ruff)

# Tests (pytest, async mode auto)
uv run pytest                                     # All tests
uv run pytest apps/core/tests/                    # Tests for one app
uv run pytest apps/core/tests/test_file.py::test_name  # Single test
uv run pytest -m unit                             # Only unit tests
uv run pytest -m integration                      # Only integration tests

# Database migrations (core app)
cd apps/core && uv run alembic upgrade head       # Apply migrations
cd apps/core && uv run alembic revision --autogenerate -m "description"  # Create migration
```

### Infrastructure (Docker)
```bash
docker compose up -d              # Start infra only (PostgreSQL, MinIO, Redis, RabbitMQ, Windmill)
docker compose --profile dev up -d   # Infra + devcontainer
docker compose --profile prod up -d  # Full production stack
```

## Frontend Architecture

- **State management**: Redux Toolkit with slices in `apps/web/lib/store/` (layers, map, jobs, workflow)
- **Data fetching**: SWR with custom fetcher (`apps/web/lib/api/fetcher.ts`), auth via NextAuth
- **API clients**: `apps/web/lib/api/` — one file per domain (datasets, layers, projects, tools, processes, workflows)
- **Custom hooks**: `apps/web/hooks/` organized by feature (map/, dashboard/, workflows/, auth/)
- **i18n**: i18next with `en` and `de` locales in `apps/web/i18n/locales/{en,de}/common.json`
- **Map**: MapLibre GL JS via react-map-gl
- **Workflows**: React Flow (`@xyflow/react`) canvas with custom nodes
- **Validation**: Zod schemas in `apps/web/lib/validations/`
- **Styling**: MUI v5 + Emotion + tss-react

## Backend Architecture

- All four Python services use FastAPI + Pydantic v2 + pydantic-settings for config
- `core` uses SQLAlchemy 2.0 async with asyncpg, SQLModel for models, Alembic for migrations
- `geoapi` and `processes` use DuckDB/DuckLake for geospatial data queries
- Analytics tools are defined in `goatlib/tools/`, inherit from `BaseToolRunner[TParams]`, and run as Windmill jobs
- Auth: Keycloak + python-jose for JWT validation (can be disabled with `AUTH=False`)
- API versioning: core and routing use `/api/v2/` prefix

## Creating Analytics Tools

1. Create tool class in `packages/python/goatlib/src/goatlib/tools/your_tool.py`:
   - Inherit from `BaseToolRunner[YourToolParams]`
   - Define input parameters as Pydantic model extending `ToolInputBase`
   - Implement `process()` method
   - Set `tool_class`, `output_geometry_type`, `default_output_name`
2. Register in `goatlib/tools/registry.py`
3. Sync to Windmill via `goatlib/tools/sync_windmill.py`

## Linting Rules

**Python** (ruff): select F, E, W, N, I, ANN; ignore E501 (line length), ANN401. Per-file: `__init__.py` ignores F401; `alembic/` ignores ANN, F401, I001, W291.

**TypeScript** (ESLint): shared config in `packages/js/eslint-config-p4b/`. Prettier for formatting.

## Environment Setup

Copy `.env.example` to `.env`. Key variables:
- `POSTGRES_SERVER`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — database connection
- `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — object storage (MinIO locally)
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GEOAPI_URL`, `NEXT_PUBLIC_PROCESSES_URL` — frontend API endpoints
- `AUTH=False` / `NEXT_PUBLIC_AUTH_DISABLED=True` — disable auth for local dev
- `WINDMILL_URL`, `WINDMILL_TOKEN` — Windmill workflow engine
- `DATA_DIR` — data directory path (`/app/data` in Docker, local path otherwise)

## Commit Convention

Uses conventional commits (commitlint + commitizen + husky). Format: `type(scope): description`.
