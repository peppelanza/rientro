// Formazione and Esperienze, the same in onboarding and Il tuo profilo (components.js App Entry Row,
// App Edu Form, App Exp Form): the values for the page template. state.edu / state.exp hold the
// entry being written (with its id when it's an existing one); save and remove are the page's.
import { fmtMonth, textToMonth, toast } from './lib.js';

const nz = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

// The body for /api/me/experiences, or null (with a message) when something can't be read
export function expBody(e) {
  if (!nz(e.company)) { toast('Indica l’azienda.', { tone: 'err' }); return null; }
  const start = textToMonth(e.start_month);
  const end = e.current ? null : textToMonth(e.end_month);
  // which date, and why: the format, or a month that hasn't come yet
  const why = (t, label) => {
    const m = String(t ?? '').trim().match(/^(\d{1,2})\s*[/.\- ]\s*(\d{4})$/);
    return m && +m[1] >= 1 && +m[1] <= 12 && +m[2] > new Date().getFullYear() ? `${label}: la data non può essere nel futuro.` : `${label}: scrivi la data come mm/aaaa, per esempio 03/2021.`;
  };
  if (start === undefined) { toast(why(e.start_month, 'Inizio'), { tone: 'err' }); return null; }
  if (end === undefined) { toast(why(e.end_month, 'Fine'), { tone: 'err' }); return null; }
  if (start && end && end < start) { toast('La fine viene prima dell’inizio.', { tone: 'err' }); return null; }
  return { company: e.company.trim(), role: nz(e.role), city: nz(e.city), start_month: start, end_month: end, current: !!e.current };
}

export function entryVals({ state: s, profile: p, rerender, save, remove }) {
  const focus = key => setTimeout(() => document.querySelector(`[data-key="${key}"]`)?.focus(), 0);
  const open = (kind, entry, key) => { s.edu = kind === 'edu' ? entry : null; s.exp = kind === 'exp' ? entry : null; rerender(); focus(key); };
  const dates = e => [fmtMonth(e.start_month), e.current ? 'oggi' : fmtMonth(e.end_month)].filter(Boolean).join(' – ');
  return {
    eduItems: p.education.map((e, i) => ({
      editing: s.edu?.id === e.id, view: s.edu?.id !== e.id,
      row: { title: e.school, sub: e.degree, meta: e.years, first: i === 0, onEdit: () => open('edu', { ...e }, 'edu-school') },
    })),
    hasEduBox: p.education.length > 0 || !!s.edu, eduAdding: !!s.edu && !s.edu.id, eduNotEditing: !s.edu,
    eduFormProps: s.edu && {
      form: s.edu, onField: (k, v) => { s.edu[k] = v; }, onSave: save.edu, onDelete: () => remove.edu(s.edu.id),
      onCancel: () => { s.edu = null; rerender(); },
    },
    addEdu: () => open('edu', { school: '', degree: '', years: '' }, 'edu-school'),

    expItems: p.experiences.map((e, i) => ({
      editing: s.exp?.id === e.id, view: s.exp?.id !== e.id,
      row: { title: e.company, sub: e.role, meta: [dates(e), e.city].filter(Boolean).join(' · '), first: i === 0, onEdit: () => open('exp', { ...e }, 'exp-company') },
    })),
    hasExpBox: p.experiences.length > 0 || !!s.exp, expAdding: !!s.exp && !s.exp.id, expNotEditing: !s.exp,
    expFormProps: s.exp && {
      form: s.exp, onField: (k, v) => { s.exp[k] = v; }, onCurrent: c => { s.exp.current = c; rerender(); },
      onSave: save.exp, onDelete: () => remove.exp(s.exp.id), onCancel: () => { s.exp = null; rerender(); },
    },
    addExp: () => open('exp', { company: '', role: '', city: '', start_month: '', end_month: '', current: false }, 'exp-company'),
  };
}
