// Places count by province, everywhere: a city chosen (in the filters, in Dove vorresti vivere, as
// the city one lives in) stands for its whole province. Benevento finds who chose Paupisi (BN) and
// the other way round; two members wanting Paupisi and Benevento are "vicini" for the matches.
// Comuni from catalog.js ([nome, sigla, regione, popolazione]); a few names exist in two provinces
// (Castro BG / LE, Samone, Peglio…): such a name stands for both.
import { COMUNI } from './catalog.js';

export const PROVINCE_NAMES = {
  AG: 'Agrigento', AL: 'Alessandria', AN: 'Ancona', AO: 'Aosta', AP: 'Ascoli Piceno', AQ: "L'Aquila", AR: 'Arezzo', AT: 'Asti', AV: 'Avellino',
  BA: 'Bari', BG: 'Bergamo', BI: 'Biella', BL: 'Belluno', BN: 'Benevento', BO: 'Bologna', BR: 'Brindisi', BS: 'Brescia', BT: 'Barletta-Andria-Trani', BZ: 'Bolzano',
  CA: 'Cagliari', CB: 'Campobasso', CE: 'Caserta', CH: 'Chieti', CL: 'Caltanissetta', CN: 'Cuneo', CO: 'Como', CR: 'Cremona', CS: 'Cosenza', CT: 'Catania', CZ: 'Catanzaro',
  EN: 'Enna', FC: 'Forlì-Cesena', FE: 'Ferrara', FG: 'Foggia', FI: 'Firenze', FM: 'Fermo', FR: 'Frosinone', GE: 'Genova', GO: 'Gorizia', GR: 'Grosseto',
  IM: 'Imperia', IS: 'Isernia', KR: 'Crotone', LC: 'Lecco', LE: 'Lecce', LI: 'Livorno', LO: 'Lodi', LT: 'Latina', LU: 'Lucca',
  MB: 'Monza e della Brianza', MC: 'Macerata', ME: 'Messina', MI: 'Milano', MN: 'Mantova', MO: 'Modena', MS: 'Massa-Carrara', MT: 'Matera',
  NA: 'Napoli', NO: 'Novara', NU: 'Nuoro', OR: 'Oristano', PA: 'Palermo', PC: 'Piacenza', PD: 'Padova', PE: 'Pescara', PG: 'Perugia', PI: 'Pisa', PN: 'Pordenone', PO: 'Prato',
  PR: 'Parma', PT: 'Pistoia', PU: 'Pesaro e Urbino', PV: 'Pavia', PZ: 'Potenza', RA: 'Ravenna', RC: 'Reggio Calabria', RE: 'Reggio Emilia', RG: 'Ragusa', RI: 'Rieti',
  RM: 'Roma', RN: 'Rimini', RO: 'Rovigo', SA: 'Salerno', SI: 'Siena', SO: 'Sondrio', SP: 'La Spezia', SR: 'Siracusa', SS: 'Sassari', SU: 'Sud Sardegna', SV: 'Savona',
  TA: 'Taranto', TE: 'Teramo', TN: 'Trento', TO: 'Torino', TP: 'Trapani', TR: 'Terni', TS: 'Trieste', TV: 'Treviso', UD: 'Udine', VA: 'Varese', VB: 'Verbano-Cusio-Ossola',
  VC: 'Vercelli', VE: 'Venezia', VI: 'Vicenza', VR: 'Verona', VT: 'Viterbo', VV: 'Vibo Valentia',
};

const provincesByName = new Map();
const comuniByProvince = new Map();
for (const [name, sigla] of COMUNI) {
  if (!provincesByName.has(name)) provincesByName.set(name, new Set());
  provincesByName.get(name).add(sigla);
  if (!comuniByProvince.has(sigla)) comuniByProvince.set(sigla, []);
  comuniByProvince.get(sigla).push(name);
}

const NONE = new Set();
// The province(s) of a comune by its name (none for a foreign city or free text)
export const provincesOf = name => provincesByName.get(name) ?? NONE;
// Every comune of the same province(s) as this one, itself included
export const sameProvinceComuni = name => [...new Set([...provincesOf(name)].flatMap(s => comuniByProvince.get(s) ?? []))];
// Two places in the same province (the same name counts, also for places outside Italy)
export function sameProvince(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = provincesOf(a);
  for (const s of provincesOf(b)) if (pa.has(s)) return true;
  return false;
}
// "provincia di Benevento" (the first province, for a name in two)
export const provinceLabel = name => { const s = provincesOf(name).values().next().value; return s ? `provincia di ${PROVINCE_NAMES[s] ?? s}` : null; };
