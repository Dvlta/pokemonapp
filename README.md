# Pokemon Finder

A full-stack web application that displays Pokemon as interactive markers on a map of California. Built with React, Django REST Framework, and Django Channels for real-time WebSocket support.

## Features

- **Interactive Map** — Browse Pokemon plotted across California on a Leaflet map with sprite markers, multiple base layers (roads, satellite, topographic), and rich popups showing stats, types, weaknesses, and live energy data
- **Authentication** — Token-based auth with registration, login, and protected routes
- **Pokemon Import** — Fetch 100 Pokemon from PokeAPI with coordinates assigned from GeoJSON polyline data files
- **File Upload** — Upload custom Pokemon via CSV or XLSX with automatic coordinate and type parsing
- **Favorites** — Mark Pokemon as favorites and filter the list
- **Search & Filter** — Search by name/location, filter by source (API vs uploaded) or favorites
- **Real-time Energy** — WebSocket stream delivers energy readings every 3 seconds, calculated from live weather data (OpenWeather API with local fallback)
- **Distance Calculation** — Compute Haversine distance from any Pokemon to UCLA campus
- **Docker Deployment** — Single `docker compose up` with Nginx, Daphne, and PostgreSQL persistence

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Material-UI 5, Leaflet, React Router 6 |
| Backend | Django 5, Django REST Framework, Django Channels, Daphne |
| Database | PostgreSQL 17 |
| Infrastructure | Docker, Docker Compose, Nginx |

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 14+ for local backend development
- (Optional) Docker & Docker Compose

### Local Development

**1. Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — set DJANGO_SECRET_KEY, PostgreSQL credentials,
# and optionally OPENWEATHER_API_KEY

python manage.py migrate
python manage.py import_pokemon          # fetch 100 Pokemon from PokeAPI
daphne -p 8000 pokemon_project.asgi:application
```

The `import_pokemon` command supports these flags:

| Flag | Description |
|------|-------------|
| `--limit N` | Import only N Pokemon |
| `--offset N` | Start at PokeAPI offset |
| `--dry-run` | Parse without saving |
| `--clear-api` | Delete existing API Pokemon first |
| `--timeout N` | HTTP timeout in seconds (default 15) |

Imported Pokemon use `source="api"` and are assigned coordinates from GeoJSON files in `docs/` based on the first letter of the Pokemon name (`A - J` or `K - Z`).

**2. Frontend**

```bash
cd frontend
npm install

cp .env.example .env
# Defaults point to http://127.0.0.1:8000

npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), register an account, and start exploring.

### Docker

```bash
docker compose up --build
```

The app is served at [http://localhost](http://localhost). Nginx proxies `/api/` and `/ws/` to the backend. PostgreSQL data is persisted in a Docker volume.

Seed the database inside Docker:

```bash
docker compose exec backend python manage.py import_pokemon
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DJANGO_SECRET_KEY` | — | Django secret key (required) |
| `DJANGO_DEBUG` | `True` | Debug mode |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Comma-separated allowed hosts |
| `CORS_ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated CORS origins |
| `OPENWEATHER_API_KEY` | — | For live weather in energy stream (optional — falls back to local snapshot) |
| `DATABASE_URL` | — | Managed PostgreSQL connection URL; overrides the `POSTGRES_*` variables |
| `POSTGRES_DB` | `pokemon` | PostgreSQL database name |
| `POSTGRES_USER` | `pokemon` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `pokemon` | PostgreSQL password |
| `POSTGRES_HOST` | `127.0.0.1` | PostgreSQL hostname (`db` in Docker) |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api` | Backend API base URL |
| `VITE_WS_BASE_URL` | `ws://127.0.0.1:8000/ws` | WebSocket base URL |

## API Reference

All Pokemon endpoints require authentication via `Authorization: Token <token>` header.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/accounts/register/` | Register (username, email, password, password_confirm) |
| `POST` | `/api/accounts/login/` | Login (username, password) — returns token |
| `POST` | `/api/accounts/logout/` | Logout — invalidates token |
| `GET` | `/api/accounts/me/` | Current user info |

### Pokemon

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/pokemon/` | List Pokemon (paginated, 25/page) |
| `POST` | `/api/pokemon/` | Create a Pokemon |
| `GET` | `/api/pokemon/{id}/` | Get Pokemon detail |
| `PATCH` | `/api/pokemon/{id}/` | Update Pokemon |
| `DELETE` | `/api/pokemon/{id}/` | Delete Pokemon |
| `POST` | `/api/pokemon/{id}/favorite/` | Favorite a Pokemon |
| `DELETE` | `/api/pokemon/{id}/favorite/` | Unfavorite a Pokemon |
| `GET` | `/api/pokemon/favorites/` | List favorites |
| `POST` | `/api/pokemon/upload/` | Upload CSV/XLSX file |
| `GET` | `/api/health/` | Health check (no auth required) |

**Query parameters for `GET /api/pokemon/`:**

| Parameter | Description |
|-----------|-------------|
| `page` | Page number |
| `search` | Search by name, location, or source |
| `source` | Filter by `api` or `upload` |
| `favorite` | Filter by `true` or `false` |

### WebSocket

```
ws://<host>/ws/pokemon/<pokemon_id>/energy/?token=<token>
```

Sends JSON energy snapshots every 3 seconds:

```json
{
  "energy": 72,
  "weather": {
    "description": "clear sky",
    "temperature_f": 68.5,
    "source": "openweather"
  }
}
```

## File Upload Format

Upload CSV or XLSX files with these columns:

| Column | Required | Description |
|--------|----------|-------------|
| Pokemon | Yes | Pokemon name |
| Lat | Yes | Latitude |
| Long | Yes | Longitude |
| Type | Yes | Comma-separated types |
| Location | Yes | Location name |
| Latest Moves | Yes | Comma-separated moves |
| Sprite | Yes | Sprite image URL |
| Description | No | Pokedex description |
| Category | No | Pokemon category |
| Abilities | No | Comma-separated abilities |
| Height Decimeters | No | Height in decimeters |
| Weight Hectograms | No | Weight in hectograms |

A sample file is provided at `docs/Pokemon Upload.xlsx`.

## Project Structure

```
pokemonapp/
├── backend/
│   ├── pokemon_project/     # Django settings, URLs, ASGI config
│   ├── pokemon/             # Models, views, serializers, WebSocket consumer
│   ├── accounts/            # Auth views (register, login, logout)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/           # LoginPage, RegisterPage, DashboardPage
│   │   ├── components/      # PokemonMap
│   │   ├── api.js           # Axios API client
│   │   ├── auth.jsx         # Auth context provider
│   │   └── routes.jsx       # Protected route wrapper
│   ├── package.json
│   ├── nginx.conf
│   ├── Dockerfile
│   └── .env.example
├── docs/                    # GeoJSON coordinate files, sample upload, spec PDF
└── docker-compose.yml
```
