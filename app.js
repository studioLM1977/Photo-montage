// Montage — application de montage photo premium (statique, sans dépendances)
(() => {
  'use strict';

  /* ===================== State ===================== */

  const state = {
    photos: [],           // { id, file, url, img, durationOverride }
    transition: 'kenburns',
    randomTransitions: false,
    transitionDuration: 0.7,
    globalDuration: 3.0,
    template: 'voyage',
    music: null,          // { file, url, el }
    watermark: '',
    quality: 'hd',
    playing: false,
    exporting: false,
  };

  // Piscine des styles piochés en mode "transitions aléatoires" (le zoom Ken Burns n'y
  // figure pas : c'est un effet continu, pas un style de coupure entre deux photos).
  const RANDOM_TRANSITION_POOL = [
    'crossfade', 'fadeBlack', 'fadeWhite', 'slide',
    'dissolve', 'morph', 'crosszoom', 'cube', 'doorway',
  ];

  const TEMPLATES = {
    romantique: { transition: 'crossfade', duration: 4.0, transitionDuration: 1.0 },
    voyage:     { transition: 'kenburns',  duration: 3.5, transitionDuration: 0.6 },
    fete:       { transition: 'slide',     duration: 2.0, transitionDuration: 0.4 },
    minimal:    { transition: 'fadeBlack', duration: 3.0, transitionDuration: 0.5 },
  };

  const QUALITY_SIZES = {
    standard: { w: 720, h: 1280, bitrate: 5_000_000 },
    hd:       { w: 1080, h: 1920, bitrate: 12_000_000 },
  };

  // Les photos de téléphone (12+ Mpx) gardées en pleine résolution en mémoire pendant
  // toute la session peuvent saturer un mobile et faire échouer le rendu silencieusement.
  // On les redimensionne une fois à l'import : garde de la marge au-dessus de l'export
  // HD (1080x1920) pour rester net même avec le zoom Ken Burns.
  const MAX_PHOTO_DIMENSION = 2200;

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let nextId = 1;
  let history = []; // { url, duration, size, ts }

  /* ===================== DOM refs ===================== */

  const $ = (id) => document.getElementById(id);

  const importZone = $('importZone');
  const editZone = $('editZone');
  const resultZone = $('resultZone');
  const historySection = $('historySection');
  const fileInput = $('fileInput');
  const pickFilesBtn = $('pickFilesBtn');
  const addMoreBtn = $('addMoreBtn');
  const photoGrid = $('photoGrid');
  const photoCount = $('photoCount');

  const templateSelect = $('templateSelect');
  const transitionSelect = $('transitionSelect');
  const randomTransitionsToggle = $('randomTransitionsToggle');
  const durationRange = $('durationRange');
  const durationValue = $('durationValue');
  const transitionDurationRange = $('transitionDurationRange');
  const transitionDurationValue = $('transitionDurationValue');
  const musicPickBtn = $('musicPickBtn');
  const musicInput = $('musicInput');
  const musicName = $('musicName');
  const musicClearBtn = $('musicClearBtn');
  const watermarkInput = $('watermarkInput');
  const qualitySelect = $('qualitySelect');

  function ctx2d(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return ctx;
  }

  const previewCanvas = $('previewCanvas');
  const previewCtx = ctx2d(previewCanvas);
  const previewEmpty = $('previewEmpty');
  const previewProgressBar = $('previewProgressBar');
  const playBtn = $('playBtn');
  const previewTime = $('previewTime');
  const exportBtn = $('exportBtn');

  const exportOverlay = $('exportOverlay');
  const exportStatus = $('exportStatus');
  const exportBar = $('exportBar');

  const resultVideo = $('resultVideo');
  const resultDuration = $('resultDuration');
  const resultSize = $('resultSize');
  const shareWhatsappBtn = $('shareWhatsappBtn');
  const downloadBtn = $('downloadBtn');
  const newMontageBtn = $('newMontageBtn');
  const resultConfetti = $('resultConfetti');
  const whatsappHelp = $('whatsappHelp');
  const whatsappHelpFilename = $('whatsappHelpFilename');
  const whatsappHelpOpen = $('whatsappHelpOpen');
  const whatsappHelpClose = $('whatsappHelpClose');
  const whatsappHelpSkip = $('whatsappHelpSkip');

  const recenterModal = $('recenterModal');
  const recenterCanvas = $('recenterCanvas');
  const recenterCtx = ctx2d(recenterCanvas);
  const recenterCancelBtn = $('recenterCancelBtn');
  const recenterResetBtn = $('recenterResetBtn');
  const recenterConfirmBtn = $('recenterConfirmBtn');

  const historyList = $('historyList');
  const themeToggle = $('themeToggle');
  const toastRoot = $('toastRoot');

  let currentExportBlob = null;
  let currentExportUrl = null;

  /* ===================== Utilities ===================== */

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function showToast(message, variant = 'info') {
    const el = document.createElement('div');
    el.className = `toast${variant === 'celebrate' ? ' celebrate' : ''}`;
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  function attachRipple(btn) {
    btn.addEventListener('pointerdown', (e) => {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const size = Math.max(rect.width, rect.height) * 1.2;
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  }
  document.querySelectorAll('.btn').forEach(attachRipple);

  /* ===================== Theme ===================== */

  const THEME_KEY = 'montage.theme';
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  });
  initTheme();

  /* ===================== Import photos ===================== */

  pickFilesBtn.addEventListener('click', () => fileInput.click());
  addMoreBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => addPhotos(Array.from(e.target.files || [])));

  ['dragenter', 'dragover'].forEach((evt) =>
    importZone.addEventListener(evt, (e) => {
      e.preventDefault();
      importZone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    importZone.addEventListener(evt, (e) => {
      e.preventDefault();
      importZone.classList.remove('dragover');
    })
  );
  importZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) addPhotos(files);
  });
  editZone.addEventListener('dragover', (e) => e.preventDefault());
  editZone.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) addPhotos(files);
  });

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = url;
    });
  }

  // Redimensionne l'image chargée si elle dépasse MAX_PHOTO_DIMENSION, pour éviter de
  // garder plusieurs photos pleine résolution (12+ Mpx) en mémoire pendant toute la session.
  function normalizePhotoImage(img) {
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w <= MAX_PHOTO_DIMENSION && h <= MAX_PHOTO_DIMENSION) return img;
    const scale = MAX_PHOTO_DIMENSION / Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx2d(canvas).drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function mediaSize(media) {
    return { w: media.naturalWidth || media.width, h: media.naturalHeight || media.height };
  }

  async function addPhotos(files) {
    if (!files.length) return;
    const loaded = await Promise.all(
      files.map(async (file) => {
        const url = URL.createObjectURL(file);
        try {
          const rawImg = await loadImage(url);
          const img = normalizePhotoImage(rawImg);
          return { id: nextId++, file, url, img, durationOverride: null, focusX: 0.5, focusY: 0.5 };
        } catch (err) {
          showToast(`Impossible de charger "${file.name}"`, 'info');
          URL.revokeObjectURL(url);
          return null;
        }
      })
    );
    const additions = loaded.filter(Boolean);
    state.photos.push(...additions);
    importZone.classList.add('hidden');
    editZone.classList.remove('hidden');
    renderGrid();
    renderPreviewFrame(0);
    fileInput.value = '';
  }

  /* ===================== Grid / reorder ===================== */

  function renderGrid() {
    photoGrid.innerHTML = '';
    state.photos.forEach((photo, index) => {
      const li = document.createElement('li');
      li.className = 'photo-card';
      li.draggable = true;
      li.dataset.id = photo.id;
      li.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;

      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = `Photo ${index + 1}`;
      li.appendChild(img);

      const badge = document.createElement('span');
      badge.className = 'photo-card-badge';
      badge.textContent = index + 1;
      li.appendChild(badge);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'photo-card-remove';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'Supprimer cette photo');
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removePhoto(photo.id));
      li.appendChild(removeBtn);

      const moveWrap = document.createElement('div');
      moveWrap.className = 'photo-card-move';
      const moveLeft = document.createElement('button');
      moveLeft.type = 'button';
      moveLeft.className = 'move-btn';
      moveLeft.textContent = '‹';
      moveLeft.setAttribute('aria-label', 'Déplacer avant');
      moveLeft.disabled = index === 0;
      moveLeft.addEventListener('click', () => movePhoto(index, index - 1));
      const moveRight = document.createElement('button');
      moveRight.type = 'button';
      moveRight.className = 'move-btn';
      moveRight.textContent = '›';
      moveRight.setAttribute('aria-label', 'Déplacer après');
      moveRight.disabled = index === state.photos.length - 1;
      moveRight.addEventListener('click', () => movePhoto(index, index + 1));
      moveWrap.append(moveLeft, moveRight);
      li.appendChild(moveWrap);

      const recenterBtn = document.createElement('button');
      recenterBtn.type = 'button';
      recenterBtn.className = 'photo-card-recenter';
      recenterBtn.setAttribute('aria-label', 'Recadrer cette photo');
      recenterBtn.innerHTML = '⛶';
      recenterBtn.addEventListener('click', () => openRecenterModal(photo));
      li.appendChild(recenterBtn);

      const durationWrap = document.createElement('div');
      durationWrap.className = 'photo-card-duration';
      const durationInput = document.createElement('input');
      durationInput.type = 'number';
      durationInput.min = '1';
      durationInput.max = '15';
      durationInput.step = '0.5';
      durationInput.placeholder = 'auto';
      durationInput.setAttribute('aria-label', 'Durée personnalisée en secondes');
      if (photo.durationOverride != null) durationInput.value = photo.durationOverride;
      durationInput.addEventListener('change', () => {
        const v = parseFloat(durationInput.value);
        photo.durationOverride = Number.isFinite(v) && v > 0 ? v : null;
        renderPreviewFrame(0);
      });
      durationWrap.appendChild(durationInput);
      li.appendChild(durationWrap);

      // Desktop drag & drop reorder
      li.addEventListener('dragstart', () => li.classList.add('dragging'));
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        document.querySelectorAll('.photo-card.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const draggingEl = photoGrid.querySelector('.photo-card.dragging');
        if (!draggingEl || draggingEl === li) return;
        const fromId = Number(draggingEl.dataset.id);
        const toId = Number(li.dataset.id);
        const fromIdx = state.photos.findIndex((p) => p.id === fromId);
        const toIdx = state.photos.findIndex((p) => p.id === toId);
        movePhoto(fromIdx, toIdx);
      });

      photoGrid.appendChild(li);
    });

    photoCount.textContent = state.photos.length;
    updatePreviewAvailability();
  }

  function movePhoto(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= state.photos.length || fromIdx === toIdx) return;
    const [item] = state.photos.splice(fromIdx, 1);
    state.photos.splice(toIdx, 0, item);
    renderGrid();
    renderPreviewFrame(0);
  }

  function removePhoto(id) {
    state.photos = state.photos.filter((p) => p.id !== id);
    renderGrid();
    if (state.photos.length === 0) {
      editZone.classList.add('hidden');
      importZone.classList.remove('hidden');
    } else {
      renderPreviewFrame(0);
    }
  }

  function updatePreviewAvailability() {
    const ready = state.photos.length >= 2;
    previewEmpty.classList.toggle('hidden', ready);
    playBtn.disabled = !ready;
    exportBtn.disabled = !ready;
  }

  /* ===================== Settings ===================== */

  function applyTemplate(name) {
    const preset = TEMPLATES[name];
    if (!preset) return;
    state.transition = preset.transition;
    state.globalDuration = preset.duration;
    state.transitionDuration = preset.transitionDuration;
    state.randomTransitions = false;
    transitionSelect.value = preset.transition;
    transitionSelect.disabled = false;
    randomTransitionsToggle.checked = false;
    durationRange.value = preset.duration;
    transitionDurationRange.value = preset.transitionDuration;
    durationValue.textContent = `${preset.duration.toFixed(1).replace('.', ',')} s`;
    transitionDurationValue.textContent = `${preset.transitionDuration.toFixed(1).replace('.', ',')} s`;
    renderPreviewFrame(0);
  }

  templateSelect.addEventListener('change', () => {
    if (templateSelect.value !== 'custom') applyTemplate(templateSelect.value);
  });

  function markCustom() {
    templateSelect.value = 'custom';
  }

  transitionSelect.addEventListener('change', () => {
    state.transition = transitionSelect.value;
    markCustom();
    renderPreviewFrame(0);
  });

  randomTransitionsToggle.addEventListener('change', () => {
    state.randomTransitions = randomTransitionsToggle.checked;
    transitionSelect.disabled = state.randomTransitions;
    markCustom();
    renderPreviewFrame(0);
  });

  durationRange.addEventListener('input', () => {
    state.globalDuration = parseFloat(durationRange.value);
    durationValue.textContent = `${state.globalDuration.toFixed(1).replace('.', ',')} s`;
    markCustom();
  });

  transitionDurationRange.addEventListener('input', () => {
    state.transitionDuration = parseFloat(transitionDurationRange.value);
    transitionDurationValue.textContent = `${state.transitionDuration.toFixed(1).replace('.', ',')} s`;
    markCustom();
  });

  watermarkInput.addEventListener('input', () => {
    state.watermark = watermarkInput.value.trim();
    renderPreviewFrame(0);
  });

  qualitySelect.addEventListener('change', () => {
    state.quality = qualitySelect.value;
    resizeCanvasForQuality();
    renderPreviewFrame(0);
  });

  function resizeCanvasForQuality() {
    const { w, h } = QUALITY_SIZES[state.quality];
    previewCanvas.width = w;
    previewCanvas.height = h;
    // Changer width/height réinitialise l'état du contexte (dont imageSmoothingQuality).
    previewCtx.imageSmoothingEnabled = true;
    previewCtx.imageSmoothingQuality = 'high';
  }
  resizeCanvasForQuality();

  musicPickBtn.addEventListener('click', () => musicInput.click());
  musicInput.addEventListener('change', () => {
    const file = musicInput.files && musicInput.files[0];
    if (!file) return;
    if (state.music) URL.revokeObjectURL(state.music.url);
    const url = URL.createObjectURL(file);
    const el = new Audio(url);
    el.preload = 'auto';
    state.music = { file, url, el };
    musicName.textContent = file.name;
    musicClearBtn.classList.remove('hidden');
  });
  musicClearBtn.addEventListener('click', () => {
    if (state.music) URL.revokeObjectURL(state.music.url);
    state.music = null;
    musicName.textContent = 'Aucune';
    musicClearBtn.classList.add('hidden');
    musicInput.value = '';
  });

  /* ===================== Timeline model ===================== */

  function slotDuration(photo) {
    return photo.durationOverride != null ? photo.durationOverride : state.globalDuration;
  }

  function buildTimeline() {
    let t = 0;
    return state.photos.map((photo, i) => {
      const d = slotDuration(photo);
      const entry = { photo, index: i, start: t, duration: d };
      t += d;
      return entry;
    });
  }

  function totalDuration() {
    return state.photos.reduce((sum, p) => sum + slotDuration(p), 0);
  }

  /* ===================== Ken Burns pan seed ===================== */

  function kenBurnsVector(id) {
    // Direction pseudo-aléatoire mais stable par photo, pour un mouvement varié et naturel.
    const angle = (id * 2.399963) % (Math.PI * 2); // nombre d'or en radians, bonne répartition
    return { dx: Math.cos(angle) * 0.06, dy: Math.sin(angle) * 0.06 };
  }

  // Style de transition pour la coupure qui SUIT la photo `id` — pseudo-aléatoire mais stable
  // (même id -> même style à chaque rendu, en aperçu comme à l'export), pour ne jamais changer
  // d'un rendu à l'autre. Repose sur la même technique d'angle d'or que kenBurnsVector.
  function transitionForBoundary(id) {
    if (!state.randomTransitions) return state.transition;
    const angle = (id * 2.399963) % (Math.PI * 2);
    const index = Math.floor((angle / (Math.PI * 2)) * RANDOM_TRANSITION_POOL.length);
    return RANDOM_TRANSITION_POOL[Math.min(index, RANDOM_TRANSITION_POOL.length - 1)];
  }

  /* ===================== gl-transitions (gl-transitions.com, MIT) ===================== */
  // Shaders vendorisés depuis https://github.com/gl-transitions/gl-transitions
  // (vendor/gl-transitions/). Intégrés en chaîne pour éviter une dépendance de build.

  const GL_TRANSITION_SOURCE = {
    dissolve: `
// Author: Rich Harris — License: MIT
uniform float scale; // = 4.0
uniform float smoothness; // = 0.01
uniform float seed; // = 12.9898
float random(vec2 co) {
  float a = seed, b = 78.233, c = 43758.5453;
  float dt = dot(co.xy, vec2(a, b));
  float sn = mod(dt, 3.14);
  return fract(sin(sn) * c);
}
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
vec4 transition(vec2 uv) {
  vec4 from = getFromColor(uv);
  vec4 to = getToColor(uv);
  float n = noise(uv * scale);
  float p = mix(-smoothness, 1.0 + smoothness, progress);
  float q = smoothstep(p - smoothness, p + smoothness, n);
  return mix(from, to, 1.0 - q);
}`,
    morph: `
// Author: paniq — License: MIT
uniform float strength; // = 0.1
vec4 transition(vec2 p) {
  vec4 ca = getFromColor(p);
  vec4 cb = getToColor(p);
  vec2 oa = (((ca.rg + ca.b) * 0.5) * 2.0 - 1.0);
  vec2 ob = (((cb.rg + cb.b) * 0.5) * 2.0 - 1.0);
  vec2 oc = mix(oa, ob, 0.5) * strength;
  float w0 = progress;
  float w1 = 1.0 - w0;
  return mix(getFromColor(p + oc * w0), getToColor(p - oc * w1), progress);
}`,
    crosszoom: `
// Author: rectalogic — License: MIT
uniform float strength; // = 0.4
const float PI = 3.141592653589793;
float Linear_ease(in float begin, in float change, in float duration, in float time) {
  return change * time / duration + begin;
}
float Exponential_easeInOut(in float begin, in float change, in float duration, in float time) {
  if (time == 0.0) return begin;
  else if (time == duration) return begin + change;
  time = time / (duration / 2.0);
  if (time < 1.0) return change / 2.0 * pow(2.0, 10.0 * (time - 1.0)) + begin;
  return change / 2.0 * (-pow(2.0, -10.0 * (time - 1.0)) + 2.0) + begin;
}
float Sinusoidal_easeInOut(in float begin, in float change, in float duration, in float time) {
  return -change / 2.0 * (cos(PI * time / duration) - 1.0) + begin;
}
float czRand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}
vec4 czCrossFade(in vec2 uv, in float dissolve) {
  return mix(getFromColor(uv), getToColor(uv), dissolve);
}
vec4 transition(vec2 uv) {
  vec2 texCoord = uv.xy / vec2(1.0).xy;
  vec2 center = vec2(Linear_ease(0.25, 0.5, 1.0, progress), 0.5);
  float dissolve = Exponential_easeInOut(0.0, 1.0, 1.0, progress);
  float strengthEase = Sinusoidal_easeInOut(0.0, strength, 0.5, progress);
  vec4 color = vec4(0.0);
  float total = 0.0;
  vec2 toCenter = center - texCoord;
  float offset = czRand(uv);
  for (float t = 0.0; t <= 40.0; t++) {
    float percent = (t + offset) / 40.0;
    float weight = 4.0 * (percent - percent * percent);
    color += czCrossFade(texCoord + toCenter * percent * strengthEase, dissolve) * weight;
    total += weight;
  }
  return color / total;
}`,
    cube: `
// Author: gre — License: MIT
uniform float persp; // = 0.7
uniform float unzoom; // = 0.3
uniform float reflection; // = 0.4
uniform float floating; // = 3.0
vec2 cubeProject(vec2 p) {
  return p * vec2(1.0, -1.2) + vec2(0.0, -floating / 100.0);
}
bool cubeInBounds(vec2 p) {
  return all(lessThan(vec2(0.0), p)) && all(lessThan(p, vec2(1.0)));
}
vec4 cubeBgColor(vec2 p, vec2 pfr, vec2 pto) {
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  pfr = cubeProject(pfr);
  if (cubeInBounds(pfr)) {
    c += mix(vec4(0.0), getFromColor(pfr), reflection * mix(1.0, 0.0, pfr.y));
  }
  pto = cubeProject(pto);
  if (cubeInBounds(pto)) {
    c += mix(vec4(0.0), getToColor(pto), reflection * mix(1.0, 0.0, pto.y));
  }
  return c;
}
vec2 cubeXskew(vec2 p, float persp2, float center) {
  float x = mix(p.x, 1.0 - p.x, center);
  return (
    (
      vec2(x, (p.y - 0.5 * (1.0 - persp2) * x) / (1.0 + (persp2 - 1.0) * x))
      - vec2(0.5 - distance(center, 0.5), 0.0)
    )
    * vec2(0.5 / distance(center, 0.5) * (center < 0.5 ? 1.0 : -1.0), 1.0)
    + vec2(center < 0.5 ? 0.0 : 1.0, 0.0)
  );
}
vec4 transition(vec2 op) {
  float uz = unzoom * 2.0 * (0.5 - distance(0.5, progress));
  vec2 p = -uz * 0.5 + (1.0 + uz) * op;
  vec2 fromP = cubeXskew(
    (p - vec2(progress, 0.0)) / vec2(1.0 - progress, 1.0),
    1.0 - mix(progress, 0.0, persp),
    0.0
  );
  vec2 toP = cubeXskew(
    p / vec2(progress, 1.0),
    mix(pow(progress, 2.0), 1.0, persp),
    1.0
  );
  if (cubeInBounds(fromP)) return getFromColor(fromP);
  else if (cubeInBounds(toP)) return getToColor(toP);
  return cubeBgColor(op, fromP, toP);
}`,
    doorway: `
// Author: gre — License: MIT
uniform float reflection; // = 0.4
uniform float perspective; // = 0.4
uniform float depth; // = 3.0
const vec4 doorwayBlack = vec4(0.0, 0.0, 0.0, 1.0);
bool doorwayInBounds(vec2 p) {
  return all(lessThan(vec2(0.0), p)) && all(lessThan(p, vec2(1.0)));
}
vec2 doorwayProject(vec2 p) {
  return p * vec2(1.0, -1.2) + vec2(0.0, -0.02);
}
vec4 doorwayBgColor(vec2 p, vec2 pto) {
  vec4 c = doorwayBlack;
  pto = doorwayProject(pto);
  if (doorwayInBounds(pto)) {
    c += mix(doorwayBlack, getToColor(pto), reflection * mix(1.0, 0.0, pto.y));
  }
  return c;
}
vec4 transition(vec2 p) {
  vec2 pfr = vec2(-1.0), pto = vec2(-1.0);
  float middleSlit = 2.0 * abs(p.x - 0.5) - progress;
  if (middleSlit > 0.0) {
    pfr = p + (p.x > 0.5 ? -1.0 : 1.0) * vec2(0.5 * progress, 0.0);
    float d = 1.0 / (1.0 + perspective * progress * (1.0 - middleSlit));
    pfr.y -= d / 2.0;
    pfr.y *= d;
    pfr.y += d / 2.0;
  }
  float size = mix(1.0, depth, 1.0 - progress);
  pto = (p + vec2(-0.5, -0.5)) * vec2(size, size) + vec2(0.5, 0.5);
  if (doorwayInBounds(pfr)) return getFromColor(pfr);
  else if (doorwayInBounds(pto)) return getToColor(pto);
  else return doorwayBgColor(p, pto);
}`,
  };

  const GL_TRANSITION_DEFAULTS = {
    dissolve: { scale: 4.0, smoothness: 0.01, seed: 12.9898 },
    morph: { strength: 0.1 },
    crosszoom: { strength: 0.4 },
    cube: { persp: 0.7, unzoom: 0.3, reflection: 0.4, floating: 3.0 },
    doorway: { reflection: 0.4, perspective: 0.4, depth: 3.0 },
  };

  function createGlEngine() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    const programs = {};
    const vertexSrc = `
      attribute vec2 _p;
      varying vec2 _uv;
      void main() {
        gl_Position = vec4(_p, 0.0, 1.0);
        _uv = _p * 0.5 + 0.5;
      }`;

    function compile(type, src) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    }

    function buildProgram(name) {
      if (programs[name] !== undefined) return programs[name];
      const fragSrc = `
        precision highp float;
        varying vec2 _uv;
        uniform sampler2D from, to;
        uniform float progress;
        uniform float ratio;
        vec4 getFromColor(vec2 uv) { return texture2D(from, uv); }
        vec4 getToColor(vec2 uv) { return texture2D(to, uv); }
        ${GL_TRANSITION_SOURCE[name]}
        void main() { gl_FragColor = transition(_uv); }`;
      const vs = compile(gl.VERTEX_SHADER, vertexSrc);
      const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
      let program = null;
      if (vs && fs) {
        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.warn('Program link error:', gl.getProgramInfoLog(program));
          program = null;
        }
      }
      programs[name] = program;
      return program;
    }

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    function makeTexture(sourceCanvas) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    }

    function render(name, fromCanvas, toCanvas, progress, w, h) {
      const program = buildProgram(name);
      if (!program) return false;

      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.useProgram(program);

      const posLoc = gl.getAttribLocation(program, '_p');
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const fromTex = makeTexture(fromCanvas);
      const toTex = makeTexture(toCanvas);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fromTex);
      gl.uniform1i(gl.getUniformLocation(program, 'from'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, toTex);
      gl.uniform1i(gl.getUniformLocation(program, 'to'), 1);

      const progressLoc = gl.getUniformLocation(program, 'progress');
      if (progressLoc) gl.uniform1f(progressLoc, progress);
      const ratioLoc = gl.getUniformLocation(program, 'ratio');
      if (ratioLoc) gl.uniform1f(ratioLoc, w / h);

      const defaults = GL_TRANSITION_DEFAULTS[name] || {};
      Object.keys(defaults).forEach((key) => {
        const loc = gl.getUniformLocation(program, key);
        if (loc) gl.uniform1f(loc, defaults[key]);
      });

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.deleteTexture(fromTex);
      gl.deleteTexture(toTex);
      return true;
    }

    return { canvas, render };
  }

  const glEngine = createGlEngine();
  const GL_TRANSITIONS = new Set(['dissolve', 'morph', 'crosszoom', 'cube', 'doorway']);

  function getCoverCanvas(photo, w, h) {
    const key = `${w}x${h}:${photo.focusX}:${photo.focusY}`;
    if (photo._cover && photo._cover.key === key) return photo._cover.canvas;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    drawCover(ctx2d(c), photo.img, 0, 0, w, h, 1, 0, 0, photo.focusX, photo.focusY);
    photo._cover = { key, canvas: c };
    return c;
  }

  /* ===================== Canvas drawing ===================== */

  function drawCover(ctx, img, cx, cy, cw, ch, zoom = 1, panX = 0, panY = 0, focusX = 0.5, focusY = 0.5) {
    if (!img) return;
    const { w: iw, h: ih } = mediaSize(img);
    if (!iw || !ih) return;
    const scale = Math.max(cw / iw, ch / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    let dx = cx + cw / 2 - focusX * dw + panX * cw;
    let dy = cy + ch / 2 - focusY * dh + panY * ch;
    // Le point de focus ne doit jamais découvrir de bord vide : on le contraint à la
    // plage qui garde la photo en "cover" complet du cadre.
    dx = Math.max(cx + cw - dw, Math.min(cx, dx));
    dy = Math.max(cy + ch - dh, Math.min(cy, dy));
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function drawWatermark(ctx, w, h) {
    if (!state.watermark) return;
    const fontSize = Math.round(w * 0.032);
    ctx.save();
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const y = h - fontSize * 1.2;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(state.watermark, w / 2, y);
    ctx.restore();
  }

  function renderAt(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const timeline = buildTimeline();
    if (!timeline.length) return;
    const total = totalDuration();
    const clamped = Math.max(0, Math.min(t, total - 0.001));

    let current = timeline[timeline.length - 1];
    for (const entry of timeline) {
      if (clamped >= entry.start && clamped < entry.start + entry.duration) {
        current = entry;
        break;
      }
    }

    const local = clamped - current.start;
    const D = current.duration;
    const td = Math.min(state.transitionDuration, D / 2);
    const isLast = current.index === timeline.length - 1;
    const inTransition = !isLast && local >= D - td;

    const kenburns = state.transition === 'kenburns';
    const zoomFor = (localT, dur) => (kenburns ? 1 + 0.09 * (localT / dur) : 1);
    const panFor = (photoId, localT, dur) => {
      if (!kenburns) return { x: 0, y: 0 };
      const vec = kenBurnsVector(photoId);
      return { x: vec.dx * (localT / dur), y: vec.dy * (localT / dur) };
    };

    if (!inTransition) {
      const zoom = zoomFor(local, D);
      const pan = panFor(current.photo.id, local, D);
      drawCover(ctx, current.photo.img, 0, 0, w, h, zoom, pan.x, pan.y, current.photo.focusX, current.photo.focusY);
    } else {
      const next = timeline[current.index + 1];
      const rawBlend = (local - (D - td)) / td;
      const blend = easeInOutCubic(Math.max(0, Math.min(1, rawBlend)));
      const zoomA = zoomFor(local, D);
      const zoomB = zoomFor(0, next.duration);
      const panA = panFor(current.photo.id, local, D);
      const boundaryTransition = transitionForBoundary(current.photo.id);

      if (boundaryTransition === 'slide') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.save();
        ctx.translate(-blend * w, 0);
        drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y, current.photo.focusX, current.photo.focusY);
        ctx.restore();
        ctx.save();
        ctx.translate((1 - blend) * w, 0);
        drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0, next.photo.focusX, next.photo.focusY);
        ctx.restore();
        ctx.restore();
      } else if (boundaryTransition === 'fadeBlack' || boundaryTransition === 'fadeWhite') {
        ctx.fillStyle = boundaryTransition === 'fadeWhite' ? '#fff' : '#000';
        ctx.fillRect(0, 0, w, h);
        const outAlpha = Math.max(0, 1 - blend * 2);
        const inAlpha = Math.max(0, blend * 2 - 1);
        ctx.globalAlpha = outAlpha;
        drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y, current.photo.focusX, current.photo.focusY);
        ctx.globalAlpha = inAlpha;
        drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0, next.photo.focusX, next.photo.focusY);
        ctx.globalAlpha = 1;
      } else if (GL_TRANSITIONS.has(boundaryTransition) && glEngine) {
        const fromCanvas = getCoverCanvas(current.photo, w, h);
        const toCanvas = getCoverCanvas(next.photo, w, h);
        const ok = glEngine.render(boundaryTransition, fromCanvas, toCanvas, blend, w, h);
        if (ok) {
          ctx.drawImage(glEngine.canvas, 0, 0, w, h);
        } else {
          ctx.globalAlpha = 1 - blend;
          drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y, current.photo.focusX, current.photo.focusY);
          ctx.globalAlpha = blend;
          drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0, next.photo.focusX, next.photo.focusY);
          ctx.globalAlpha = 1;
        }
      } else {
        // crossfade / kenburns
        ctx.globalAlpha = 1 - blend;
        drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y, current.photo.focusX, current.photo.focusY);
        ctx.globalAlpha = blend;
        drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0, next.photo.focusX, next.photo.focusY);
        ctx.globalAlpha = 1;
      }
    }

    drawWatermark(ctx, w, h);
  }

  function renderPreviewFrame(t) {
    renderAt(previewCtx, previewCanvas.width, previewCanvas.height, t);
  }

  /* ===================== Preview playback ===================== */

  let playStart = null;
  let playRaf = null;

  function togglePlay() {
    if (state.photos.length < 2) return;
    state.playing ? stopPlay() : startPlay();
  }
  playBtn.addEventListener('click', togglePlay);

  function startPlay() {
    state.playing = true;
    playBtn.textContent = '⏸ Pause';
    playStart = performance.now();
    if (state.music) {
      state.music.el.currentTime = 0;
      state.music.el.play().catch(() => {});
    }
    const loop = (now) => {
      const total = totalDuration();
      let t = (now - playStart) / 1000;
      if (t >= total) {
        stopPlay();
        renderPreviewFrame(0);
        previewProgressBar.style.width = '0%';
        previewTime.textContent = formatTime(0);
        return;
      }
      try {
        renderPreviewFrame(t);
      } catch (err) {
        console.error('Erreur de rendu de l\'aperçu :', err);
      }
      previewProgressBar.style.width = `${(t / total) * 100}%`;
      previewTime.textContent = formatTime(t);
      playRaf = requestAnimationFrame(loop);
    };
    playRaf = requestAnimationFrame(loop);
  }

  function stopPlay() {
    state.playing = false;
    playBtn.textContent = '▶ Lire l\'aperçu';
    if (playRaf) cancelAnimationFrame(playRaf);
    if (state.music) state.music.el.pause();
  }

  /* ===================== Défragmentation MP4 ===================== */
  // MediaRecorder produit un MP4 "fragmenté" (moov + moof + mdat, sans vraies tables
  // d'échantillons, durée à 0) — une structure valide selon la norme ISO-BMFF, que la
  // plupart des lecteurs savent lire, mais qui semble hors du périmètre que WhatsApp
  // accepte pour un envoi de document (probablement calibré sur des vidéos "classiques"
  // façon caméra). On reconstruit ici une table d'échantillons classique (stts/stsc/stsz/
  // stco/stss) à partir des boîtes moof/traf/trun, sans toucher aux octets image (mdat
  // recopié tel quel) — validé par re-décodage pixel-perfect avant intégration.
  function mp4FindBox(view, buf, start, end, type) {
    let pos = start;
    while (pos + 8 <= end) {
      const size = view.getUint32(pos);
      const t = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
      if (t === type) return { pos, size };
      if (size <= 0) break;
      pos += size;
    }
    return null;
  }

  function mp4FindAllBoxes(view, buf, start, end, type) {
    const out = [];
    let pos = start;
    while (pos + 8 <= end) {
      const size = view.getUint32(pos);
      const t = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
      if (t === type) out.push({ pos, size });
      if (size <= 0) break;
      pos += size;
    }
    return out;
  }

  function mp4Box(typeStr, payload) {
    const out = new Uint8Array(8 + payload.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, out.length);
    for (let i = 0; i < 4; i++) out[4 + i] = typeStr.charCodeAt(i);
    out.set(payload, 8);
    return out;
  }

  // mvhd/tkhd/mdhd version 1 utilisent des champs 64 bits pour creation_time/modification_time/
  // duration (et non 32 bits comme en version 0) — nos durées tiennent largement dans 32 bits,
  // on écrit donc 0 sur les 4 octets de poids fort et la vraie valeur sur les 4 de poids faible.
  function writeDurationField(view, off, version, value) {
    if (version === 1) {
      view.setUint32(off, 0);
      view.setUint32(off + 4, value);
    } else {
      view.setUint32(off, value);
    }
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  function parseTrafSamples(view, buf, trafPos, trafSize, moofPos) {
    const tfhd = mp4FindBox(view, buf, trafPos + 8, trafPos + trafSize, 'tfhd');
    const tfhdFlags = view.getUint32(tfhd.pos + 8) & 0xffffff;
    const trackId = view.getUint32(tfhd.pos + 12);
    let q = tfhd.pos + 16;
    let defaultSampleDuration = 0;
    let defaultSampleSize = 0;
    let defaultSampleFlags = 0;
    let baseDataOffset = null;
    if (tfhdFlags & 0x000001) {
      // 64-bit base_data_offset
      baseDataOffset = view.getUint32(q) * 2 ** 32 + view.getUint32(q + 4);
      q += 8;
    }
    if (tfhdFlags & 0x000002) q += 4;
    if (tfhdFlags & 0x000008) { defaultSampleDuration = view.getUint32(q); q += 4; }
    if (tfhdFlags & 0x000010) { defaultSampleSize = view.getUint32(q); q += 4; }
    if (tfhdFlags & 0x000020) { defaultSampleFlags = view.getUint32(q); q += 4; }
    const defaultBaseIsMoof = !!(tfhdFlags & 0x020000);

    const samples = [];
    let pos = trafPos + 8;
    while (pos + 8 <= trafPos + trafSize) {
      const size = view.getUint32(pos);
      const t = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
      if (t === 'trun') {
        const flags = view.getUint32(pos + 8) & 0xffffff;
        const sampleCount = view.getUint32(pos + 12);
        let qq = pos + 16;
        let dataOffset = 0;
        if (flags & 0x000001) { dataOffset = view.getInt32(qq); qq += 4; }
        let firstSampleFlags = null;
        if (flags & 0x000004) { firstSampleFlags = view.getUint32(qq); qq += 4; }
        const hasDur = !!(flags & 0x000100);
        const hasSize = !!(flags & 0x000200);
        const hasFlags = !!(flags & 0x000400);
        const hasCto = !!(flags & 0x000800);

        let runBase;
        if (defaultBaseIsMoof) runBase = moofPos + dataOffset;
        else if (baseDataOffset !== null) runBase = baseDataOffset + dataOffset;
        else runBase = moofPos + dataOffset;

        let cursor = runBase;
        for (let i = 0; i < sampleCount; i++) {
          let dur = defaultSampleDuration;
          if (hasDur) { dur = view.getUint32(qq); qq += 4; }
          let sz = defaultSampleSize;
          if (hasSize) { sz = view.getUint32(qq); qq += 4; }
          let flg = defaultSampleFlags;
          if (hasFlags) { flg = view.getUint32(qq); qq += 4; }
          else if (i === 0 && firstSampleFlags !== null) flg = firstSampleFlags;
          if (hasCto) qq += 4;
          const isSync = ((flg >>> 16) & 0x1) === 0;
          samples.push({ duration: dur, size: sz, sync: isSync, absOffset: cursor });
          cursor += sz;
        }
      }
      if (size <= 0) break;
      pos += size;
    }
    return { trackId, samples };
  }

  async function flattenMp4(blob, durationSeconds) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(buf.buffer);

    const ftyp = mp4FindBox(view, buf, 0, buf.length, 'ftyp');
    const moov = mp4FindBox(view, buf, 0, buf.length, 'moov');
    if (!ftyp || !moov) return blob; // structure inattendue, on n'y touche pas

    const moofList = mp4FindAllBoxes(view, buf, 0, buf.length, 'moof');
    if (!moofList.length) return blob; // déjà un MP4 classique (pas fragmenté)

    // MediaRecorder peut découper un enregistrement un peu long en PLUSIEURS fragments
    // (plusieurs paires moof+mdat), pas une seule — chaque fragment a son propre mdat.
    // On les retrouve tous et on les recolle en un seul mdat final, en recalculant pour
    // chaque échantillon sa position dans ce mdat combiné (sans quoi les données des
    // fragments précédant le dernier sont silencieusement perdues).
    const fragments = [];
    const trafByTrack = new Map();
    for (const moof of moofList) {
      const mdat = mp4FindBox(view, buf, moof.pos + moof.size, buf.length, 'mdat');
      if (!mdat) return blob;
      const mdatPayloadStart = mdat.pos + 8;
      const fragIndex = fragments.length;
      fragments.push({ mdatPayloadStart, mdatPayload: buf.subarray(mdatPayloadStart, mdat.pos + mdat.size) });

      const trafs = mp4FindAllBoxes(view, buf, moof.pos + 8, moof.pos + moof.size, 'traf');
      for (const traf of trafs) {
        const { trackId, samples } = parseTrafSamples(view, buf, traf.pos, traf.size, moof.pos);
        samples.forEach((s) => { s.frag = fragIndex; });
        if (!trafByTrack.has(trackId)) trafByTrack.set(trackId, []);
        trafByTrack.get(trackId).push(...samples);
      }
    }

    const fragNewBase = [];
    let combinedSize = 0;
    for (const f of fragments) {
      fragNewBase.push(combinedSize);
      combinedSize += f.mdatPayload.length;
    }
    const mdatPayload = new Uint8Array(combinedSize);
    fragments.forEach((f, i) => mdatPayload.set(f.mdatPayload, fragNewBase[i]));

    function newOffsetForSample(s) {
      const frag = fragments[s.frag];
      return fragNewBase[s.frag] + (s.absOffset - frag.mdatPayloadStart);
    }

    const mvhd = mp4FindBox(view, buf, moov.pos + 8, moov.pos + moov.size, 'mvhd');
    const mvhdVersion = buf[mvhd.pos + 8];
    const movieTsOff = mvhd.pos + 8 + 4 + (mvhdVersion === 1 ? 16 : 8);
    const movieTimescale = view.getUint32(movieTsOff);
    const mvhdBytes = buf.slice(mvhd.pos, mvhd.pos + mvhd.size);

    const trakBoxes = [];
    const traks = mp4FindAllBoxes(view, buf, moov.pos + 8, moov.pos + moov.size, 'trak');
    for (const trak of traks) {
      const tkhd = mp4FindBox(view, buf, trak.pos + 8, trak.pos + trak.size, 'tkhd');
      const tkhdVersion = buf[tkhd.pos + 8];
      const tkIdOff = tkhd.pos + 8 + 4 + (tkhdVersion === 1 ? 16 : 8);
      const trackId = view.getUint32(tkIdOff);
      const tkhdBytes = buf.slice(tkhd.pos, tkhd.pos + tkhd.size);

      const mdia = mp4FindBox(view, buf, trak.pos + 8, trak.pos + trak.size, 'mdia');
      const mdhd = mp4FindBox(view, buf, mdia.pos + 8, mdia.pos + mdia.size, 'mdhd');
      const mdhdVersion = buf[mdhd.pos + 8];
      const mdTsOff = mdhd.pos + 8 + 4 + (mdhdVersion === 1 ? 16 : 8);
      const trackTimescale = view.getUint32(mdTsOff);
      const mdhdBytes = buf.slice(mdhd.pos, mdhd.pos + mdhd.size);

      const hdlr = mp4FindBox(view, buf, mdia.pos + 8, mdia.pos + mdia.size, 'hdlr');
      const hdlrBytes = buf.slice(hdlr.pos, hdlr.pos + hdlr.size);

      const minf = mp4FindBox(view, buf, mdia.pos + 8, mdia.pos + mdia.size, 'minf');
      const vmhd = mp4FindBox(view, buf, minf.pos + 8, minf.pos + minf.size, 'vmhd');
      const mediaHeader = vmhd || mp4FindBox(view, buf, minf.pos + 8, minf.pos + minf.size, 'smhd');
      const mhdBytes = buf.slice(mediaHeader.pos, mediaHeader.pos + mediaHeader.size);
      const dinf = mp4FindBox(view, buf, minf.pos + 8, minf.pos + minf.size, 'dinf');
      const dinfBytes = buf.slice(dinf.pos, dinf.pos + dinf.size);
      const stbl = mp4FindBox(view, buf, minf.pos + 8, minf.pos + minf.size, 'stbl');
      const stsd = mp4FindBox(view, buf, stbl.pos + 8, stbl.pos + stbl.size, 'stsd');
      const stsdBytes = buf.slice(stsd.pos, stsd.pos + stsd.size);

      const samples = trafByTrack.get(trackId) || [];
      const n = samples.length;
      const totalTrackTicks = samples.reduce((s, x) => s + x.duration, 0);
      const durationInTrackTicks = totalTrackTicks;
      const movieTicks = Math.round((durationInTrackTicks / (trackTimescale || 1)) * movieTimescale);

      const patchedTkhd = tkhdBytes.slice();
      const tkhdView = new DataView(patchedTkhd.buffer);
      const tkDurOff = 8 + 4 + (tkhdVersion === 1 ? 24 : 16);
      writeDurationField(tkhdView, tkDurOff, tkhdVersion, movieTicks);

      const patchedMdhd = mdhdBytes.slice();
      const mdhdDurOff = 8 + 4 + (mdhdVersion === 1 ? 16 : 8) + 4;
      writeDurationField(new DataView(patchedMdhd.buffer), mdhdDurOff, mdhdVersion, totalTrackTicks);

      // stts
      const sttsEntries = [];
      for (const s of samples) {
        if (sttsEntries.length && sttsEntries[sttsEntries.length - 1][1] === s.duration) {
          sttsEntries[sttsEntries.length - 1][0]++;
        } else {
          sttsEntries.push([1, s.duration]);
        }
      }
      const sttsPayload = new Uint8Array(8 + sttsEntries.length * 8);
      const sttsView = new DataView(sttsPayload.buffer);
      sttsView.setUint32(4, sttsEntries.length);
      sttsEntries.forEach(([count, delta], i) => {
        sttsView.setUint32(8 + i * 8, count);
        sttsView.setUint32(8 + i * 8 + 4, delta);
      });
      const sttsBox = mp4Box('stts', sttsPayload);

      // stsz
      const stszPayload = new Uint8Array(12 + n * 4);
      const stszView = new DataView(stszPayload.buffer);
      stszView.setUint32(8, n);
      samples.forEach((s, i) => stszView.setUint32(12 + i * 4, s.size));
      const stszBox = mp4Box('stsz', stszPayload);

      // stsc : un chunk par échantillon (robuste si plusieurs pistes entrelacées)
      const stscPayload = new Uint8Array(8 + 12);
      const stscView = new DataView(stscPayload.buffer);
      stscView.setUint32(4, 1);
      stscView.setUint32(8, 1);
      stscView.setUint32(12, 1);
      stscView.setUint32(16, 1);
      const stscBox = mp4Box('stsc', stscPayload);

      // stco : un offset absolu par échantillon (calculé après connaître la taille finale du moov)
      const stcoPayload = new Uint8Array(8 + n * 4);
      new DataView(stcoPayload.buffer).setUint32(4, n);
      const stcoBox = mp4Box('stco', stcoPayload);

      const syncIndices = [];
      samples.forEach((s, i) => { if (s.sync) syncIndices.push(i + 1); });
      let stssBox = new Uint8Array(0);
      if (syncIndices.length && syncIndices.length < n) {
        const stssPayload = new Uint8Array(8 + syncIndices.length * 4);
        const stssView = new DataView(stssPayload.buffer);
        stssView.setUint32(4, syncIndices.length);
        syncIndices.forEach((idx, i) => stssView.setUint32(8 + i * 4, idx));
        stssBox = mp4Box('stss', stssPayload);
      }

      const stblBox = mp4Box('stbl', concatBytes([stsdBytes, sttsBox, stscBox, stszBox, stcoBox, stssBox]));
      const minfBox = mp4Box('minf', concatBytes([mhdBytes, dinfBytes, stblBox]));
      const mdiaBox = mp4Box('mdia', concatBytes([patchedMdhd, hdlrBytes, minfBox]));
      const trakBox = mp4Box('trak', concatBytes([patchedTkhd, mdiaBox]));

      trakBoxes.push({ bytes: trakBox, samples, movieTicks });
    }

    const overallMovieTicks = Math.max(0, ...trakBoxes.map((t) => t.movieTicks));
    const patchedMvhd = mvhdBytes.slice();
    writeDurationField(new DataView(patchedMvhd.buffer), movieTsOff - mvhd.pos + 4, mvhdVersion, overallMovieTicks);

    const moovBox = mp4Box('moov', concatBytes([patchedMvhd, ...trakBoxes.map((t) => t.bytes)]));
    const mdatBox = mp4Box('mdat', mdatPayload);
    // Le ftyp d'origine (copié par MediaRecorder) déclare des marques réservées au streaming
    // fragmenté (iso5/hlsf/cmfc — HLS/CMAF) même une fois le fichier reconstruit en MP4
    // classique : certains validateurs (dont WhatsApp) semblent s'y fier pour refuser le
    // fichier. On le remplace par un ftyp générique de MP4 "classique" façon caméra.
    const ftypBrands = ['isom', 'iso2', 'avc1', 'mp41'];
    const ftypPayload = new Uint8Array(8 + ftypBrands.length * 4);
    ftypPayload.set([0x69, 0x73, 0x6f, 0x6d]); // major_brand = 'isom'
    ftypBrands.forEach((brand, i) => {
      for (let c = 0; c < 4; c++) ftypPayload[8 + i * 4 + c] = brand.charCodeAt(c);
    });
    const ftypBytes = mp4Box('ftyp', ftypPayload);
    const headerTotalLen = ftypBytes.length + moovBox.length + 8;

    // Deuxième passe : patcher les stco de chaque piste avec les vrais offsets absolus.
    const finalTrakBytes = trakBoxes.map(({ bytes, samples }) => {
      const trakBytes = bytes.slice();
      const trakView = new DataView(trakBytes.buffer);
      let markerPos = -1;
      for (let i = 0; i + 4 <= trakBytes.length; i++) {
        if (trakBytes[i] === 0x73 && trakBytes[i + 1] === 0x74 && trakBytes[i + 2] === 0x63 && trakBytes[i + 3] === 0x6f) {
          markerPos = i - 4; // revenir au début de la boîte (avant le tag 'stco')
          break;
        }
      }
      const entriesStart = markerPos + 4 + 4 + 4 + 4; // size+type+version_flags+entry_count
      samples.forEach((s, i) => {
        const newOffset = headerTotalLen + newOffsetForSample(s);
        trakView.setUint32(entriesStart + i * 4, newOffset);
      });
      return trakBytes;
    });

    const finalMoovBox = mp4Box('moov', concatBytes([patchedMvhd, ...finalTrakBytes]));
    const out = concatBytes([ftypBytes, finalMoovBox, mdatBox]);
    return new Blob([out], { type: blob.type });
  }

  /* ===================== Export ===================== */

  function pickMimeType() {
    const candidates = [
      // video/mp4 en premier : c'est le seul format que WhatsApp (iOS et Android)
      // accepte de façon fiable pour un partage de vidéo. Safari sait l'enregistrer
      // nativement ; les navigateurs qui ne le supportent pas retombent sur webm.
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return candidates.find((c) => window.MediaRecorder && MediaRecorder.isTypeSupported(c)) || 'video/webm';
  }

  exportBtn.addEventListener('click', runExport);

  async function runExport() {
    if (state.photos.length < 2 || state.exporting) return;
    state.exporting = true;
    if (state.playing) stopPlay();

    exportOverlay.classList.remove('hidden');
    exportStatus.textContent = 'Préparation du montage…';
    exportBar.style.width = '0%';

    const { w, h, bitrate } = QUALITY_SIZES[state.quality];
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const exportCtx = ctx2d(exportCanvas);

    const total = totalDuration();
    const videoStream = exportCanvas.captureStream(30);
    let combinedStream = videoStream;
    let musicEl = null;

    if (state.music && typeof state.music.el.captureStream === 'function') {
      try {
        musicEl = state.music.el;
        musicEl.currentTime = 0;
        const audioStream = musicEl.captureStream();
        combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ]);
      } catch (err) {
        combinedStream = videoStream;
      }
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate });
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    const finished = new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    recorder.start();
    if (musicEl) musicEl.play().catch(() => {});
    exportStatus.textContent = 'Génération du montage…';

    const startTs = performance.now();
    await new Promise((resolve) => {
      function frame(now) {
        const t = (now - startTs) / 1000;
        try {
          renderAt(exportCtx, w, h, Math.min(t, total - 0.001));
        } catch (err) {
          console.error('Erreur de rendu export :', err);
        }
        if (t >= total) {
          exportBar.style.width = '100%';
          resolve();
          return;
        }
        exportBar.style.width = `${(t / total) * 100}%`;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    recorder.stop();
    if (musicEl) musicEl.pause();
    exportStatus.textContent = 'Finalisation…';

    let blob = await finished;
    if (blob.type.includes('mp4')) {
      try {
        blob = await flattenMp4(blob, total);
      } catch (err) {
        console.error('Impossible de défragmenter le MP4, envoi du fichier tel quel :', err);
      }
    }
    currentExportBlob = blob;
    currentExportUrl = URL.createObjectURL(blob);

    exportOverlay.classList.add('hidden');
    state.exporting = false;
    showResult(blob, currentExportUrl, total);
  }

  function showResult(blob, url, duration) {
    resultVideo.src = url;
    resultDuration.textContent = formatTime(duration);
    resultSize.textContent = formatSize(blob.size);
    editZone.classList.add('hidden');
    resultZone.classList.remove('hidden');
    launchConfetti(resultConfetti);
    showToast('Montage généré avec succès', 'celebrate');

    history.unshift({ url, duration, size: blob.size, ts: Date.now() });
    history = history.slice(0, 6);
    renderHistory();
  }

  /* ===================== Share / download ===================== */

  function suggestedFileName() {
    const type = (currentExportBlob && currentExportBlob.type) || '';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    return `montage-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  // Le lien <a download> sur un blob vidéo est notoirement lent/peu fiable sur Safari iOS
  // (pas de vraie fenêtre de téléchargement natif). navigator.share, quand disponible,
  // ouvre le partage natif iOS ("Enregistrer dans Fichiers"/"Enregistrer la vidéo"), bien
  // plus rapide — on l'utilise en priorité, avec repli sur le lien classique sinon.
  async function saveVideoLocally() {
    if (!currentExportBlob || !currentExportUrl) return false;
    const file = new File([currentExportBlob], suggestedFileName(), { type: currentExportBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false; // annulé par l'utilisateur
      }
    }
    const a = document.createElement('a');
    a.href = currentExportUrl;
    a.download = suggestedFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }

  downloadBtn.addEventListener('click', () => {
    saveVideoLocally();
  });

  // WhatsApp recompresse presque toujours une vidéo reçue via le partage natif (navigator.share
  // vers WhatsApp directement). Le seul moyen fiable de garder la qualité d'origine est de
  // l'envoyer comme Document (bouton 📎 dans WhatsApp) — un choix que seul l'utilisateur peut
  // faire à l'intérieur de l'app WhatsApp. On enregistre donc le fichier, on ouvre WhatsApp tout
  // seul, et on n'affiche le rappel des étapes que si l'utilisateur ne l'a pas déjà masqué.
  const SKIP_WHATSAPP_HELP_KEY = 'montage.skipWhatsappHelp';

  whatsappHelpSkip.checked = localStorage.getItem(SKIP_WHATSAPP_HELP_KEY) === '1';
  whatsappHelpSkip.addEventListener('change', () => {
    localStorage.setItem(SKIP_WHATSAPP_HELP_KEY, whatsappHelpSkip.checked ? '1' : '0');
  });

  shareWhatsappBtn.addEventListener('click', async () => {
    if (!currentExportUrl) return;
    await saveVideoLocally();
    if (localStorage.getItem(SKIP_WHATSAPP_HELP_KEY) === '1') {
      window.location.href = 'whatsapp://';
      return;
    }
    whatsappHelpFilename.textContent = suggestedFileName();
    whatsappHelp.classList.remove('hidden');
    window.location.href = 'whatsapp://';
  });

  whatsappHelpOpen.addEventListener('click', () => {
    whatsappHelp.classList.add('hidden');
    window.location.href = 'whatsapp://';
  });

  whatsappHelpClose.addEventListener('click', () => {
    whatsappHelp.classList.add('hidden');
  });

  newMontageBtn.addEventListener('click', () => {
    resultZone.classList.add('hidden');
    importZone.classList.remove('hidden');
    state.photos = [];
    photoGrid.innerHTML = '';
    photoCount.textContent = '0';
    currentExportBlob = null;
    currentExportUrl = null;
  });

  /* ===================== Recenter modal ===================== */

  let recenterPhoto = null;
  let recenterFocusX = 0.5;
  let recenterFocusY = 0.5;
  let recenterDrag = null;

  function drawRecenterFrame() {
    const w = recenterCanvas.width;
    const h = recenterCanvas.height;
    recenterCtx.clearRect(0, 0, w, h);
    if (!recenterPhoto) return;
    drawCover(recenterCtx, recenterPhoto.img, 0, 0, w, h, 1, 0, 0, recenterFocusX, recenterFocusY);
  }

  function openRecenterModal(photo) {
    recenterPhoto = photo;
    recenterFocusX = photo.focusX;
    recenterFocusY = photo.focusY;
    drawRecenterFrame();
    recenterModal.classList.remove('hidden');
  }

  function closeRecenterModal() {
    recenterModal.classList.add('hidden');
    recenterPhoto = null;
    recenterDrag = null;
  }

  recenterCanvas.addEventListener('pointerdown', (e) => {
    if (!recenterPhoto) return;
    recenterCanvas.setPointerCapture(e.pointerId);
    const { w: iw, h: ih } = mediaSize(recenterPhoto.img);
    if (!iw || !ih) return;
    const cw = recenterCanvas.width;
    const ch = recenterCanvas.height;
    const scale = Math.max(cw / iw, ch / ih);
    const rect = recenterCanvas.getBoundingClientRect();
    recenterDrag = {
      startX: e.clientX,
      startY: e.clientY,
      startFocusX: recenterFocusX,
      startFocusY: recenterFocusY,
      dw: iw * scale,
      dh: ih * scale,
      pixelScaleX: cw / rect.width,
      pixelScaleY: ch / rect.height,
    };
  });

  recenterCanvas.addEventListener('pointermove', (e) => {
    if (!recenterDrag) return;
    const deltaX = (e.clientX - recenterDrag.startX) * recenterDrag.pixelScaleX;
    const deltaY = (e.clientY - recenterDrag.startY) * recenterDrag.pixelScaleY;
    recenterFocusX = Math.max(0, Math.min(1, recenterDrag.startFocusX - deltaX / recenterDrag.dw));
    recenterFocusY = Math.max(0, Math.min(1, recenterDrag.startFocusY - deltaY / recenterDrag.dh));
    drawRecenterFrame();
  });

  function endRecenterDrag() { recenterDrag = null; }
  recenterCanvas.addEventListener('pointerup', endRecenterDrag);
  recenterCanvas.addEventListener('pointercancel', endRecenterDrag);

  recenterResetBtn.addEventListener('click', () => {
    recenterFocusX = 0.5;
    recenterFocusY = 0.5;
    drawRecenterFrame();
  });

  recenterConfirmBtn.addEventListener('click', () => {
    if (recenterPhoto) {
      recenterPhoto.focusX = recenterFocusX;
      recenterPhoto.focusY = recenterFocusY;
      renderPreviewFrame(0);
    }
    closeRecenterModal();
  });

  recenterCancelBtn.addEventListener('click', () => {
    closeRecenterModal();
  });

  /* ===================== History ===================== */

  function renderHistory() {
    historySection.classList.toggle('hidden', history.length === 0);
    historyList.innerHTML = '';
    history.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const video = document.createElement('video');
      video.src = item.url;
      video.muted = true;
      video.playsInline = true;
      li.appendChild(video);
      li.addEventListener('click', () => {
        video.currentTime = 0;
        video.play().catch(() => {});
      });
      historyList.appendChild(li);
    });
  }

  /* ===================== Confetti (léger, canvas) ===================== */

  function launchConfetti(container) {
    if (REDUCED_MOTION) return;
    const canvas = document.createElement('canvas');
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const colors = ['#8069ff', '#ff6f91', '#ffd166', '#4ade80'];
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
    }));

    let frame = 0;
    function tick() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      if (frame < 110) requestAnimationFrame(tick);
      else container.innerHTML = '';
    }
    requestAnimationFrame(tick);
  }

  /* ===================== Init ===================== */

  updatePreviewAvailability();
  applyTemplate(state.template);
})();
