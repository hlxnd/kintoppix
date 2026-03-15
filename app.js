const grid = document.getElementById('grid');
const input = document.getElementById('search');
const sourceDropdown = document.getElementById('sourceDropdown');
const dropdownBtn = document.getElementById('dropdownBtn');
const sourceAllCb = document.getElementById('sourceAll');
const sourceCheckboxes = sourceDropdown.querySelectorAll('input[type=checkbox]:not(#sourceAll)');
const genreDropdown = document.getElementById('genreDropdown');
const genreDropdownBtn = document.getElementById('genreDropdownBtn');
const genreMenu = document.getElementById('genreMenu');

// Build genre list from data
const allGenreLabel = document.createElement('label');
allGenreLabel.innerHTML = '<input type="checkbox" id="genreAll" checked> <span id="genreAllText">ALL</span>';
allGenreLabel.style.borderBottom = '1px solid #333';
allGenreLabel.style.marginBottom = '4px';
allGenreLabel.style.paddingBottom = '8px';
genreMenu.appendChild(allGenreLabel);
const genreAllCb = document.getElementById('genreAll');

const allGenres = [...new Set(MOVIES.flatMap(m => m.genres || []))].sort();
allGenres.forEach(g => {
  const label = document.createElement('label');
  label.innerHTML = `<input type="checkbox" value="${g}" checked> <span data-genre-en="${g}">${g}</span>`;
  genreMenu.appendChild(label);
});
const genreCheckboxes = genreMenu.querySelectorAll('input[type=checkbox]:not(#genreAll)');

genreAllCb.addEventListener('change', () => {
  genreCheckboxes.forEach(cb => cb.checked = genreAllCb.checked);
  applyFilters();
});

genreCheckboxes.forEach(cb => cb.addEventListener('change', () => {
  genreAllCb.checked = [...genreCheckboxes].every(c => c.checked);
  applyFilters();
}));

// VideoJS player setup
const modal = document.getElementById('player-modal');
const player = videojs('player', { fluid: true });

function openPlayer(url) {
  player.src({ type: url.endsWith('m3u8') ? 'application/x-mpegURL' : undefined, src: url });
  player.load();
  modal.classList.add('open');
  player.play();
}

const _decodeEl = document.createElement('textarea');
function decodeHtml(str) { _decodeEl.innerHTML = str; return _decodeEl.value; }

function closePlayer() {
  player.pause();
  player.src('');
  modal.classList.remove('open');
}

document.getElementById('player-close').addEventListener('click', closePlayer);
modal.addEventListener('click', e => { if (e.target === modal) closePlayer(); });

// Detail modal
const detailModal = document.getElementById('detail-modal');
const detailImg = document.getElementById('detail-img');
const detailTitle = document.getElementById('detail-title');
const detailMeta = document.getElementById('detail-meta');
const detailOverview = document.getElementById('detail-overview');
const detailChannel = document.getElementById('detail-channel');
const detailWatch = document.getElementById('detail-watch');
const detailAlts = document.getElementById('detail-alts');
const detailInfoLink = document.getElementById('detail-info-link');

