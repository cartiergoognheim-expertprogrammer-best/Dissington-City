/**
 * Dissington City — app.js
 * Grid-based MP3 player with Media Session (CarPlay) + PWA service worker.
 */

/* ── State ───────────────────────────────────────── */
const state = {
  tracks:        [],
  filtered:      [],
  currentIndex:  -1,
  isPlaying:     false,
  shuffle:       false,
  repeat:        'none',   // 'none' | 'all' | 'one'
  preMuteVolume: 1,
  sort:          'title',
  query:         '',
  blobUrls:      [],
};

/* ── DOM refs ────────────────────────────────────── */
const dom = {
  audio:          document.getElementById('audioEl'),
  trackGrid:      document.getElementById('trackGrid'),
  trackCount:     document.getElementById('trackCount'),
  searchInput:    document.getElementById('searchInput'),
  searchClear:    document.getElementById('searchClear'),
  sortSelect:     document.getElementById('sortSelect'),
  emptyLib:       document.getElementById('emptyLibrary'),
  emptySearch:    document.getElementById('emptySearch'),
  dropOverlay:    document.getElementById('dropOverlay'),
  fileInput:      document.getElementById('fileInput'),
  playBtn:        document.getElementById('playBtn'),
  prevBtn:        document.getElementById('prevBtn'),
  nextBtn:        document.getElementById('nextBtn'),
  shuffleBtn:     document.getElementById('shuffleBtn'),
  repeatBtn:      document.getElementById('repeatBtn'),
  repeatOneBadge: document.getElementById('repeatOneBadge'),
  muteBtn:        document.getElementById('muteBtn'),
  seekBar:        document.getElementById('seekBar'),
  volumeBar:      document.getElementById('volumeBar'),
  timeElapsed:    document.getElementById('timeElapsed'),
  timeDuration:   document.getElementById('timeDuration'),
  playerTitle:    document.getElementById('playerTitle'),
  playerArtist:   document.getElementById('playerArtist'),
  playerArt:      document.getElementById('playerArt'),
};

