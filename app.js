// Montage — application de montage photo premium (statique, sans dépendances)
(() => {
  'use strict';

  /* ===================== State ===================== */

  const state = {
    photos: [],           // { id, file, url, img, durationOverride }
    transition: 'kenburns',
    transitionDuration: 0.7,
    globalDuration: 3.0,
    template: 'voyage',
    music: null,          // { file, url, el }
    watermark: '',
    quality: 'hd',
    playing: false,
    exporting: false,
  };

  const TEMPLATES = {
    romantique: { transition: 'crossfade', duration: 4.0, transitionDuration: 1.0 },
    voyage:     { transition: 'kenburns',  duration: 3.5, transitionDuration: 0.6 },
    fete:       { transition: 'slide',     duration: 2.0, transitionDuration: 0.4 },
    minimal:    { transition: 'fadeBlack', duration: 3.0, transitionDuration: 0.5 },
  };

  const QUALITY_SIZES = {
    standard: { w: 540, h: 960, bitrate: 2_500_000 },
    hd:       { w: 720, h: 1280, bitrate: 6_000_000 },
  };

  // Les photos de téléphone (12+ Mpx) gardées en pleine résolution en mémoire pendant
  // toute la session peuvent saturer un mobile et faire échouer le rendu silencieusement.
  // On les redimensionne une fois à l'import : largement suffisant pour un export HD (720x1280).
  const MAX_PHOTO_DIMENSION = 1920;

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

  const previewCanvas = $('previewCanvas');
  const previewCtx = previewCanvas.getContext('2d');
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
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
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
          return { id: nextId++, file, url, img, durationOverride: null };
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
    transitionSelect.value = preset.transition;
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
  };

  const GL_TRANSITION_DEFAULTS = {
    dissolve: { scale: 4.0, smoothness: 0.01, seed: 12.9898 },
    morph: { strength: 0.1 },
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
  const GL_TRANSITIONS = new Set(['dissolve', 'morph']);

  function getCoverCanvas(photo, w, h) {
    const key = `${w}x${h}`;
    if (photo._cover && photo._cover.key === key) return photo._cover.canvas;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    drawCover(c.getContext('2d'), photo.img, 0, 0, w, h);
    photo._cover = { key, canvas: c };
    return c;
  }

  /* ===================== Canvas drawing ===================== */

  function drawCover(ctx, img, cx, cy, cw, ch, zoom = 1, panX = 0, panY = 0) {
    if (!img) return;
    const { w: iw, h: ih } = mediaSize(img);
    if (!iw || !ih) return;
    const scale = Math.max(cw / iw, ch / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = cx + (cw - dw) / 2 + panX * cw;
    const dy = cy + (ch - dh) / 2 + panY * ch;
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
      drawCover(ctx, current.photo.img, 0, 0, w, h, zoom, pan.x, pan.y);
    } else {
      const next = timeline[current.index + 1];
      const rawBlend = (local - (D - td)) / td;
      const blend = easeInOutCubic(Math.max(0, Math.min(1, rawBlend)));
      const zoomA = zoomFor(local, D);
      const zoomB = zoomFor(0, next.duration);
      const panA = panFor(current.photo.id, local, D);

      if (state.transition === 'slide') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.save();
        ctx.translate(-blend * w, 0);
        drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y);
        ctx.restore();
        ctx.save();
        ctx.translate((1 - blend) * w, 0);
        drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0);
        ctx.restore();
        ctx.restore();
      } else if (state.transition === 'fadeBlack' || state.transition === 'fadeWhite') {
        ctx.fillStyle = state.transition === 'fadeWhite' ? '#fff' : '#000';
        ctx.fillRect(0, 0, w, h);
        const outAlpha = Math.max(0, 1 - blend * 2);
        const inAlpha = Math.max(0, blend * 2 - 1);
        ctx.globalAlpha = outAlpha;
        drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y);
        ctx.globalAlpha = inAlpha;
        drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0);
        ctx.globalAlpha = 1;
      } else if (GL_TRANSITIONS.has(state.transition) && glEngine) {
        const fromCanvas = getCoverCanvas(current.photo, w, h);
        const toCanvas = getCoverCanvas(next.photo, w, h);
        const ok = glEngine.render(state.transition, fromCanvas, toCanvas, blend, w, h);
        if (ok) {
          ctx.drawImage(glEngine.canvas, 0, 0, w, h);
        } else {
          ctx.globalAlpha = 1 - blend;
          drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y);
          ctx.globalAlpha = blend;
          drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0);
          ctx.globalAlpha = 1;
        }
      } else {
        // crossfade / kenburns
        ctx.globalAlpha = 1 - blend;
        drawCover(ctx, current.photo.img, 0, 0, w, h, zoomA, panA.x, panA.y);
        ctx.globalAlpha = blend;
        drawCover(ctx, next.photo.img, 0, 0, w, h, zoomB, 0, 0);
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
    const exportCtx = exportCanvas.getContext('2d');

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

    const blob = await finished;
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

  downloadBtn.addEventListener('click', () => {
    if (!currentExportUrl) return;
    const a = document.createElement('a');
    a.href = currentExportUrl;
    a.download = suggestedFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  shareWhatsappBtn.addEventListener('click', async () => {
    if (!currentExportBlob) return;
    const file = new File([currentExportBlob], suggestedFileName(), { type: currentExportBlob.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Mon montage photo',
          text: 'Regarde le montage que je viens de créer !',
        });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // annulé par l'utilisateur
    }
    // Repli : téléchargement + ouverture de WhatsApp pour joindre le fichier manuellement
    downloadBtn.click();
    showToast('Vidéo téléchargée — ouvre WhatsApp et joins le fichier depuis tes téléchargements', 'info');
    window.open(`https://wa.me/?text=${encodeURIComponent('Voici mon montage photo ! 🎞️')}`, '_blank', 'noopener');
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
