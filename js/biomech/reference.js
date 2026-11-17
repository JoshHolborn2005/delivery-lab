// Reference model for senior pace / seam bowlers.
//
// Ranges are approximate values drawn from published fast-bowling biomechanics research and coaching
// guidance. They are a starting point for coaching conversations, not a validated diagnostic model,
// and should be reviewed by a qualified biomechanist / coach. The Insights page lets a squad test
// these relationships against its own logged deliveries.
//
// good / fair: [low, high] bands. Outside `fair` = "work on". `weights` = relevance (0–3) per goal.
// evidence: 'strong' (consistent findings across studies), 'moderate' (some studies / mixed),
//           'consensus' (widely coached, little controlled research).

export const SOURCES = {
  portus2004: 'Portus, Mason, Elliott, Pfitzner & Done (2004). Technique factors related to ball release speed and trunk injuries in high performance cricket fast bowlers. Sports Biomechanics.',
  worthington2013: 'Worthington, King & Ranson (2013). Relationships between fast bowling technique and ball release speed in cricket. Journal of Applied Biomechanics.',
  elliott2000: 'Elliott (2000). Back injuries and the fast bowler in cricket. Journal of Sports Sciences.',
  ranson2008: 'Ranson, Burnett, King, Patel & O\'Sullivan (2008). The relationship between bowling action classification and three-dimensional lower trunk motion in fast bowlers in cricket. Journal of Sports Sciences.',
  glazier2014: 'Glazier & Wheat (2014). An integrated approach to the biomechanics and motor control of cricket fast bowling techniques. Sports Medicine.',
  winter: 'Winter. Biomechanics and Motor Control of Human Movement (segment-length proportions used for scaling).',
  coaching: 'Coaching consensus from fast-bowling coach education. Widely taught, but with little controlled research.',
};

export const EVIDENCE = {
  strong: { label: 'Strong evidence', weight: 1 },
  moderate: { label: 'Moderate evidence', weight: 0.85 },
  consensus: { label: 'Coaching consensus', weight: 0.7 },
};

const INF = Infinity;

