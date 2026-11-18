/* ==========================================
   Move Smart - live form check
   Runs Google's MediaPipe pose model in the browser on the camera or a video file,
   draws the skeleton, and uses pose-logic.js to count reps and give feedback.
   Nothing is uploaded: every frame stays on the visitor's device.
   ========================================== */
(function () {
  'use strict';

  var MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  var COUNTDOWN_MS = 3000;

  var logic = window.MoveSmartLogic;
  var $ = function (id) { return document.getElementById(id); };
  var video = $('live-video');
  var canvas = $('live-canvas');
  if (!video || !canvas || !logic) return;
  var ctx = canvas.getContext('2d');

  var ui = {
    picker: document.querySelector('.exercise-picker'),
    stage: $('live-stage'),
    idle: $('stage-idle'),
    idleImage: $('idle-image'),
    idleText: $('idle-text'),
    hud: $('hud'),
    countdown: $('countdown'),
    loading: $('stage-loading'),
    start: $('start-camera'),
    chooseFile: $('choose-file'),
    fileInput: $('video-file'),
    voice: $('voice-toggle'),
    fullscreen: $('fullscreen-toggle'),
    reps: $('rep-count'),
    countLabel: $('count-label'),
    angleLabel: $('angle-label'),
    angleValue: $('angle-value'),
    cue: $('live-cue'),
    tip: $('live-tip'),
    status: $('live-status'),
    summary: $('set-summary'),
    logEmpty: $('log-empty'),
    log: $('rep-log')
  };

  // what to call each exercise in the instructions, and its picture
  var WORDS = {
    squat: { action: 'do a few squats', image: 'squat.svg' },
    pushup: { action: 'do a few push-ups', image: 'pushup.svg' },
    lunge: { action: 'do a few lunges', image: 'lunge.svg' },
    curl: { action: 'do a few bicep curls', image: 'curl.svg' },
    jack: { action: 'do a few jumping jacks', image: 'jack.svg' },
    plank: { action: 'hold a plank', image: 'plank.svg' }
  };

  var landmarker = null;
  var loading = null;
  var stream = null;
  var fileUrl = null;
  var running = false;
  var mode = null;          // 'camera' or 'file'
  var session = null;
  var lastFrameTime = -1;
  var lastCue = '';
  var countdownEnds = 0;
  var lastCountdownNumber = 0;
  var noteCounts = {};

  // ---------- choosing an exercise ----------
  function currentExercise() {
    var checked = document.querySelector('input[name="exercise"]:checked');
    return checked ? checked.value : 'squat';
  }

  function showExercise() {
    var key = currentExercise();
    var ex = logic.EXERCISES[key];
    ui.angleLabel.textContent = ex.angleLabel;
    ui.countLabel.textContent = ex.statLabel || 'Reps';
    ui.tip.textContent = 'Camera tip: ' + ex.viewTip;
    ui.idleImage.src = 'images/' + WORDS[key].image;
    ui.idleText.innerHTML = 'Press <strong>Start camera</strong>, step back, and ' + WORDS[key].action + '.';
    if (!running) ui.reps.textContent = ex.type === 'hold' ? '0:00' : '0';
  }

  // a link like form-check.html?exercise=lunge picks that exercise
  (function pickFromLink() {
    var match = /[?&]exercise=([a-z]+)/.exec(window.location.search);
    var input = match && document.querySelector('input[name="exercise"][value="' + match[1] + '"]');
    if (input) input.checked = true;
  })();

  // ---------- voice coach ----------
  var canSpeak = 'speechSynthesis' in window;
  var voiceOn = canSpeak;
  var lastSpoken = { text: '', at: 0 };
  try {
    if (localStorage.getItem('movesmart-voice') === 'off') voiceOn = false;
  } catch (e) { /* storage blocked: keep the default */ }

  function showVoice() {
    ui.voice.setAttribute('aria-pressed', String(voiceOn));
    ui.voice.textContent = voiceOn ? 'Voice coach: on' : 'Voice coach: off';
  }

  function say(text, urgent) {
    if (!voiceOn || !canSpeak) return;
    var now = performance.now();
    if (!urgent && (text === lastSpoken.text || now - lastSpoken.at < 2500)) return;
    if (urgent) window.speechSynthesis.cancel();
    var line = new SpeechSynthesisUtterance(text);
    line.rate = 1.05;
    window.speechSynthesis.speak(line);
    lastSpoken = { text: text, at: now };
  }

  // ---------- loading the pose model (only when someone presses a button) ----------
  function loadModel() {
    if (landmarker) return Promise.resolve(landmarker);
    if (loading) return loading;
    loading = import(MEDIAPIPE + '/vision_bundle.mjs')
      .then(function (mp) {
        return mp.FilesetResolver.forVisionTasks(MEDIAPIPE + '/wasm').then(function (files) {
          var options = function (delegate) {
            return {
              baseOptions: { modelAssetPath: MODEL, delegate: delegate },
              runningMode: 'VIDEO',
              numPoses: 1
            };
          };
          // use the graphics card when the browser allows it, otherwise the processor
          return mp.PoseLandmarker.createFromOptions(files, options('GPU')).catch(function () {
            return mp.PoseLandmarker.createFromOptions(files, options('CPU'));
          });
        });
      })
      .then(function (model) {
        landmarker = model;
        return model;
      })
      .catch(function (error) {
        loading = null;
        throw error;
      });
    return loading;
  }

  // ---------- starting and stopping ----------
  function startCamera() {
    if (running) {
      stopCheck(true);
      return;
    }
    clearStage();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('This browser cannot open the camera here. Open the site from its https:// address, or use a video file instead.');
      return;
    }
    setLoading(true);
    var camera = navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    Promise.all([camera, loadModel()])
      .then(function (results) {
        stream = results[0];
        video.srcObject = stream;
        setMirrored(true);
        return video.play();
      })
      .then(function () { begin('camera'); })
      .catch(handleError);
  }

  function startFile(file) {
    clearStage();
    setLoading(true);
    loadModel()
      .then(function () {
        fileUrl = URL.createObjectURL(file);
        video.srcObject = null;
        video.src = fileUrl;
        setMirrored(false);
        return video.play();
      })
      .then(function () { begin('file'); })
      .catch(handleError);
  }

  function begin(how) {
    mode = how;
    session = logic.createSession(currentExercise());
    running = true;
    lastFrameTime = -1;
    lastCue = '';
    noteCounts = {};
    ui.log.innerHTML = '';
    ui.logEmpty.hidden = false;
    ui.summary.hidden = true;
    ui.reps.textContent = session.type === 'hold' ? '0:00' : '0';
    ui.angleValue.textContent = '--';
    setCue('', false);
    setLoading(false);
    ui.idle.hidden = true;
    ui.hud.hidden = false;
    ui.picker.disabled = true;
    ui.chooseFile.disabled = true;
    ui.start.textContent = 'Stop';
    ui.start.classList.add('is-stop');
    setStatus('');
    // the camera gets a 3-2-1 countdown so you have time to step back
    countdownEnds = how === 'camera' ? performance.now() + COUNTDOWN_MS : 0;
    lastCountdownNumber = 0;
    if (countdownEnds) setCue('Get in position', false);
    requestAnimationFrame(loop);
  }

  function stopCheck(showSummary) {
    var wasRunning = running;
    running = false;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
      fileUrl = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ui.countdown.hidden = true;
    ui.hud.hidden = true;
    ui.idle.hidden = false;
    ui.picker.disabled = false;
    ui.chooseFile.disabled = false;
    ui.start.textContent = 'Start camera';
    ui.start.classList.remove('is-stop');
    setLoading(false);
    if (showSummary && wasRunning && session) showSummaryCard();
  }

  function clearStage() {
    stopCheck(false);
    ui.summary.hidden = true;
    setStatus('');
  }

  // ---------- the frame loop ----------
  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastFrameTime) {
      lastFrameTime = video.currentTime;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      var result;
      try {
        result = landmarker.detectForVideo(video, performance.now());
      } catch (error) {
        handleError(error);
        return;
      }
      var landmarks = result && result.landmarks && result.landmarks[0];
      draw(landmarks);
      if (inCountdown()) {
        // keep showing the skeleton, but do not count yet
      } else {
        show(session.update(landmarks, canvas.width, canvas.height, performance.now()));
      }
    } else {
      inCountdown();
    }
    requestAnimationFrame(loop);
  }

  // shows 3, 2, 1, Go and returns true while the countdown is still running
  function inCountdown() {
    if (!countdownEnds) return false;
    var left = countdownEnds - performance.now();
    if (left <= 0) {
      countdownEnds = 0;
      ui.countdown.textContent = 'Go!';
      say('Go', true);
      setCue(logic.EXERCISES[session.exercise].startCue || 'Go!', false);
      window.setTimeout(function () { ui.countdown.hidden = true; }, 600);
      return false;
    }
    var number = Math.ceil(left / 1000);
    if (number !== lastCountdownNumber) {
      lastCountdownNumber = number;
      ui.countdown.hidden = false;
      ui.countdown.textContent = String(number);
      say(String(number), true);
    }
    return true;
  }

  function draw(landmarks) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;
    var w = canvas.width, h = canvas.height;
    var size = Math.max(3, w / 240);
    ctx.lineCap = 'round';
    ctx.lineWidth = size * 1.6;
    ctx.strokeStyle = 'rgba(247, 246, 248, 0.95)';
    logic.CONNECTIONS.forEach(function (pair) {
      var a = landmarks[pair[0]], b = landmarks[pair[1]];
      if (a.visibility < 0.4 || b.visibility < 0.4) return;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    });
    ctx.lineWidth = size;
    logic.JOINTS.forEach(function (i) {
      var p = landmarks[i];
      if (p.visibility < 0.4) return;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, size * 2, 0, Math.PI * 2);
      ctx.fillStyle = '#2b2838';
      ctx.fill();
      ctx.strokeStyle = '#c4b5be';
      ctx.stroke();
    });
  }

  function show(state) {
    var value = state.display != null ? state.display : String(state.reps);
    if (ui.reps.textContent !== value) ui.reps.textContent = value;
    ui.angleValue.textContent = state.angle == null ? '--' : Math.round(state.angle) + '°';
    if (state.cue) {
      setCue(state.cue.text, state.cue.warn);
      if (state.cue.warn && !state.newRep) say(state.cue.text, false);
    }
    if (state.newRep) addRep(state.newRep);
  }

  function setCue(text, warn) {
    if (text === lastCue) return;
    lastCue = text;
    ui.cue.textContent = text;
    ui.cue.hidden = !text;
    ui.cue.classList.toggle('warn', !!warn);
  }

  function addRep(rep) {
    var item = document.createElement('li');
    item.textContent = rep.label || ('Rep ' + rep.number + ': ' +
      (rep.good ? 'good rep' : rep.notes.join(', ').toLowerCase()));
    if (!rep.good) item.className = 'warn';
    ui.log.appendChild(item);
    ui.log.scrollTop = ui.log.scrollHeight;
    ui.logEmpty.hidden = true;
    (rep.notes || []).forEach(function (note) { noteCounts[note] = (noteCounts[note] || 0) + 1; });

    // a little bounce on the counter, and the coach calls it out
    ui.reps.classList.remove('bump');
    void ui.reps.offsetWidth;
    ui.reps.classList.add('bump');
    if (rep.label) say(rep.label, true);
    else say(rep.good ? String(rep.number) : rep.number + '. ' + rep.notes[0], true);
  }

  // ---------- end of a set ----------
  function showSummaryCard() {
    var s = session.summary();
    var html;
    if (session.type === 'hold') {
      html = '<h3>Plank finished</h3><p class="summary-big">' + logic.formatTime(s.seconds) + '</p>' +
        '<p>held in good form</p>';
    } else {
      var score = s.reps ? Math.round((s.good / s.reps) * 100) : 0;
      html = '<h3>Set finished</h3><p class="summary-big">' + s.reps + (s.reps === 1 ? ' rep' : ' reps') + '</p>' +
        '<p>' + s.good + ' of ' + s.reps + ' with good form' + (s.reps ? ' (' + score + '%)' : '') + '</p>';
      var top = Object.keys(noteCounts).sort(function (a, b) { return noteCounts[b] - noteCounts[a]; })[0];
      if (top) html += '<p class="summary-tip"><strong>Focus on next time:</strong> ' + top.toLowerCase() + '</p>';
      else if (s.reps) html += '<p class="summary-tip"><strong>Great set!</strong> Every rep had good form.</p>';
    }
    ui.summary.innerHTML = html;
    ui.summary.hidden = false;
    ui.summary.focus({ preventScroll: true });
    setStatus(session.summaryText());
  }

  // ---------- messages ----------
  function setStatus(text) {
    ui.status.textContent = text;
    ui.status.classList.remove('error');
  }

  function showError(text) {
    ui.status.textContent = text;
    ui.status.classList.add('error');
  }

  function setLoading(on) {
    ui.loading.hidden = !on;
    ui.start.disabled = on;
    ui.chooseFile.disabled = on || running;
    if (on) ui.idle.hidden = true;
  }

  function handleError(error) {
    stopCheck(false);
    var name = error && error.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      showError('Camera access was blocked. Allow the camera for this site in your browser settings, or use a video file instead.');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      showError('No camera was found. Connect a camera, or use a video file instead.');
    } else if (name === 'NotReadableError') {
      showError('Your camera is being used by another app. Close that app and try again.');
    } else if (name === 'NotSupportedError' || (error && /source|format/i.test(error.message || ''))) {
      showError('This video could not be played. Try an MP4 or WebM file.');
    } else {
      showError('The pose model could not load. Check your internet connection and try again.');
    }
    if (window.console) console.error(error);
  }

  function setMirrored(on) {
    video.classList.toggle('mirrored', on);
    canvas.classList.toggle('mirrored', on);
  }

  // ---------- full screen ----------
  var stageFull = ui.stage.requestFullscreen ? 'requestFullscreen' : (ui.stage.webkitRequestFullscreen ? 'webkitRequestFullscreen' : null);
  function isFull() {
    return (document.fullscreenElement || document.webkitFullscreenElement) === ui.stage;
  }
  if (!stageFull) {
    ui.fullscreen.hidden = true;
  } else {
    ui.fullscreen.addEventListener('click', function () {
      if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else ui.stage[stageFull]();
    });
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (name) {
      document.addEventListener(name, function () {
        ui.fullscreen.textContent = isFull() ? 'Exit full screen' : 'Full screen';
      });
    });
  }

  // ---------- buttons ----------
  ui.start.addEventListener('click', startCamera);
  ui.chooseFile.addEventListener('click', function () { ui.fileInput.click(); });
  ui.fileInput.addEventListener('change', function () {
    var file = ui.fileInput.files[0];
    ui.fileInput.value = '';
    if (file) startFile(file);
  });
  video.addEventListener('ended', function () { if (mode === 'file') stopCheck(true); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="exercise"]'), function (input) {
    input.addEventListener('change', function () {
      ui.summary.hidden = true;
      setStatus('');
      showExercise();
    });
  });
  if (canSpeak) {
    ui.voice.addEventListener('click', function () {
      voiceOn = !voiceOn;
      if (!voiceOn) window.speechSynthesis.cancel();
      try { localStorage.setItem('movesmart-voice', voiceOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
      showVoice();
    });
    showVoice();
  } else {
    ui.voice.hidden = true;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && stream) stopCheck(true);
  });
  showExercise();
})();