/* ── Init ────────────────────────────────────────── */
async function init() {
  registerSW();
  loadSavedPrefs();
  await loadTracksJson();
  renderGrid();
  setupMediaSession();
  bindEvents();
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

async function loadTracksJson() {
  try {
    const res = await fetch('tracks.json');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (Array.isArray(data)) {
      state.tracks = data.map(norm);
    }
  } catch (e) {
    console.warn('tracks.json not loaded:', e.message);
  }
  applyFilterSort();
}

function norm(t) {
  return {
    title:    t.title    || 'Unknown Title',
    artist:   t.artist   || 'Unknown Artist',
    album:    t.album    || '—',
    duration: t.duration || '—',
    file:     t.file     || '',
    cover:    t.cover    || null,
    id:       t.id       || btoa(encodeURIComponent(t.file || t.title || Math.random())).slice(0,12),
  };
}

/* ── Filter + sort ───────────────────────────────── */
function applyFilterSort() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.tracks.filter(t =>
    !q || t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
  );

  state.filtered.sort((a, b) => {
    if (state.sort === 'newest') return 0;   // preserve insertion order
    const av = (a[state.sort] || '').toLowerCase();
    const bv = (b[state.sort] || '').toLowerCase();
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
}

/* ── Grid rendering ──────────────────────────────── */
function renderGrid() {
  applyFilterSort();

  const hasLib    = state.tracks.length > 0;
  const hasResult = state.filtered.length > 0;

  dom.emptyLib.hidden    = hasLib;
  dom.emptySearch.hidden = !(hasLib && !hasResult);
  dom.trackCount.textContent = hasLib ? `${state.filtered.length} track${state.filtered.length !== 1 ? 's' : ''}` : '';

  const frag = document.createDocumentFragment();

  state.filtered.forEach((track, idx) => {
    const isActive = state.currentIndex === idx;
    const isPaused = isActive && !state.isPlaying;

    const card = document.createElement('div');
    card.className = 'track-card' + (isActive ? ' active' : '') + (isPaused ? ' paused' : '');
    card.dataset.index = idx;

    const artInner = track.cover
      ? `<img src="${esc(track.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

    const playPauseIcon = isActive && state.isPlaying
      ? `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg>`;

    card.innerHTML = `
      <div class="card-art">
        ${artInner}
        <span class="card-eq">
          <span class="eq-bar"></span>
          <span class="eq-bar"></span>
          <span class="eq-bar"></span>
        </span>
        <button class="card-play-btn" aria-label="${isActive && state.isPlaying ? 'Pause' : 'Play'}">
          ${playPauseIcon}
        </button>
      </div>
      <div class="card-info">
        <span class="card-title"    title="${esc(track.title)}">${esc(track.title)}</span>
        <span class="card-artist"   title="${esc(track.artist)}">${esc(track.artist)}</span>
        <span class="card-duration">${esc(track.duration)}</span>
      </div>
    `;

    // Click card body → play
    card.addEventListener('click', e => {
      if (e.target.closest('.card-play-btn')) return;
      playTrack(idx);
    });

    // Click play button
    card.querySelector('.card-play-btn').addEventListener('click', e => {
      e.stopPropagation();
      state.currentIndex === idx ? togglePlay() : playTrack(idx);
    });

    frag.appendChild(card);
  });

  dom.trackGrid.innerHTML = '';
  dom.trackGrid.appendChild(frag);
}

/* Tiny HTML escaper */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Playback ─────────────────────────────────────── */
function playTrack(idx) {
  if (idx < 0 || idx >= state.filtered.length) return;
  const track = state.filtered[idx];
  state.currentIndex = idx;

  dom.audio.src = track.file;
  dom.audio.load();
  dom.audio.play().then(() => {
    state.isPlaying = true;
    updatePlayerBar(track);
    updateMediaMeta(track);
    renderGrid();
    scrollCardIntoView();
  }).catch(err => {
    console.error(err);
    showToast(`Can't play "${track.title}" — check the file path.`, 'error');
    state.isPlaying = false;
    updatePlayBtn();
  });
}

function togglePlay() {
  if (state.currentIndex === -1) { if (state.filtered.length) playTrack(0); return; }
  if (dom.audio.paused) {
    dom.audio.play().then(() => { state.isPlaying = true;  updatePlayBtn(); updateMediaState(); renderGrid(); });
  } else {
    dom.audio.pause();
    state.isPlaying = false; updatePlayBtn(); updateMediaState(); renderGrid();
  }
}

function playNext() {
  if (!state.filtered.length) return;
  let next;
  if (state.repeat === 'one')    next = state.currentIndex;
  else if (state.shuffle)        next = randIdx();
  else {
    next = state.currentIndex + 1;
    if (next >= state.filtered.length) {
      if (state.repeat === 'all') next = 0; else { stopAll(); return; }
    }
  }
  playTrack(next);
}

function playPrev() {
  if (!state.filtered.length) return;
  if (dom.audio.currentTime > 3) { dom.audio.currentTime = 0; return; }
  let prev;
  if (state.shuffle) prev = randIdx();
  else {
    prev = state.currentIndex - 1;
    if (prev < 0) prev = state.repeat === 'all' ? state.filtered.length - 1 : 0;
  }
  playTrack(prev);
}

function stopAll() {
  dom.audio.pause();
  state.isPlaying = false; state.currentIndex = -1; dom.audio.src = '';
  updatePlayerBar(null);
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  renderGrid();
}

function randIdx() {
  if (state.filtered.length <= 1) return 0;
  let i; do { i = Math.floor(Math.random() * state.filtered.length); } while (i === state.currentIndex);
  return i;
}

function scrollCardIntoView() {
  requestAnimationFrame(() => {
    const active = dom.trackGrid.querySelector('.track-card.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

/* ── Player bar UI ───────────────────────────────── */
function updatePlayerBar(track) {
  if (!track) {
    dom.playerTitle.textContent  = 'No track selected';
    dom.playerArtist.textContent = '—';
    dom.seekBar.value = 0; updateRange(dom.seekBar);
    dom.playerArt.innerHTML = musicNoteSvg(18);
    return;
  }
  dom.playerTitle.textContent  = track.title;
  dom.playerArtist.textContent = track.artist;
  dom.timeDuration.textContent = track.duration !== '—' ? track.duration : '—';
  dom.playerArt.innerHTML = track.cover
    ? `<img src="${esc(track.cover)}" alt="" onerror="this.parentNode.innerHTML='${musicNoteSvg(18).replace(/'/g,"\\'")}'">`
    : musicNoteSvg(18);
  updatePlayBtn();
}

function musicNoteSvg(s) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="${s}" height="${s}"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
}

function updatePlayBtn() {
  dom.playBtn.querySelector('.icon-play').hidden  =  state.isPlaying;
  dom.playBtn.querySelector('.icon-pause').hidden = !state.isPlaying;
}

function updateShuffleBtn() {
  dom.shuffleBtn.classList.toggle('active', state.shuffle);
  dom.shuffleBtn.title = `Shuffle: ${state.shuffle ? 'On' : 'Off'} (S)`;
}

function updateRepeatBtn() {
  dom.repeatBtn.classList.toggle('active', state.repeat !== 'none');
  dom.repeatOneBadge.hidden = state.repeat !== 'one';
}

function updateVolIcon() {
  const m = dom.audio.muted || dom.audio.volume === 0;
  dom.muteBtn.querySelector('.icon-vol').hidden  =  m;
  dom.muteBtn.querySelector('.icon-mute').hidden = !m;
}

function updateRange(input) {
  const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--pct', pct + '%');
}

/* ── Media Session (CarPlay / lock screen) ───────── */
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler('play',          () => { dom.audio.play(); state.isPlaying = true;  updatePlayBtn(); updateMediaState(); });
  ms.setActionHandler('pause',         () => { dom.audio.pause(); state.isPlaying = false; updatePlayBtn(); updateMediaState(); });
  ms.setActionHandler('previoustrack', playPrev);
  ms.setActionHandler('nexttrack',     playNext);
  ms.setActionHandler('stop',          stopAll);
  ms.setActionHandler('seekto',        d => { if (d.seekTime !== undefined) dom.audio.currentTime = d.seekTime; });
  ms.setActionHandler('seekbackward',  d => { dom.audio.currentTime = Math.max(0, dom.audio.currentTime - (d.seekOffset||10)); });
  ms.setActionHandler('seekforward',   d => { dom.audio.currentTime = Math.min(dom.audio.duration||0, dom.audio.currentTime + (d.seekOffset||10)); });
}

function updateMediaMeta(track) {
  if (!('mediaSession' in navigator) || !track) return;
  const art = [];
  if (track.cover) art.push({ src: track.cover, sizes: '512x512', type: 'image/jpeg' });
  art.push({ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' });
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title, artist: track.artist,
    album: track.album !== '—' ? track.album : '', artwork: art,
  });
  updateMediaState();
}

function updateMediaState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
  if (dom.audio.duration && isFinite(dom.audio.duration)) {
    try {
      navigator.mediaSession.setPositionState({
        duration: dom.audio.duration,
        playbackRate: dom.audio.playbackRate,
        position: Math.min(dom.audio.currentTime, dom.audio.duration),
      });
    } catch {}
  }
}

/* ── Persistence ─────────────────────────────────── */
const LS = 'dissington_prefs';

function loadSavedPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || '{}');
    if (s.volume  !== undefined) dom.audio.volume = s.volume;
    if (s.muted   !== undefined) dom.audio.muted  = s.muted;
    if (s.shuffle !== undefined) state.shuffle     = s.shuffle;
    if (s.repeat  !== undefined) state.repeat      = s.repeat;
    if (s.sort    !== undefined) { state.sort = s.sort; dom.sortSelect.value = s.sort; }
    dom.volumeBar.value = dom.audio.volume;
    updateRange(dom.volumeBar);
    updateShuffleBtn(); updateRepeatBtn(); updateVolIcon();
  } catch {}
}