export const METRICS = [
  // ---------------------------------------------------------------- Side-on
  {
    id: 'approachSpeed', view: 'side', label: 'Run-up speed at back-foot contact', short: 'Run-up speed', unit: 'm/s', dp: 1,
    good: [5.5, INF], fair: [4.5, INF], scaleMin: 3, scaleMax: 7.5,
    weights: { pace: 3, swing: 0, accuracy: 0 }, evidence: 'moderate', sources: ['worthington2013', 'glazier2014'],
    what: 'How fast the bowler\'s hips are travelling as the back foot lands, estimated from the side-on clip and the player\'s height.',
    why: { pace: 'Momentum built up in the run-up is passed up through the body into the ball. Quicker bowlers usually arrive at the crease faster, as long as their action can control it.' },
    low: { summary: 'The run-up is arriving at the crease slowly, leaving pace in the tank.', drills: ['runup-gates', 'runup-rhythm'], cues: ['Build up smoothly: be at your fastest in the last 3–4 strides', 'Run tall, with relaxed shoulders and arms driving forward'] },
  },
  {
    id: 'frontKneeFFC', view: 'side', label: 'Front-knee angle at front-foot contact', short: 'Front knee at landing', unit: '°', dp: 0,
    good: [155, INF], fair: [140, INF], scaleMin: 110, scaleMax: 185,
    weights: { pace: 1, swing: 0, accuracy: 0 }, evidence: 'moderate', sources: ['portus2004', 'worthington2013'],
    what: 'Angle at the front knee (hip–knee–ankle) when the front foot lands. 180° is a straight leg.',
    why: { pace: 'Landing on a straighter leg makes it easier to brace and keep the knee firm through to release.' },
    low: { summary: 'The front leg lands already well bent, which makes it hard to brace against.', drills: ['brace-walkthrough', 'stride-markers'], cues: ['Reach out with a long, firm front leg', 'Land heel-first with the knee almost straight'] },
  },
  {
    id: 'frontKneeBR', view: 'side', label: 'Front-knee angle at release', short: 'Front knee at release', unit: '°', dp: 0,
    good: [160, INF], fair: [145, INF], scaleMin: 110, scaleMax: 185,
    weights: { pace: 3, swing: 0, accuracy: 1 }, evidence: 'strong', sources: ['portus2004', 'worthington2013'],
    what: 'Angle at the front knee at ball release. 180° is a straight leg.',
    why: { pace: 'A straighter, braced front knee at release is one of the most consistent technical markers of faster bowlers. It acts as a pivot that turns forward momentum into arm and trunk speed.', accuracy: 'A stable front leg gives a consistent release height and point.' },
    low: { summary: 'The front knee is bent at release, so momentum is being absorbed instead of passed into the ball.', drills: ['brace-walkthrough', 'stick-landings', 'stride-markers'], cues: ['Land on a strong front leg and push the ground away', 'Think "pole vault": brace and go over the top'] },
  },
  {
    id: 'frontKneeFlex', view: 'side', label: 'Front-knee collapse (FFC → release)', short: 'Front-knee collapse', unit: '°', dp: 0,
    good: [0, 10], fair: [0, 25], scaleMin: 0, scaleMax: 45,
    weights: { pace: 2, swing: 0, accuracy: 1 }, evidence: 'strong', sources: ['portus2004', 'worthington2013'],
    what: 'How many degrees the front knee bends after the front foot lands, before release.',
    why: { pace: 'Front-knee "collapse" soaks up the energy that a braced leg would pass up the chain.', accuracy: 'A collapsing front leg lowers and varies the release point.' },
    high: { summary: 'The front knee is giving way after landing.', drills: ['stick-landings', 'brace-walkthrough', 'stride-markers'], cues: ['Firm front leg: no give', 'Stand tall over the front foot at release'] },
  },
  {
    id: 'strideLength', view: 'side', label: 'Delivery stride length', short: 'Stride length', unit: '% height', dp: 0,
    good: [75, 90], fair: [65, 100], scaleMin: 50, scaleMax: 115,
    weights: { pace: 1, swing: 0, accuracy: 1 }, evidence: 'moderate', sources: ['portus2004', 'glazier2014'],
    what: 'Distance from the back-foot landing spot to the front-foot landing spot, as a percentage of the bowler\'s height.',
    why: { pace: 'A powerful stride helps deceleration and bracing, but an over-long stride usually causes the front knee to collapse.', accuracy: 'A repeatable stride length gives a repeatable release point.' },
    low: { summary: 'The delivery stride is short, which limits the bound into the crease.', drills: ['stride-markers', 'runup-gates'], cues: ['A longer, more powerful bound into the crease', 'Drive the front knee up and out'] },
    high: { summary: 'The delivery stride is very long, which often costs front-knee bracing and balance.', drills: ['stride-markers', 'brace-walkthrough'], cues: ['Shorten the stride slightly so the front leg can brace', 'Land "under" yourself, not reaching'] },
  },
  {
    id: 'trunkFlexBR', view: 'side', label: 'Forward trunk flexion at release', short: 'Trunk flexion at release', unit: '°', dp: 0,
    good: [25, 55], fair: [15, 65], scaleMin: -10, scaleMax: 80,
    weights: { pace: 1, swing: 0, accuracy: 0 }, evidence: 'moderate', sources: ['worthington2013', 'glazier2014'],
    what: 'How far the trunk (hips to shoulders) is tilted forward from vertical at release.',
    why: { pace: 'Driving the trunk forward over the front leg adds speed at the shoulder, and so at the hand.' },
    low: { summary: 'The trunk is still fairly upright at release.', drills: ['chest-over-knee', 'medball-overhead'], cues: ['Drive the chest down over the front thigh', 'Bowl through the ball, not at it'] },
    high: { summary: 'The trunk is folding forward very early, which often means a low release.', drills: ['tall-release', 'brace-walkthrough'], cues: ['Stay tall up to release, then follow through'] },
  },
  {
    id: 'trunkFlexChange', view: 'side', label: 'Trunk flexion from FFC to release', short: 'Trunk flexion range', unit: '°', dp: 0,
    good: [30, INF], fair: [15, INF], scaleMin: -10, scaleMax: 70,
    weights: { pace: 2, swing: 0, accuracy: 0 }, evidence: 'moderate', sources: ['worthington2013'],
    what: 'How much the trunk flexes forward between front-foot contact and release.',
    why: { pace: 'Faster bowlers tend to flex the trunk forward strongly over the braced front leg during this phase.' },
    low: { summary: 'Little forward trunk movement between landing and release.', drills: ['medball-overhead', 'chest-over-knee'], cues: ['Whip the chest over the front leg', 'Pull the front arm down hard to the hip'] },
  },
  {
    id: 'releaseHeight', view: 'side', label: 'Release height (wrist)', short: 'Release height', unit: '% height', dp: 0,
    good: null, scaleMin: 90, scaleMax: 135,
    weights: { pace: 0, swing: 0, accuracy: 0 }, evidence: 'consensus', sources: ['coaching'],
    what: 'Height of the bowling wrist at release as a percentage of the bowler\'s height. Not scored, but used to check how repeatable the action is.',
    why: {},
  },

  // ---------------------------------------------------------------- Front-on
  {
    id: 'shoulderAlignBFC', view: 'front', label: 'Shoulder alignment at back-foot contact', short: 'Shoulder alignment (BFC)', unit: '°', dp: 0,
    good: null, scaleMin: -30, scaleMax: 100,
    weights: { pace: 0, swing: 0, accuracy: 0 }, evidence: 'strong', sources: ['portus2004', 'ranson2008'],
    what: '0° = shoulders fully side-on (pointing down the pitch), 90° = fully front-on. Used to classify the action. It is not good or bad in itself.',
    why: {},
  },
  {
    id: 'counterRotation', view: 'front', label: 'Shoulder counter-rotation', short: 'Counter-rotation', unit: '°', dp: 0,
    good: [0, 20], fair: [0, 30], scaleMin: 0, scaleMax: 60,
    weights: { pace: 0, swing: 0, accuracy: 1 }, evidence: 'strong', sources: ['portus2004', 'elliott2000', 'ranson2008'],
    what: 'How far the shoulders twist back to a more side-on position between back-foot and front-foot contact.',
    why: { accuracy: 'Large counter-rotation means the upper and lower body are working against each other. Above about 30° it is the defining feature of a "mixed" action, the pattern most linked to lower-back stress fractures.' },
    high: { summary: 'The shoulders counter-rotate a lot during the delivery stride (mixed-action pattern).', drills: ['alignment-match', 'mirror-freeze', 'anti-side-bend'], cues: ['Hips and shoulders point the same way at back-foot landing', 'Commit to one action: side-on or front-on'] },
  },
  {
    id: 'hipShoulderSepFFC', view: 'front', label: 'Hip–shoulder separation at front-foot contact', short: 'Hip–shoulder separation', unit: '°', dp: 0,
    good: [12, 45], fair: [5, 55], scaleMin: -20, scaleMax: 70,
    weights: { pace: 2, swing: 0, accuracy: 0 }, evidence: 'moderate', sources: ['worthington2013', 'glazier2014'],
    what: 'How far the hips have rotated towards the batter ahead of the shoulders when the front foot lands.',
    why: { pace: 'Hips leading the shoulders stretches the trunk muscles, which then "unwind" to add speed, like the X-factor in a golf swing.' },
    low: { summary: 'Hips and shoulders rotate together, so there is little stretch to unwind.', drills: ['medball-rotational', 'hip-lead'], cues: ['Hips lead, shoulders follow', 'Keep the front shoulder closed a split-second longer'] },
    high: { summary: 'Very large hip–shoulder separation. Check this is not part of a mixed action.', drills: ['alignment-match', 'mirror-freeze'], cues: ['Let the shoulders follow the hips smoothly'] },
  },
  {
    id: 'lateralFlexBR', view: 'front', label: 'Side-bend (lateral trunk flexion) at release', short: 'Side-bend at release', unit: '°', dp: 0,
    good: [15, 40], fair: [5, 50], scaleMin: -15, scaleMax: 65,
    weights: { pace: 1, swing: 1, accuracy: 2 }, evidence: 'moderate', sources: ['ranson2008', 'worthington2013'],
    what: 'How far the trunk leans away from the bowling arm at release, seen front-on.',
    why: { pace: 'Some side-bend helps get the arm high and adds speed.', swing: 'Excessive lean tilts the arm and seam off upright.', accuracy: 'Falling away to the side makes the release direction harder to repeat. Large side-bend also loads the lower back.' },
    low: { summary: 'Very little side-bend. The bowler may be "short" over the top.', drills: ['chest-over-knee'], cues: ['Get up and over the front leg'] },
    high: { summary: 'The trunk is falling away sideways at release.', drills: ['anti-side-bend', 'tall-release', 'target-line'], cues: ['Stay tall over the front leg', 'Head over the front foot'] },
  },
  {
    id: 'armVerticalBR', view: 'front', label: 'Bowling-arm angle from vertical at release', short: 'Arm angle at release', unit: '°', dp: 0,
    good: [-15, 15], fair: [-25, 30], scaleMin: -45, scaleMax: 60,
    weights: { pace: 0, swing: 3, accuracy: 2 }, evidence: 'consensus', sources: ['coaching'],
    what: 'Bowling arm (shoulder to wrist) relative to true vertical at release, seen front-on. Positive = arm out wide towards the bowling side (round-arm). Negative = past the head.',
    why: { swing: 'A high, near-vertical arm makes it much easier to present an upright, stable seam, which is the basis of conventional swing.', accuracy: 'A high arm keeps the hand travelling straight down the target line.' },
    low: { summary: 'The arm is falling past the head at release.', drills: ['tall-release', 'anti-side-bend'], cues: ['Arm straight up over the shoulder, not over the head'] },
    high: { summary: 'The arm is slinging round, away from vertical.', drills: ['brush-ear', 'seam-flicks'], cues: ['Brush the ear with the bowling arm', 'High hand: reach for the sky at release'] },
  },
  {
    id: 'headTiltBR', view: 'front', label: 'Head tilt (eye line) at release', short: 'Head tilt', unit: '°', dp: 0,
    good: [0, 15], fair: [0, 30], scaleMin: 0, scaleMax: 50,
    weights: { pace: 0, swing: 1, accuracy: 2 }, evidence: 'consensus', sources: ['coaching'],
    what: 'Angle of the eye line from horizontal at release.',
    why: { accuracy: 'Level eyes give a stable visual reference for line and length.', swing: 'A tilted head usually comes with a tilted trunk and seam.' },
    high: { summary: 'The head is tilting at release.', drills: ['eyes-level', 'tall-release'], cues: ['Eyes level, locked on the target'] },
  },
  {
    id: 'headOffsetBR', view: 'front', label: 'Head position relative to front foot at release', short: 'Head over front foot', unit: '% height', dp: 0,
    good: [-10, 12], fair: [-18, 22], scaleMin: -30, scaleMax: 40,
    weights: { pace: 0, swing: 1, accuracy: 3 }, evidence: 'consensus', sources: ['coaching'],
    what: 'Sideways distance of the head from the front ankle at release. Positive = head outside the front foot, away from the bowling arm (falling away).',
    why: { accuracy: 'A head stacked over the front foot is a classic marker of a balanced, repeatable release.', swing: 'Falling away drags the arm and seam off line.' },
    low: { summary: 'The head is well across towards the bowling-arm side.', drills: ['target-line', 'tall-release'], cues: ['Head over the front foot, eyes on the target'] },
    high: { summary: 'The head is falling away from the front foot at release.', drills: ['tall-release', 'anti-side-bend', 'target-line'], cues: ['Head over the front foot', 'Bowl "up and over", not "round"'] },
  },
  {
    id: 'frontFootAlign', view: 'front', label: 'Front-foot landing line', short: 'Front-foot line', unit: '% height', dp: 0,
    good: [-10, 10], fair: [-20, 20], scaleMin: -35, scaleMax: 35,
    weights: { pace: 0, swing: 1, accuracy: 2 }, evidence: 'consensus', sources: ['coaching'],
    what: 'Sideways position of the front-foot landing relative to the back-foot landing. Positive = landing across towards the bowling-arm side ("closed"). Negative = landing wide ("open").',
    why: { accuracy: 'Landing in line with the target lets the body rotate and follow through along the line.', swing: 'Landing very open or very closed changes the body angle and seam direction at release.' },
    low: { summary: 'The front foot lands wide and open of the back foot.', drills: ['target-line', 'alignment-match'], cues: ['Land the front foot in line with the target'] },
    high: { summary: 'The front foot lands across the body (closed).', drills: ['target-line', 'alignment-match'], cues: ['Front toes point at the target', 'Step towards the target, not across it'] },
  },
  {
    id: 'hipShoulderSepBFC', view: 'front', label: 'Hip–shoulder difference at back-foot contact', short: 'Hip–shoulder diff. (BFC)', unit: '°', dp: 0,
    good: null, scaleMin: -40, scaleMax: 60,
    weights: { pace: 0, swing: 0, accuracy: 0 }, evidence: 'strong', sources: ['portus2004'],
    what: 'Difference between hip and shoulder alignment at back-foot contact. Large values indicate a mixed action.',
    why: {},
  },

  // ---------------------------------------------------------------- Session-level
  {
    id: 'repeatability', view: 'session', label: 'Action repeatability', short: 'Repeatability', unit: '/100', dp: 0,
    good: [70, 100], fair: [45, 100], scaleMin: 0, scaleMax: 100,
    weights: { pace: 0, swing: 1, accuracy: 3 }, evidence: 'consensus', sources: ['coaching', 'glazier2014'],
    what: 'How similar the key positions are from ball to ball (stride, release height, knee, arm angle, head). Needs at least 2 clips from the same camera angle.',
    why: { accuracy: 'Accuracy comes from repeating the same release over and over.', swing: 'Consistent seam presentation needs a consistent arm and wrist position.' },
    low: { summary: 'Key positions vary a lot from ball to ball.', drills: ['runup-rhythm', 'target-bowling'], cues: ['Same marks, same rhythm, every ball', 'Bowl at 80% and groove it before adding pace'] },
  },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]));

