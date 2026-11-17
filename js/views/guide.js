import { html, setHTML } from '../util.js';

export async function renderGuide(app) {
  setHTML(app, html`
    <div class="page-head"><div><h1>Filming guide</h1><div class="sub">Good footage matters more than anything else for accurate analysis.</div></div></div>

    <div class="grid grid-2">
      <div class="card">
        <h2>Camera positions</h2>
        <div class="guide-figure">${pitchDiagram()}</div>
        <p class="muted" style="font-size:.85rem;margin:8px 0 0">Top-down view of the bowling end. <strong>A</strong> = side-on camera, <strong>B</strong> = front-on camera, behind the bowler.</p>
      </div>
      <div class="card">
        <h2>Checklist</h2>
        <ul style="padding-left:18px;margin:0">
          <li><strong>Slow-motion:</strong> 120 or 240 fps. Release takes only a few hundredths of a second, so normal 30 fps video often misses it.</li>
          <li><strong>Tripod or fixed phone:</strong> the camera must not move or zoom during the clip.</li>
          <li><strong>Whole body in frame</strong> from the last 3–4 run-up strides through the follow-through, feet included.</li>
          <li><strong>One bowler in view</strong> if possible. Other people near the bowler can confuse the tracker.</li>
          <li><strong>Good light</strong>, with no strong backlight. Fitted clothing that contrasts with the background helps.</li>
          <li><strong>One delivery per clip</strong>, about 2–4 seconds long. Use the trim buttons if a clip is longer.</li>
          <li><strong>3–6 deliveries per session</strong>, ideally at least 2 side-on and 2 front-on.</li>
        </ul>
      </div>
      <div class="card">
        <h2>A · Side-on</h2>
        <ul style="padding-left:18px;margin:0">
          <li>Square to the bowling crease, 10–15 m from the line of the run-up, at hip height.</li>
          <li>Frame wide enough to see back-foot contact, front-foot contact and release.</li>
          <li>Measures: run-up speed, front-knee angle and collapse, stride length, trunk flexion, release height.</li>
        </ul>
      </div>
      <div class="card">
        <h2>B · Front-on</h2>
        <ul style="padding-left:18px;margin:0">
          <li>Directly behind the bowler, in line with the stumps and the run-up, looking down the pitch towards the batter. Set it at chest-to-head height; a little higher helps see over the run-up.</li>
          <li>Stay clear of the run-up (behind the run-up mark, or far enough back), and zoom so the bowler fills about half of the frame height at the crease.</li>
          <li>The bowler runs away from the camera. The app detects the camera position automatically, and you can override it in the clip settings if needed.</li>
          <li>Measures: action type (side-on, semi-open, front-on, mixed), shoulder counter-rotation (injury risk), hip–shoulder separation, side-bend, arm angle, head position, front-foot line.</li>
        </ul>
      </div>
      <div class="card">
        <h2>Slow-motion settings</h2>
        <p>When adding a clip, tell the app how it plays back:</p>
        <ul style="padding-left:18px;margin:0">
          <li><strong>Real speed:</strong> a normal video, or an original high-fps file that plays at normal speed on a computer (e.g. an iPhone slo-mo AirDropped as the original).</li>
          <li><strong>Slowed 4× / 8×:</strong> a slo-mo that was exported or shared so that it plays back slowed. 120 fps = 4×, 240 fps = 8×.</li>
        </ul>
        <p class="muted" style="margin-top:8px;font-size:.88rem">Getting this wrong only affects timing-based numbers (run-up speed). Angles and positions are unaffected, and you can change it later on the session page.</p>
      </div>
      <div class="card">
        <h2>Checking the events</h2>
        <p>The app finds <strong>back-foot contact</strong>, <strong>front-foot contact</strong> and <strong>release</strong> automatically. Events marked "estimate" need a look: scrub to the right frame and press <em>Set here</em>. Every measurement updates instantly.</p>
        <p class="muted" style="font-size:.88rem;margin:0">For the most accurate results, switch to the high-accuracy body-tracking model on the dashboard and re-process the session.</p>
      </div>
    </div>
  `);
}

function pitchDiagram() {
  // Top-down: run-up from the left, crease and stumps, pitch continuing to the right.
  return html`<svg viewBox="0 0 520 240" role="img" aria-label="Camera positions: A side-on, square to the crease. B front-on, behind the bowler in line with the stumps.">
    <rect x="150" y="80" width="360" height="80" rx="4" fill="color-mix(in srgb, var(--accent) 14%, transparent)" stroke="var(--border)"></rect>
    <line x1="190" y1="70" x2="190" y2="170" stroke="var(--text)" stroke-width="2"></line>
    <text x="196" y="66" font-size="11" fill="var(--muted)">popping crease</text>
    <rect x="166" y="114" width="6" height="12" fill="var(--text)"></rect>
    <rect x="488" y="114" width="6" height="12" fill="var(--text)"></rect>
    <text x="440" y="100" font-size="11" fill="var(--muted)">batter's end</text>
    <path d="M58 120 L150 120" stroke="var(--muted)" stroke-width="2" stroke-dasharray="6 5"></path>
    <polygon points="150,120 140,115 140,125" fill="var(--muted)"></polygon>
    <text x="70" y="110" font-size="11" fill="var(--muted)">run-up</text>
    <circle cx="190" cy="120" r="7" fill="#c0392b"></circle>
    <g>
      <rect x="176" y="200" width="28" height="18" rx="4" fill="var(--text)"></rect>
      <circle cx="190" cy="209" r="5" fill="var(--surface)"></circle>
      <path d="M190 198 L190 132" stroke="var(--ev-bfc)" stroke-width="2" stroke-dasharray="4 4"></path>
      <text x="212" y="214" font-size="13" font-weight="700" fill="var(--text)">A  side-on</text>
      <text x="212" y="230" font-size="11" fill="var(--muted)">10–15 m, square to crease</text>
    </g>
    <g>
      <rect x="14" y="111" width="18" height="18" rx="4" fill="var(--text)"></rect>
      <circle cx="23" cy="120" r="5" fill="var(--surface)"></circle>
      <path d="M34 120 L52 120" stroke="var(--ev-bfc)" stroke-width="2" stroke-dasharray="4 4"></path>
      <text x="8" y="152" font-size="13" font-weight="700" fill="var(--text)">B  front-on</text>
      <text x="8" y="168" font-size="11" fill="var(--muted)">behind the bowler,</text>
      <text x="8" y="182" font-size="11" fill="var(--muted)">in line with the stumps</text>
    </g>
  </svg>`;
}