function savePrefs() {
  try {
    localStorage.setItem(LS, JSON.stringify({
      volume: dom.audio.volume, muted: dom.audio.muted,
      shuffle: state.shuffle,   repeat: state.repeat, sort: state.sort,
    }));
  } catch {}
}

/* ── File import ─────────────────────────────────── */
function importFiles(files) {
  let added = 0;
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('audio/') && !file.name.endsWith('.mp3')) return;
    const url = URL.createObjectURL(file);
    state.blobUrls.push(url);
    const name = file.name.replace(/\.[^.]+$/, '');
    const parts = name.split(' - ').map(s => s.trim());
    state.tracks.push(norm({
      title:  parts.length >= 2 ? parts.slice(1).join(' - ') : name,
      artist: parts.length >= 2 ? parts[0] : 'Unknown Artist',
      album: '—', duration: '—', file: url, id: url,
    }));
    added++;
  });
  if (added) { renderGrid(); showToast(`Added ${added} track${added > 1 ? 's' : ''}`, 'success'); }
}

/* ── Toast ───────────────────────────────────────── */
let toastWrap;
function showToast(msg, type='') {
  if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toast-container'; document.body.appendChild(toastWrap); }
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  toastWrap.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, 3000);
}

/* ── Helpers ─────────────────────────────────────── */
function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}

