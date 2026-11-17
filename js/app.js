// Hash router. Each view is `async (container, nav, ...params) => void` and may register
// cleanup with nav.onLeave(). nav.alive() is false once the user has navigated away.

import { renderHome } from './views/home.js';
import { renderTeams, renderTeam } from './views/teams.js';
import { renderPlayer } from './views/player.js';
import { renderNewSession } from './views/newSession.js';
import { renderSession } from './views/session.js';
import { renderInsights } from './views/insights.js';
import { renderLibrary } from './views/library.js';
import { renderGuide } from './views/guide.js';
import { html, setHTML, $$ } from './util.js';

const routes = [
  [/^#?\/?$/, renderHome, 'home'],
  [/^#\/teams$/, renderTeams, 'teams'],
  [/^#\/team\/([\w-]+)$/, renderTeam, 'teams'],
  [/^#\/player\/([\w-]+)$/, renderPlayer, 'teams'],
  [/^#\/player\/([\w-]+)\/new$/, renderNewSession, 'teams'],
  [/^#\/session\/([\w-]+)$/, renderSession, 'teams'],
  [/^#\/insights$/, renderInsights, 'insights'],
  [/^#\/library$/, renderLibrary, 'library'],
  [/^#\/guide$/, renderGuide, 'guide'],
];

let current = null;

async function route(opts = {}) {
  if (opts instanceof Event) opts = {};
  if (current) {
    current.active = false;
    for (const fn of current.leave) { try { fn(); } catch (e) { console.error(e); } }
  }
  const nav = { active: true, leave: [] };
  nav.alive = () => nav.active;
  nav.onLeave = (fn) => nav.leave.push(fn);
  nav.refresh = ({ keepScroll = true } = {}) => route({ keepScroll });
  current = nav;

  const hash = location.hash || '#/';
  const app = document.getElementById('app');
  // A fresh container per render, so delegated listeners never leak between views.
  const view = document.createElement('div');
  app.replaceChildren(view);
  for (const [re, fn, section] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
    const y = window.scrollY;
    try {
      await fn(view, nav, ...m.slice(1));
    } catch (e) {
      console.error(e);
      if (nav.alive()) {
        setHTML(view, html`<div class="card empty"><h2>Something went wrong</h2><p>${e.message || String(e)}</p><a class="btn" href="#/">Back to dashboard</a></div>`);
      }
    }
    if (nav.alive()) window.scrollTo(0, opts.keepScroll ? y : 0);
    return;
  }
  setHTML(view, html`<div class="card empty"><h2>Page not found</h2><a class="btn" href="#/">Back to dashboard</a></div>`);
}

window.addEventListener('hashchange', route);
route();
