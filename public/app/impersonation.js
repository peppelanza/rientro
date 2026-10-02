// Admin "Accedi come": while the admin is signed in as someone else, every page
// gets a red frame around the screen and, bottom right, who they are signed in as with a way out.

export async function impersonationFrame() {
  if (location.pathname.startsWith('/admin')) return;
  const me = await fetch('/api/session').then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.impersonated) return;
  const name = [me.profile?.first_name, me.profile?.last_name].filter(Boolean).join(' ') || me.user.email;

  const frame = document.createElement('div');
  frame.className = 'imp-frame';
  frame.setAttribute('aria-hidden', 'true');
  const box = document.createElement('div');
  box.className = 'imp-box';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Accesso come altro utente');
  box.innerHTML = '<span>Loggato come <b></b></span><button type="button">Esci</button>';
  box.querySelector('b').textContent = name;
  const btn = box.querySelector('button');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const r = await fetch('/api/auth/impersonation/stop', { method: 'POST', headers: { 'x-requested-with': 'rientro' } })
      .then(x => x.json()).catch(() => null);
    location.href = r?.go || '/accedi';
  });
  document.body.append(frame, box);
}
