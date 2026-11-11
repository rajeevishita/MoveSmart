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

  var logic = window.MoveSmartLogic;
  var $ = function (id) { return document.getElementById(id); };
  var video = $('live-video');
  var canvas = $('live-canvas');
  if (!video || !canvas || !logic) return;
  var ctx = canvas.getContext('2d');

  var ui = {
    exercise: $('exercise'),
    startCamera: $('start-camera'),
    chooseFile: $('choose-file'),
    fileInput: $('video-file'),
    stop: $('stop-check'),
    placeholder: $('live-placeholder'),
    reps: $('rep-count'),
    angleLabel: $('angle-label'),
    angleValue: $('angle-value'),
    cue: $('live-cue'),
    log: $('rep-log'),
    status: $('live-status')
  };

  var landmarker = null;
  var loading = null;
  var stream = null;
  var fileUrl = null;
  var running = false;
  var session = null;
  var lastFrameTime = -1;
  var lastCue = '';

  // ---------- loading the pose model (only when someone presses a button) ----------
  function loadModel() {
    if (landmarker) return Promise.resolve(landmarker);
    if (loading) return loading;
    setStatus('Loading the pose model. This takes a few seconds the first time.');
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
        setStatus('');
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
    stopCheck(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('This browser cannot open the camera here. Open the site from its https:// address, or use a video file instead.');
      return;
    }
    setBusy(true);
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
      .catch(function (error) {
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
        handleError(error);
      });
  }

  function startFile(file) {
    stopCheck(false);
    setBusy(true);
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

  function begin() {
    session = logic.createSession(ui.exercise.value);
    running = true;
    lastFrameTime = -1;
    lastCue = '';
    ui.log.innerHTML = '';
    ui.reps.textContent = '0';
    ui.angleValue.textContent = '--';
    ui.angleLabel.textContent = session.angleLabel;
    ui.placeholder.hidden = true;
    ui.stop.disabled = false;
    ui.exercise.disabled = true;
    setBusy(false);
    setStatus('');
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
    ui.placeholder.hidden = false;
    ui.stop.disabled = true;
    ui.exercise.disabled = false;
    setBusy(false);
    if (showSummary && wasRunning && session) {
      var s = session.summary();
      setStatus('Set finished: ' + s.reps + (s.reps === 1 ? ' rep, ' : ' reps, ') + s.good + ' with good form.');
    }
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
      show(session.update(landmarks, canvas.width, canvas.height));
    }
    requestAnimationFrame(loop);
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
    ui.reps.textContent = String(state.reps);
    ui.angleValue.textContent = state.angle == null ? '--' : Math.round(state.angle) + '°';
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
    }
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

  function handleError(error) {
    running = false;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    setBusy(false);
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

  function setBusy(busy) {
    ui.startCamera.disabled = busy;
    ui.chooseFile.disabled = busy;
  }

  function setMirrored(on) {
    video.classList.toggle('mirrored', on);
    canvas.classList.toggle('mirrored', on);
  }

  // ---------- buttons ----------
  ui.startCamera.addEventListener('click', startCamera);
  ui.chooseFile.addEventListener('click', function () { ui.fileInput.click(); });
  ui.fileInput.addEventListener('change', function () {
    var file = ui.fileInput.files[0];
    ui.fileInput.value = '';
    if (file) startFile(file);
  });
  ui.stop.addEventListener('click', function () { stopCheck(true); });
  video.addEventListener('ended', function () { stopCheck(true); });
  ui.exercise.addEventListener('change', function () {
    ui.angleLabel.textContent = logic.EXERCISES[ui.exercise.value].angleLabel;
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && stream) stopCheck(true);
  });
})();