function openDetail(m) {
  if (m.poster) { detailImg.src = m.poster; detailImg.style.display = 'block'; }
  else { detailImg.style.display = 'none'; }

  detailTitle.textContent = decodeHtml(m.title);

  const parts = [];
  if (m.year) parts.push(`<span>${m.year}</span>`);
  if (m.rating !== '0') parts.push(`<span class="d-rating">★ ${m.rating}</span>`);
  if (m.duration) parts.push(`<span>${m.duration}</span>`);
  if (m.genres && m.genres.length) {
    parts.push(`<span class="d-sep">·</span><span>${m.genres.map(g => {
      const t = I18N[currentLang];
      return t.genreMap[g] || g;
    }).join(', ')}</span>`);
  }
  detailMeta.innerHTML = parts.join('<span class="d-sep"> · </span>');

  detailOverview.textContent = decodeHtml(m.overview || '');
  detailChannel.textContent = decodeHtml(m.channel);

  const t = I18N[currentLang];
  detailWatch.innerHTML = `▶ <span class="watch-label">${m.hasDirectVideo ? t.watch : t.open}</span>`;
  detailWatch.onclick = () => {
    closeDetail();
    if (m.hasDirectVideo) { openPlayer(m.href); }
    else { window.open(m.href, '_blank'); }
  };

  detailAlts.innerHTML = '';
  (m.altVersions || []).forEach(av => {
    const vl = t.versionLabels[av.label] || { short: av.label, tip: av.label };
    const btn = document.createElement('button');
    btn.className = 'alt-version-btn';
    btn.textContent = '▶ ' + vl.short;
    btn.title = vl.tip;
    btn.onclick = () => {
      closeDetail();
      if (av.hasDirectVideo) { openPlayer(av.href); }
      else { window.open(av.href, '_blank'); }
    };
    detailAlts.appendChild(btn);
  });

  if (m.infoHref) {
    detailInfoLink.href = m.infoHref;
    detailInfoLink.textContent = t.moreInfo;
    detailInfoLink.style.display = '';
  } else {
    detailInfoLink.style.display = 'none';
  }

  detailModal.classList.add('open');
}

function closeDetail() { detailModal.classList.remove('open'); }

document.getElementById('detail-close').addEventListener('click', closeDetail);
detailModal.addEventListener('click', e => { if (e.target === detailModal) closeDetail(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePlayer(); closeDetail(); } });

function buildCard(m) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = m.href;
  if (!m.hasDirectVideo) { a.target = '_blank'; a.rel = 'noopener'; }
  a.dataset.videoSrc = m.hasDirectVideo ? m.href : '';
  a.dataset.title = m.searchTitle;
  a.dataset.source = m.source;
  a.dataset.rating = m.rating;
  a.dataset.popularity = m.popularity;
  a.dataset.timestamp = m.timestamp || 0;
  a.dataset.genres = (m.genres || []).join(',');

  const posterImg = m.poster
    ? `<img class="poster" src="${m.poster}" alt="${m.title}" loading="lazy">`
    : `<div class="poster-placeholder">${m.title}</div>`;

  const isNew = m.timestamp && (Date.now() / 1000 - m.timestamp) < 7 * 86400;
  const newBadge = isNew ? `<span class="badge-new">New!</span>` : '';
  const versionBadges = (m.altVersions || []).length
    ? `<div class="poster-versions">${(m.altVersions || []).map(av => `<span class="badge-version" data-version-key="${av.label}">${av.label}</span>`).join('')}</div>`
    : '';
  const poster = `<div class="card-poster">${posterImg}${newBadge}${versionBadges}</div>`;

  const rating = m.rating !== '0'
    ? `<span class="rating${m.lowConfidence ? ' dim' : ''}">★ ${m.rating}</span>`
    : '';

  const year = m.year ? `<span class="year">${m.year}</span>` : '';
  const duration = m.duration ? `<span class="duration">${m.duration}</span>` : '';

  const genreTags = (m.genres || []).map(g => `<span class="genre-tag" data-genre-en="${g}">${g}</span>`).join('');

  a.innerHTML = `
    ${poster}
    <div class="card-info">
      <div class="card-title">${m.title}</div>
      <div class="card-meta">${rating}${duration}<span class="channel">${m.channel}</span>${year}</div>
      ${genreTags ? `<div class="genres">${genreTags}</div>` : ''}
    </div>`;
  a.addEventListener('click', e => {
    e.preventDefault();
    openDetail(m);
  });

  return a;
}

const sortSelect = document.getElementById('sortSelect');

function getSortedCards() {
  const key = sortSelect.value;
  return [...MOVIES]
    .sort((a, b) => parseFloat(b[key]) - parseFloat(a[key]))
    .map(buildCard);
}

let cards = getSortedCards();
cards.forEach(c => grid.appendChild(c));

