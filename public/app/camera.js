// "Scatta foto": the camera in a dialog (same look as the video recorder in video.js). Resolves
// with a JPEG File once the member keeps a shot, or null. The shot then goes through the same checks
// and framing as an uploaded photo (face.js).
export const canTakePhoto = () => !!navigator.mediaDevices?.getUserMedia;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

export function takePhoto() {
  return new Promise(resolve => {
    const opener = document.activeElement;
    const overlay = el('div', 'rec-overlay');
    const dialog = el('div', 'rec-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'cam-title');
    const title = el('h2', 'rec-title', 'Scatta foto');
    title.id = 'cam-title';
    const hint = el('p', 'rec-hint', 'Guarda in camera, con il viso ben illuminato e in primo piano.');
    const stage = el('div', 'rec-stage cam-stage');
    const live = el('video', 'rec-live');
    Object.assign(live, { autoplay: true, muted: true, playsInline: true });
    const still = el('canvas', 'cam-still');
    still.hidden = true;
    stage.append(live, still, el('div', 'cam-guide'));
    const status = el('p', 'rec-status');
    status.setAttribute('aria-live', 'polite');
    const actions = el('div', 'rec-actions');
    const cancel = el('button', 'rec-btn rec-btn-ghost', 'Annulla');
    const retake = el('button', 'rec-btn rec-btn-ghost', 'Rifai');
    const main = el('button', 'rec-btn rec-btn-main', 'Scatta');
    retake.hidden = true;
    for (const b of [cancel, retake, main]) b.type = 'button';
    actions.append(cancel, retake, main);
    dialog.append(title, hint, stage, status, actions);
    overlay.append(dialog);
    document.body.append(overlay);

    let stream = null;
    let shot = null;
    const close = file => {
      stream?.getTracks().forEach(t => t.stop());
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
      shot = null;
      live.hidden = false; still.hidden = true; retake.hidden = true;
      main.textContent = 'Scatta'; main.disabled = !stream;
      status.textContent = '';
    };
    main.onclick = async () => {
      if (shot) return close(shot);
      // The preview is mirrored like a mirror; the photo is kept the right way round
      const w = live.videoWidth, h = live.videoHeight;
      if (!w || !h) return;
      Object.assign(still, { width: w, height: h });
      still.getContext('2d').drawImage(live, 0, 0, w, h);
      const blob = await new Promise(r => still.toBlob(r, 'image/jpeg', 0.92));
      shot = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      live.hidden = true; still.hidden = false; retake.hidden = false;
      main.textContent = 'Usa questa foto';
      status.textContent = 'Ti piace? Se no, rifalla.';
      main.focus();
    };
    retake.onclick = () => { showLive(); main.focus(); };

    main.disabled = true;
    status.textContent = 'Attiviamo la fotocamera…';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(s => {
        if (!overlay.isConnected) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        live.srcObject = s;
        showLive();
        main.focus();
      })
      .catch(err => {
        status.textContent = err?.name === 'NotAllowedError'
          ? 'Per scattare serve il permesso di usare la fotocamera. Puoi darlo dalle impostazioni del browser, oppure caricare una foto.'
          : 'Non troviamo una fotocamera. Puoi caricare una foto.';
      });
  });
}
