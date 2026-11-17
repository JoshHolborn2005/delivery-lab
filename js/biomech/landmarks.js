// MediaPipe Pose (BlazePose) 33-landmark topology, plus helpers for left/right lookups.
// Landmark "left"/"right" are from the athlete's perspective.

export const NJ = 33;

export const NOSE = 0;
const SIDE_IDX = {
  L: { eye: 2, ear: 7, mouth: 9, sh: 11, el: 13, wr: 15, pinky: 17, index: 19, thumb: 21, hip: 23, knee: 25, ank: 27, heel: 29, foot: 31 },
  R: { eye: 5, ear: 8, mouth: 10, sh: 12, el: 14, wr: 16, pinky: 18, index: 20, thumb: 22, hip: 24, knee: 26, ank: 28, heel: 30, foot: 32 },
};

/** Landmark index for a side ('L' | 'R') and joint name. */
export const J = (side, joint) => SIDE_IDX[side][joint];
export const other = (side) => (side === 'L' ? 'R' : 'L');
export const armSide = (arm) => (arm === 'left' ? 'L' : 'R');

export const LR_PAIRS = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

// Groups that the pose model tends to mislabel independently of each other.
export const FLIP_GROUPS = {
  torso: [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [23, 24]],
  arms: [[13, 14], [15, 16], [17, 18], [19, 20], [21, 22]],
  legs: [[25, 26], [27, 28], [29, 30], [31, 32]],
};

/** Skeleton bones for drawing: [from, to, part] where part is used for colouring. */
export const BONES = [
  [11, 12, 'torso'], [11, 23, 'torso'], [12, 24, 'torso'], [23, 24, 'torso'],
  [11, 13, 'armL'], [13, 15, 'armL'], [15, 19, 'armL'],
  [12, 14, 'armR'], [14, 16, 'armR'], [16, 20, 'armR'],
  [23, 25, 'legL'], [25, 27, 'legL'], [27, 29, 'legL'], [29, 31, 'legL'], [27, 31, 'legL'],
  [24, 26, 'legR'], [26, 28, 'legR'], [28, 30, 'legR'], [30, 32, 'legR'], [28, 32, 'legR'],
];
export const DRAW_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
