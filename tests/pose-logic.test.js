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

// ---------- new exercises ----------

// Build landmarks from a map of landmark number -> point (all fully visible)
function landmarksMap(points) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.2 }));
  for (const [i, p] of Object.entries(points)) lm[+i] = { x: p.x / W, y: p.y / H, visibility: 0.95 };
  return lm;
}
function feed(session, frames, start = 0) {
  const reps = [];
  let last;
  frames.forEach((lm, i) => {
    last = session.update(lm, W, H, start + i * (1000 / 30));
    if (last.newRep) reps.push(last.newRep);
  });
  return { reps, last };
}
const there = (from, deg, len) => ({ x: from.x + len * Math.sin(rad(deg)), y: from.y + len * Math.cos(rad(deg)) });
const repeat = (frame, n) => Array.from({ length: n }, () => frame);

// Side-view lunge. t: 0 standing, 1 bottom. lean: torso lean in degrees
function lungePose(t, lean = 3) {
  const hip = { x: 600, y: 330 + 150 * t };
  const frontKnee = there(hip, 80 * t, 170);          // front thigh swings forward
  const frontAnkle = { x: frontKnee.x, y: frontKnee.y + 160 };   // front shin stays upright
  const backKnee = there(hip, -25 * t, 170);           // back thigh swings back
  const backAnkle = there(backKnee, -(25 * t) - 95 * t, 160);    // back shin folds behind
  const shoulder = { x: hip.x + 200 * Math.sin(rad(lean)), y: hip.y - 200 * Math.cos(rad(lean)) };
  return landmarksMap({ 11: shoulder, 12: shoulder, 23: hip, 24: hip, 25: frontKnee, 27: frontAnkle, 26: backKnee, 28: backAnkle });
}
const lungeRep = (depth = 1, lean = 3) => {
  const f = [];
  for (let i = 0; i <= 12; i++) f.push(...repeat(lungePose((i / 12) * depth, lean), 2));
  for (let i = 12; i >= 0; i--) f.push(...repeat(lungePose((i / 12) * depth, lean), 2));
  return f;
};

test('counts lunges and checks depth and an upright torso', () => {
  const bottom = logic.measureLunge(lungePose(1), W, H);
  assert.ok(bottom.angle < 105, `front knee at the bottom was ${bottom.angle}`);
  const s = logic.createSession('lunge');
  const { reps } = feed(s, [...repeat(lungePose(0), 5), ...lungeRep(), ...lungeRep(0.75), ...lungeRep(1, 40)]);
  assert.strictEqual(reps.length, 3);
  assert.ok(reps[0].good, JSON.stringify(reps[0]));
  assert.ok(reps[1].notes.includes('Lower your back knee a little more'), JSON.stringify(reps[1]));
  assert.ok(reps[2].notes.includes('Keep your torso upright'), JSON.stringify(reps[2]));
});

// Bicep curl seen from the side. elbowDeg: angle at the elbow. drift: how far the elbow swings forward
function curlPose(elbowDeg, drift = 0) {
  const shoulder = { x: 600, y: 200 }, hip = { x: 600, y: 420 };
  const elbow = there(shoulder, drift, 140);
  const wrist = there(elbow, drift + 180 - elbowDeg, 120); // forearm bends forward from the upper arm
  return landmarksMap({ 11: shoulder, 13: elbow, 15: wrist, 23: hip });
}
const curlRep = (top = 40, drift = 0) => {
  const f = [];
  for (let a = 170; a >= top; a -= 8) f.push(...repeat(curlPose(a, drift), 2));
  for (let a = top; a <= 170; a += 8) f.push(...repeat(curlPose(a, drift), 2));
  return f;
};

test('counts bicep curls and flags half reps and a swinging elbow', () => {
  const s = logic.createSession('curl');
  const { reps } = feed(s, [...repeat(curlPose(170), 5), ...curlRep(), ...curlRep(62), ...curlRep(40, 45)]);
  assert.strictEqual(reps.length, 3);
  assert.ok(reps[0].good, JSON.stringify(reps[0]));
  assert.ok(reps[1].notes.includes('Curl all the way up'), JSON.stringify(reps[1]));
  assert.ok(reps[2].notes.includes('Keep your elbow at your side'), JSON.stringify(reps[2]));
});

// Jumping jack facing the camera. arms: 0 down, 1 overhead. feet: how far apart, in shoulder widths
function jackPose(arms, feet) {
  const a = 15 + 155 * arms;
  const ls = { x: 560, y: 200 }, rs = { x: 640, y: 200 };
  const lw = { x: ls.x - 150 * Math.sin(rad(a)), y: ls.y + 150 * Math.cos(rad(a)) };
  const rw = { x: rs.x + 150 * Math.sin(rad(a)), y: rs.y + 150 * Math.cos(rad(a)) };
  const half = (feet * 80) / 2;
  return landmarksMap({ 11: ls, 12: rs, 15: lw, 16: rw, 23: { x: 575, y: 400 }, 24: { x: 625, y: 400 },
                        27: { x: 600 - half, y: 620 }, 28: { x: 600 + half, y: 620 } });
}
const jackRep = (arms = 1, feet = 1.9) => {
  const f = [];
  for (let i = 0; i <= 8; i++) f.push(jackPose((i / 8) * arms, 0.6 + (i / 8) * (feet - 0.6)));
  for (let i = 8; i >= 0; i--) f.push(jackPose((i / 8) * arms, 0.6 + (i / 8) * (feet - 0.6)));
  return f;
};

test('counts jumping jacks and checks arms overhead and feet wide', () => {
  const s = logic.createSession('jack');
  const { reps } = feed(s, [...repeat(jackPose(0, 0.6), 5), ...jackRep(), ...jackRep(0.7), ...jackRep(1, 1.0)]);
  assert.strictEqual(reps.length, 3);
  assert.ok(reps[0].good, JSON.stringify(reps[0]));
  assert.ok(reps[1].notes.includes('Raise your arms all the way overhead'), JSON.stringify(reps[1]));
  assert.ok(reps[2].notes.includes('Jump your feet wider'), JSON.stringify(reps[2]));
});

// Side-view plank. drop: pixels the hips sag below the line (negative = hips too high)
function plankPose(drop = 0) {
  const shoulder = { x: 900, y: 500 }, ankle = { x: 300, y: 560 };
  const hip = { x: 600, y: 530 + drop };
  return landmarksMap({ 11: shoulder, 23: hip, 27: ankle });
}

test('the plank timer only runs while the body is in a straight line', () => {
  const s = logic.createSession('plank');
  const standing = landmarksMap({ 11: { x: 600, y: 200 }, 23: { x: 600, y: 400 }, 27: { x: 600, y: 620 } });
  let out = s.update(standing, W, H, 0);
  assert.strictEqual(out.cue.text, 'Get into a plank, side-on to the camera');
  const frames = [...repeat(plankPose(), 300), ...repeat(plankPose(90), 90), ...repeat(plankPose(-110), 60), ...repeat(plankPose(), 60)];
  const { reps, last } = feed(s, frames, 1000);
  const held = s.summary().seconds;
  assert.ok(Math.abs(held - 12) < 0.3, `held ${held} seconds`);
  assert.strictEqual(last.display, logic.formatTime(held));
  assert.deepStrictEqual(reps.map((r) => r.label), ['10 seconds of good form']);
});

test('every exercise has a name, labels and a camera tip', () => {
  for (const [key, ex] of Object.entries(logic.EXERCISES)) {
    assert.ok(ex.name && ex.angleLabel && ex.viewTip, key);
  }
});
