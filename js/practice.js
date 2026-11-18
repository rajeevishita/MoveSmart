/* ==========================================
   Move Smart - practice without a camera
   A slider moves a squatting skeleton. The made-up body points go through the
   same rep counter and form checks (pose-logic.js) as the live camera check.
   ========================================== */
(function () {
  'use strict';

  var logic = window.MoveSmartLogic;
  var svg = document.getElementById('practice-svg');
  if (!logic || !svg) return;

  var ui = {
    depth: document.getElementById('practice-depth'),
    heels: document.getElementById('practice-heels'),
    lean: document.getElementById('practice-lean'),
    reps: document.getElementById('practice-reps'),
    angle: document.getElementById('practice-angle'),
    cue: document.getElementById('practice-cue'),
    log: document.getElementById('practice-log'),
    reset: document.getElementById('practice-reset')
  };
  var NS = 'http://www.w3.org/2000/svg';
  var RAD = Math.PI / 180;
  var session = logic.createSession('squat');
  var lastCue = '';

  // A side-view squat. depth: 0 standing to 1 at the bottom
  function pose(depth, heels, lean) {
    var lift = heels ? depth : 0;
    var ax = 600, ay = 490 - 8 * lift;
    var knee = [ax + 120 * Math.sin(30 * depth * RAD), ay - 120 * Math.cos(30 * depth * RAD)];
    var hip = [knee[0] - 135 * Math.sin(95 * depth * RAD), knee[1] - 135 * Math.cos(95 * depth * RAD)];
    var torso = 3 + 42 * depth + (lean ? 24 * depth : 0);
    var shoulder = [hip[0] + 150 * Math.sin(torso * RAD), hip[1] - 150 * Math.cos(torso * RAD)];
    var head = [shoulder[0] + 55 * Math.sin((torso + 5) * RAD), shoulder[1] - 55 * Math.cos((torso + 5) * RAD)];
    var arm = 90 * Math.min(1, depth * 1.4);
    var elbow = [shoulder[0] + 80 * Math.sin((180 - arm) * RAD), shoulder[1] - 80 * Math.cos((180 - arm) * RAD)];
    var wrist = [elbow[0] + 72 * Math.sin((180 - arm * 1.05) * RAD), elbow[1] - 72 * Math.cos((180 - arm * 1.05) * RAD)];
    return { ankle: [ax, ay], knee: knee, hip: hip, shoulder: shoulder, head: head, elbow: elbow, wrist: wrist,
             toe: [650, 498], heel: [582, 498 - 14 * lift] };
  }

  // turn the drawing into the 33 body points the pose model would give
  function toLandmarks(p) {
    var lm = [];
    for (var i = 0; i < 33; i++) lm.push({ x: 0, y: 0, visibility: 0.2 });
    var map = { 0: 'head', 11: 'shoulder', 13: 'elbow', 15: 'wrist', 23: 'hip', 25: 'knee', 27: 'ankle', 29: 'heel', 31: 'toe' };
    Object.keys(map).forEach(function (k) {
      var i = Number(k), q = p[map[k]];
      lm[i] = { x: q[0], y: q[1], visibility: 0.95 };
      if (i > 0) lm[i + 1] = { x: q[0] + 3, y: q[1], visibility: 0.4 };
    });
    return lm;
  }

  // ---------- drawing ----------
  function make(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    svg.appendChild(el);
    return el;
  }
  var bones = make('path', { fill: 'none', stroke: '#f7f6f8', 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  var arc = make('path', { fill: 'none', stroke: '#a89398', 'stroke-width': 5, 'stroke-linecap': 'round' });
  var headCircle = make('circle', { r: 26, fill: '#2b2838', stroke: '#f7f6f8', 'stroke-width': 8 });
  var joints = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].map(function () {
    return make('circle', { r: 9, fill: '#2b2838', stroke: '#c4b5be', 'stroke-width': 5 });
  });
  var label = make('text', { 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': 22, 'font-weight': 700, fill: '#f7f6f8' });

  function pt(q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }

  function draw(p, kneeAngle) {
    var neckEnd = [p.head[0] + (p.shoulder[0] - p.head[0]) * 26 / 55, p.head[1] + (p.shoulder[1] - p.head[1]) * 26 / 55];
    bones.setAttribute('d',
      'M' + pt(p.shoulder) + ' L' + pt(p.hip) + ' L' + pt(p.knee) + ' L' + pt(p.ankle) + ' L' + pt(p.toe) +
      ' M' + pt(p.ankle) + ' L' + pt(p.heel) +
      ' M' + pt(p.shoulder) + ' L' + pt(p.elbow) + ' L' + pt(p.wrist) +
      ' M' + pt(p.shoulder) + ' L' + pt(neckEnd));
    headCircle.setAttribute('cx', p.head[0]);
    headCircle.setAttribute('cy', p.head[1]);
    ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].forEach(function (k, i) {
      joints[i].setAttribute('cx', p[k][0]);
      joints[i].setAttribute('cy', p[k][1]);
    });

    // the knee angle, drawn as an arc between the thigh and the shin
    var toHip = Math.atan2(p.hip[1] - p.knee[1], p.hip[0] - p.knee[0]);
    var toAnkle = Math.atan2(p.ankle[1] - p.knee[1], p.ankle[0] - p.knee[0]);
    var r = 40;
    var a = [p.knee[0] + r * Math.cos(toHip), p.knee[1] + r * Math.sin(toHip)];
    var b = [p.knee[0] + r * Math.cos(toAnkle), p.knee[1] + r * Math.sin(toAnkle)];
    var turn = (toAnkle - toHip + 2 * Math.PI) % (2 * Math.PI);
    arc.setAttribute('d', 'M' + pt(a) + ' A' + r + ' ' + r + ' 0 0 ' + (turn < Math.PI ? 1 : 0) + ' ' + pt(b));
    arc.style.display = kneeAngle > 170 ? 'none' : '';
    label.setAttribute('x', p.knee[0] + 26);
    label.setAttribute('y', p.knee[1] + 8);
    label.textContent = Math.round(kneeAngle) + '°';
  }

  // ---------- counting ----------
  function update() {
    var p = pose(ui.depth.value / 100, ui.heels.checked, ui.lean.checked);
    var lm = toLandmarks(p);
    var state, newRep = null;
    // the live check sees about 30 frames a second, so feed a few frames per slider step
    for (var i = 0; i < 3; i++) {
      state = session.update(lm, 1, 1);
      if (state.newRep) {
        newRep = state.newRep;
        lastCue = '';
      }
    }
    state.newRep = newRep;
    if (newRep) state.cue = { text: 'Rep ' + newRep.number + ': ' + (newRep.good ? 'good rep' : newRep.notes[0]), warn: !newRep.good };
    draw(p, state.angle);
    ui.angle.textContent = Math.round(state.angle) + '°';
    ui.reps.textContent = String(state.reps);
    if (state.cue && state.cue.text !== lastCue) {
      lastCue = state.cue.text;
      ui.cue.textContent = state.cue.text;
      ui.cue.classList.toggle('warn', state.cue.warn);
    }
    if (state.newRep) {
      var item = document.createElement('li');
      item.textContent = 'Rep ' + state.newRep.number + ': ' +
        (state.newRep.good ? 'good rep' : state.newRep.notes.join(', ').toLowerCase());
      if (!state.newRep.good) item.className = 'warn';
      ui.log.appendChild(item);
      ui.log.scrollTop = ui.log.scrollHeight;
      ui.reps.classList.remove('bump');
      void ui.reps.offsetWidth;
      ui.reps.classList.add('bump');
    }
  }

  function reset() {
    session = logic.createSession('squat');
    lastCue = '';
    ui.depth.value = 0;
    ui.log.innerHTML = '';
    ui.cue.textContent = 'Drag the slider to the right to squat down.';
    ui.cue.classList.remove('warn');
    update();
  }

  ui.depth.addEventListener('input', update);
  ui.heels.addEventListener('change', update);
  ui.lean.addEventListener('change', update);
  ui.reset.addEventListener('click', reset);
  update();
})();
