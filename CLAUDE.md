# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Build to /build directory
npm run preview      # Preview production build (localhost:4173)
npm run check        # TypeScript type checking
npm run check:watch  # Type checking in watch mode
npm run test         # Run Vitest in watch mode
npm run test:unit    # Run unit tests once
npm run test:e2e     # Run Playwright E2E tests (requires preview server)
npm run lint         # ESLint + Prettier check
npm run format       # Auto-format with Prettier
```

## Technology Stack

- **SvelteKit 2.0** with Svelte 5 reactivity (`$state`, `$derived`, `$effect` runes)
- **TypeScript** (strict mode enabled)
- **Tailwind CSS** with custom dark theme
- **Vitest** (unit) + **Playwright** (E2E) for testing
- **Static adapter** - deploys as pure static site to GitHub Pages

## Project Architecture

### Core Directories (`src/lib/`)

- **`analysis/`** - Pattern correlation, narrative tracking, main character detection across news items
- **`api/`** - Data fetching from GDELT, RSS feeds (30+ sources), market APIs, CoinGecko
- **`components/`** - Svelte components organized into layout/, panels/, modals/, common/
- **`config/`** - Centralized configuration for feeds, keywords, analysis patterns, panels, map hotspots
- **`services/`** - Resilience layer: CacheManager, CircuitBreaker, RequestDeduplicator, ServiceClient
- **`stores/`** - Svelte stores for settings, news, markets, monitors, refresh orchestration
- **`types/`** - TypeScript interfaces

### Path Aliases

```typescript
$lib        → src/lib
$components → src/lib/components
$stores     → src/lib/stores
$services   → src/lib/services
$config     → src/lib/config
$types      → src/lib/types
```

## Key Architectural Patterns

### Server-Side Architecture (NEW)
The app now uses `@sveltejs/adapter-node` for server-side capabilities:

**Server API Routes (`src/routes/api/`):**
- `/api/news` - Server-side news aggregation from 15+ RSS sources
- `/api/markets` - Market data with caching (crypto, commodities, indices)
- `/api/data` - Government contracts, layoffs, predictions, whale transactions
- `/api/ai` - AI-powered headline analysis using Mistral-8B via OpenRouter

**Background Services (`src/lib/server/`):**
- `news-store.ts` - In-memory news cache persists between requests
- `news-scraper.ts` - Continuous RSS scraping (runs even without visitors)
- Hooks (`src/hooks.server.ts`) - Initializes background scraping on server start

### Service Layer (`src/lib/services/`)
All HTTP requests go through `ServiceClient` which integrates:
- **CacheManager**: Per-service caching with TTL
- **CircuitBreaker**: Prevents cascading failures
- **RequestDeduplicator**: Prevents concurrent duplicate requests

### Multi-Stage Refresh (`src/lib/stores/refresh.ts`)
Data fetches happen in 3 stages with staggered delays:
1. Critical (0ms): News, markets, alerts
2. Secondary (2s): Crypto, commodities, intel
3. Tertiary (4s): Contracts, whales, layoffs, polymarket

### Analysis Engine (`src/lib/analysis/`)
Unique business logic for intelligence analysis:
- Correlation detection across disparate news items
- Narrative tracking (fringe → mainstream progression)
- Entity prominence calculation ("main character" analysis)
- All use configurable regex patterns from `src/lib/config/analysis.ts`

### Configuration-Driven Design (`src/lib/config/`)
- `feeds.ts`: 30+ RSS sources across 6 categories (politics, tech, finance, gov, ai, intel)
- `keywords.ts`: Alert keywords, region detection, topic detection
- `analysis.ts`: Correlation topics and narrative patterns with severity levels
- `panels.ts`: Panel registry with display order
- `map.ts`: Geopolitical hotspots, conflict zones, strategic locations

## Testing

**Unit tests**: Located alongside source as `*.test.ts` or `*.spec.ts`
**E2E tests**: In `tests/e2e/*.spec.ts`, run against preview server

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Refresh all data |
| `S` | Open settings modal |
| `N` | Toggle AI notifications |
| `C` | Toggle compact mode |
| `V` | Toggle panel visibility dropdown |
| `X` | Collapse/expand all panels |
| `Esc` | Close modals and dropdowns |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for AI-powered headline analysis
OPENROUTER_API_KEY=sk-or-v1-...

# Optional: Configure refresh interval (default: 5 minutes)
NEWS_REFRESH_INTERVAL=300000

# Optional: Enable/disable background scraping
ENABLE_BACKGROUND_SCRAPING=true
```

## Running the Server

```bash
npm install                    # Install dependencies
npm run build                  # Build the application
npm start                      # Start production server (runs on :3000)
```

For development:
```bash
npm run dev                    # Start dev server with hot reload
```

## Accessibility

- Skip to main content link
- ARIA labels and roles throughout
- Focus trapping in modals
- Keyboard navigation support
- Reduced motion support (`prefers-reduced-motion`)
- High contrast mode support (`prefers-contrast: high`)

## Deployment

The app now requires a Node.js server (not static hosting):

**Local/VPS:**
```bash
npm run build && node build
```

**Docker:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY build ./build
EXPOSE 3000
CMD ["node", "build"]
```

**Environment Variables for Production:**
- Set `OPENROUTER_API_KEY` for AI features
- Set `ENABLE_BACKGROUND_SCRAPING=true` for continuous updates

## External Dependencies

- **D3.js** for interactive map visualization
- **OpenRouter/Mistral-8B** for AI headline analysis
- **CoinGecko API** for cryptocurrency data
- **USASpending.gov API** for government contracts
- **RSS Feeds**: Reuters, BBC, NYT, Guardian, Al Jazeera, and more
