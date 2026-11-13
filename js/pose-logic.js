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

  // ---------- lunge ----------
  function measureLunge(landmarks, width, height) {
    var p = toPixels(landmarks, width, height);
    var near = pickSide(p, [11, 23, 25, 27], [12, 24, 26, 28]);
    var leftKnee = angle(p[23], p[25], p[27]);
    var rightKnee = angle(p[24], p[26], p[28]);
    var shoulder = p[near[0]], hip = p[near[1]];
    var bent = Math.min(leftKnee, rightKnee);
    return {
      visible: minVisibility([p[near[1]], p[near[2]], p[near[3]]]) >= 0.5 &&
               minVisibility([p[23], p[24], p[25], p[26], p[27], p[28]]) >= 0.2,
      signal: bent,   // the more bent knee: about 175 standing, about 90 at the bottom
      angle: bent,
      lean: Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(hip.y - shoulder.y)) * 180 / Math.PI
    };
  }

  // ---------- bicep curl ----------
  function measureCurl(landmarks, width, height) {
    var p = toPixels(landmarks, width, height);
    var ids = pickSide(p, [11, 13, 15, 23], [12, 14, 16, 24]);
    var shoulder = p[ids[0]], elbow = p[ids[1]], wrist = p[ids[2]], hip = p[ids[3]];
    var elbowAngle = angle(shoulder, elbow, wrist);
    return {
      visible: minVisibility([shoulder, elbow, wrist]) >= 0.5 && hip.v >= 0.3,
      signal: elbowAngle, // about 170 with the arm straight, about 40 at the top of the curl
      angle: elbowAngle,
      // how far the elbow swings away from the side of the body
      drift: angle(elbow, shoulder, hip)
    };
  }

  // ---------- jumping jack (facing the camera) ----------
  function measureJack(landmarks, width, height) {
    var p = toPixels(landmarks, width, height);
    var midShoulder = { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2 };
    var midHip = { x: (p[23].x + p[24].x) / 2, y: (p[23].y + p[24].y) / 2 };
    var torso = Math.max(distance(midShoulder, midHip), 1);
    var wristY = (p[15].y + p[16].y) / 2;
    var armAngle = ((angle(p[23], p[11], p[15]) || 0) + (angle(p[24], p[12], p[16]) || 0)) / 2;
    return {
      visible: minVisibility([p[11], p[12], p[15], p[16], p[23], p[24], p[27], p[28]]) >= 0.5,
      // how far the hands are below the shoulders, in torso lengths:
      // about 0.8 with arms down, below -0.6 with arms overhead
      signal: (wristY - midShoulder.y) / torso,
      angle: armAngle,
      spread: Math.abs(p[27].x - p[28].x) / Math.max(distance(p[11], p[12]), 1)
    };
  }

  // ---------- plank (a timed hold) ----------
  function measurePlank(landmarks, width, height) {
    var p = toPixels(landmarks, width, height);
    var ids = pickSide(p, [11, 23, 27], [12, 24, 28]);
    var shoulder = p[ids[0]], hip = p[ids[1]], ankle = p[ids[2]];
    var span = ankle.x - shoulder.x;
    var t = Math.abs(span) < 1 ? 0.5 : (hip.x - shoulder.x) / span;
    var lineY = shoulder.y + t * (ankle.y - shoulder.y);
    var body = Math.max(distance(shoulder, ankle), 1);
    return {
      visible: minVisibility([shoulder, hip, ankle]) >= 0.5,
      // a plank is roughly level: shoulders and ankles less than 35 degrees from horizontal
      inPosition: Math.atan2(Math.abs(ankle.y - shoulder.y), Math.abs(ankle.x - shoulder.x)) * 180 / Math.PI < 35,
      hipDrop: (hip.y - lineY) / body,
      angle: angle(shoulder, hip, ankle)
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
      viewTip: 'Stand side-on to the camera, 6 to 8 feet away, with your whole body in the frame.',
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
      viewTip: 'Set the camera low and to your side, so your whole body is in the frame from head to feet.',
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

    },
    lunge: {
      name: 'Lunge',
      angleLabel: 'Knee angle',
      measure: measureLunge,
      downAt: 125,
      upAt: 155,
      goodDepth: 105,
      startCue: 'Step into a lunge when you are ready.',
      viewTip: 'Stand side-on to the camera with your whole body in the frame, and step forward along the floor.',
      watch: function (m, rep) {
        if (m.lean > 25) rep.flags.torso = true;
      },
      liveCue: function (m) {
        if (m.lean > 25) return { text: 'Keep your torso upright', warn: true };
        if (m.signal <= 105) return { text: 'Good depth, now push back up', warn: false };
        return { text: 'Lower your back knee toward the floor', warn: false };
      },
      notes: function (rep) {
        var notes = [];
        if (rep.lowest > 105) notes.push('Lower your back knee a little more');
        if (rep.flags.torso) notes.push('Keep your torso upright');
        return notes;
      }
    },
    curl: {
      name: 'Bicep curl',
      angleLabel: 'Elbow angle',
      measure: measureCurl,
      downAt: 70,
      upAt: 145,
      goodDepth: 55,
      startCue: 'Hold the weight with your arm straight, then curl when you are ready.',
      viewTip: 'Face the camera or stand side-on, close enough that your shoulder, elbow, wrist, and hip are clearly visible.',
      watch: function (m, rep) {
        if (m.drift > 35) rep.flags.elbow = true;
      },
      liveCue: function (m) {
        if (m.drift > 35) return { text: 'Keep your elbow at your side', warn: true };
        if (m.signal <= 55) return { text: 'Good squeeze, now lower slowly', warn: false };
        return { text: 'Keep curling up', warn: false };
      },
      notes: function (rep) {
        var notes = [];
        if (rep.lowest > 55) notes.push('Curl all the way up');
        if (rep.flags.elbow) notes.push('Keep your elbow at your side');
        return notes;
      }
    },
    jack: {
      name: 'Jumping jack',
      angleLabel: 'Arm angle',
      measure: measureJack,
      downAt: -0.2,
      upAt: 0.3,
      goodDepth: -0.6,
      startCue: 'Start with your feet together and your arms by your sides.',
      viewTip: 'Face the camera, 6 to 8 feet away, with room to spread your arms and feet.',
      watch: function (m, rep) {
        rep.flags.spread = Math.max(rep.flags.spread || 0, m.spread);
      },
      liveCue: function (m) {
        if (m.signal <= -0.6) return { text: 'Arms up, now back down', warn: false };
        return { text: 'Reach your arms all the way up', warn: false };
      },
      notes: function (rep) {
        var notes = [];
        if (rep.lowest > -0.6) notes.push('Raise your arms all the way overhead');
        if ((rep.flags.spread || 0) < 1.3) notes.push('Jump your feet wider');
        return notes;
      }
    },
    plank: {
      name: 'Plank',
      type: 'hold',
      angleLabel: 'Body line',
      statLabel: 'Good form',
      measure: measurePlank,
      viewTip: 'Set the camera low and to your side, so your whole body is in the frame from head to feet.'
    }
  };

  // ---------- session: smoothing + rep counting ----------
  function formatTime(seconds) {
    var whole = Math.floor(seconds);
    return Math.floor(whole / 60) + ':' + ('0' + (whole % 60)).slice(-2);
  }

  // A timed hold (the plank): the clock only runs while your form is good
  function createHoldSession(exerciseKey) {
    var ex = EXERCISES[exerciseKey];
    var goodTime = 0;
    var lastTime = null;
    var nextMilestone = 10;
    var smoothDrop = null;

    function update(landmarks, width, height, now) {
      var dt = lastTime == null || now == null ? 1 / 30 : Math.min(Math.max((now - lastTime) / 1000, 0), 0.2);
      lastTime = now == null ? null : now;
      var out = { visible: false, reps: 0, display: formatTime(goodTime), angle: null, cue: null, newRep: null };
      if (!landmarks || landmarks.length < 33) {
        out.cue = { text: 'Step into the frame so your whole body is visible', warn: true };
        return out;
      }
      var m = ex.measure(landmarks, width, height);
      out.angle = m.angle;
      if (!m.visible) {
        out.cue = { text: 'Move the camera so your whole body is in the frame', warn: true };
        return out;
      }
      out.visible = true;
      if (!m.inPosition) {
        smoothDrop = null;
        out.cue = { text: 'Get into a plank, side-on to the camera', warn: false };
        return out;
      }
      smoothDrop = smoothDrop == null ? m.hipDrop : smoothDrop + 0.5 * (m.hipDrop - smoothDrop);
      if (smoothDrop > 0.06) {
        out.cue = { text: 'Lift your hips into a straight line', warn: true };
      } else if (smoothDrop < -0.1) {
        out.cue = { text: 'Lower your hips into a straight line', warn: true };
      } else {
        goodTime += dt;
        out.cue = { text: 'Hold it! Your body is in a straight line', warn: false };
        if (goodTime >= nextMilestone) {
          out.newRep = { number: nextMilestone, good: true, notes: [], label: nextMilestone + ' seconds of good form' };
          nextMilestone += 10;
        }
      }
      out.display = formatTime(goodTime);
      return out;
    }

    return {
      exercise: exerciseKey,
      name: ex.name,
      type: 'hold',
      angleLabel: ex.angleLabel,
      statLabel: ex.statLabel,
      update: update,
      summary: function () { return { reps: 0, good: 0, seconds: goodTime }; },
      summaryText: function () {
        return 'Plank finished: you held good form for ' + Math.round(goodTime) + ' seconds.';
      }
    };
  }

  function createSession(exerciseKey) {
    var ex = EXERCISES[exerciseKey];
    if (ex.type === 'hold') return createHoldSession(exerciseKey);
    var smooth = null;
    var down = false;
    var reps = 0;
    var good = 0;
    var rep = null;
    var base = { heel: 0 };
    var top = -Infinity; // the tallest position seen so far

    function update(landmarks, width, height) {
      if (!landmarks || landmarks.length < 33) {
        return { visible: false, reps: reps, display: String(reps), angle: null, cue: { text: 'Step into the frame so your whole body is visible', warn: true } };
      }
      var m = ex.measure(landmarks, width, height);
      if (!m.visible) {
        return { visible: false, reps: reps, display: String(reps), angle: m.angle, cue: { text: 'Step back so your whole body is in the frame', warn: true } };
      }

      // smooth the signal so small jitters do not count as reps
      smooth = smooth == null ? m.signal : smooth + 0.5 * (m.signal - smooth);
      var out = { visible: true, reps: reps, display: String(reps), angle: m.angle, cue: null, newRep: null };

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
          out.display = String(reps);
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
      type: 'reps',
      angleLabel: ex.angleLabel,
      statLabel: 'Reps',
      update: update,
      summary: function () { return { reps: reps, good: good }; },
      summaryText: function () {
        return 'Set finished: ' + reps + (reps === 1 ? ' rep, ' : ' reps, ') + good + ' with good form.';
      }
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
    measureLunge: measureLunge,
    measureCurl: measureCurl,
    measureJack: measureJack,
    measurePlank: measurePlank,
    formatTime: formatTime,
    createSession: createSession
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MoveSmartLogic = api;
  }
})(this);
