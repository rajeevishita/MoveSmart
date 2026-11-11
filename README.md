# Move Smart

**AI-powered exercise form feedback that runs in your browser.**

Live site: https://rajeevishita.github.io/MoveSmart/

Move Smart uses computer vision to watch you exercise, count your reps, and tell you what to fix, in real time. Point your webcam at yourself (or upload a video), do a set of squats or push-ups, and Move Smart tracks your joints, measures the angles between them, and gives feedback on every rep.

All processing happens on your device. Video is never uploaded to a server.

## Features

- **Live form check** with your webcam or a video file ([Form Check page](https://rajeevishita.github.io/MoveSmart/form-check.html#live-check))
- **Pose tracking** with Google's MediaPipe Pose Landmarker (33 body points per frame)
- **Rep counting** for squats and push-ups
- **Form feedback**, live and per rep:
  - Squat: depth, heels lifting, chest dropping, knees caving in (front view)
  - Push-up: depth, hips sagging, hips too high
- **Exercise guides** for the squat, push-up, lunge, deadlift, and overhead press
- Responsive design that works on phones, and it respects the "reduce motion" setting

## How the live check works

1. **Find the body.** Each video frame goes to MediaPipe's pose model, which returns 33 landmarks (shoulders, hips, knees, ankles, heels, and more).
2. **Measure.** `js/pose-logic.js` converts the landmarks to pixels and calculates joint angles with the dot product, plus a few body ratios. For squats, the main signal is how high the hips are above the knees, measured in shin lengths. It is about 1 when standing and about 0 when the thighs are parallel to the floor, and it works from the side or the front.
3. **Count reps.** The signal is smoothed, then a two-threshold state machine counts a rep only after you go below the "down" line and come back above the "up" line. Using two thresholds stops small wobbles from being counted as reps.
4. **Check form.** During each rep, simple rules compare joint positions against cues a coach would use. For example, the heels are compared with where they sat while you were standing tall.

## Tech

- HTML5, CSS3 (custom properties, grid, flexbox), vanilla JavaScript
- [MediaPipe Tasks Vision](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) for in-browser pose estimation
- Node's built-in test runner for unit tests
- Hosted on GitHub Pages

## Project structure

```
index.html            Home page
how-it-works.html     Steps, camera setup, privacy
exercises.html        Comparison table and exercise guides
form-check.html       Live form check, demo video, example report
about.html            The problem and the project's background
contact.html          Contact form and FAQ
css/style.css         All styles
js/pose-logic.js      Angles, rep counting, and form rules (no browser code)
js/form-check.js      Camera, video, drawing, and the page controls
tests/                Unit tests for pose-logic.js
images/, videos/      Illustrations and demo videos
```

## Run it locally

Open `index.html` in a browser. The live check needs an internet connection the first time, to download the pose model.

To run the tests (Node 18 or newer):

```
node --test
```

## Roadmap

- More exercises for the live check (lunge, deadlift, overhead press)
- Measure accuracy against hand-counted reps on recorded clips
- Save sessions and show progress over time

## Credits

Built by Ishita Rajeev. Started as a semester website project for CIS 300 (Web Design and Development) at Arizona State University, growing out of an earlier exercise form analyzer built with Python, OpenCV, and MediaPipe.

&copy; 2026 Ishita Rajeev. All rights reserved.
