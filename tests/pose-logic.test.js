// Tests for js/pose-logic.js. Run from the project folder with:  node --test
const test = require('node:test');
const assert = require('node:assert');
const logic = require('../js/pose-logic.js');

const W = 1280, H = 720;
const rad = (d) => d * Math.PI / 180;

// Build a full set of 33 landmarks from a few side-view joint positions (in pixels).
// The left side faces the camera; the right side is mostly hidden.
function landmarksFrom(j) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.2 }));
  const put = (i, p, vis) => { lm[i] = { x: p.x / W, y: p.y / H, visibility: vis }; };
  const pairs = [[11, 12, 'shoulder'], [13, 14, 'elbow'], [15, 16, 'wrist'], [23, 24, 'hip'],
                 [25, 26, 'knee'], [27, 28, 'ankle'], [29, 30, 'heel'], [31, 32, 'toe']];
  for (const [l, r, k] of pairs) {
    put(l, j[k], 0.95);
    put(r, { x: j[k].x + 4, y: j[k].y }, 0.4);
  }
  return lm;
}

// Side-view squat. t: 0 standing, 1 bottom. heelLift: 0..1
function squatPose(t, heelLift = 0) {
  const ankle = { x: 600, y: 600 - 10 * heelLift };
  const knee = { x: ankle.x + 160 * Math.sin(rad(30 * t)), y: ankle.y - 160 * Math.cos(rad(30 * t)) };
  const hip = { x: knee.x - 180 * Math.sin(rad(95 * t)), y: knee.y - 180 * Math.cos(rad(95 * t)) };
  const lean = 3 + 42 * t;
  const shoulder = { x: hip.x + 200 * Math.sin(rad(lean)), y: hip.y - 200 * Math.cos(rad(lean)) };
  return {
    shoulder, hip, knee, ankle,
    elbow: { x: shoulder.x + 100, y: shoulder.y + 10 }, wrist: { x: shoulder.x + 190, y: shoulder.y },
    heel: { x: 580, y: 610 - 18 * heelLift }, toe: { x: 660, y: 610 }
  };
}

// Side-view push-up. elbowDeg: angle at the elbow; hipDrop: pixels the hips sag below the body line
function pushupPose(elbowDeg, hipDrop = 0) {
  const wrist = { x: 900, y: 620 };
  const elbow = { x: 900, y: 620 - 130 };
  const upperDir = rad(180 - elbowDeg); // tilt the upper arm back as the elbow bends
  const shoulder = { x: elbow.x - 130 * Math.sin(upperDir), y: elbow.y - 130 * Math.cos(upperDir) };
  const ankle = { x: 300, y: 640 };
  const hip = { x: (shoulder.x + ankle.x) / 2, y: (shoulder.y + ankle.y) / 2 + hipDrop };
  const knee = { x: (hip.x + ankle.x) / 2, y: (hip.y + ankle.y) / 2 };
  return { shoulder, elbow, wrist, hip, knee, ankle, heel: { x: 290, y: 630 }, toe: { x: 280, y: 650 } };
}

// Feed a list of poses through a session, holding each one for a few frames
function run(session, poses, hold = 3) {
  const reps = [];
  let last;
  for (const pose of poses) {
    for (let i = 0; i < hold; i++) {
      last = session.update(landmarksFrom(pose), W, H);
      if (last.newRep) reps.push(last.newRep);
    }
  }
  return { reps, last };
}

// One rep down and back up. Heels (if they lift) come up in the bottom half, like a real lifter's.
function squatRep(depth = 1, heelLift = 0) {
  const steps = [];
  const lift = (i) => heelLift * Math.max(0, (i / 10 - 0.5) * 2);
  for (let i = 0; i <= 10; i++) steps.push(squatPose((i / 10) * depth, lift(i)));
  for (let i = 10; i >= 0; i--) steps.push(squatPose((i / 10) * depth, lift(i)));
  return steps;
}

