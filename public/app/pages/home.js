import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Fai rete con chi torna';

// Content copied from the design logic (Rientro 01 Landing e Accesso v2).
export const forWho = [
  { t: 'Chi sta tornando', d: "Anni all'estero, competenze da riportare. Vuoi tornare con un progetto, non solo con un trasloco." },
  { t: 'Chi si trasferisce', d: "Non sei italiano ma hai scelto l'Italia. Ti serve qualcuno che conosca il contesto." },
  { t: 'Chi ci sta pensando', d: 'Non hai ancora deciso. Conoscere le persone giuste può essere il motivo per farlo.' },
];
export const principles = [
  { t: 'Profili rivisti a mano', d: 'Niente account vuoti o anonimi.' },
  { t: 'Nessun punteggio', d: 'Ti mostriamo cosa si completa, non percentuali.' },
  { t: 'Messaggi solo con consenso', d: "La chat si apre dopo l'accettazione." },
  { t: 'Gratuito', d: 'Al lancio, per tutti.' },
];
const steps = [
  { n: '01', t: 'Crea il tuo profilo', d: 'Percorso, idea, dove vivi e dove vuoi vivere. Con LinkedIn si compila quasi da solo.' },
  { n: '02', t: 'Lo rivediamo', d: 'Ogni profilo viene letto da una persona prima di andare online.' },
  { n: '03', t: 'Scopri persone', d: 'Filtra per città, settori, competenze e tempo. Nessun punteggio, solo persone.' },
  { n: '04', t: 'Connettiti e parla', d: 'Invii una richiesta. Se viene accettata, si apre la chat.' },
];
// Illustrative example profiles from the design (not real members).
const heroPeople = [['Giulia', 'Product Strategist', 'LONDRA', 'MILANO'], ['Marco', 'Software Engineer', 'BERLINO', 'CAGLIARI'], ['Sara', 'Product Designer', 'AMSTERDAM', 'TORINO'], ['Luca', 'Ex consulente strategico', 'NEW YORK', 'NAPOLI']]
  .map(([n, r, a, b], i) => ({ n, r, a, b, mt: i % 2 ? '36px' : '0' }));

// Time left until launch, as the four countdown tiles
const UNITS = [['d', 'Giorni', 86400], ['h', 'Ore', 3600], ['m', 'Minuti', 60], ['s', 'Secondi', 1]];
function timeLeft(at) {
  let s = Math.max(0, Math.floor((at - Date.now()) / 1000));
  return UNITS.map(([k, l, size]) => { const v = Math.floor(s / size); s -= v * size; return { k, l, v: String(v).padStart(2, '0') }; });
}

// One landing page. Before launch (LAUNCHED flag off and launch date ahead) the example
// profiles give way to a live countdown to the launch date.
export default class extends Page {
  async load() {
    const [me, launch] = await Promise.all([peekMe(), fetch('/api/public/launch').then(r => r.json()).catch(() => ({ launched: true }))]);
    Object.assign(this.state, { me, launched: launch.launched, launchAt: Date.parse(launch.launch_at) });
    if (!launch.launched) this.timer = setInterval(() => this.tick(), 1000);
  }
  componentWillUnmount() { clearInterval(this.timer); }

  // Updates the digits in place every second; reloads when the countdown ends
  tick() {
    if (Date.now() >= this.state.launchAt) { clearInterval(this.timer); location.reload(); return; }
    for (const { k, v } of timeLeft(this.state.launchAt)) {
      const el = document.querySelector(`[data-cd="${k}"]`);
      if (el && el.textContent !== v) el.textContent = v;
    }
  }

  renderVals() {
    const me = this.state.me;
    const prelaunch = this.state.launched === false;
    return {
      launched: this.state.launched !== false, prelaunch, forWho, steps, principles, heroPeople,
      countdown: prelaunch ? timeLeft(this.state.launchAt) : [],
      launchText: prelaunch ? 'Apre il ' + new Date(this.state.launchAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1° ') : '',
      countdownLabel: 'Tempo che manca al lancio',
      loginLabel: me ? 'Il tuo spazio' : 'Accedi', loginHref: me ? homeFor(me) : '/accedi',
      enter: () => { location.href = me ? homeFor(me) : '/accedi'; },
      how: () => document.getElementById('come-funziona')?.scrollIntoView(),
    };
  }
}
