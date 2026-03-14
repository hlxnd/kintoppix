const fs = require('fs');
const https = require('https');

const TMDB_KEY = '8c26f4762d19f47ee529c71494b289ce';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

function cleanTitle(title) {
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

async function searchTmdb(title, lang) {
  const stripped = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=${lang}&query=${encodeURIComponent(stripped)}&page=1`;
  const data = await get(url);
  return data.results || [];
}

async function fetchTmdb(movie) {
  const cacheFile = `${CACHE_DIR}/${movie.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }

  try {
    const lang = movie.lang;
    let results = await searchTmdb(movie.cleanTitle, lang);
    let hit = bestMatch(results, movie.cleanTitle, movie.description);

    // Fallback: try with article replaced by "The" if no exact title match
    const english = articleToEnglish(movie.cleanTitle);
    if (english !== movie.cleanTitle && (!hit || normalize(hit.title) !== normalize(movie.cleanTitle))) {
      const fallback = await searchTmdb(english, lang);
      const fallbackHit = bestMatch(fallback, english, movie.description);
      if (fallbackHit && scoreResult(fallbackHit, english, movie.description) > scoreResult(hit, movie.cleanTitle, movie.description)) {
        hit = fallbackHit;
      }
    }

    const result = hit ? {
      poster: hit.poster_path ? TMDB_IMG + hit.poster_path : null,
      rating: hit.vote_average ? hit.vote_average.toFixed(1) : null,
    } : null;

    fs.writeFileSync(cacheFile, JSON.stringify(result));
    return result;
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sourceLabel(file) {
  if (file === 'arte_fr.json') return 'arte.fr';
  if (file === 'arte_de.json') return 'arte.de';
  if (file === '3sat.json')    return '3sat';
  return file;
}

function movieRecord(movie, tmdb) {
  const title = escapeHtml(movie.cleanTitle);
  return {
    title,
    searchTitle: title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    href: escapeHtml(movie.url_website),
    channel: escapeHtml(movie.channel),
    source: sourceLabel(movie.source),
    poster: tmdb && tmdb.poster ? tmdb.poster : null,
    rating: tmdb && tmdb.rating && tmdb.rating !== '0.0' ? tmdb.rating : '0',
  };
}

async function main() {
  const sources = [
    { file: 'arte_fr.json', lang: 'fr-FR' },
    { file: 'arte_de.json', lang: 'de-DE' },
    { file: '3sat.json',    lang: 'de-DE' },
  ];
  const entries = sources.flatMap(({ file, lang }) =>
    JSON.parse(fs.readFileSync(file, 'utf8')).result.results.map(e => ({ ...e, lang, source: file }))
  );

  // Deduplicate by url_website (same stream = same movie)
  const seen = new Map();
  for (const entry of entries) {
    const key = entry.url_website;
    if (!seen.has(key)) {
      seen.set(key, { ...entry, cleanTitle: cleanTitle(entry.title) });
    }
  }
  const movies = [...seen.values()];
  console.log(`Unique movies: ${movies.length}`);

  const records = [];
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    process.stdout.write(`\rFetching TMDB [${i + 1}/${movies.length}] ${movie.cleanTitle.slice(0, 40).padEnd(40)}`);
    const tmdb = await fetchTmdb(movie);
    records.push(movieRecord(movie, tmdb));
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('\nDone fetching.');

  const version = Date.now();
  fs.writeFileSync('content.js', `window.MOVIES = ${JSON.stringify(records, null, 2)};\n`, 'utf8');
  console.log('Written: content.js');

  // Stamp cache-busting version in index.html
  const html = fs.readFileSync('index.html', 'utf8')
    .replace(/content\.js\?v=\d+/, `content.js?v=${version}`);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log(`Written: index.html (v=${version})`);
}

main().catch(err => { console.error(err); process.exit(1); });