function reSort() {
  const key = sortSelect.value;
  [...cards].sort((a, b) => parseFloat(b.dataset[key]) - parseFloat(a.dataset[key]))
    .forEach(c => grid.appendChild(c));
}

sortSelect.addEventListener('change', reSort);

function applyFilters() {
  const q = input.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const activeSources = new Set([...sourceCheckboxes].filter(c => c.checked).map(c => c.value));
  const activeGenres = new Set([...genreCheckboxes].filter(c => c.checked).map(c => c.value));
  const isAllSelected = genreAllCb.checked;
  cards.forEach(card => {
    const matchTitle = !q || card.dataset.title.includes(q);
    const matchSource = activeSources.has(card.dataset.source);
    const cardGenres = card.dataset.genres ? card.dataset.genres.split(',').filter(Boolean) : [];
    const hasNoGenres = cardGenres.length === 0;
    const matchGenre = isAllSelected
      ? true
      : !hasNoGenres && cardGenres.some(g => activeGenres.has(g));
    card.style.display = matchTitle && matchSource && matchGenre ? '' : 'none';
  });
}

input.addEventListener('input', applyFilters);
sourceAllCb.addEventListener('change', () => {
  sourceCheckboxes.forEach(cb => cb.checked = sourceAllCb.checked);
  applyFilters();
});
sourceCheckboxes.forEach(cb => cb.addEventListener('change', () => {
  sourceAllCb.checked = [...sourceCheckboxes].every(c => c.checked);
  applyFilters();
}));
genreCheckboxes.forEach(cb => cb.addEventListener('change', applyFilters));

const langDropdown = document.getElementById('langDropdown');
const langDropdownBtn = document.getElementById('langDropdownBtn');
const allDropdowns = [sourceDropdown, genreDropdown, langDropdown];

function openDropdown(dd) {
  allDropdowns.forEach(d => d.classList.toggle('open', d === dd ? !dd.classList.contains('open') : false));
}

dropdownBtn.addEventListener('click', e => { e.stopPropagation(); openDropdown(sourceDropdown); });
sourceDropdown.querySelector('.dropdown-menu').addEventListener('click', e => e.stopPropagation());
genreDropdownBtn.addEventListener('click', e => { e.stopPropagation(); openDropdown(genreDropdown); });
genreMenu.addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => allDropdowns.forEach(d => d.classList.remove('open')));

let currentLang = 'de';

