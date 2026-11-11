/* ==========================================
   Move Smart - pose logic
   Turns pose landmarks into joint angles, counts reps, and checks form.
   Used by form-check.js in the browser and by the tests in Node.
   ========================================== */
(function (root) {
  'use strict';

  // MediaPipe Pose landmark numbers
  var LM = {
    L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
    L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28,
    L_HEEL: 29, R_HEEL: 30, L_FOOT: 31, R_FOOT: 32
  };

  // Lines drawn between landmarks to make the skeleton
  var CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
    [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]
  ];
  var JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

  // ---------- geometry helpers ----------

  // Landmarks come as fractions of the frame; convert to pixels so angles are not stretched
  function toPixels(landmarks, width, height) {
    return landmarks.map(function (p) {
      return { x: p.x * width, y: p.y * height, v: p.visibility == null ? 1 : p.visibility };
    });
  }

  // Angle ABC in degrees (the angle at point b)
  function angle(a, b, c) {
    var v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    var len = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (!len) return null;
    var cos = (v1x * v2x + v1y * v2y) / len;
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function minVisibility(points) {
    return Math.min.apply(null, points.map(function (p) { return p.v; }));
  }

  // Use whichever side of the body the camera sees better
  function pickSide(p, left, right) {
    var sum = function (ids) { return ids.reduce(function (t, i) { return t + p[i].v; }, 0); };
    return sum(left) >= sum(right) ? left : right;
  }

  // ---------- squat ----------
  function measureSquat(landmarks, width, height) {
    var p = toPixels(landmarks, width, height);
    var ids = pickSide(p, [11, 23, 25, 27, 29, 31], [12, 24, 26, 28, 30, 32]);
    var shoulder = p[ids[0]], hip = p[ids[1]], knee = p[ids[2]], ankle = p[ids[3]], heel = p[ids[4]], toe = p[ids[5]];
    var shin = Math.max(distance(knee, ankle), 1);

    var midShoulder = { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2 };
    var midHip = { x: (p[23].x + p[24].x) / 2, y: (p[23].y + p[24].y) / 2 };
    var frontView = distance(p[11], p[12]) / Math.max(distance(midShoulder, midHip), 1) > 0.45;

    return {
      visible: minVisibility([hip, knee, ankle]) >= 0.5,
      // how high the hips are above the knees, measured in shin lengths:
      // about 1 when standing, about 0 when the thighs are parallel to the floor
      signal: (knee.y - hip.y) / shin,
      angle: angle(hip, knee, ankle),
      lean: Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(hip.y - shoulder.y)) * 180 / Math.PI,
      heel: (toe.y - heel.y) / shin,
      frontView: frontView,
      kneesIn: frontView && Math.abs(p[25].x - p[26].x) < 0.75 * Math.abs(p[27].x - p[28].x)
    };
  }

  // ---------- push-up ----------
  function measurePushup(landmarks, width, height) {
    var p = toPixels(landmarks, width, height);
    var ids = pickSide(p, [11, 13, 15, 23, 27], [12, 14, 16, 24, 28]);
    var shoulder = p[ids[0]], elbow = p[ids[1]], wrist = p[ids[2]], hip = p[ids[3]], ankle = p[ids[4]];

    // how far the hips sit below the straight line from shoulders to ankles (positive = sagging)
    var span = ankle.x - shoulder.x;
    var t = Math.abs(span) < 1 ? 0.5 : (hip.x - shoulder.x) / span;
    var lineY = shoulder.y + t * (ankle.y - shoulder.y);
    var body = Math.max(distance(shoulder, ankle), 1);

    var elbowAngle = angle(shoulder, elbow, wrist);
    return {
      visible: minVisibility([shoulder, elbow, wrist, hip]) >= 0.5 && ankle.v >= 0.3,
      signal: elbowAngle,
      angle: elbowAngle,
      hipDrop: (hip.y - lineY) / body
    };
  }

  // ---------- exercise settings ----------
  var EXERCISES = {
    squat: {
      name: 'Squat',
      angleLabel: 'Knee angle',
      measure: measureSquat,
      downAt: 0.5,     // a rep starts once the hips drop below this
      upAt: 0.85,      // and counts once you stand back up past this
      goodDepth: 0.25, // thighs close to parallel
      startCue: 'Squat down when you are ready.',
      watch: function (m, rep, base) {
        if (m.heel - base.heel > 0.08) rep.flags.heels = true;
        if (m.signal < 0.4 && m.lean > 55) rep.flags.chest = true;
        if (m.signal < 0.5 && m.kneesIn) rep.flags.knees = true;
      },
      liveCue: function (m, base) {
        if (m.heel - base.heel > 0.08) return { text: 'Keep your heels down', warn: true };
        if (m.signal < 0.4 && m.lean > 55) return { text: 'Keep your chest up', warn: true };
        if (m.signal < 0.5 && m.kneesIn) return { text: 'Push your knees out', warn: true };
        if (m.signal <= 0.25) return { text: 'Good depth, now drive up', warn: false };
        return { text: 'Keep going down', warn: false };
      },
      notes: function (rep) {
        var notes = [];
        if (rep.lowest > 0.25) notes.push('Go a little lower');
        if (rep.flags.heels) notes.push('Keep your heels down');
        if (rep.flags.chest) notes.push('Keep your chest up');
        if (rep.flags.knees) notes.push('Push your knees out');
        return notes;
      }
    },
    pushup: {
      name: 'Push-up',
      angleLabel: 'Elbow angle',
      measure: measurePushup,
      downAt: 110,
      upAt: 150,
      goodDepth: 95,
      startCue: 'Get into a plank and lower when you are ready.',
      watch: function (m, rep) {
        if (m.hipDrop > 0.08) rep.flags.sag = true;
        if (m.hipDrop < -0.12) rep.flags.pike = true;
      },
      liveCue: function (m) {
        if (m.hipDrop > 0.08) return { text: 'Lift your hips into a straight line', warn: true };
        if (m.hipDrop < -0.12) return { text: 'Lower your hips into a straight line', warn: true };
        if (m.signal <= 95) return { text: 'Good depth, now push up', warn: false };
        return { text: 'Keep lowering your chest', warn: false };
      },
      notes: function (rep) {
        var notes = [];
        if (rep.lowest > 95) notes.push('Lower your chest a little more');
        if (rep.flags.sag) notes.push('Keep your hips from sagging');
        if (rep.flags.pike) notes.push('Keep your hips down');
        return notes;
      }
    }
  };

  // ---------- session: smoothing + rep counting ----------
  function createSession(exerciseKey) {
    var ex = EXERCISES[exerciseKey];
    var smooth = null;
    var down = false;
    var reps = 0;
    var good = 0;
    var rep = null;
    var base = { heel: 0 };
    var top = -Infinity; // the tallest position seen so far

    function update(landmarks, width, height) {
      if (!landmarks || landmarks.length < 33) {
        return { visible: false, reps: reps, angle: null, cue: { text: 'Step into the frame so your whole body is visible', warn: true } };
      }
      var m = ex.measure(landmarks, width, height);
      if (!m.visible) {
        return { visible: false, reps: reps, angle: m.angle, cue: { text: 'Step back so your whole body is in the frame', warn: true } };
      }

      // smooth the signal so small jitters do not count as reps
      smooth = smooth == null ? m.signal : smooth + 0.5 * (m.signal - smooth);
      var out = { visible: true, reps: reps, angle: m.angle, cue: null, newRep: null };

      if (!down) {
        // while standing at full height, keep a baseline of where the heels sit (used to spot heels lifting)
        top = Math.max(top, smooth);
        if (smooth > ex.upAt && smooth >= top - 0.06) base.heel = base.heel + 0.3 * (m.heel - base.heel) || 0;
        if (smooth < ex.downAt) {
          down = true;
          rep = { lowest: smooth, flags: {} };
        }
      }

      if (down) {
        rep.lowest = Math.min(rep.lowest, smooth);
        ex.watch(m, rep, base);
        out.cue = ex.liveCue(m, base);
        if (smooth > ex.upAt) {
          down = false;
          reps += 1;
          var notes = ex.notes(rep);
          if (!notes.length) good += 1;
          out.reps = reps;
          out.newRep = { number: reps, good: !notes.length, notes: notes };
          out.cue = { text: notes.length ? 'Rep ' + reps + ': ' + notes[0] : 'Rep ' + reps + ': good rep', warn: notes.length > 0 };
          rep = null;
        }
      } else if (!out.cue) {
        out.cue = reps === 0 ? { text: ex.startCue, warn: false } : null;
      }
      return out;
    }

    return {
      exercise: exerciseKey,
      name: ex.name,
      angleLabel: ex.angleLabel,
      update: update,
      summary: function () { return { reps: reps, good: good }; }
    };
  }

  var api = {
    LM: LM,
    CONNECTIONS: CONNECTIONS,
    JOINTS: JOINTS,
    EXERCISES: EXERCISES,
    angle: angle,
    measureSquat: measureSquat,
    measurePushup: measurePushup,
    createSession: createSession
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MoveSmartLogic = api;
  }
})(this);
