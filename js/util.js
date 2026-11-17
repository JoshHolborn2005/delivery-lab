// Small DOM + formatting helpers shared by every view.

export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function val(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}

/** Tagged template: interpolations are HTML-escaped unless they are Raw (e.g. nested html``). */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export function setHTML(el, content) {
  el.innerHTML = content instanceof Raw ? content.s : esc(content ?? '');
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Event delegation. */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function fmtDate(d) {
  if (!d) return '–';
  const date = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')) : new Date(d);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmt(v, dp = 0) {
  return v == null || !Number.isFinite(v) ? '–' : Number(v).toFixed(dp);
}
export function fmtSigned(v, dp = 0) {
  if (v == null || !Number.isFinite(v)) return '–';
  const s = Number(v).toFixed(dp);
  return v > 0 ? `+${s}` : s;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function median(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export function mean(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}
export function sd(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x));
  if (a.length < 2) return null;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

let toastTimer = null;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** Modal form dialog. Resolves with FormData on submit, or null on cancel. */
export function formDialog({ title, body, submitLabel = 'Save', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    setHTML(dlg, html`<form class="dialog-form" novalidate>
      <h2>${title}</h2>
      <div class="dialog-body">${body}</div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submitLabel}</button>
      </div>
    </form>`);
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    let result = null;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      result = new FormData(form);
      dlg.close();
    });
    dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    dlg.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  });
}

export async function confirmDialog(title, message, label = 'Delete') {
  const r = await formDialog({ title, body: html`<p>${message}</p>`, submitLabel: label, danger: true });
  return !!r;
}

export const GOALS = {
  pace: { label: 'Pace', blurb: 'Bowl faster: more km/h at release' },
  swing: { label: 'Swing', blurb: 'More, and more reliable, movement in the air' },
  accuracy: { label: 'Accuracy', blurb: 'Hit the target line and length more often' },
};

export const STYLE_LABELS = { fast: 'Fast', 'fast-medium': 'Fast-medium', medium: 'Medium pace' };
export const VIEW_LABELS = { side: 'Side-on', front: 'Front-on' };

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}