test('angle() returns the angle at the middle point', () => {
  assert.strictEqual(Math.round(logic.angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })), 90);
  assert.strictEqual(Math.round(logic.angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })), 180);
});

test('knee angle is about 180 standing and well under 90 at the bottom of a squat', () => {
  const standing = logic.measureSquat(landmarksFrom(squatPose(0)), W, H);
  const bottom = logic.measureSquat(landmarksFrom(squatPose(1)), W, H);
  assert.ok(standing.angle > 170, `standing angle was ${standing.angle}`);
  assert.ok(bottom.angle < 70, `bottom angle was ${bottom.angle}`);
  assert.ok(standing.signal > 1 && bottom.signal < 0, 'hip height signal goes from above 1 to below 0');
});

test('counts three good squats', () => {
  const s = logic.createSession('squat');
  const { reps } = run(s, [squatPose(0), ...squatRep(), ...squatRep(), ...squatRep()]);
  assert.strictEqual(reps.length, 3);
  assert.ok(reps.every((r) => r.good), JSON.stringify(reps));
  assert.deepStrictEqual(s.summary(), { reps: 3, good: 3 });
});

test('flags heels lifting on the rep where it happens', () => {
  const s = logic.createSession('squat');
  const { reps } = run(s, [squatPose(0), ...squatRep(), ...squatRep(1, 1), ...squatRep()]);
  assert.strictEqual(reps.length, 3);
  assert.ok(reps[0].good && reps[2].good);
  assert.deepStrictEqual(reps[1].notes, ['Keep your heels down']);
});

test('a half squat counts but asks you to go lower', () => {
  const s = logic.createSession('squat');
  const { reps } = run(s, [squatPose(0), ...squatRep(0.72)]);
  assert.strictEqual(reps.length, 1);
  assert.ok(reps[0].notes.includes('Go a little lower'), JSON.stringify(reps[0]));
});

test('small wobbles while standing do not count as reps', () => {
  const s = logic.createSession('squat');
  const wobble = [];
  for (let i = 0; i < 40; i++) wobble.push(squatPose(0.25 + 0.1 * Math.sin(i)));
  const { reps } = run(s, wobble, 1);
  assert.strictEqual(reps.length, 0);
});

test('nothing is counted when the legs are out of view', () => {
  const s = logic.createSession('squat');
  const hidden = (pose) => landmarksFrom(pose).map((p, i) => (i >= 23 ? { ...p, visibility: 0.1 } : p));
  let out;
  for (const pose of squatRep()) out = s.update(hidden(pose), W, H);
  assert.strictEqual(out.visible, false);
  assert.strictEqual(out.reps, 0);
});

test('counts push-ups and flags sagging hips', () => {
  const s = logic.createSession('pushup');
  const rep = (sag) => {
    const steps = [];
    for (let a = 175; a >= 80; a -= 10) steps.push(pushupPose(a, sag));
    for (let a = 80; a <= 175; a += 10) steps.push(pushupPose(a, sag));
    return steps;
  };
  const { reps } = run(s, [pushupPose(175), ...rep(0), ...rep(70)]);
  assert.strictEqual(reps.length, 2);
  assert.ok(reps[0].good, JSON.stringify(reps[0]));
  assert.ok(reps[1].notes.includes('Keep your hips from sagging'), JSON.stringify(reps[1]));
});

test('spots heels lifting even when they start rising at the top of the rep', () => {
  const s = logic.createSession('squat');
  const early = [];
  for (let i = 0; i <= 10; i++) early.push(squatPose(i / 10, i / 10));
  for (let i = 10; i >= 0; i--) early.push(squatPose(i / 10, i / 10));
  const { reps } = run(s, [squatPose(0), ...squatRep(), ...early]);
  assert.strictEqual(reps.length, 2);
  assert.deepStrictEqual(reps[1].notes, ['Keep your heels down']);
});
