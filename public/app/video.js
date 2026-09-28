// Profile video helpers: duration check for picked files, and an in-page recorder
// (camera + microphone via MediaRecorder). The server checks the length again and converts
// every video to MP4, so a recording can be WebM (Chrome, Firefox) or MP4 (Safari).

export const MIN_SECONDS = 15;
export const MAX_SECONDS = 60;

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// Resolves with the length in seconds, or null when the browser can't tell (the server decides then)
export function videoDuration(file) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = d => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) && d > 0 ? d : null); };
    const timer = setTimeout(() => done(null), 8000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => { clearTimeout(timer); done(v.duration); };
    v.onerror = () => { clearTimeout(timer); done(null); };
    v.src = url;
  });
}

// Plays the file just uploaded from memory (page state .videoPreview), so the member sees it at
// once while the server converts it; null forgets it.
export function setPreview(state, file) {
  if (state.videoPreview) URL.revokeObjectURL(state.videoPreview);
  state.videoPreview = file ? URL.createObjectURL(file) : null;
}

// The member keeps the current video: the server converts it in the background. keepalive lets
// the request finish when it is sent while the page is closing.
export function confirmVideo() {
  fetch('/api/me/video/confirm', { method: 'POST', keepalive: true, headers: { 'x-requested-with': 'rientro' } }).catch(() => {});
}

// Message for a length outside 15–60 seconds (half a second of tolerance), else null
export function durationProblem(seconds) {
  if (seconds === null) return null;
  if (seconds < MIN_SECONDS - 0.5) return `Il video dura ${Math.round(seconds)} secondi: deve durarne almeno ${MIN_SECONDS}.`;
  if (seconds > MAX_SECONDS + 0.5) return `Il video dura ${Math.round(seconds)} secondi: può durarne al massimo ${MAX_SECONDS}.`;
  return null;
}

const TYPES = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

// Opens the recorder dialog. Resolves with a File once the member confirms a take, or null.
export function recordVideo() {
  return new Promise(resolve => {
    const opener = document.activeElement;
    const overlay = el('div', 'rec-overlay');
    const dialog = el('div', 'rec-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'rec-title');
    const title = el('h2', 'rec-title', 'Registra il tuo video');
    title.id = 'rec-title';
    const hint = el('p', 'rec-hint', `Da ${MIN_SECONDS} a ${MAX_SECONDS} secondi. Chi sei, cosa vuoi costruire, perché l'Italia.`);
    const stage = el('div', 'rec-stage');
    const live = el('video', 'rec-live');
    Object.assign(live, { autoplay: true, muted: true, playsInline: true });
    const review = el('video', 'rec-review');
    Object.assign(review, { controls: true, playsInline: true });
    review.hidden = true;
    const badge = el('div', 'rec-badge', `0:00 / ${clock(MAX_SECONDS)}`);
    const bar = el('div', 'rec-bar');
    const fill = el('div', 'rec-bar-fill');
    const minMark = el('div', 'rec-bar-min');
    minMark.style.left = `${(MIN_SECONDS / MAX_SECONDS) * 100}%`;
    bar.append(fill, minMark);
    stage.append(live, review, badge);
    const status = el('p', 'rec-status');
    status.setAttribute('aria-live', 'polite');
    const actions = el('div', 'rec-actions');
    const cancel = el('button', 'rec-btn rec-btn-ghost', 'Annulla');
    const main = el('button', 'rec-btn rec-btn-main', 'Registra');
    const retake = el('button', 'rec-btn rec-btn-ghost', 'Rifai');
    retake.hidden = true;
    for (const b of [cancel, main, retake]) b.type = 'button';
    actions.append(cancel, retake, main);
    dialog.append(title, hint, stage, bar, status, actions);
    overlay.append(dialog);
    document.body.append(overlay);

    let stream = null;
    let recorder = null;
    let chunks = [];
    let started = 0;
    let tick = null;
    let take = null;
    let mode = 'ready'; // ready → recording → review
    const type = TYPES.find(t => MediaRecorder.isTypeSupported?.(t)) || '';

    const close = file => {
      clearInterval(tick);
      if (recorder?.state === 'recording') recorder.stop();
      stream?.getTracks().forEach(t => t.stop());
      review.pause();
      if (review.src) URL.revokeObjectURL(review.src);
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
      resolve(file);
    };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(null); });
    cancel.onclick = () => close(null);

    const showLive = () => {
      mode = 'ready';
      live.hidden = false; review.hidden = true; retake.hidden = true;
      main.textContent = 'Registra'; main.disabled = !stream;
      fill.style.width = '0%'; badge.textContent = `0:00 / ${clock(MAX_SECONDS)}`; badge.classList.remove('is-rec');
      status.textContent = '';
    };

    const stop = () => { clearInterval(tick); if (recorder?.state === 'recording') recorder.stop(); };

    const start = () => {
      chunks = [];
      recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 2_000_000 });
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const seconds = (performance.now() - started) / 1000;
        if (seconds < MIN_SECONDS) { showLive(); status.textContent = `Troppo breve: servono almeno ${MIN_SECONDS} secondi.`; return; }
        const blobType = (recorder.mimeType || type || 'video/webm').split(';')[0];
        take = new File([new Blob(chunks, { type: blobType })], `video.${blobType.includes('mp4') ? 'mp4' : 'webm'}`, { type: blobType });
        mode = 'review';
        review.src = URL.createObjectURL(take);
        live.hidden = true; review.hidden = false; retake.hidden = false;
        badge.classList.remove('is-rec'); badge.textContent = clock(Math.min(seconds, MAX_SECONDS));
        main.textContent = 'Usa questo video'; main.disabled = false;
        status.textContent = 'Riguardalo: se ti convince, usalo.';
        main.focus();
      };
      recorder.start(1000);
      started = performance.now();
      mode = 'recording';
      badge.classList.add('is-rec');
      main.disabled = true;
      tick = setInterval(() => {
        const s = (performance.now() - started) / 1000;
        badge.textContent = `${clock(Math.min(s, MAX_SECONDS))} / ${clock(MAX_SECONDS)}`;
        fill.style.width = `${Math.min(100, (s / MAX_SECONDS) * 100)}%`;
        if (s < MIN_SECONDS) { main.textContent = `Fine (ancora ${Math.ceil(MIN_SECONDS - s)} s)`; main.disabled = true; }
        else { main.textContent = 'Fine'; main.disabled = false; }
        if (s >= MAX_SECONDS) stop();
      }, 200);
    };

    main.onclick = () => {
      if (mode === 'ready') start();
      else if (mode === 'recording') stop();
      else close(take);
    };
    // Rifai: stop the take that may be playing and throw it away
    const dropTake = () => {
      review.pause();
      if (review.src) URL.revokeObjectURL(review.src);
      review.removeAttribute('src');
      review.load();
      take = null; chunks = [];
    };
    retake.onclick = () => { dropTake(); showLive(); main.focus(); };

    main.disabled = true;
    status.textContent = 'Attiviamo la fotocamera…';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then(s => {
        if (!overlay.isConnected) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        live.srcObject = s;
        showLive();
        main.focus();
      })
      .catch(err => {
        status.textContent = err?.name === 'NotAllowedError'
          ? 'Per registrare serve il permesso di usare fotocamera e microfono. Puoi darlo dalle impostazioni del browser, oppure caricare un video.'
          : 'Non troviamo una fotocamera. Puoi caricare un video registrato con il telefono.';
      });
  });
}