/* ── Events ──────────────────────────────────────── */
function bindEvents() {

  // Audio
  dom.audio.addEventListener('timeupdate', () => {
    if (!dom.seekBar.matches(':active')) {
      dom.seekBar.value = dom.audio.duration ? (dom.audio.currentTime/dom.audio.duration)*100 : 0;
      updateRange(dom.seekBar);
    }
    dom.timeElapsed.textContent = fmt(dom.audio.currentTime);
    if (Math.round(dom.audio.currentTime) % 5 === 0) updateMediaState();
  });

  dom.audio.addEventListener('loadedmetadata', () => {
    dom.timeDuration.textContent = fmt(dom.audio.duration);
    updateMediaState();
    // Backfill duration into track object if it was '—'
    if (state.currentIndex >= 0) {
      const t = state.filtered[state.currentIndex];
      if (t && t.duration === '—') {
        t.duration = fmt(dom.audio.duration);
        const orig = state.tracks.find(x => x.id === t.id);
        if (orig) orig.duration = t.duration;
        const el = dom.trackGrid.querySelector('.track-card.active .card-duration');
        if (el) el.textContent = t.duration;
      }
    }
  });

  dom.audio.addEventListener('ended', playNext);
  dom.audio.addEventListener('play',  () => { state.isPlaying = true;  updatePlayBtn(); updateMediaState(); });
  dom.audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayBtn(); updateMediaState(); });

  // Controls
  dom.playBtn.addEventListener('click', togglePlay);
  dom.prevBtn.addEventListener('click', playPrev);
  dom.nextBtn.addEventListener('click', playNext);

  dom.shuffleBtn.addEventListener('click', () => { state.shuffle = !state.shuffle; updateShuffleBtn(); savePrefs(); });
  dom.repeatBtn.addEventListener('click', () => {
    const m = ['none','all','one'];
    state.repeat = m[(m.indexOf(state.repeat)+1) % m.length];
    updateRepeatBtn(); savePrefs();
  });

  // Seek
  dom.seekBar.addEventListener('input',  () => { updateRange(dom.seekBar); dom.timeElapsed.textContent = fmt((dom.seekBar.value/100)*(dom.audio.duration||0)); });
  dom.seekBar.addEventListener('change', () => { if (dom.audio.duration) { dom.audio.currentTime = (dom.seekBar.value/100)*dom.audio.duration; updateMediaState(); } });

  // Volume
  dom.volumeBar.addEventListener('input', () => { dom.audio.volume = dom.volumeBar.value; dom.audio.muted = dom.audio.volume===0; updateRange(dom.volumeBar); updateVolIcon(); savePrefs(); });
  dom.muteBtn.addEventListener('click', () => {
    dom.audio.muted = !dom.audio.muted;
    if (dom.audio.muted) { state.preMuteVolume = dom.audio.volume; dom.volumeBar.value = 0; }
    else { dom.audio.volume = state.preMuteVolume || 1; dom.volumeBar.value = dom.audio.volume; }
    updateRange(dom.volumeBar); updateVolIcon(); savePrefs();
  });

  // Search
  dom.searchInput.addEventListener('input', e => {
    state.query = e.target.value;
    dom.searchClear.classList.toggle('visible', state.query.length > 0);
    renderGrid();
  });
  dom.searchClear.addEventListener('click', () => {
    dom.searchInput.value = ''; state.query = '';
    dom.searchClear.classList.remove('visible');
    renderGrid(); dom.searchInput.focus();
  });

  // Sort
  dom.sortSelect.addEventListener('change', () => { state.sort = dom.sortSelect.value; savePrefs(); renderGrid(); });

  // Import via file input (triggered by drop overlay button if added, or drag/drop)
  dom.fileInput.addEventListener('change', e => { importFiles(e.target.files); e.target.value=''; });

  // Drag & drop onto page
  let dc = 0;
  document.addEventListener('dragenter', e => { e.preventDefault(); dc++; dom.dropOverlay.classList.add('active'); });
  document.addEventListener('dragleave', () => { if (--dc <= 0) { dc=0; dom.dropOverlay.classList.remove('active'); } });
  document.addEventListener('dragover',  e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault(); dc=0; dom.dropOverlay.classList.remove('active');
    if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target === dom.searchInput || e.ctrlKey || e.metaKey) return;
    switch (e.code) {
      case 'Space':      e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': e.preventDefault(); dom.audio.currentTime = Math.min(dom.audio.currentTime+5, dom.audio.duration||0); break;
      case 'ArrowLeft':  e.preventDefault(); dom.audio.currentTime = Math.max(dom.audio.currentTime-5, 0); break;
      case 'ArrowUp':    e.preventDefault(); dom.audio.volume=Math.min(1,dom.audio.volume+0.05); dom.volumeBar.value=dom.audio.volume; updateRange(dom.volumeBar); updateVolIcon(); break;
      case 'ArrowDown':  e.preventDefault(); dom.audio.volume=Math.max(0,dom.audio.volume-0.05); dom.volumeBar.value=dom.audio.volume; updateRange(dom.volumeBar); updateVolIcon(); break;
      case 'KeyN': playNext(); break;
      case 'KeyP': playPrev(); break;
      case 'KeyS': state.shuffle=!state.shuffle; updateShuffleBtn(); savePrefs(); break;
      case 'KeyR': { const m=['none','all','one']; state.repeat=m[(m.indexOf(state.repeat)+1)%m.length]; updateRepeatBtn(); savePrefs(); } break;
      case 'KeyM': dom.muteBtn.click(); break;
    }
  });

  window.addEventListener('beforeunload', () => state.blobUrls.forEach(u => URL.revokeObjectURL(u)));
}

