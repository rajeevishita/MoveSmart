/* ==========================================
   Move Smart - practice without a camera
   A slider moves a squatting skeleton. You can add mistakes from a menu, and
   the made-up body points go through the same rep counter and form checks
   (pose-logic.js) as the live camera check.
   Knees caving in only shows from the front, so that mistake turns the
   skeleton to face you; heels and leaning only show from the side.
   ========================================== */
(function () {
  'use strict';

  var logic = window.MoveSmartLogic;
  var svg = document.getElementById('practice-svg');
  if (!logic || !svg) return;

  var ui = {
    depth: document.getElementById('practice-depth'),
    add: document.getElementById('practice-add'),
    addButton: document.getElementById('practice-add-button'),
    chips: document.getElementById('practice-chips'),
    view: document.getElementById('practice-view'),
    reps: document.getElementById('practice-reps'),
    angle: document.getElementById('practice-angle'),
    cue: document.getElementById('practice-cue'),
    log: document.getElementById('practice-log'),
    reset: document.getElementById('practice-reset')
  };
  var NS = 'http://www.w3.org/2000/svg';
  var RAD = Math.PI / 180;

  var MISTAKES = {
    heels: { label: 'Lift my heels', view: 'side' },
    lean: { label: 'Lean too far forward', view: 'side' },
    shallow: { label: 'Stop before I’m deep enough' },
    top: { label: 'Don’t stand all the way up' },
    knees: { label: 'Let my knees cave in', view: 'front' }
  };
  var ORDER = ['heels', 'lean', 'shallow', 'top', 'knees'];
  var active = [];
  var view = 'side';

  var session = logic.createSession('squat');
  var lastCue = '';
  var wentDown = false;

  function has(key) { return active.indexOf(key) !== -1; }

  // The slider runs 0..1; mistakes change how far the body actually moves.
  // "Not deep enough" stops short of the depth the form check wants, and
  // "don't stand all the way up" never gets back high enough to finish a rep.
  function bodyDepth(slider) {
    var low = has('top') ? 0.45 : 0;
    var high = has('shallow') ? 0.73 : 1;
    return low + (high - low) * slider;
  }

  // ---------- poses ----------
  // side view, facing right. depth: 0 standing to 1 at the bottom
  function sidePose(depth) {
    var lift = has('heels') ? depth : 0;
    var ax = 600, ay = 490 - 8 * lift;
    var knee = [ax + 120 * Math.sin(30 * depth * RAD), ay - 120 * Math.cos(30 * depth * RAD)];
    var hip = [knee[0] - 135 * Math.sin(95 * depth * RAD), knee[1] - 135 * Math.cos(95 * depth * RAD)];
    var torso = 3 + 42 * depth + (has('lean') ? 24 * depth : 0);
    var shoulder = [hip[0] + 150 * Math.sin(torso * RAD), hip[1] - 150 * Math.cos(torso * RAD)];
    var head = [shoulder[0] + 55 * Math.sin((torso + 5) * RAD), shoulder[1] - 55 * Math.cos((torso + 5) * RAD)];
    var arm = 90 * Math.min(1, depth * 1.4);
    var elbow = [shoulder[0] + 80 * Math.sin((180 - arm) * RAD), shoulder[1] - 80 * Math.cos((180 - arm) * RAD)];
    var wrist = [elbow[0] + 72 * Math.sin((180 - arm * 1.05) * RAD), elbow[1] - 72 * Math.cos((180 - arm * 1.05) * RAD)];
    return { ankle: [ax, ay], knee: knee, hip: hip, shoulder: shoulder, head: head, elbow: elbow, wrist: wrist,
             toe: [650, 498], heel: [582, 498 - 14 * lift] };
  }

  // front view, facing you. Heights match the side view; only left and right change.
  function frontPose(depth) {
    var cx = 640, ay = 490;
    var kneeY = ay - 120 * Math.cos(30 * depth * RAD);
    // the thighs point at you at the bottom; keep a little height so they still read as thighs
    var hipY = kneeY - Math.max(22, 135 * Math.cos(95 * depth * RAD));
    var torso = 3 + 42 * depth;
    var shY = hipY - 150 * Math.cos(torso * RAD);
    var headY = shY - 55 * Math.cos((torso + 5) * RAD);
    // half the gap between the knees: good form pushes them out over the toes,
    // the mistake lets them fall in toward each other
    var knee = has('knees') ? 40 - 22 * depth : 40 + 38 * depth;
    var hipW = 30 + 10 * depth;
    function side(s) {
      return {
        // hands clasped in front of the chest, like a goblet squat
        shoulder: [cx + s * 52, shY], elbow: [cx + s * 66, shY + 58], wrist: [cx + s * 12, shY + 44],
        hip: [cx + s * hipW, hipY], knee: [cx + s * knee, kneeY], ankle: [cx + s * 40, ay],
        heel: [cx + s * 40, ay + 8], toe: [cx + s * 58, ay + 8]
      };
    }
    return { left: side(1), right: side(-1), head: [cx, headY], neck: [cx, shY], pelvis: [cx, hipY] };
  }

  // turn the drawing into the 33 body points the pose model would give
  var MAP = { 11: 'shoulder', 13: 'elbow', 15: 'wrist', 23: 'hip', 25: 'knee', 27: 'ankle', 29: 'heel', 31: 'toe' };
  function toLandmarks(p) {
    var lm = [];
    for (var i = 0; i < 33; i++) lm.push({ x: 0, y: 0, visibility: 0.2 });
    lm[0] = { x: p.head[0], y: p.head[1], visibility: 0.95 };
    Object.keys(MAP).forEach(function (k) {
      var i = Number(k), name = MAP[k];
      if (view === 'front') {
        lm[i] = { x: p.left[name][0], y: p.left[name][1], visibility: 0.95 };
        lm[i + 1] = { x: p.right[name][0], y: p.right[name][1], visibility: 0.95 };
      } else {
        lm[i] = { x: p[name][0], y: p[name][1], visibility: 0.95 };
        lm[i + 1] = { x: p[name][0] + 3, y: p[name][1], visibility: 0.4 };
      }
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
  var joints = [];
  for (var j = 0; j < 12; j++) joints.push(make('circle', { r: 9, fill: '#2b2838', stroke: '#c4b5be', 'stroke-width': 5 }));
  var kneeRings = [0, 1].map(function () {
    return make('circle', { r: 19, fill: 'none', stroke: '#e3a9b5', 'stroke-width': 4, 'stroke-dasharray': '6 6' });
  });
  var label = make('text', { 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': 22, 'font-weight': 700, fill: '#f7f6f8' });

  function pt(q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }
  function line() { return 'M' + Array.prototype.map.call(arguments, pt).join(' L'); }

  function placeJoints(points) {
    joints.forEach(function (c, i) {
      var q = points[i];
      c.style.display = q ? '' : 'none';
      if (q) {
        c.setAttribute('cx', q[0]);
        c.setAttribute('cy', q[1]);
      }
    });
  }

  function drawSide(p, kneeAngle) {
    var neckEnd = [p.head[0] + (p.shoulder[0] - p.head[0]) * 26 / 55, p.head[1] + (p.shoulder[1] - p.head[1]) * 26 / 55];
    bones.setAttribute('d', line(p.shoulder, p.hip, p.knee, p.ankle, p.toe) + ' ' + line(p.ankle, p.heel) + ' ' +
      line(p.shoulder, p.elbow, p.wrist) + ' ' + line(p.shoulder, neckEnd));
    headCircle.setAttribute('cx', p.head[0]);
    headCircle.setAttribute('cy', p.head[1]);
    placeJoints([p.shoulder, p.elbow, p.wrist, p.hip, p.knee, p.ankle]);
    kneeRings.forEach(function (r) { r.style.display = 'none'; });

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

  function drawFront(p, kneeAngle, caving) {
    var L = p.left, R = p.right;
    var neckTop = [p.head[0], p.head[1] + 26];
    bones.setAttribute('d', [
      line(L.shoulder, R.shoulder), line(p.neck, p.pelvis), line(L.hip, R.hip), line(p.neck, neckTop),
      line(L.shoulder, L.elbow, L.wrist), line(R.shoulder, R.elbow, R.wrist),
      line(L.hip, L.knee, L.ankle, L.toe), line(R.hip, R.knee, R.ankle, R.toe)
    ].join(' '));
    headCircle.setAttribute('cx', p.head[0]);
    headCircle.setAttribute('cy', p.head[1]);
    placeJoints([L.shoulder, R.shoulder, L.elbow, R.elbow, L.wrist, R.wrist, L.hip, R.hip, L.knee, R.knee, L.ankle, R.ankle]);
    [L.knee, R.knee].forEach(function (q, i) {
      kneeRings[i].style.display = caving ? '' : 'none';
      kneeRings[i].setAttribute('cx', q[0]);
      kneeRings[i].setAttribute('cy', q[1]);
    });
    arc.style.display = 'none';
    label.setAttribute('x', L.knee[0] + 34);
    label.setAttribute('y', L.knee[1] + 8);
    label.textContent = Math.round(kneeAngle) + '°';
  }

  // ---------- counting ----------
  function setCue(text, warn) {
    lastCue = text;
    ui.cue.textContent = text;
    ui.cue.classList.toggle('warn', !!warn);
  }

  function update() {
    var slider = ui.depth.value / 100;
    var depth = bodyDepth(slider);
    var p = view === 'front' ? frontPose(depth) : sidePose(depth);
    var lm = toLandmarks(p);
    var state, newRep = null;
    // the live check sees about 30 frames a second, so feed a few frames per slider step
    for (var i = 0; i < 3; i++) {
      state = session.update(lm, 1, 1);
      if (state.newRep) newRep = state.newRep;
    }
    if (depth > 0.62) wentDown = true;

    if (view === 'front') drawFront(p, state.angle, has('knees') && depth > 0.5);
    else drawSide(p, state.angle);
    ui.angle.textContent = Math.round(state.angle) + '°';
    ui.reps.textContent = String(state.reps);

    if (newRep) {
      wentDown = false;
      setCue('Rep ' + newRep.number + ': ' + (newRep.good ? 'good rep' : newRep.notes[0]), !newRep.good);
      var item = document.createElement('li');
      item.textContent = 'Rep ' + newRep.number + ': ' + (newRep.good ? 'good rep' : newRep.notes.join(', ').toLowerCase());
      if (!newRep.good) item.className = 'warn';
      ui.log.appendChild(item);
      ui.log.scrollTop = ui.log.scrollHeight;
      ui.reps.classList.remove('bump');
      void ui.reps.offsetWidth;
      ui.reps.classList.add('bump');
    } else if (has('top') && wentDown && slider < 0.05) {
      // back at the top, but never high enough for the counter
      setCue('Stand all the way up to finish the rep', true);
    } else if (state.cue && state.cue.text !== lastCue) {
      setCue(state.cue.text, state.cue.warn);
    }
  }

  // ---------- the mistake menu ----------
  function renderChips() {
    ui.chips.innerHTML = '';
    if (!active.length) {
      var none = document.createElement('li');
      none.className = 'chip-none';
      none.textContent = 'None yet, so this squat is clean.';
      ui.chips.appendChild(none);
    }
    active.forEach(function (key) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mistake-chip';
      b.setAttribute('data-mistake', key);
      b.setAttribute('aria-label', 'Remove mistake: ' + MISTAKES[key].label);
      b.innerHTML = '<span></span><span class="chip-x" aria-hidden="true">&times;</span>';
      b.firstChild.textContent = MISTAKES[key].label;
      li.appendChild(b);
      ui.chips.appendChild(li);
    });
    Array.prototype.forEach.call(ui.add.options, function (opt) {
      if (opt.value) opt.disabled = has(opt.value);
    });
    ui.add.value = '';
    ui.addButton.disabled = active.length === ORDER.length;
  }

  function setView(next) {
    if (next === view) return '';
    view = next;
    ui.view.textContent = next === 'front' ? 'Front view' : 'Side view';
    return next === 'front' ? 'Turned to face you, so you can see the knees.' : 'Turned back to the side view.';
  }

  function addMistake(key) {
    if (!MISTAKES[key] || has(key)) return;
    var needs = MISTAKES[key].view;
    var dropped = [];
    if (needs) {
      // mistakes that only show from the other side come off
      active = active.filter(function (k) {
        var other = MISTAKES[k].view;
        if (other && other !== needs) {
          dropped.push(MISTAKES[k].label.toLowerCase());
          return false;
        }
        return true;
      });
    }
    active.push(key);
    active.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
    var note = setView(has('knees') ? 'front' : 'side');
    renderChips();
    update();
    if (note && dropped.length) {
      note += ' (Removed: ' + dropped.join(', ') + ', which only ' + (dropped.length > 1 ? 'show' : 'shows') +
              ' from the ' + (needs === 'front' ? 'side' : 'front') + '.)';
    }
    if (note) setCue(note, false);
  }

  function removeMistake(key) {
    active = active.filter(function (k) { return k !== key; });
    var note = setView(has('knees') ? 'front' : 'side');
    renderChips();
    update();
    if (note) setCue(note, false);
  }

  ui.addButton.addEventListener('click', function () {
    if (!ui.add.value) {
      ui.add.focus();
      return;
    }
    addMistake(ui.add.value);
  });
  ui.chips.addEventListener('click', function (e) {
    var chip = e.target.closest('.mistake-chip');
    if (!chip) return;
    var next = chip.parentNode.nextElementSibling || chip.parentNode.previousElementSibling;
    removeMistake(chip.getAttribute('data-mistake'));
    // keep keyboard focus somewhere sensible
    var target = next && next.querySelector('.mistake-chip');
    (target ? ui.chips.querySelector('[data-mistake="' + target.getAttribute('data-mistake') + '"]') : ui.add).focus();
  });

  function reset() {
    session = logic.createSession('squat');
    lastCue = '';
    wentDown = false;
    ui.depth.value = 0;
    ui.log.innerHTML = '';
    update();
    setCue('Drag the slider to the right to squat down.', false);
  }

  ui.depth.addEventListener('input', update);
  ui.reset.addEventListener('click', reset);
  renderChips();
  update();
  setCue('Drag the slider to the right to squat down.', false);
})();
