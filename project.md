# Kintoppix — Project Documentation

## What is this?

A JustWatch-style visual movie browser for free content available on European public broadcaster archives (mediathekviewweb). Users can browse movie posters, ratings, genres and play videos directly — no subscription, no login.

## Architecture

### Files

| File | Purpose |
|------|---------|
| `build.js` | Node build script — reads JSON sources, fetches TMDB, writes `content.js` |
| `index.html` | Static shell — loads `content.js`, renders grid, all UI logic inline |
| `content.js` | **Generated, gitignored** — `window.MOVIES` array, cache-busted via `?v=TIMESTAMP` |
| `update.sh` | Fetches fresh JSON snapshots from mediathekviewweb API for all sources |
| `clean-srf.js` | Post-processes `srf.json` — keeps only topic "Film" or "Schweizer Film" |
| `cache/` | **Gitignored** — one JSON file per movie (keyed by mediathekview `id`) |
| `.github/workflows/daily-rebuild.yml` | GitHub Actions daily rebuild + GitHub Pages deploy |

### Data sources (mediathekviewweb API)

| File | Channel | Topic filter | Language |
|------|---------|-------------|---------|
| `arte_fr.json` | ARTE.FR | Films | fr-FR |
| `arte_de.json` | ARTE.DE | Filme | de-DE |
| `3sat.json` | 3sat | Spielfilm | de-DE |
| `ard.json` | ARD | Filme in der | de-DE |
| `srf.json` | SRF | Film | de-DE |

### Build pipeline

1. `update.sh` — curl each mediathekviewweb API endpoint → saves JSON files
2. `clean-srf.js` — filters SRF entries to Film/Schweizer Film topics only
3. `build.js`:
   - Loads all JSON sources, tags each entry with `lang` and `source`
   - Filters: removes `(Audiodeskription)` titles and entries < 30 min duration
   - Deduplicates by `url_website`
   - Title cleaning: strips `«XXX»` guillemets (SRF), `(mit Untertitel)`, `- Spielfilm...` etc.
   - Fetches TMDB genre list once in English (`en-US`)
   - For each movie: checks `cache/{id}.json` (version-checked), fetches TMDB if miss
   - TMDB matching: accent-stripped query, `fr-FR`/`de-DE` language, description similarity scoring, French/German article → "The" fallback
   - SRF cache entries additionally store full `_raw` TMDB payload + `genre_names`
   - Writes `content.js` and stamps `?v=TIMESTAMP` in `index.html`
   - Prunes stale cache entries (IDs no longer in current dataset)

### TMDB cache

- Location: `cache/` (gitignored locally, persisted via `actions/cache` in CI)
- Cache version: `CACHE_VERSION = 4` — bump to invalidate all entries
- Cache key per entry: `movie.id` with non-alphanumeric chars replaced by `_`
- Null entries (no TMDB match) are cached too but re-attempted on next run
- SRF entries include `_raw` field with full TMDB hit + `genre_names`

### movie record fields (in `content.js`)

```js
{
  title,        // HTML-escaped display title
  searchTitle,  // accent-stripped lowercase for search filtering
  href,         // direct video URL (url_video_hd > url_video > url_video_low > url_website)
  infoHref,     // broadcaster page (url_website) — opened by ⓘ button
  hasDirectVideo, // bool — true if href is a direct stream (not url_website)
  channel,      // e.g. "ARTE.FR", "SRF 1"
  source,       // e.g. "arte.fr", "srf"
  poster,       // TMDB poster URL (w342) or null
  rating,       // TMDB vote_average as string e.g. "7.4", or "0"
  lowConfidence,// bool — true if voteCount < 50 (rating displayed dimmed)
  popularity,   // TMDB popularity float
  voteCount,    // TMDB vote count
  year,         // release year string e.g. "2023" or null
  genres,       // array of English genre names e.g. ["Drama", "Thriller"]
  duration,     // formatted as "h:mm" from mediathekview duration (seconds) or null
}
```

## UI features (`index.html`)

- **Grid**: CSS `auto-fill minmax(160px)` responsive poster grid
- **Sort**: dropdown — Popularity (default) or Rating (re-orders DOM in place)
- **Search**: real-time accent-insensitive title filter
- **Genre filter**: multiselect dropdown, built dynamically from `MOVIES` data
- **Source filter**: multiselect dropdown — arte.fr, arte.de, 3sat, ard, srf
- **VideoJS player**: modal overlay using `cdn.jsdelivr.net/npm/video.js` — opens on card click if `hasDirectVideo`; SRF and no-video cards open `href` in new tab
- **ⓘ button**: appears on poster hover, opens `infoHref` (broadcaster page) in new tab
- **Dimmed ratings**: `.rating.dim` CSS class applied when `lowConfidence === true`
- **Year**: shown in card-meta row
- **Duration**: shown as `h:mm` in card-meta row
- **Genre tags**: shown below card-meta

## Development

```bash
# Fetch fresh data
bash update.sh

# Full build
node build.js

# Test build (3 movies per source = 15 total)
node build.js --test
```

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/daily-rebuild.yml`

- Runs daily at 05:00 UTC + manual `workflow_dispatch`
- Restores `cache/` via `actions/cache/restore` (key: `tmdb-cache-*`)
- Runs `update.sh` then `node build.js`
- Saves updated `cache/` via `actions/cache/save` (key: `tmdb-cache-{run_id}`)
- Force-adds `content.js` + `index.html` and commits if changed
- GitHub Pages serves from `main` branch root

## TODO / Known issues

- **TMDB API key** is hardcoded in `build.js` — should be moved to GitHub secret `TMDB_API_KEY` and read via `process.env.TMDB_API_KEY || 'fallback'`
- **Expired video tokens**: ARTE/ARD video URLs contain time-limited CDN tokens — links may expire within hours of snapshot. VideoJS will fail silently; ⓘ button fallback available
- **SRF video playback**: direct video links restored (previously used url_website); needs real-world validation
- **TMDB mismatches**: some movies not found or matched incorrectly (e.g. foreign-language titles with no TMDB entry)
- **Product brief**: partially created at `_bmad-output/planning-artifacts/product-brief-MWJW-2026-03-14.md` (steps 1-2 completed)