/* ── Boot ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  setupThemeSwitcher();
  await init();
});

/* ═══════════════════════════════════════════════════════
   THEME SWITCHER
═══════════════════════════════════════════════════════ */
const THEME_KEY = 'dissington_theme';

const THEME_NAMES = {
  '1': 'Theme 1',
  '2': 'Theme 2',
  '3': 'Theme 3',
};

function applyTheme(id) {
  // Set or remove the data-theme attribute on <html>
  if (id === '1') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }

  // Update label in the tab button
  document.getElementById('themeLabel').textContent = THEME_NAMES[id] || 'Theme ' + id;

  // Mark the active option in the dropdown
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === id);
  });

  // Persist choice
  try { localStorage.setItem(THEME_KEY, id); } catch {}

  // Update theme-color meta (browser chrome colour on mobile)
  const themeColors = { '1': '#0d0d12', '2': '#f5cba7', '3': '#ff69b4' };
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = themeColors[id] || '#0d0d12';
}

function setupThemeSwitcher() {
  const switcher  = document.getElementById('themeSwitcher');
  const tabBtn    = document.getElementById('themeTabBtn');
  const dropdown  = document.getElementById('themeDropdown');

  // Load saved theme
  let saved = '1';
  try { saved = localStorage.getItem(THEME_KEY) || '1'; } catch {}
  applyTheme(saved);

  // Toggle dropdown open/closed
  tabBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    switcher.classList.toggle('open', !isOpen);
  });

  // Pick a theme
  dropdown.addEventListener('click', e => {
    const option = e.target.closest('.theme-option');
    if (!option) return;
    applyTheme(option.dataset.theme);
    dropdown.hidden = true;
    switcher.classList.remove('open');
  });

  // Click outside → close
  document.addEventListener('click', e => {
    if (!switcher.contains(e.target)) {
      dropdown.hidden = true;
      switcher.classList.remove('open');
    }
  });
}


