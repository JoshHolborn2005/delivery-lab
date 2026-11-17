# Delivery Lab: bowling action analysis

A web app that analyses **pace and seam bowling actions** from phone video. Coaches upload 3–6 clips per
session (side-on and front-on). The app tracks the bowler's body in the browser, finds the key moments of
the delivery and measures the action against a research-based reference model. It then gives
**goal-specific focus areas, drills and cues** for pace, swing or accuracy. Teams and players are managed in
the app, and every analysed delivery feeds a squad **Insights** database.

## Live app

**https://joshholborn2005.github.io/delivery-lab/**: works on any phone or computer. Add it to the iPhone
home screen from Safari's share menu. Data is stored on each device separately.

To publish changes, commit and push to `main`. GitHub Pages redeploys in about a minute.

## Running it locally

No install needed: it uses the Python that ships with macOS.

```bash
cd "/Users/joshuaholborn/Cricket App"
python3 -m http.server 5173 --bind 127.0.0.1
```

Then open <http://localhost:5173>. Use Chrome or Safari (both can decode iPhone HEVC `.mov` files).
The pose model (~9 MB, or ~30 MB for high accuracy) downloads from Google's CDN on first use.

**Biomechanics tests:** open <http://localhost:5173/tests/> (111 checks against synthetic actions with known
angles and event timings).

To use it on a phone at the nets, it needs to be hosted on HTTPS (e.g. GitHub Pages or Netlify). It's a
static site with no build step.

## How it works

```
video ──► pose/processor.js  (MediaPipe Pose Landmarker, frame by frame, in the browser)
      ──► biomech/clean.js    (gap fill, left/right swap fixes, handedness check, smoothing, body scale)
      ──► biomech/events.js   (back-foot contact, front-foot contact, release, all coach-editable)
      ──► biomech/metrics.js  (per-clip measurements: side-on and front-on sets)
      ──► biomech/analysis.js (session medians, goal scores, injury flags, ranked focus areas)
      ──► views/              (dual raw / motion-capture player, breakdown, drills, insights)
```

* **Side-on clips** measure run-up speed, front-knee angle at landing and release, front-knee collapse,
  stride length, trunk flexion and release height.
* **Front-on clips** measure action type (side-on / semi-open / front-on / mixed), shoulder
  counter-rotation, hip–shoulder separation, side-bend, arm angle, head tilt and position, and front-foot line.
* **Session-level** repeatability compares the clips with each other.
* **Injury flags** (mixed action, excessive side-bend) are always shown, whatever the goal.

`js/biomech/` has no DOM access and is plain functions over joint coordinates, so it can be ported to a
native iPhone app (e.g. Swift with Apple Vision body pose) with the same logic.

## Data

Everything is stored **on the device** in IndexedDB (`js/db.js`): teams, players, sessions, clips, pose
tracks and videos. The dashboard exports and imports a JSON backup of results (no videos). All storage
goes through `db.js`, so it can later be swapped for a cloud backend (e.g. Supabase) for multi-coach teams.

## Reference model and evidence

`js/biomech/reference.js` holds every metric's target range, its relevance (0–3) to pace / swing /
accuracy, and an evidence label: *strong*, *moderate* or *coaching consensus*. Ranges are approximate
values for **senior** pace bowlers, drawn from published research (Portus et al. 2004, Worthington et al. 2013,
Elliott 2000, Ranson et al. 2008, Glazier & Wheat 2014) and coaching guidance. They are a starting point,
and a qualified biomechanist should review them. The Insights page tests the relationships against your
own squad's logged deliveries.

## Known limitations

* Single-camera 2D estimates: expect a few degrees of error, more at 30 fps or in poor light.
* Front-on 3D alignment (counter-rotation, hip–shoulder separation) relies on the pose model's depth
  estimate. Treat it as screening and confirm by eye.
* Seam position and wrist (the main drivers of swing) are too small to track and must be checked by eye.
* Front-on clips are filmed from **behind the bowler**, in line with the stumps. The app auto-detects a clip
  filmed from in front instead (using apparent size change and face direction), and coaches can override it.

## Project layout

```
index.html, css/styles.css
js/app.js            router
js/db.js             IndexedDB storage + backup
js/util.js           DOM / formatting helpers
js/pose/processor.js MediaPipe video processing
js/biomech/          analysis (portable, no DOM)
js/views/            screens and components
tests/               synthetic-action generator, test runner, dev seeding script
```