const I18N = {
  de: {
    subtitle: 'Kostenloses Streaming der öffentlich-rechtlichen Mediatheken',
    sortPopularity: 'Sortierung: Beliebtheit',
    sortRating: 'Sortierung: Bewertung',
    sortDate: 'Sortierung: Datum',
    searchPlaceholder: 'Titel suchen…',
    genres: 'Genres ▾',
    sources: 'Sender ▾',
    all: 'ALLE',
    watch: 'Ansehen',
    open: 'Öffnen',
    moreInfo: 'Mehr Infos →',
    genreMap: { 'Action':'Action','Adventure':'Abenteuer','Animation':'Animation','Comedy':'Komödie','Crime':'Krimi','Documentary':'Dokumentarfilm','Drama':'Drama','Family':'Familie','Fantasy':'Fantasy','History':'Geschichte','Horror':'Horror','Music':'Musik','Mystery':'Mystery','Romance':'Romantik','Science Fiction':'Science-Fiction','TV Movie':'TV-Film','Thriller':'Thriller','War':'Kriegsfilm','Western':'Western' },
    versionLabels: { AD:{short:'AD',tip:'Audiodeskription'}, OmU:{short:'OmU',tip:'Originalversion mit Untertiteln'}, UT:{short:'UT',tip:'Untertitel'}, OV:{short:'OV',tip:'Originalversion'}, GL:{short:'DGS',tip:'Gebärdensprache'}, FR:{short:'FR',tip:'Französisch'}, EN:{short:'EN',tip:'Englisch'} }
  },
  fr: {
    subtitle: 'Streaming gratuit des chaînes publiques',
    sortPopularity: 'Tri : Popularité',
    sortRating: 'Tri : Note',
    sortDate: 'Tri : Date',
    searchPlaceholder: 'Rechercher des titres…',
    genres: 'Genres ▾',
    sources: 'Chaînes ▾',
    all: 'TOUS',
    watch: 'Regarder',
    open: 'Ouvrir',
    moreInfo: 'Plus d\'infos →',
    genreMap: { 'Action':'Action','Adventure':'Aventure','Animation':'Animation','Comedy':'Comédie','Crime':'Policier','Documentary':'Documentaire','Drama':'Drame','Family':'Famille','Fantasy':'Fantastique','History':'Histoire','Horror':'Horreur','Music':'Musique','Mystery':'Mystère','Romance':'Romance','Science Fiction':'Science-fiction','TV Movie':'Téléfilm','Thriller':'Thriller','War':'Guerre','Western':'Western' },
    versionLabels: { AD:{short:'AD',tip:'Audiodescription'}, OmU:{short:'VOST',tip:'Version originale sous-titrée'}, UT:{short:'ST',tip:'Sous-titres'}, OV:{short:'VO',tip:'Version originale'}, GL:{short:'LSF',tip:'Langue des signes'}, FR:{short:'FR',tip:'Français'}, EN:{short:'EN',tip:'Anglais'} }
  },
  en: {
    subtitle: 'Free streaming from Public Broadcasters',
    sortPopularity: 'Sort: Popularity',
    sortRating: 'Sort: Rating',
    sortDate: 'Sort: Date',
    searchPlaceholder: 'Search titles…',
    genres: 'Genres ▾',
    sources: 'Sources ▾',
    all: 'ALL',
    watch: 'Watch',
    open: 'Open',
    moreInfo: 'More info →',
    genreMap: {},
    versionLabels: { AD:{short:'AD',tip:'Audio Description'}, OmU:{short:'OST',tip:'Original with subtitles'}, UT:{short:'Subs',tip:'Subtitles'}, OV:{short:'OV',tip:'Original version'}, GL:{short:'SL',tip:'Sign Language'}, FR:{short:'FR',tip:'French'}, EN:{short:'EN',tip:'English'} }
  }
};

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('kintoppix-lang', lang);
  const t = I18N[lang];
  document.querySelector('header h1 span').textContent = t.subtitle;
  sortSelect.options[0].textContent = t.sortPopularity;
  sortSelect.options[1].textContent = t.sortRating;
  sortSelect.options[2].textContent = t.sortDate;
  input.placeholder = t.searchPlaceholder;
  genreDropdownBtn.textContent = t.genres;
  dropdownBtn.textContent = t.sources;
  document.getElementById('genreAllText').textContent = t.all;
  document.getElementById('sourceAllText').textContent = t.all;
  document.querySelectorAll('[data-genre-en]').forEach(el => {
    el.textContent = t.genreMap[el.dataset.genreEn] || el.dataset.genreEn;
  });
  document.querySelectorAll('[data-version-key]').forEach(el => {
    const vl = t.versionLabels[el.dataset.versionKey];
    if (vl) el.textContent = vl.short;
  });
  langDropdownBtn.textContent = lang.toUpperCase() + ' ▾';
  langDropdown.querySelectorAll('[data-lang]').forEach(el => {
    el.classList.toggle('active', el.dataset.lang === lang);
  });
  langDropdown.classList.remove('open');
}

langDropdownBtn.addEventListener('click', e => { e.stopPropagation(); openDropdown(langDropdown); });
langDropdown.querySelector('.dropdown-menu').addEventListener('click', e => e.stopPropagation());
langDropdown.querySelectorAll('[data-lang]').forEach(el => {
  el.addEventListener('click', () => setLang(el.dataset.lang));
});

setLang(localStorage.getItem('kintoppix-lang') || 'de');
