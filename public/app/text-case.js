// Names as people would read them, the same on the server (src/profiles.js, the Google / LinkedIn
// names) and in the browser (onboarding.js says it before Continua).
// Pure: no browser nor server code in here.

const letters = s => (String(s).match(/\p{L}/gu) || []);

// A real name, not initials: at least two letters, not one letter repeated ("G", "G.", "L", "Xx", "aaa")
export function realName(s) {
  const l = letters(s).map(c => c.toLowerCase());
  return l.length >= 2 && new Set(l).size >= 2;
}

// "GIUSEPPE", "giuseppe" → "Giuseppe"; "D'ANGELO" → "D'Angelo", "DE LUCA" → "De Luca",
// "ROSSI-BIANCHI" → "Rossi-Bianchi". Names already written with capitals as wanted stay as they are
// ("McDonald", "de Luca").
export function nameCase(s) {
  if (typeof s !== 'string') return s;
  const l = letters(s);
  const allUpper = l.length > 1 && l.every(c => c === c.toUpperCase() && c !== c.toLowerCase());
  const allLower = l.length > 0 && l.every(c => c === c.toLowerCase() && c !== c.toUpperCase());
  if (!allUpper && !allLower) return s;
  return s.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
}