/* ═══════════════════════════════════════════════════════
   JUMPSCARE + Y2K POPUPS
   Both initialised inside DOMContentLoaded so DOM exists.
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Jumpscare ─────────────────────────────────────── */
  const overlay = document.getElementById('jumpscareOverlay');
  let jumpscareActive = false;

  function triggerJumpscare() {
    if (!overlay || jumpscareActive) return;
    jumpscareActive = true;
    overlay.classList.add('active');
    setTimeout(() => {
      overlay.classList.remove('active');
      jumpscareActive = false;
    }, 1000);
  }

  // 1/6000 chance every second
  setInterval(() => {
    if (Math.random() < 1 / 6000) triggerJumpscare();
  }, 1000);

  // Spam play/pause: 5 clicks within 2s → jumpscare
  const toggleTimes = [];
  const playBtn = document.getElementById('playBtn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const now = Date.now();
      toggleTimes.push(now);
      while (toggleTimes.length && now - toggleTimes[0] > 2000) toggleTimes.shift();
      if (toggleTimes.length >= 5) {
        toggleTimes.length = 0;
        triggerJumpscare();
      }
    });
  }

  /* ── Y2K Popup Ads ─────────────────────────────────── */
  const POPUP_GIFS = [
    { src: 'popup1.jpg', title: '⭐ You won a prize!!!' },
    { src: 'popup2.jpg', title: '💘 HOT singles near u!!' },
    { src: 'popup3.jpg', title: '🔥 Download Now FREE' },
    { src: 'popup4.jpg', title: '🎉 Congratulations!!!' },
    { src: 'popup5.jpg', title: '⚠️ WARNING: Virus detected' },
  ];

  const FOOTER_TEXTS = [
    'Click OK to claim your prize!!!',
    'Download Now - Its FREE!!!',
    'Hot deals in YOUR area!!!',
    'Limited time!!! Act NOW!!!',
    'Scan complete. Click to fix!!!',
  ];

  // Use all 3 gifs
  const activeGifs = POPUP_GIFS;
  const container  = document.getElementById('popupContainer');
  const showing    = new Set();
  const MAX_POPUPS = 3;

  function isTheme3() {
    return document.documentElement.getAttribute('data-theme') === '3';
  }

  function clearAllPopups() {
    if (!container) return;
    container.innerHTML = '';
    showing.clear();
  }

  function createPopup(gif) {
    if (!container) return;
    if (showing.has(gif.src) || showing.size >= MAX_POPUPS) return;
    showing.add(gif.src);

    const popup   = document.createElement('div');
    popup.className  = 'y2k-popup';
    popup.dataset.gif = gif.src;

    const maxX   = Math.max(10, window.innerWidth  - 220);
    const maxY   = Math.max(60, window.innerHeight - 320);
    popup.style.left = Math.floor(Math.random() * maxX) + 'px';
    popup.style.top  = Math.floor(Math.random() * maxY * 0.7 + 50) + 'px';
    popup.style.animationDelay    = (Math.random() * 2).toFixed(2) + 's';
    popup.style.animationDuration = (3 + Math.random() * 3).toFixed(2) + 's';
    popup.style.zIndex = 5000 + showing.size;

    const footer = FOOTER_TEXTS[Math.floor(Math.random() * FOOTER_TEXTS.length)];

    popup.innerHTML = `
      <div class="y2k-popup-titlebar">
        <span>${gif.title}</span>
        <button class="y2k-popup-close" title="Close">✕</button>
      </div>
      <div class="y2k-popup-body">
        <img src="${gif.src}" alt="" />
      </div>
      <div class="y2k-popup-footer">${footer}</div>
    `;

    popup.querySelector('.y2k-popup-close').addEventListener('click', () => {
      popup.remove();
      showing.delete(gif.src);
    });

    // Draggable by titlebar
    const handle = popup.querySelector('.y2k-popup-titlebar');
    let dragging = false, sx, sy, ox, oy;

    handle.addEventListener('mousedown', e => {
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = parseInt(popup.style.left) || 0;
      oy = parseInt(popup.style.top)  || 0;
      popup.style.animationPlayState = 'paused';
      popup.style.zIndex = 9999;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      popup.style.left = (ox + e.clientX - sx) + 'px';
      popup.style.top  = (oy + e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      popup.style.animationPlayState = 'running';
    });

    container.appendChild(popup);
  }

  // 1/350 chance per second per gif
  setInterval(() => {
    if (!isTheme3()) { if (showing.size > 0) clearAllPopups(); return; }
    activeGifs.forEach(gif => {
      if (!showing.has(gif.src) && Math.random() < 1 / 350) createPopup(gif);
    });
  }, 1000);

  // Clear when switching away from theme 3
  document.addEventListener('click', e => {
    const opt = e.target.closest('.theme-option');
    if (opt && opt.dataset.theme !== '3') clearAllPopups();
  });

}); // end DOMContentLoaded
