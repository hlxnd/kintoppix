const fs = require('fs');
const https = require('https');

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const CACHE_VERSION = 4;
const LOW_VOTE_THRESHOLD = 50;

const VERSION_DETECT = [
  { re: /\(Originalversion mit Untertitel\)/i, label: 'OmU' },
  { re: /\(Audiodeskription\)/i, label: 'AD' },
  { re: /\(mit Untertitel\)/i, label: 'UT' },
  { re: /\(Originalversion\)/i, label: 'OV' },
];

function detectVersion(title) {
  for (const { re, label } of VERSION_DETECT) {
    if (re.test(title)) return label;
  }
  return null;
}

function cleanTitle(title) {
  // Extract title from «XXX» guillemet quotes if present
  const guillemet = title.match(/«([^»]+)»/);
  if (guillemet) return guillemet[1].trim();

  return title
    .replace(/\s*\(Audiodeskription\)/gi, '')
    .replace(/\s*\(mit Untertitel\)/gi, '')
    .replace(/\s*\(Originalversion mit Untertitel\)/gi, '')
    .replace(/\s*\(Originalversion\)/gi, '')
    .replace(/\s*\([^)]*[Uu]ntertitel[^)]*\)/g, '')
    .replace(/\s*-\s*Spielfilm.*$/i, '')
    .trim();
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

const CACHE_DIR = 'cache';
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

function articleToEnglish(title) {
  return title.replace(/^(Les|Le|La|L'|Die|Der|Das|Den|Ein|Eine)\s+/i, 'The ');
}

const STOP_WORDS = new Set(['the','a','an','le','la','les','de','du','des','et','en','un','une','est','il','elle','qui','que','dans','sur','par','pour','avec','ce','se','sa','son','ses','au','aux','is','in','of','to','and','his','her','their','its','at','as','on','by','this','was','are','has','have','been','he','she','they']);

function descSimilarity(a, b) {
  if (!a || !b) return 0;
  const words = s => new Set(normalize(s).split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)));
  const wa = words(a), wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  const intersection = [...wa].filter(w => wb.has(w)).length;
  return intersection / Math.min(wa.size, wb.size);
}

function scoreResult(result, queryTitle, sourceDesc) {
  const t = normalize(result.title);
  const q = normalize(queryTitle);
  const titleScore = t === q ? 3 : (t.includes(q) || q.includes(t)) ? 1 : 0;
  const descScore = descSimilarity(sourceDesc, result.overview);
  return titleScore + descScore;
}