/** Per-metric "normal" ball-to-ball variation, used by the repeatability score. */
export const REPEAT_TOL = {
  side: { strideLength: 4, releaseHeight: 3, frontKneeBR: 6, trunkFlexBR: 5 },
  front: { armVerticalBR: 5, headOffsetBR: 4, lateralFlexBR: 5, frontFootAlign: 5 },
};

/** Injury-risk rules: always shown, whatever the session goal. */
export const INJURY_RULES = [
  {
    id: 'mixed-cr', metric: 'counterRotation', level: (v) => (v > 30 ? 'high' : v > 20 ? 'caution' : null),
    title: 'Mixed-action pattern: shoulder counter-rotation',
    message: (v) => `Shoulders counter-rotate about ${Math.round(v)}° between back- and front-foot contact. Over 30° is the research definition of a mixed action, the technique most strongly linked to lower-back stress fractures in fast bowlers.`,
    sources: ['portus2004', 'elliott2000', 'ranson2008'], drills: ['alignment-match', 'mirror-freeze'],
  },
  {
    id: 'mixed-sep', metric: 'hipShoulderSepBFC', level: (v) => (Math.abs(v) > 30 ? 'high' : null),
    title: 'Mixed-action pattern: hips and shoulders misaligned at back-foot contact',
    message: (v) => `Hips and shoulders are about ${Math.round(Math.abs(v))}° out of line at back-foot contact, meaning the upper and lower body are set up for different actions.`,
    sources: ['portus2004', 'elliott2000'], drills: ['alignment-match', 'mirror-freeze'],
  },
  {
    id: 'side-bend', metric: 'lateralFlexBR', level: (v) => (v > 50 ? 'high' : v > 40 ? 'caution' : null),
    title: 'Large side-bend at release',
    message: (v) => `The trunk bends about ${Math.round(v)}° sideways at release. Large side-bend combined with rotation increases load on the lower back.`,
    sources: ['ranson2008', 'elliott2000'], drills: ['anti-side-bend', 'tall-release'],
  },
];

/** Swing tendency from the action type (coaching consensus). */
export const SWING_TENDENCY = {
  'Side-on': 'Side-on actions usually find outswing (away from a right-hander) most natural, because the arm comes across the body towards the slips.',
  'Front-on': 'Front-on actions usually find inswing (into a right-hander) most natural, because the chest is open and the arm comes down a more open line.',
  'Semi-open': 'Semi-open actions can swing it both ways, with seam position and wrist deciding the direction. This is a good base for learning both.',
  Mixed: 'With a mixed action, deal with the injury-risk pattern before chasing swing. Swing comes from seam position and a stable release, which a mixed action makes harder to repeat.',
};
