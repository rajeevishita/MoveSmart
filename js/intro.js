/* ==========================================
   Move Smart - home page intro
   An 8-second opening: the hero gets designed in a Figma-style editor
   (canvas, body points, fill, glass, a squat, the tagline, a 3D view of the
   layers), then the frame zooms into the real page.
   Plays once per visit. "Skip intro" or Escape jumps past it, and the
   "Replay intro" button in the hero plays it again.
   ========================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var intro = document.getElementById('intro');
  if (!intro) return;

  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var replayButton = document.querySelector('.intro-replay');
  var skipButton = intro.querySelector('.intro-skip');
  var editor = intro.querySelector('.intro-editor');
  var frame = intro.querySelector('.ed-frame');
  var layers = intro.querySelectorAll('.lyr');
  var cursor = intro.querySelector('.ed-cursor');
  var caption = intro.querySelector('.intro-caption');
  var captionNum = intro.querySelector('.ic-num');
  var captionText = intro.querySelector('.ic-text');
  var bar = intro.querySelector('.intro-progress i');
  var svg = document.getElementById('intro-svg');
  var ui = {
    reps: document.getElementById('intro-reps'),
    angle: document.getElementById('intro-angle'),
    tilt: document.getElementById('intro-tilt'),
    turn: document.getElementById('intro-turn'),
    gap: document.getElementById('intro-gap'),
    hex: document.getElementById('intro-hex'),
    scrub: intro.querySelector('.pr-scrub i')
  };
  var SEEN_KEY = 'movesmart-intro';
  var STAGES = ['is-frame', 'is-paths', 'is-fill', 'is-glass', 'is-motion', 'is-deep', 'is-word', 'is-3d', 'is-out', 'is-skip'];
  var END = 8100;

  // ---------- the skeleton (side view, same shape as the hero and practice area) ----------
  var NS = 'http://www.w3.org/2000/svg';
  var RAD = Math.PI / 180;

  function make(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    svg.appendChild(el);
    return el;
  }

  make('line', { 'class': 'ifloor', x1: 450, y1: 503, x2: 830, y2: 503 });
  var arc = make('path', { 'class': 'iarc' });
  var bones = make('path', { 'class': 'ib', pathLength: 1 });
  var head = make('circle', { 'class': 'ihead', r: 26, pathLength: 1 });
  var JOINTS = ['ankle', 'knee', 'hip', 'shoulder', 'elbow', 'wrist'];
  var joints = JOINTS.map(function (name, i) {
    var c = make('circle', { 'class': 'ij', r: 9 });
    c.style.setProperty('--i', i);
    return c;
  });
  var label = make('text', { 'class': 'ilabel' });

  function pose(depth) {
    var ax = 600, ay = 490;
    var knee = [ax + 120 * Math.sin(30 * depth * RAD), ay - 120 * Math.cos(30 * depth * RAD)];
    var hip = [knee[0] - 135 * Math.sin(95 * depth * RAD), knee[1] - 135 * Math.cos(95 * depth * RAD)];
    var torso = 3 + 42 * depth;
    var shoulder = [hip[0] + 150 * Math.sin(torso * RAD), hip[1] - 150 * Math.cos(torso * RAD)];
    var headPt = [shoulder[0] + 55 * Math.sin((torso + 5) * RAD), shoulder[1] - 55 * Math.cos((torso + 5) * RAD)];
    var arm = 90 * Math.min(1, depth * 1.4);
    var elbow = [shoulder[0] + 80 * Math.sin((180 - arm) * RAD), shoulder[1] - 80 * Math.cos((180 - arm) * RAD)];
    var wrist = [elbow[0] + 72 * Math.sin((180 - arm * 1.05) * RAD), elbow[1] - 72 * Math.cos((180 - arm * 1.05) * RAD)];
    return { ankle: [ax, ay], knee: knee, hip: hip, shoulder: shoulder, head: headPt, elbow: elbow, wrist: wrist, toe: [650, 498], heel: [582, 498] };
  }

  function pt(q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }

  function kneeAngle(p) {
    var a = [p.hip[0] - p.knee[0], p.hip[1] - p.knee[1]];
    var b = [p.ankle[0] - p.knee[0], p.ankle[1] - p.knee[1]];
    var cos = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]));
    return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
  }

  var lastDepth = -1;
  function drawPose(depth) {
    if (Math.abs(depth - lastDepth) < 0.002) return;
    lastDepth = depth;
    var p = pose(depth);
    var neck = [p.head[0] + (p.shoulder[0] - p.head[0]) * 26 / 55, p.head[1] + (p.shoulder[1] - p.head[1]) * 26 / 55];
    bones.setAttribute('d',
      'M' + pt(p.shoulder) + ' L' + pt(p.hip) + ' L' + pt(p.knee) + ' L' + pt(p.ankle) + ' L' + pt(p.toe) +
      ' M' + pt(p.ankle) + ' L' + pt(p.heel) +
      ' M' + pt(p.shoulder) + ' L' + pt(p.elbow) + ' L' + pt(p.wrist) +
      ' M' + pt(p.shoulder) + ' L' + pt(neck));
    head.setAttribute('cx', p.head[0]);
    head.setAttribute('cy', p.head[1]);
    JOINTS.forEach(function (name, i) {
      joints[i].setAttribute('cx', p[name][0]);
      joints[i].setAttribute('cy', p[name][1]);
    });
    var angle = kneeAngle(p);
    var toHip = Math.atan2(p.hip[1] - p.knee[1], p.hip[0] - p.knee[0]);
    var toAnkle = Math.atan2(p.ankle[1] - p.knee[1], p.ankle[0] - p.knee[0]);
    var r = 40;
    var a = [p.knee[0] + r * Math.cos(toHip), p.knee[1] + r * Math.sin(toHip)];
    var b = [p.knee[0] + r * Math.cos(toAnkle), p.knee[1] + r * Math.sin(toAnkle)];
    var turn = (toAnkle - toHip + 2 * Math.PI) % (2 * Math.PI);
    arc.setAttribute('d', angle > 170 ? '' : 'M' + pt(a) + ' A' + r + ' ' + r + ' 0 0 ' + (turn < Math.PI ? 1 : 0) + ' ' + pt(b));
    label.setAttribute('x', p.knee[0] + 26);
    label.setAttribute('y', p.knee[1] + 8);
    label.textContent = Math.round(angle) + '°';
    ui.angle.textContent = Math.round(angle) + '°';
  }

  // ---------- small helpers ----------
  function stage(name) { intro.classList.add(name); }

  function showLayer(name) {
    var item = intro.querySelector('.ed-tree [data-layer="' + name + '"]');
    if (!item) return;
    item.classList.add('is-shown');
    intro.querySelectorAll('.ed-tree .is-active').forEach(function (el) { el.classList.remove('is-active'); });
    item.classList.add('is-active');
  }

  function setProp(name) {
    var sec = intro.querySelector('.pr[data-prop="' + name + '"]');
    intro.querySelectorAll('.pr.is-active').forEach(function (el) { el.classList.remove('is-active'); });
    if (sec) sec.classList.add('is-set', 'is-active');
  }

  function say(num, text) {
    caption.classList.add('is-swap');
    window.setTimeout(function () {
      captionNum.textContent = num;
      captionText.textContent = text;
      caption.classList.remove('is-swap');
    }, 140);
  }

  // move the cursor to a spot on an element (fx, fy = 0..1 across it)
  function cursorTo(el, fx, fy) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (!r.width) return; // hidden on phones
    var e = editor.getBoundingClientRect();
    cursor.style.setProperty('--cx', Math.round(r.left - e.left + r.width * (fx === undefined ? 0.5 : fx)) + 'px');
    cursor.style.setProperty('--cy', Math.round(r.top - e.top + r.height * (fy === undefined ? 0.5 : fy)) + 'px');
  }

  function click() {
    cursor.classList.add('is-click');
    window.setTimeout(function () { cursor.classList.remove('is-click'); }, 160);
  }

  // the last row of a settings section; the cursor's name tag then hangs into the
  // short title of the next section instead of covering a value
  function prop(name) {
    var rows = intro.querySelectorAll('.pr[data-prop="' + name + '"] p, .pr[data-prop="' + name + '"] .pr-scrub');
    return rows[rows.length - 1];
  }

  function pointAt(name) { cursorTo(prop(name), 0.37, 0.5); }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function ease(u) {
    u = Math.max(0, Math.min(1, u));
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  // ---------- the timeline (milliseconds) ----------
  var EVENTS = [
    [0, function () { say('01', 'Canvas · 1440 × 900'); cursorTo(frame, 0.92, 0.9); }],
    [380, function () { stage('is-frame'); showLayer('hero'); setProp('frame'); cursorTo(frame, 0.04, 0.06); click(); }],
    [900, function () { say('02', 'Vector paths · 33 body points'); stage('is-paths'); showLayer('skeleton'); showLayer('joints'); cursorTo(frame, 0.56, 0.3); }],
    [1350, function () { showLayer('bones'); }],
    [1950, function () { pointAt('fill'); }],
    [2150, function () { say('03', 'Fill · #2B2838'); click(); stage('is-fill'); setProp('fill'); showLayer('background'); ui.hex.textContent = '2B2838'; }],
    [2700, function () { pointAt('fx'); }],
    [2900, function () { say('04', 'Glass · background blur 22'); click(); stage('is-glass'); setProp('fx'); showLayer('hud'); showLayer('reps'); showLayer('angle'); }],
    [3350, function () { pointAt('motion'); }],
    [3550, function () { say('05', 'Motion · squat, 1 rep'); click(); stage('is-motion'); setProp('motion'); }],
    [4900, function () { pointAt('text'); }],
    [5100, function () { say('06', 'Type · Archivo ExtraBold'); click(); stage('is-word'); setProp('text'); showLayer('wordmark'); }],
    [5750, function () { pointAt('d3'); }],
    [5900, function () { say('07', '3D view · tilt 52°, turn −24°'); click(); stage('is-3d'); setProp('d3'); }],
    [7150, function () { intro.classList.remove('is-3d'); setProp('export'); }],
    [7350, function () { zoomFrom = frame.getBoundingClientRect(); stage('is-out'); heroEnter(); }]
  ];

  var MOTION = [3600, 5000];        // the squat
  var TILT = [5900, 6400, 6750, 7200]; // into 3D, hold, back out
  var OUT = [7350, 7850];           // zoom into the page (then it fades until 8100)

  var running = false, start = null, frameId = 0, fired = 0, repDone = false, frameWidth = 0, lastShown = {}, zoomFrom = null;

  function setText(key, el, text) {
    if (lastShown[key] === text) return;
    lastShown[key] = text;
    el.textContent = text;
  }

  function update(t) {
    bar.style.transform = 'scaleX(' + Math.min(1, t / END).toFixed(4) + ')';

    // the squat: down and back up, with the rep counted on the way up
    var u = (t - MOTION[0]) / (MOTION[1] - MOTION[0]);
    var depth = u > 0 && u < 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * u) : 0;
    drawPose(depth);
    ui.scrub.style.width = (Math.max(0, Math.min(1, u)) * 100).toFixed(1) + '%';
    intro.classList.toggle('is-deep', u > 0.42 && t < OUT[0]);
    if (!repDone && u >= 0.8) {
      repDone = true;
      ui.reps.textContent = '1';
      bump(ui.reps);
    }

    // the 3D view: tilt and turn the frame, and spread the layers apart
    var k = 0;
    if (t > TILT[0] && t < TILT[3]) {
      k = t < TILT[1] ? ease((t - TILT[0]) / (TILT[1] - TILT[0])) : t < TILT[2] ? 1 : 1 - ease((t - TILT[2]) / (TILT[3] - TILT[2]));
    }
    var o = Math.max(0, Math.min(1, (t - OUT[0]) / (OUT[1] - OUT[0])));
    var out = 1 - Math.pow(1 - o, 3);   // fast at first, then settles
    var tilt = 52 * k, turn = -24 * k;
    var scale = 1 - 0.24 * k, dx = 0, dy = 0;
    if (out > 0 && zoomFrom) {
      // the design grows until it is the page: as wide as the window, lined up with the top
      var vw = window.innerWidth;
      var full = vw / zoomFrom.width;
      scale = 1 + (full - 1) * out;
      dx = (vw / 2 - (zoomFrom.left + zoomFrom.width / 2)) * out;
      dy = (vw * 0.625 / 2 - (zoomFrom.top + zoomFrom.height / 2)) * out;
    }
    frame.style.transform = 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px) rotateX(' + tilt.toFixed(2) + 'deg) rotateZ(' + turn.toFixed(2) + 'deg) scale(' + scale.toFixed(4) + ')';
    frame.style.filter = out > 0 ? 'blur(' + (out * 6).toFixed(1) + 'px)' : '';
    var gap = k * frameWidth * 0.1;
    for (var i = 0; i < layers.length; i++) {
      layers[i].style.transform = gap ? 'translateZ(' + (gap * i).toFixed(1) + 'px)' : '';
    }
    setText('tilt', ui.tilt, Math.round(tilt) + '°');
    setText('turn', ui.turn, (turn < -0.5 ? '−' : '') + Math.abs(Math.round(turn)) + '°');
    setText('gap', ui.gap, String(Math.round(gap)));
  }

  function tick(now) {
    if (start === null) start = now; // starts when the tab is actually visible
    var t = now - start;
    while (fired < EVENTS.length && EVENTS[fired][0] <= t) {
      EVENTS[fired][1]();
      fired++;
    }
    update(t);
    if (t < END) frameId = window.requestAnimationFrame(tick);
    else finish();
  }

  // ---------- start, skip, finish ----------
  var others = [];

  function lock(on) {
    root.classList.toggle('intro-lock', on);
    if (on) others = Array.prototype.filter.call(document.body.children, function (el) { return el !== intro && el.tagName !== 'SCRIPT'; });
    others.forEach(function (el) { el.inert = on; });
  }

  function reset() {
    intro.classList.add('is-reset');
    STAGES.concat('is-play').forEach(function (s) { intro.classList.remove(s); });
    intro.querySelectorAll('.is-shown, .is-active, .is-set').forEach(function (el) { el.classList.remove('is-shown', 'is-active', 'is-set'); });
    ui.reps.textContent = '0';
    ui.hex.textContent = 'FFFFFF';
    lastShown = {};
    lastDepth = -1;
    zoomFrom = null;
    repDone = false;
    fired = 0;
    start = null;
    drawPose(0);
    update(0);
    void intro.offsetWidth;            // apply the reset before animating again
    intro.classList.remove('is-reset');
    intro.classList.add('is-play');
  }

  function heroEnter() {
    root.classList.add('hero-enter');
    window.setTimeout(function () { root.classList.remove('hero-enter'); }, 2200);
  }

  function play() {
    window.cancelAnimationFrame(frameId);
    intro.style.animation = 'none';    // the script is running, so the backup timer isn't needed
    root.classList.add('intro-on');
    frameWidth = frame.offsetWidth;
    reset();
    lock(true);
    running = true;
    skipButton.focus({ preventScroll: true });
    frameId = window.requestAnimationFrame(tick);
  }

  function finish() {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(frameId);
    var hadFocus = intro.contains(document.activeElement);
    lock(false);
    root.classList.remove('intro-on');
    STAGES.forEach(function (s) { intro.classList.remove(s); });
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* private mode: it may play again next time */ }
    if (hadFocus) {
      var main = document.getElementById('main');
      if (main) {
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }
    }
  }

  function skip() {
    if (!running) return;
    window.cancelAnimationFrame(frameId);
    intro.classList.add('is-skip');
    heroEnter();
    window.setTimeout(function () {
      running = true;
      finish();
    }, 320);
    running = false;
  }

  skipButton.addEventListener('click', skip);
  document.addEventListener('keydown', function (e) {
    if (running && e.key === 'Escape') skip();
  });
  window.addEventListener('resize', function () {
    if (running) frameWidth = frame.offsetWidth;
  });

  if (replayButton && !calm) {
    replayButton.hidden = false;
    replayButton.addEventListener('click', function () {
      window.scrollTo(0, 0);
      play();
    });
  }

  drawPose(0);
  if (root.classList.contains('intro-on')) play();
})();