function bestMatch(results, title, sourceDesc) {
  let best = null, bestScore = -1;
  for (const r of results) {
    const score = scoreResult(r, title, sourceDesc);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

async function fetchGenres(lang) {
  const data = await get(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_KEY}&language=${lang}`);
  return Object.fromEntries((data.genres || []).map(g => [g.id, g.name]));
}

async function searchTmdb(title, lang) {
  const stripped = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=${lang}&query=${encodeURIComponent(stripped)}&page=1`;
  const data = await get(url);
  return data.results || [];
}

async function fetchTmdb(movie, genreMap) {
  const cacheFile = `${CACHE_DIR}/${movie.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cached && cached._v === CACHE_VERSION) return { data: cached, cached: true };
  }

  try {
    const lang = movie.lang;
    let results = await searchTmdb(movie.cleanTitle, lang);
    let hit = bestMatch(results, movie.cleanTitle, movie.description);

    const english = articleToEnglish(movie.cleanTitle);
    if (english !== movie.cleanTitle && (!hit || normalize(hit.title) !== normalize(movie.cleanTitle))) {
      const fallback = await searchTmdb(english, lang);
      const fallbackHit = bestMatch(fallback, english, movie.description);
      if (fallbackHit && scoreResult(fallbackHit, english, movie.description) > scoreResult(hit, movie.cleanTitle, movie.description)) {
        hit = fallbackHit;
      }
    }

    const result = hit ? {
      _v: CACHE_VERSION,
      poster: hit.poster_path ? TMDB_IMG + hit.poster_path : null,
      rating: hit.vote_average ? hit.vote_average.toFixed(1) : null,
      voteCount: hit.vote_count || 0,
      popularity: hit.popularity || 0,
      year: hit.release_date ? hit.release_date.slice(0, 4) : null,
      genres: (hit.genre_ids || []).map(id => genreMap[id]).filter(Boolean),
    } : null;

    fs.writeFileSync(cacheFile, JSON.stringify(result));
    return { data: result, cached: false };
  } catch {
    return { data: null, cached: false };
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sourceLabel(file) {
  if (file === 'arte_fr.json') return 'arte.fr';
  if (file === 'arte_de.json') return 'arte.de';
  if (file === '3sat.json')    return '3sat';
  if (file === 'ard.json')     return 'ard';
  if (file === 'srf.json')     return 'srf';
  if (file === 'zdf.json')     return 'zdf';
  return file;
}

function movieRecord(movie, tmdb) {
  const title = escapeHtml(movie.cleanTitle);
  return {
    title,
    searchTitle: title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    href: escapeHtml(movie.url_video_hd || movie.url_video || movie.url_video_low || movie.url_website),
    infoHref: escapeHtml(movie.url_website),
    hasDirectVideo: !!(movie.url_video_hd || movie.url_video || movie.url_video_low),
    channel: escapeHtml(movie.channel),
    source: sourceLabel(movie.source),
    poster: tmdb && tmdb.poster ? tmdb.poster : null,
    overview: movie.description ? escapeHtml(movie.description) : null,
    rating: tmdb && tmdb.rating && tmdb.rating !== '0.0' ? tmdb.rating : '0',
    lowConfidence: !tmdb || (tmdb.voteCount < LOW_VOTE_THRESHOLD),
    popularity: tmdb ? tmdb.popularity : 0,
    year: tmdb && tmdb.year ? tmdb.year : null,
    genres: tmdb && tmdb.genres ? tmdb.genres : [],
    duration: movie.duration ? (() => { const h = Math.floor(movie.duration / 3600); const m = Math.floor((movie.duration % 3600) / 60); return `${h}:${String(m).padStart(2, '0')}`; })() : null,
    timestamp: movie.timestamp || null,
    altVersions: movie.altVersions || [],
  };
}

async function main() {
  const sources = [
    { file: 'arte_fr.json', lang: 'fr-FR' },
    { file: 'arte_de.json', lang: 'de-DE' },
    { file: '3sat.json',    lang: 'de-DE' },
    { file: 'ard.json',     lang: 'de-DE' },
    { file: 'srf.json',     lang: 'de-DE' },
    { file: 'zdf.json',     lang: 'de-DE' },
  ];
  const entries = sources.flatMap(({ file, lang }) =>
    JSON.parse(fs.readFileSync(file, 'utf8')).result.results.map(e => ({ ...e, lang, source: file }))
  );

  // Filter out entries shorter than 30 min (keep all version variants)
  const filtered = entries.filter(e =>
    (!e.duration || e.duration >= 1800)
  );

  // Deduplicate by url_website + version (same stream+version = same entry)
  const seen = new Map();
  for (const entry of filtered) {
    const version = detectVersion(entry.title);
    const key = `${entry.url_website}|||${version || ''}`;
    if (!seen.has(key)) {
      seen.set(key, { ...entry, cleanTitle: cleanTitle(entry.title) });
    }
  }
  // Group by channel + cleanTitle to merge version variants (AD, OmU, UT, OV)
  const versionGroups = new Map();
  for (const movie of seen.values()) {
    const version = detectVersion(movie.title);
    const key = `${movie.channel}|||${movie.cleanTitle}`;
    if (!versionGroups.has(key)) versionGroups.set(key, []);
    versionGroups.get(key).push({ ...movie, _version: version });
  }

  let movies = [];
  for (const group of versionGroups.values()) {
    const primary = group.find(m => !m._version) || group[0];
    const alts = group.filter(m => m !== primary && m._version);
    primary.altVersions = alts.map(m => ({
      label: m._version,
      href: m.url_video_hd || m.url_video || m.url_video_low || m.url_website,
      hasDirectVideo: !!(m.url_video_hd || m.url_video || m.url_video_low),
    }));
    movies.push(primary);
  }
  const isTest = process.argv.includes('--test');
  if (isTest) {
    const perSource = 3;
    const picked = new Map();
    for (const m of movies) {
      const s = m.source;
      if (!picked.has(s)) picked.set(s, []);
      if (picked.get(s).length < perSource) picked.get(s).push(m);
    }
    movies = [...picked.values()].flat();
  }
  console.log(`Unique movies: ${movies.length}${isTest ? ' (test mode)' : ''}`);

  // Fetch genre map in English for all sources
  console.log('Fetching genre list...');
  const genreMap = await fetchGenres('en-US');

  const records = [];
  let cacheHits = 0, apiCalls = 0;
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const label = `[${i + 1}/${movies.length}]`;
    const { data: tmdb, cached } = await fetchTmdb(movie, genreMap);
    const tag = cached ? 'cache' : 'api  ';
    if (cached) cacheHits++; else apiCalls++;
    process.stdout.write(`\r${label} ${tag} ${movie.cleanTitle.slice(0, 50).padEnd(50)}`);
    records.push(movieRecord(movie, tmdb));
    if (!cached) await new Promise(r => setTimeout(r, 100));
  }
  console.log(`\nDone fetching. cache=${cacheHits} api=${apiCalls}`);

  const version = Date.now();
  fs.writeFileSync('content.js', `window.MOVIES = ${JSON.stringify(records, null, 2)};\n`, 'utf8');
  console.log('Written: content.js');

  const html = fs.readFileSync('index.html', 'utf8')
    .replace(/content\.js\?v=\d+/, `content.js?v=${version}`);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log(`Written: index.html (v=${version})`);

  // Prune stale cache entries no longer in the current dataset
  const activeIds = new Set(movies.map(m => m.id.replace(/[^a-zA-Z0-9_-]/g, '_')));
  let pruned = 0;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (!activeIds.has(f.replace('.json', ''))) {
      fs.unlinkSync(`${CACHE_DIR}/${f}`);
      pruned++;
    }
  }
  if (pruned) console.log(`Pruned ${pruned} stale cache entries.`);
}

main().catch(err => { console.error(err); process.exit(1); });
