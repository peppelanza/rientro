// Branded emails (rientro.it): one layout for every message, table-based with inline styles so it
// holds up in Gmail, Outlook and Apple Mail. Brand: lavender page, white card, "Rientro." in italic
// serif with the violet dot, Unbounded headings, violet buttons. Web fonts load where the client
// allows it (Apple Mail, iOS); elsewhere the fallbacks keep the same feel.
import { config } from './config.js';

const C = { page: '#E9E6F5', card: '#FFFFFF', ink: '#1A1726', body: '#4A4560', muted: '#8C84AE', accent: '#6C4DF5', accentDeep: '#3E2BA8', tint: '#EFEBFF', line: '#ECE8F7' };
const HEAD = "'Unbounded', 'Helvetica Neue', Arial, sans-serif";
const BODY = "'Geist', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const MONO = "'Geist Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const url = path => `${config.baseUrl}${path}`;

// Pieces for the body (all return HTML)
export const h1 = text => `<h1 style="margin:0 0 14px;font-family:${HEAD};font-size:26px;line-height:1.15;font-weight:600;letter-spacing:-0.04em;color:${C.ink}">${text}</h1>`;
export const p = (text, { size = 16, color = C.body, margin = '0 0 16px' } = {}) => `<p style="margin:${margin};font-family:${BODY};font-size:${size}px;line-height:1.55;color:${color}">${text}</p>`;
export const eyebrow = text => `<p style="margin:0 0 10px;font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.accent}">${text}</p>`;
export const button = (label, href) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="border-radius:999px;background:${C.accent}"><a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${BODY};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px">${label}</a></td></tr></table>`;
export const note = text => `<div style="margin:0 0 16px;padding:12px 16px;border-radius:16px;background:${C.tint};font-family:${BODY};font-size:15px;line-height:1.5;color:${C.accentDeep}">${text}</div>`;
export const code = text => `<div style="margin:6px 0 22px;padding:18px 0;border-radius:20px;background:${C.tint};text-align:center;font-family:${MONO};font-size:34px;font-weight:600;letter-spacing:10px;color:${C.ink}">${text}</div>`;
// Numbered steps ("Come funziona")
export const steps = items => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 20px">${items.map(([title, text], i) => `
<tr><td valign="top" style="width:38px;padding:0 0 16px"><div style="width:28px;height:28px;border-radius:50%;background:${C.tint};color:${C.accentDeep};font-family:${HEAD};font-size:13px;font-weight:600;line-height:28px;text-align:center">${i + 1}</div></td>
<td valign="top" style="padding:3px 0 16px"><div style="font-family:${BODY};font-size:15px;font-weight:600;color:${C.ink}">${title}</div><div style="font-family:${BODY};font-size:14px;line-height:1.5;color:${C.body}">${text}</div></td></tr>`).join('')}</table>`;
// One person in a digest: initials/photo-free row (images are often blocked), name, what happened
export const row = ({ title, text, href }) => `<tr><td style="padding:14px 0;border-top:1px solid ${C.line}"><a href="${esc(href)}" style="text-decoration:none"><div style="font-family:${BODY};font-size:15px;font-weight:600;color:${C.ink}">${title}</div>${text ? `<div style="margin-top:3px;font-family:${BODY};font-size:14px;line-height:1.45;color:${C.body}">${text}</div>` : ''}</a></td></tr>`;
export const rows = items => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border-bottom:1px solid ${C.line}">${items.join('')}</table>`;

/**
 * The whole email. `body` is HTML built with the pieces above; `preheader` is the grey line next to
 * the subject in the inbox; `footer` explains why this arrived (notifications link to the settings).
 */
export function layout({ preheader = '', body, footer = '' }) {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600&family=Geist:wght@400;600&family=Geist+Mono&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
<title>Rientro</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${C.page}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px">
<tr><td style="padding:0 8px 18px"><a href="${url('/')}" style="text-decoration:none;font-family:${SERIF};font-style:italic;font-size:30px;line-height:1;color:${C.ink}">Rientro<span style="color:${C.accent};font-style:normal">.</span></a></td></tr>
<tr><td style="background:${C.card};border-radius:28px;padding:36px 32px">${body}</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${BODY};font-size:12px;line-height:1.6;color:${C.muted}">${footer ? `${footer}<br>` : ''}Rientro · la community di chi torna in Italia o al Sud per costruire qualcosa · <a href="${url('/')}" style="color:${C.muted}">rientro.it</a></td></tr>
</table></td></tr></table></body></html>`;
}

// Plain-text twin of every email (some clients and spam filters prefer it)
export const textFooter = '\n\n—\nRientro · rientro.it';
