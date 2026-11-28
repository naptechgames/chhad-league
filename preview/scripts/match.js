"use strict";
const $ = (id) => document.getElementById(id),
  canvas = $("pitch");
const touchLayout = matchMedia("(any-pointer:coarse), (max-width:700px)");
const portraitPitch = matchMedia(
  "(orientation:portrait) and (any-pointer:coarse), (orientation:portrait) and (max-width:700px)"
);
const stadium = createStadium(canvas);
const W = 1000,
  H = 450,
  CY = 225,
  GOAL = 70,
  clamp = (v, l, h) => Math.max(l, Math.min(h, v)),
  dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const players = Array.from({ length: 4 }, (_, i) => ({
  i,
  team: i >> 1,
  x: 0,
  y: 0,
  face: i < 2 ? 1 : -1,
  step: 0,
  burst: 0,
  cool: 0,
  moving: false
}));
let ball = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    height: 0,
    lift: 0,
    spin: 0,
    owner: 0,
    lock: 0,
    passTo: -1,
    rotation: new Float32Array([0, 0, 0, 1])
  },
  active = 0,
  mode = "menu",
  beforePause = "play",
  score = [0, 0],
  seconds = gameBrand.matchSeconds,
  lastAttack = false,
  extra = 0,
  restart = 0,
  kickSide = 0,
  charging = false,
  charge = 0,
  aim = 0,
  bend = 0,
  flash = 0,
  message = "",
  elapsed = 0;
const keys = new Set();
let joy = { x: 0, y: 0 },
  stickId = null,
  nudgeLeft = 0,
  audio = null,
  sound = false;
const quickShotPower = 0.5,
  dashCooldown = 2.1;
const teamNames = ["Mint", "Coral"];
const matchTally = { shots: [0, 0], saves: [0, 0] };
const hud = {
  root: $("match-hud"),
  score: $("goals"),
  clock: $("clock"),
  clockBox: $("clock-box"),
  clockLabel: $("clock-label"),
  notice: $("notice"),
  power: $("power"),
  powerValue: $("power-value"),
  track: $("power-track"),
  fill: $("fill"),
  curl: $("curl"),
  touch: $("touch-controls"),
  shoot: $("shoot"),
  pass: $("pass"),
  dash: $("dash"),
  stepover: $("stepover"),
  feint: $("feint"),
  replay: $("replay-bar"),
  replayFill: $("replay-fill"),
  overlay: $("overlay"),
  summary: $("match-summary")
};
let noticeTeam = null,
  paintedPower = -1,
  paintedCurl = null,
  paintedDash = -1,
  paintedReplay = -1;
const replayRate = 0.5,
  shotSampleStep = 1 / 40,
  frameLimit = 256;
const recording = {
  frames: [],
  pool: [],
  kick: null,
  event: null,
  next: 0,
  step: shotSampleStep,
  keyframe: false
};
let replay = null;

function rotateFootball(q, dx, dz, out) {
  const travel = Math.hypot(dx, dz);
  if (travel < 0.00001 || travel > 3) {
    out.set(q);
    return;
  }
  const half = travel / (2 * 0.166),
    s = Math.sin(half) / travel,
    X = dz * s,
    Z = -dx * s,
    W = Math.cos(half),
    [a, b, c, w] = q;
  out[0] = W * a + X * w - Z * b;
  out[1] = W * b + Z * a - X * c;
  out[2] = W * c + Z * w + X * b;
  out[3] = W * w - X * a - Z * c;
}
function resetRecording() {
  recording.pool.push(...recording.frames.splice(0));
  recording.kick = null;
  recording.event = null;
  recording.next = 0;
  recording.step = shotSampleStep;
  recording.keyframe = false;
}
function trimRecording(before) {
  const frames = recording.frames;
  let drop = 0;
  while (drop + 1 < frames.length && frames[drop + 1].time <= before) drop++;
  if (drop) recording.pool.push(...frames.splice(0, drop));
}
function captureFrame(force = false) {
  if (!force && elapsed + 1e-7 < recording.next) return;
  const frames = recording.frames;
  if (recording.kick === null && !recording.event) trimRecording(elapsed - 0.42);
  let frame = frames[frames.length - 1];
  if (!frame || Math.abs(frame.time - elapsed) > 1e-7) {
    // Keep the wind-up even for an unusually long rolling shot; reuse the discarded slots.
    if (frames.length >= frameLimit) {
      let kept = 1;
      for (let i = 1; i < frames.length; i++) {
        if (i % 2 === 0 || i === frames.length - 1) frames[kept++] = frames[i];
        else recording.pool.push(frames[i]);
      }
      frames.length = kept;
      recording.step *= 2;
    }
    frame = recording.pool.pop() || {
      rotation: new Float32Array(4),
      rigs: Array.from({ length: 6 }, () => new Float32Array(15 * 16))
    };
    frames.push(frame);
  }
  frame.time = elapsed;
  frame.x = ball.x;
  frame.y = ball.y;
  frame.height = ball.height;
  frame.rotation.set(ball.rotation);
  stadium.captureRigs(frame.rigs, elapsed, mode === "goal" ? 1 - kickSide : -1);
  recording.next = elapsed + (recording.kick === null && !recording.event ? 1 / 24 : recording.step);
}
function recordKick() {
  if (recording.event) return;
  trimRecording(elapsed - 0.42);
  recording.kick = elapsed;
  recording.step = shotSampleStep;
  captureFrame(true);
}
function markReplay(kind, team) {
  recording.event = { kind, team, impact: elapsed };
  recording.keyframe = true;
}
function startReplay() {
  const event = recording.event,
    frames = recording.frames;
  captureFrame(true);
  recording.event = null;
  if (frames.length < 2) {
    if (mode === "end") showResult();
    return;
  }
  const title = teamNames[event.team] + (event.kind === "goal" ? " goal" : " diving save");
  replay = {
    kind: event.kind,
    goalSign: (event.team ? 1 : -1) * (event.kind === "goal" ? -1 : 1),
    resume: mode,
    start: frames[0].time,
    time: frames[0].time,
    end: frames[frames.length - 1].time,
    index: 0,
    ball: { rotation: new Float32Array(4) }
  };
  resetInput();
  setScreen("replay");
  paintedReplay = -1;
  updateReplayMeter();
  $("replay-event").textContent = title;
  $("live").textContent = title + " replay";
  $("skip-replay").focus({ preventScroll: true });
}
function replayView() {
  if (!replay) return null;
  const frames = recording.frames,
    r = replay;
  while (r.index + 1 < frames.length - 1 && frames[r.index + 1].time <= r.time) r.index++;
  r.a = frames[r.index];
  r.b = frames[r.index + 1];
  const u = (r.blend = clamp((r.time - r.a.time) / (r.b.time - r.a.time), 0, 1));
  const b = r.ball;
  b.x = r.a.x + (r.b.x - r.a.x) * u;
  b.y = r.a.y + (r.b.y - r.a.y) * u;
  b.height = r.a.height + (r.b.height - r.a.height) * u;
  if (u === 1) b.rotation.set(r.b.rotation);
  else rotateFootball(r.a.rotation, (b.x - r.a.x) * 0.04, (b.y - r.a.y) * 0.04, b.rotation);
  return r;
}
function exitReplay() {
  if (mode !== "replay") return;
  const resume = replay.resume;
  replay = null;
  recording.kick = null;
  recording.step = shotSampleStep;
  setScreen(resume);
  if (mode === "end") {
    showResult();
    return;
  }
  canvas.focus({ preventScroll: true });
  if (mode === "goal") {
    afterGoalKickoff();
    return;
  }
  trimRecording(elapsed - 0.42);
  flash = 0;
  updatePossession();
  $("live").textContent = "Play resumes";
}
function beep(freq, len = 0.09) {
  if (!sound || !audio) return;
  const o = audio.createOscillator(),
    g = audio.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audio.destination);
  g.gain.setValueAtTime(0.09, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.002, audio.currentTime + len);
  o.start();
  o.stop(audio.currentTime + len);
}
function formatTime(value) {
  const t = Math.max(0, Math.ceil(value));
  return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
}
function setScreen(next) {
  mode = next;
  document.body.dataset.screen = next;
  hud.root.hidden = next === "menu" || next === "pause" || next === "end";
  hud.touch.hidden = next !== "play";
  hud.replay.hidden = next !== "replay";
  hud.notice.hidden = next === "replay";
  hud.overlay.hidden = true;
  hud.summary.hidden = next !== "end";
  $("pause").hidden = next !== "play" && next !== "goal" && next !== "replay";
  $("view-status").hidden = true;
  $("control-guide").hidden = true;
  $("help-toggle").setAttribute("aria-expanded", "false");
  if (next === "play" || next === "goal") {
    updateControls();
    updatePossession();
  }
}
function updateClock() {
  const left = lastAttack ? extra : seconds,
    late = seconds > 0 && seconds <= 10;
  const label =
    mode === "end" ? "Full time" : lastAttack ? "Last attack" : late ? "Final 10s" : "Time left";
  const value = formatTime(left);
  if (hud.clock.textContent !== value) hud.clock.textContent = value;
  if (hud.clockLabel.textContent !== label) {
    hud.clockLabel.textContent = label;
    hud.clockBox.classList.toggle("urgent", lastAttack || late);
  }
}
function stats() {
  const goals = score.join("–");
  if (hud.score.textContent !== goals) hud.score.textContent = goals;
  updateClock();
}
function updatePossession() {
  let team = null,
    label = "Loose ball";
  if (flash > 0) {
    team = noticeTeam;
    label = message;
  } else if (ball.owner >= 0) {
    team = players[ball.owner].team;
    label = teamNames[team] + " in possession";
  } else if (ball.shotTeam != null) {
    team = ball.shotTeam;
    label = teamNames[team] + " shot";
  } else if (ball.passTo >= 0) {
    team = players[ball.passTo].team;
    label = teamNames[team] + " pass";
  }
  const side = team == null ? "neutral" : team === 0 ? "mint" : "coral";
  if (hud.notice.textContent !== label) hud.notice.textContent = label;
  if (hud.notice.dataset.team !== side) hud.notice.dataset.team = side;
}
function announce(s, t = 1.1, team = null) {
  message = s;
  flash = t;
  noticeTeam = team;
  updatePossession();
  $("live").textContent = s;
}
function kickoffCue() {
  return portraitPitch.matches ? "Mint kick off · Attack up" : "Mint kick off · Attack right";
}
function updateViewCopy() {
  const portrait = portraitPitch.matches;
  canvas.setAttribute(
    "aria-label",
    "Rooftop soccer field. Mint attacks the goal " + (portrait ? "at the top." : "on the right.")
  );
  if (mode === "menu")
    $("detail").textContent =
      "3v3 soccer · " + gameBrand.matchSeconds + " seconds on the clock. You play as Mint.";
  const guide = $("touch-guide");

  guide.textContent =
    (portrait
      ? "Drag the pad up to attack. Tap Shoot, or hold and swipe left or right to curl."
      : "Drag the pad right to attack. Tap Shoot, or hold and swipe up or down to curl.") +
    (mode === "pause" ? " Without the ball, tap Switch or Tackle." : "");
  if (flash > 0 && message.startsWith("Mint kick off ·")) {
    message = kickoffCue();
    updatePossession();
  }
}
function updateShotMeter() {
  const percent = Math.round(charge * 100),
    curlPercent = Math.abs(bend) < 0.06 ? 0 : Math.round(bend * 100);
  if (percent !== paintedPower) {
    paintedPower = percent;
    hud.powerValue.textContent = percent + "%";
    hud.track.setAttribute("aria-valuenow", String(percent));
    hud.fill.style.transform = "scaleX(" + percent / 100 + ")";
  }
  if (curlPercent !== paintedCurl) {
    paintedCurl = curlPercent;
    const side = portraitPitch.matches
      ? curlPercent < 0
        ? "Left"
        : "Right"
      : curlPercent < 0
        ? "Far-post"
        : "Near-post";
    hud.curl.textContent = curlPercent ? side + " curl · " + Math.abs(curlPercent) + "%" : "Straight";
  }
}
function updateReplayMeter() {
  const pct = Math.round(clamp((replay.time - replay.start) / (replay.end - replay.start), 0, 1) * 100);
  if (pct !== paintedReplay) {
    paintedReplay = pct;
    hud.replayFill.style.transform = "scaleX(" + pct / 100 + ")";
  }
}
function updateDashMeter(p) {
  const ready = Math.round(20 * (1 - clamp(p.cool / dashCooldown, 0, 1)));
  if (ready !== paintedDash) {
    paintedDash = ready;
    hud.touch.style.setProperty("--dash-ready", String(ready / 20));
  }
  hud.touch.classList.toggle("recovering", p.cool > 0);
}
function canDash(p) {
  return !p.cool && !p.strike && !p.skill;
}
function updateControls() {
  const p = players[active],
    hasBall = ball.owner === active,
    primary = hasBall ? "Shoot" : "Tackle";
  if (hud.shoot.textContent !== primary) {
    hud.shoot.textContent = primary;
    hud.shoot.classList.toggle("defending", !hasBall);
    hud.pass.textContent = hasBall ? "Pass" : "Switch";
  }
  const busy = !!(p.strike || p.skill);
  hud.dash.disabled = !canDash(p);
  hud.shoot.disabled = hasBall ? busy : !canDash(p);
  hud.pass.disabled = hasBall && busy;
  hud.stepover.disabled = hud.feint.disabled = !canTrick(p);
  updateDashMeter(p);
}
let shotId = null,
  shotSurface = null,
  shotX = 0,
  shotY = 0,
  swipeAxis = null;
function stopCharge() {
  const wasCharging = charging,
    id = shotId,
    surface = shotSurface;
  charging = false;
  charge = aim = bend = 0;
  shotId = null;
  shotSurface = null;
  swipeAxis = null;
  if (id !== null && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
  if (wasCharging) {
    hud.power.hidden = true;
    hud.root.classList.remove("is-charging");
    hud.shoot.classList.remove("is-held");
    updateControls();
  }
}
function take(i) {
  if (ball.owner >= 0 && ball.owner !== i) {
    players[ball.owner].strike = null;
    players[ball.owner].skill = null;
  }
  if (recording.kick !== null && !recording.event) {
    recording.kick = null;
    recording.step = shotSampleStep;
    recording.next = Math.min(recording.next, elapsed);
  }
  ball.shotTeam = null;
  ball.owner = i;
  ball.vx = ball.vy = ball.spin = ball.height = ball.lift = 0;
  ball.passTo = -1;
  ball.lock = 0.48;
  if (i < 2) active = i;
  stopCharge();
  updatePossession();
  updateControls();
}
function formation(side) {
  resetRecording();
  ball.rotation.set([0, 0, 0, 1]);
  resetKeepers();
  const positions =
    side === 0
      ? [
          [475, 225],
          [560, 100],
          [665, 238],
          [815, 155]
        ]
      : [
          [335, 212],
          [175, 313],
          [525, 225],
          [440, 350]
        ];
  players.forEach((p, i) => {
    [p.x, p.y] = positions[i];
    p.face = p.team ? -1 : 1;
    p.heading = (p.face * Math.PI) / 2;
    p.strike = p.skill = p.wrongFoot = null;
    p.skillWait = 0;
    p.vx = p.vy = p.pace = p.bank = p.burst = p.cool = 0;
    p.step = i * Math.PI * 0.53;
    p.moving = false;
  });
  active = 0;
  take(side * 2);
  syncBall();
}
function syncBall() {
  if (ball.owner < 0) return;
  const p = players[ball.owner],
    gait = clamp(p.pace / 118, 0, 1),
    u = (p.step / Math.PI) % 1;
  // Each leading boot meets the ball at heel strike, nudges it ahead, then catches up.
  const roll = (1 - Math.exp(-7 * u)) * (1 - smooth01(u)),
    side = Math.cos(p.step);
  let forward = 10.4 + gait * (1.3 + roll * (7.8 + clamp(p.pace / 65, 0, 4))),
    lateral = 3.4 * (1 - gait) + gait * side * 4.1;
  if (p.strike && !p.strike.hit) {
    const align = smooth01(p.strike.time / p.strike.contact);
    forward += (14 - forward) * align;
    lateral += (4.2 - lateral) * align;
  }
  ball.x = clamp(p.x + Math.sin(p.heading) * forward + Math.cos(p.heading) * lateral, 1, W - 1);
  ball.y = clamp(p.y + Math.cos(p.heading) * forward - Math.sin(p.heading) * lateral, 1, H - 1);
  ball.height = gait * Math.sin(Math.PI * u) * 0.7;
  if (p.skill) {
    const m = p.skill,
      s = skillMoves[m.name],
      plant = clamp(m.clock / s.plant, 0, 1),
      exit = smooth01((m.clock - s.plant) / 0.13);
    const X = m.startX + m.fx * 3 * plant,
      Y = m.startY + m.fy * 3 * plant;
    ball.x = clamp(X + (ball.x - X) * exit, 1, W - 1);
    ball.y = clamp(Y + (ball.y - Y) * exit, 1, H - 1);
    ball.height *= exit;
  }
}
function showCard(stage, title, detail, button) {
  $("card-stage").textContent = stage;
  $("heading").textContent = title;
  $("detail").textContent = detail;
  $("start").textContent = button;
  hud.overlay.hidden = false;
  $("start").focus({ preventScroll: true });
}
function begin() {
  resetInput();
  score = [0, 0];
  seconds = gameBrand.matchSeconds;
  lastAttack = false;
  extra = 0;
  flash = 0;
  replay = null;
  matchTally.shots.fill(0);
  matchTally.saves.fill(0);
  setScreen("play");
  formation(0);
  captureFrame(true);
  stats();
  canvas.focus({ preventScroll: true });
  announce(kickoffCue(), 1.15, 0);
  beep(660);
}
function showResult() {
  const title = score[0] === score[1] ? "Tie game" : teamNames[score[0] > score[1] ? 0 : 1] + " wins!";
  $("mint-shots").textContent = matchTally.shots[0];
  $("coral-shots").textContent = matchTally.shots[1];
  $("mint-saves").textContent = matchTally.saves[0];
  $("coral-saves").textContent = matchTally.saves[1];
  hud.summary.hidden = false;
  const result = `Mint ${score[0]} – ${score[1]} Coral`;
  showCard("Full time · " + hud.clock.textContent, title, result, "Play again");
  $("live").textContent = "Full time. " + result + ". " + title;
}
function finish() {
  lastAttack = false;
  setScreen("end");
  stats();
  resetInput();
  players.forEach((p) => (p.moving = false));
  if (!recording.event) showResult();
  beep(440, 0.25);
}
function pause() {
  if (mode === "pause") {
    setScreen(beforePause);
    (mode === "replay" ? $("skip-replay") : canvas).focus({ preventScroll: true });
    return;
  }
  if (mode !== "play" && mode !== "goal" && mode !== "replay") return;
  beforePause = mode;
  setScreen("pause");
  resetInput();
  updateViewCopy();
  const stage = lastAttack ? "Last attack · " + formatTime(extra) : "Time left · " + formatTime(seconds);
  showCard(
    stage,
    replay ? "Replay paused" : "Match paused",
    `Mint ${score[0]} – ${score[1]} Coral`,
    replay ? "Resume replay" : "Resume match"
  );
}
function afterGoalKickoff() {
  setScreen("play");
  formation(kickSide);
  announce(teamNames[kickSide] + " kick off", 0.8, kickSide);
}
function goal(side) {
  score[side]++;
  stats();
  resetInput();
  markReplay("goal", side);
  beep(880, 0.22);
  if (lastAttack) {
    finish();
    return;
  }
  setScreen("goal");
  restart = 1.35;
  kickSide = 1 - side;
  announce(teamNames[side] + " scores!", 1.35, side);
}
const smooth01 = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const skillMoves = {
  stepover: { label: "Stepover", plant: 0.34, release: 0.33, angle: 0.92, exitSpeed: 239 },
  feint: { label: "Body feint", plant: 0.22, release: 0.3, angle: 1.09, exitSpeed: 218 }
};
function movementInput() {
  const screenX =
    joy.x +
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const screenY =
    joy.y +
    Number(keys.has("KeyS") || keys.has("ArrowDown")) -
    Number(keys.has("KeyW") || keys.has("ArrowUp"));
  return portraitPitch.matches ? { x: -screenY, y: screenX } : { x: screenX, y: screenY };
}
function canTrick(p) {
  return (
    mode === "play" &&
    ball.owner === p.i &&
    !p.skill &&
    !p.strike &&
    !charging &&
    p.burst <= 0 &&
    p.skillWait <= 0
  );
}
function startSkill(name) {
  const p = players[active];
  if (!canTrick(p)) return;
  const fx = Math.sin(p.heading),
    fy = Math.cos(p.heading),
    input = movementInput(),
    across = input.x * fy - input.y * fx;
  // A tap on its own cuts toward the defender's open shoulder. Steering takes priority.
  const nearest = players.filter((q) => q.team !== p.team).sort((a, b) => dist(a, p) - dist(b, p))[0];
  const offset = (nearest.x - p.x) * fy - (nearest.y - p.y) * fx;
  let side = Math.abs(across) > 0.32 ? Math.sign(across) : Math.abs(offset) > 3 ? -Math.sign(offset) : 1;
  if (
    Math.abs(across) <= 0.32 &&
    (p.y - side * fx * 42 < 12 ||
      p.y - side * fx * 42 > H - 12 ||
      p.x + side * fy * 42 < 14 ||
      p.x + side * fy * 42 > W - 14)
  )
    side = -side;
  p.skill = { name, side, fx, fy, clock: 0, showed: false, startX: ball.x, startY: ball.y };
  p.skillWait = skillMoves[name].plant + skillMoves[name].release + 0.57;
  announce(skillMoves[name].label, 0.53, p.team);
  updateControls();
}
function reactToFake(p, m) {
  const reads = players
    .filter((q) => {
      const dx = q.x - p.x,
        dy = q.y - p.y,
        d = Math.hypot(dx, dy),
        ahead = dx * m.fx + dy * m.fy;
      const facing = -(dx * Math.sin(q.heading) + dy * Math.cos(q.heading));
      return (
        q.team !== p.team && !q.wrongFoot && ahead > 4 && ahead > d * 0.42 && d < 73 && facing > d * 0.16
      );
    })
    .sort((a, b) => dist(a, p) - dist(b, p));
  if (!reads.length) return;
  // Only the first defender commits. A covering defender can still win the ball.
  reads[0].wrongFoot = {
    x: -m.side * m.fy * 0.93 - m.fx * 0.28,
    y: m.side * m.fx * 0.93 - m.fy * 0.28,
    left: m.name === "stepover" ? 0.37 : 0.3
  };
}
function advanceSkill(p, dt) {
  const m = p.skill,
    s = skillMoves[m.name];
  m.clock += dt;
  if (!m.showed && m.clock >= s.plant * 0.52) {
    m.showed = true;
    reactToFake(p, m);
  }
  const cut = smooth01((m.clock - s.plant) / 0.09),
    lean = Math.sin(Math.PI * clamp(m.clock / s.plant, 0, 1));
  const yaw = m.side * (s.angle * cut - (m.name === "feint" ? 0.32 : 0.11) * lean);
  const cs = Math.cos(yaw),
    sn = Math.sin(yaw);
  move(p, m.fx * cs + m.fy * sn, m.fy * cs - m.fx * sn, 21 + (s.exitSpeed - 21) * cut, dt);
  if (m.clock >= s.plant + s.release) {
    p.skill = null;
    if (p.i === active) updateControls();
  }
}
function strikePose(p) {
  const a = p.strike;
  if (!a) {
    const wind = charging && ball.owner === p.i ? 0.48 + 0.45 * charge : 0;
    return { load: wind, swing: 0, weight: wind };
  }
  const u = a.time / a.contact,
    back = smooth01(u / 0.58),
    forward = smooth01((u - 0.58) / 0.48),
    recover = smooth01((a.time - a.contact - 0.055) / a.recovery);
  return {
    load: (a.preload + (1 - a.preload) * back) * (1 - forward),
    swing: forward * (1 - recover),
    weight: (a.preload + (1 - a.preload) * smooth01(u / 0.34)) * (1 - recover)
  };
}
function turnPlayer(p, target, dt, rate) {
  const delta = Math.atan2(Math.sin(target - p.heading), Math.cos(target - p.heading));
  const turn = delta * (1 - Math.exp(-rate * dt));
  p.heading += turn;
  p.bank += (clamp((turn / Math.max(dt, 0.001)) * 0.12, -1, 1) - p.bank) * (1 - Math.exp(-9 * dt));
  if (Math.abs(Math.sin(p.heading)) > 0.16) p.face = Math.sign(Math.sin(p.heading));
}
function move(p, dx, dy, speed, dt) {
  const strike = p.strike,
    plant = strike && strike.time < strike.contact + 0.065;
  if (plant) {
    dx = dy = 0;
    turnPlayer(p, strike.heading, dt, 38);
  }
  const magnitude = Math.hypot(dx, dy),
    scale = speed / Math.max(1, magnitude);
  const blend = 1 - Math.exp(-(plant ? 42 : magnitude > 0.06 ? 16 : 21) * dt);
  p.vx += (dx * scale - p.vx) * blend;
  p.vy += (dy * scale - p.vy) * blend;
  const oldX = p.x,
    oldY = p.y;
  p.x = clamp(p.x + p.vx * dt, 14, W - 14);
  p.y = clamp(p.y + p.vy * dt, 12, H - 12);
  const travel = Math.hypot(p.x - oldX, p.y - oldY);
  p.pace += (travel / dt - p.pace) * (1 - Math.exp(-18 * dt));
  p.moving = p.pace > 3;
  if (!plant && magnitude > 0.06) turnPlayer(p, Math.atan2(dx, dy), dt, 16);
  else if (!plant) p.bank *= Math.exp(-10 * dt);
  // Advance by ground distance. The sprint lengthens the stride before increasing cadence.
  const strideLength = 2.08 + 0.75 * clamp((p.pace - 130) / 160, 0, 1);
  p.step += (travel * 0.04 * 2 * Math.PI) / strideLength;
}
function go(p, x, y, speed, dt) {
  const dx = x - p.x,
    dy = y - p.y,
    len = Math.hypot(dx, dy);
  if (len < 5) {
    move(p, 0, 0, 0, dt);
    return;
  }
  move(p, dx / len, dy / len, Math.min(speed, len / dt), dt);
}
// Side spin rotates the horizontal velocity as the ball travels. A signed arc
// sets the boot angle once at contact; a moving defender can intercept the flight.
function kickFlight(x, y, tx, ty, speed, curl, target) {
  const dx = tx - x,
    dy = ty - y,
    distance = Math.max(1, Math.hypot(dx, dy));
  const halfTurn = 0.73 * curl * Math.min(1, distance / 145);
  const angle = Math.atan2(dy, dx) - halfTurn;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    spin: (2 * Math.sin(halfTurn)) / distance,
    height: 0,
    lift: target < 0 ? 95 + (speed - 370) * 0.32 : 43
  };
}
function fly(b, dt) {
  const drag = Math.exp(-0.48 * dt),
    distance = (Math.hypot(b.vx, b.vy) * (1 - drag)) / 0.48;
  const turn = b.spin * distance,
    half = turn * 0.5;
  const scale = ((1 - drag) / 0.48) * (Math.abs(half) > 0.00001 ? Math.sin(half) / half : 1);
  const vx = b.vx,
    vy = b.vy;
  b.x += (vx * Math.cos(half) - vy * Math.sin(half)) * scale;
  b.y += (vy * Math.cos(half) + vx * Math.sin(half)) * scale;
  b.vx = (vx * Math.cos(turn) - vy * Math.sin(turn)) * drag;
  b.vy = (vy * Math.cos(turn) + vx * Math.sin(turn)) * drag;
  if (b.height > 0 || b.lift > 0) {
    b.lift -= 456 * dt;
    b.height += b.lift * dt;
    if (b.height <= 0) {
      b.height = 0;
      b.lift = b.lift < -35 ? -b.lift * 0.28 : 0;
    }
  }
}
function shotPreview() {
  const b = kickFlight(ball.x, ball.y, W, CY + aim * 57, 370 + charge * 310, bend, -1);
  const nodes = [{ x: b.x, y: b.y, height: 0 }];
  for (let i = 1; i <= 180; i++) {
    fly(b, 1 / 60);
    const edge = b.x >= W || b.x <= 0 || b.y < 3 || b.y > H - 3;
    if (edge || i % 2 === 0)
      nodes.push({ x: clamp(b.x, 0, W), y: clamp(b.y, 3, H - 3), height: b.height });
    if (edge) break;
  }
  return nodes;
}
function launch(i, tx, ty, speed, curl = 0, target = -1) {
  const p = players[i];
  if (ball.owner !== i || p.strike || p.skill) return;
  const initial = kickFlight(ball.x, ball.y, tx, ty, speed, curl, target);
  p.strike = {
    time: 0,
    contact: target < 0 ? 0.135 : 0.095,
    recovery: target < 0 ? 0.31 : 0.23,
    preload: charging ? 0.48 + 0.45 * charge : 0,
    heading: Math.atan2(initial.vx, initial.vy),
    tx,
    ty,
    speed,
    curl,
    target,
    hit: false
  };
  stopCharge();
  recordKick();
  if (i === active) updateControls();
}
function advanceStrike(p, dt) {
  const a = p.strike;
  if (!a) return;
  a.time += dt;
  if (!a.hit && ball.owner !== p.i) {
    p.strike = null;
    if (p.i === active) updateControls();
    return;
  }
  if (!a.hit && a.time >= a.contact) {
    syncBall();
    Object.assign(ball, kickFlight(ball.x, ball.y, a.tx, a.ty, a.speed, a.curl, a.target), {
      owner: -1,
      lock: 0.12,
      passTo: a.target,
      shotTeam: a.target < 0 ? p.team : null,
      shotAge: 0
    });
    a.hit = true;
    recording.keyframe = true;
    if (a.target < 0) matchTally.shots[p.team]++;
    else if (p.team === 0) active = a.target;
    updatePossession();
    updateControls();
    beep(a.target < 0 ? 300 : 470);
  }
  if (a.time >= a.contact + 0.055 + a.recovery) {
    p.strike = null;
    if (p.i === active) updateControls();
  }
}
function pass() {
  if (mode !== "play") return;
  if (ball.owner === active) {
    const other = players[1 - active];
    launch(active, other.x, other.y, 410, 0, other.i);
  } else if (ball.owner < 0 || ball.owner >= 2) {
    active = 1 - active;
    stopCharge();
    updateControls();
  }
}
function dash() {
  if (mode !== "play") return;
  const p = players[active];
  if (canDash(p)) {
    p.burst = 0.28;
    p.cool = dashCooldown;
    updateControls();
    beep(180);
  }
}
function startShot() {
  const p = players[active];
  if (mode !== "play" || ball.owner !== active || p.strike || p.skill || charging) return;
  const steer = movementInput().y,
    keeperOffset = keepers[1].y - CY;
  const openSide = Math.abs(keeperOffset) > 6 ? -Math.sign(keeperOffset) : p.y > CY ? -1 : 1;
  aim = Math.abs(steer) > 0.18 ? clamp(steer, -1, 1) : openSide * 0.78;
  charging = true;
  charge = quickShotPower;
  bend = 0;
  hud.power.hidden = false;
  hud.root.classList.add("is-charging");
  hud.shoot.classList.add("is-held");
  updateShotMeter();
  updateControls();
}
function shootOrTackle() {
  if (ball.owner === active) startShot();
  else dash();
}
function release() {
  if (!charging) return;
  if (mode === "play" && ball.owner === active) {
    const p = players[active],
      v = clamp(aim, -1, 1),
      power = charge;
    launch(active, W, CY + v * 57, 370 + power * 310, bend);
    p.face = 1;
  } else stopCharge();
}
function resetInput() {
  keys.clear();
  nudgeLeft = 0;
  setStick(0, 0);
  stopCharge();
  const pad = $("stick");
  if (stickId !== null && pad.hasPointerCapture(stickId)) pad.releasePointerCapture(stickId);
  stickId = null;
}
function ai(p, dt) {
  if (p.wrongFoot) {
    const read = p.wrongFoot;
    move(p, read.x, read.y, 131, dt);
    read.left -= dt;
    if (read.left <= 0) p.wrongFoot = null;
    return;
  }
  if (p.strike && !p.strike.hit) {
    move(p, 0, 0, 0, dt);
    return;
  }
  const enemy = p.team === 1,
    dir = enemy ? -1 : 1,
    own = ball.owner >= 0 ? players[ball.owner] : null,
    partner = players[p.i ^ 1];
  if (own === p) {
    const opp = players.slice(0, 2),
      near = Math.min(...opp.map((q) => dist(q, p)));
    if (p.x < 235 && enemy) {
      launch(p.i, -18, CY + Math.sin(elapsed * 2) * 50, 510);
      return;
    }
    if (enemy && near < 70 && ball.lock <= 0 && partner.x < p.x - 35 && Math.abs(partner.y - p.y) > 55) {
      launch(p.i, partner.x, partner.y, 370, 0, partner.i);
      return;
    }
    go(p, p.x + dir * 140, CY + Math.sin(elapsed * 1.3 + p.i) * 70, 109, dt);
    return;
  }
  if (!own && ball.passTo === p.i) {
    go(p, ball.x, ball.y, 132, dt);
    return;
  }
  if (own && own.team === p.team) {
    const lane = own.y < CY ? CY + 102 : CY - 102;
    go(p, clamp(own.x + dir * 155, 85, 915), lane, 122, dt);
    return;
  }
  const chase =
    !enemy && p.i !== active
      ? dist(p, ball) + 15 < dist(partner, ball)
      : dist(p, ball) <= dist(partner, ball) + 6;
  if (chase) go(p, ball.x, ball.y, enemy ? 118 : 131, dt);
  else
    go(p, clamp(ball.x - dir * 172, 75, 925), CY + (ball.y - CY) * 0.52 + (p.i % 2 ? 28 : -28), 116, dt);
}
const keepers = [0, 1].map((team) => ({
  team,
  face: team ? -1 : 1,
  x: team ? W - 12 : 12,
  bones: new Float32Array(15 * 16)
}));
function resetKeepers() {
  for (const k of keepers) {
    Object.assign(k, { y: CY, phase: null, step: 0, readIn: 0, target: null, speed: 0 });
    poseKeeper(k);
    k.contacts = keeperContacts(k);
  }
}
function predictKeeperPlane(k) {
  const f = { ...ball },
    plane = k.x + k.face * 6,
    step = 1 / 60;
  if ((f.x - plane) * k.face < 0 || f.vx * k.face >= 0) return null;
  for (let i = 0; i < 45; i++) {
    const x = f.x,
      y = f.y,
      h = f.height;
    fly(f, step);
    if (f.y < 3 || f.y > H - 3) return null;
    if ((f.x - plane) * k.face <= 0) {
      const u = (plane - x) / (f.x - x),
        at = y + (f.y - y) * u;
      return Math.abs(at - CY) <= GOAL + 6
        ? { y: at, height: 4.15 + h + (f.height - h) * u, eta: (i + u) * step }
        : null;
    }
  }
  return null;
}
function stepKeepers(dt) {
  for (const k of keepers) {
    k.previous = k.contacts;
    const incoming =
      mode === "play" && ball.owner < 0 && ball.shotTeam === 1 - k.team && ball.vx * k.face < 0;
    if (!incoming) {
      k.target = null;
      k.readIn = 0;
    }
    if (!k.phase && incoming && ball.shotAge >= 0.14) {
      k.readIn -= dt;
      if (k.readIn <= 0) {
        k.target = predictKeeperPlane(k);
        k.readIn = 0.065;
      } else if (k.target) k.target.eta -= dt;
      if (k.target && k.target.eta <= 0.32 && Math.abs(k.target.y - k.y) > 10) {
        const delta = k.target.y - k.y;
        k.phase = {
          time: 0,
          from: k.y,
          travel: Math.sign(delta) * clamp(Math.abs(delta) - 18, 7, 22),
          height: k.target.height * 0.04
        };
        k.target = null;
      }
    }
    const before = k.y;
    if (k.phase) {
      const d = k.phase;
      d.time += dt;
      k.y = d.from + d.travel * smooth01(d.time / 0.42);
      if (d.time >= 0.86) k.phase = null;
    } else {
      const angle = CY + clamp((ball.y - CY) * 0.24, -24, 24);
      const target = k.target ? CY + clamp((k.target.y - CY) * 0.22, -15, 15) : angle;
      k.y += clamp(target - k.y, -48 * dt, 48 * dt);
    }
    k.speed = (k.y - before) / dt;
    k.step += Math.abs(k.y - before) * 0.18;
    poseKeeper(k);
    k.contacts = keeperContacts(k);
  }
}
function poseKeeper(k) {
  const b = k.bones,
    d = k.phase,
    t = d ? d.time : 0,
    extend = d ? smooth01(t / 0.25) * (1 - smooth01((t - 0.47) / 0.37)) : 0;
  const side = d ? -k.face * Math.sign(d.travel) : 0,
    shuffle = Math.min(1, Math.abs(k.speed) / 45) * (1 - extend);
  const hip = 0.84 + extend * (clamp((d?.height || 0) + 0.25, 0.39, 1.64) - 0.84);
  jointFrame(
    b,
    0,
    -1,
    (k.x - 500) * 0.04,
    hip,
    (k.y - CY) * 0.04,
    0,
    (k.face * Math.PI) / 2,
    -side * 1.33 * extend
  );
  jointFrame(b, 1, 0, 0, 0.015, 0, 0.23 - 0.12 * extend);
  jointFrame(b, 2, 1, 0, 0.712, 0.005, -0.19);
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1,
      leg = 3 + i * 3,
      arm = 9 + i * 3,
      beat = Math.sin(k.step) * s * shuffle;
    jointFrame(b, leg, 0, s * 0.142, 0, 0, -0.63 - 0.16 * beat - 0.28 * extend, 0, s * 0.13);
    jointFrame(b, leg + 1, leg, 0, -0.473, 0, 1.19 + 0.19 * beat + 0.28 * extend);
    jointFrame(b, leg + 2, leg + 1, 0, -0.455, 0, -0.56);
    const reach = s === side ? 2.5 : 2.86;
    jointFrame(
      b,
      arm,
      1,
      s * 0.245,
      0.567,
      0,
      -0.47 * (1 - extend) - 0.22 * extend,
      0,
      s * 0.42 * (1 - extend) + side * reach * extend
    );
    jointFrame(b, arm + 1, arm, 0, -0.296, 0, -0.78 + 0.62 * extend);
    jointFrame(b, arm + 2, arm + 1, 0, -0.258, 0, -0.09);
  }
  // Retain the airborne reach, then plant the lowest limb for landing and recovery.
  const flight = d ? smooth01(t / 0.16) * (1 - smooth01((t - 0.32) / 0.23)) : 0;
  stadium.groundKeeper(k, flight);
}
// Centres follow the same joints as the visible gloves, torso and legs.
// Radius includes the football. Coordinates use pitch units for continuous contact tests.
const keeperPads = [
  [11, -0.09, 0.13],
  [14, -0.09, 0.13],
  [10, -0.12, 0.085],
  [13, -0.12, 0.085],
  [2, 0.14, 0.14],
  [1, 0.4, 0.24],
  [0, 0, 0.21],
  [3, -0.27, 0.13],
  [6, -0.27, 0.13],
  [4, -0.27, 0.1],
  [7, -0.27, 0.1],
  [5, -0.035, 0.11],
  [8, -0.035, 0.11]
];
function keeperContacts(k) {
  const b = k.bones;
  return keeperPads.map(([j, y, r]) => {
    const i = j * 16;
    return {
      x: 500 + (b[i + 12] + y * b[i + 4]) * 25,
      y: CY + (b[i + 14] + y * b[i + 6]) * 25,
      h: (b[i + 13] + y * b[i + 5]) * 25,
      r: r * 25 + 4.15
    };
  });
}
function parryShot(from) {
  if (ball.shotTeam == null) return;
  const k = keepers[1 - ball.shotTeam];
  if (Math.abs(ball.x - k.x) > 42 || ball.vx * k.face >= 0) return;
  let first = Infinity;
  for (let i = 0; i < k.contacts.length; i++) {
    const a = k.previous[i],
      b = k.contacts[i],
      x = from.x - a.x,
      y = from.y - a.y,
      h = from.h - a.h;
    const dx = ball.x - b.x - x,
      dy = ball.y - b.y - y,
      dh = ball.height + 4.15 - b.h - h;
    const aa = dx * dx + dy * dy + dh * dh,
      bb = x * dx + y * dy + h * dh,
      cc = x * x + y * y + h * h - b.r * b.r;
    if (cc <= 0) {
      first = 0;
      break;
    }
    const disc = bb * bb - aa * cc;
    if (aa < 1e-8 || disc < 0) continue;
    const hit = (-bb - Math.sqrt(disc)) / aa;
    if (hit >= 0 && hit <= 1) first = Math.min(first, hit);
  }
  if (!Number.isFinite(first)) return;
  ball.x = from.x + (ball.x - from.x) * first;
  ball.y = from.y + (ball.y - from.y) * first;
  ball.height = Math.max(0, from.h - 4.15 + (ball.height + 4.15 - from.h) * first);
  const speed = Math.hypot(ball.vx, ball.vy),
    side = Math.sign(ball.y - k.y) || 1;
  Object.assign(ball, {
    vx: k.face * clamp(speed * 0.4, 105, 235),
    vy: side * clamp(speed * 0.24, 65, 135),
    lift: 62,
    spin: 0,
    lock: 0.14,
    shotTeam: null,
    passTo: -1
  });
  matchTally.saves[k.team]++;
  announce(teamNames[k.team] + " save!", 0.95, k.team);
  beep(250, 0.12);
  if (k.phase && k.phase.time < 0.72) markReplay("save", k.team);
}
function stepMatch(dt) {
  elapsed += dt;
  if (flash > 0) {
    flash = Math.max(0, flash - dt);
    if (!flash) updatePossession();
  }
  if (mode === "goal") {
    stepKeepers(dt);
    restart -= dt;
    if (restart <= 0) afterGoalKickoff();
    return;
  }
  const carrier = players[active],
    oldCool = carrier.cool,
    oldWait = carrier.skillWait,
    oldBurst = carrier.burst;
  for (const p of players) {
    p.burst = Math.max(0, p.burst - dt);
    p.cool = Math.max(0, p.cool - dt);
    p.skillWait = Math.max(0, p.skillWait - dt);
  }
  if ((oldCool && !carrier.cool) || (oldWait && !carrier.skillWait) || (oldBurst && !carrier.burst))
    updateControls();
  else if (oldCool) updateDashMeter(carrier);
  let { x: dx, y: dy } = movementInput();
  if (nudgeLeft > 0) {
    nudgeLeft = Math.max(0, nudgeLeft - dt);
    if (!nudgeLeft && stickId === null) setStick(0, 0);
  }
  if (charging) {
    charge = Math.min(1, charge + dt * 1.55 * (1 - quickShotPower));
    if (!swipeAxis && Math.abs(dy) > 0.1) aim += (clamp(dy, -1, 1) - aim) * (1 - Math.exp(-12 * dt));
    if (shotId === null)
      bend = clamp(bend + 2.5 * dt * (Number(keys.has("KeyC")) - Number(keys.has("KeyZ"))), -1, 1);
    updateShotMeter();
  }
  if (carrier.skill) advanceSkill(carrier, dt);
  else {
    if (carrier.burst > 0 && Math.hypot(dx, dy) < 0.1) {
      if (ball.owner === active) dx = carrier.face;
      else {
        dx = ball.x - carrier.x;
        dy = ball.y - carrier.y;
      }
    }
    move(
      carrier,
      dx,
      dy,
      carrier.burst > 0 ? 317 : charging ? 102 : ball.owner === active ? 141 : 158,
      dt
    );
  }
  for (const p of players) if (p.i !== active) ai(p, dt);
  for (const p of players) advanceStrike(p, dt);
  if (ball.shotTeam != null) ball.shotAge += dt;
  stepKeepers(dt);
  ball.lock = Math.max(0, ball.lock - dt);
  if (ball.owner >= 0) {
    let p = players[ball.owner];
    syncBall();
    if (!ball.lock) {
      const rival = players
        .filter((q) => q.team !== p.team && dist(q, p) < (q.burst > 0 ? 33 : 17))
        .sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (rival) {
        take(rival.i);
        syncBall();
      }
    }
  } else {
    const from = { x: ball.x, y: ball.y, h: ball.height + 4.15 };
    fly(ball, dt);
    parryShot(from);
    if (ball.y < 3 || ball.y > H - 3) {
      ball.y = clamp(ball.y, 3, H - 3);
      ball.vy *= -0.77;
      ball.spin = 0;
    }
    if (ball.x < 0 || ball.x > W) {
      if (Math.abs(ball.y - CY) <= GOAL && ball.height + 6.9 < 56) {
        goal(ball.x > W ? 0 : 1);
        return;
      }
      ball.x = clamp(ball.x, 0, W);
      ball.vx *= -0.72;
      ball.spin = 0;
      ball.shotTeam = null;
      updatePossession();
    }
    if (!ball.lock && ball.height < 22) {
      const near = players
        .filter((p) => dist(p, ball) < (p.i === ball.passTo ? 24 : 17))
        .sort((a, b) => dist(a, ball) - dist(b, ball))[0];
      if (near) take(near.i);
    }
  }
  const wasLastAttack = lastAttack,
    previousSecond = Math.ceil(lastAttack ? extra : seconds);
  if (lastAttack) {
    extra -= dt;
    if (extra <= 0 || (ball.owner >= 0 && players[ball.owner].team !== trailing)) {
      finish();
      return;
    }
  } else {
    seconds = Math.max(0, seconds - dt);
    if (seconds === 0) {
      trailing = score[0] < score[1] ? 0 : score[1] < score[0] ? 1 : -1;
      if (ball.owner >= 0 && players[ball.owner].team === trailing) {
        lastAttack = true;
        extra = 7;
        announce(teamNames[trailing] + " have the last attack", 1.4, trailing);
      } else {
        finish();
        return;
      }
    }
  }
  if (wasLastAttack !== lastAttack || previousSecond !== Math.ceil(lastAttack ? extra : seconds))
    updateClock();
}
let trailing = -1;
function update(dt) {
  if (mode === "replay") {
    replay.time += dt * replayRate;
    if (replay.time >= replay.end + 0.09) exitReplay();
    else updateReplayMeter();
    return;
  }
  if (mode !== "play" && mode !== "goal") return;
  const x = ball.x,
    y = ball.y;
  stepMatch(dt);
  rotateFootball(ball.rotation, (ball.x - x) * 0.04, (ball.y - y) * 0.04, ball.rotation);
  captureFrame(recording.keyframe);
  recording.keyframe = false;
  const e = recording.event;
  if (e && (mode === "end" || elapsed - e.impact >= (e.kind === "goal" ? 0.26 : 0.12))) startReplay();
}
function render(t) {
  stadium.draw(
    { players, ball, active, mode, charging, charge, scoring: 1 - kickSide, replay: replayView() },
    t
  );
}
formation(0);
[
  [562, 293, 0.18],
  [425, 200, 1.4],
  [604, 187, -0.6],
  [520, 168, -1.3]
].forEach(([x, y, heading], i) => Object.assign(players[i], { x, y, heading }));
syncBall();
render(performance.now());
let prev = 0;
function frame(t) {
  let remaining = Math.min(0.08, (t - (prev || t)) / 1000);
  prev = t;
  while (remaining > 0.00001) {
    const dt = Math.min(1 / 60, remaining);
    update(dt);
    remaining -= dt;
  }
  render(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
let lastHandledTouch = -Infinity;
document.addEventListener(
  "pointerdown",
  () => {
    lastHandledTouch = -Infinity;
  },
  true
);
document.addEventListener(
  "click",
  (e) => {
    // A compatibility click can land on another control when a touch changes the menu layout.
    if (
      e.detail > 0 &&
      performance.now() - lastHandledTouch < 700 &&
      (!e.pointerType || e.pointerType === "touch" || e.sourceCapabilities?.firesTouchEvents)
    ) {
      lastHandledTouch = -Infinity;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true
);
function bindTap(id, activate) {
  const button = $(id);
  let touchId = null,
    pressPortrait = false;
  button.onpointerdown = (e) => {
    touchId = e.pointerType === "touch" ? e.pointerId : null;
    pressPortrait = portraitPitch.matches;
  };
  button.onpointercancel = () => {
    touchId = null;
  };
  button.onpointerup = (e) => {
    if (e.pointerId !== touchId) return;
    touchId = null;
    lastHandledTouch = performance.now();
    if (
      pressPortrait !== portraitPitch.matches ||
      !button.contains(document.elementFromPoint(e.clientX, e.clientY))
    )
      return;
    // A tap following a swipe can have a pointerup without a compatibility click.
    activate();
  };
  button.onclick = activate;
}
const fullscreenButton = $("fullscreen"),
  root = document.documentElement,
  appFullscreen = matchMedia("(display-mode: fullscreen)");
function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}
function canEnterFullscreen() {
  return !!(
    (document.fullscreenEnabled && root.requestFullscreen) ||
    (document.webkitFullscreenEnabled && root.webkitRequestFullscreen)
  );
}
let hadFullscreen = !!fullscreenElement(),
  fullscreenPending = false;
function needsFullscreenEntry() {
  return touchLayout.matches && canEnterFullscreen() && !fullscreenElement() && !appFullscreen.matches;
}
function syncFullscreen() {
  const active = !!fullscreenElement();
  fullscreenButton.hidden = !canEnterFullscreen() || (!active && appFullscreen.matches);
  const label = active ? "Exit full screen" : "Enter full screen";
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.title = label;
  if (mode === "menu")
    $("start").textContent = needsFullscreenEntry() ? "Play full screen" : "Quick Match";
  if (active) $("view-status").hidden = true;
  if (hadFullscreen && !active && (mode === "play" || mode === "goal" || mode === "replay")) pause();
  hadFullscreen = active;
}
async function changeFullscreen(enter, manual = false) {
  if (
    fullscreenPending ||
    !canEnterFullscreen() ||
    (enter && (fullscreenElement() || appFullscreen.matches))
  )
    return false;
  fullscreenPending = true;
  try {
    if (enter) {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
      else await root.webkitRequestFullscreen();
    } else if (document.exitFullscreen) await document.exitFullscreen();
    else await document.webkitExitFullscreen();
    return true;
  } catch {
    if (manual) {
      const message = $("view-status");
      message.textContent = "Open the game directly in your browser to use full screen.";
      message.hidden = false;
    }
    return false;
  } finally {
    fullscreenPending = false;
    syncFullscreen();
  }
}
document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);
appFullscreen.addEventListener("change", syncFullscreen);
syncFullscreen();
bindTap("fullscreen", () => {
  void changeFullscreen(!fullscreenElement(), true);
});
bindTap("start", async () => {
  if (fullscreenPending) return;
  if (mode === "pause") {
    pause();
    return;
  }
  // Android can put its first-use system message over the pitch. Keep the clock at 1:30 until kickoff.
  if (mode === "menu" && needsFullscreenEntry() && (await changeFullscreen(true))) return;
  begin();
});
bindTap("help-toggle", () => {
  const guide = $("control-guide");
  guide.hidden = !guide.hidden;
  $("help-toggle").setAttribute("aria-expanded", String(!guide.hidden));
});
bindTap("pause", pause);
bindTap("skip-replay", exitReplay);
$("sound").onclick = (e) => {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    sound = !sound;
    $("sound").title = sound ? "Sound on" : "Sound off";
    $("sound").setAttribute("aria-pressed", String(sound));
    beep(530);
  } catch {}
  if (e.detail && mode === "play") canvas.focus({ preventScroll: true });
};
const keyActions = {
  Space: shootOrTackle,
  KeyF: pass,
  KeyX: pass,
  Enter: pass,
  NumpadEnter: pass,
  ShiftLeft: dash,
  ShiftRight: dash,
  KeyQ: () => startSkill("stepover"),
  KeyE: () => startSkill("feint")
};
const playKeys = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyZ",
  "KeyC",
  ...Object.keys(keyActions)
]);
window.addEventListener("keydown", (e) => {
  const code = e.code;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (code === "Escape") {
    if (!e.repeat) pause();
    return;
  }
  const enter = code === "Enter" || code === "NumpadEnter";
  if ((enter || code === "Space") && e.target.closest?.("button,summary")) return;
  if (mode === "replay" && enter) {
    e.preventDefault();
    if (!e.repeat) exitReplay();
    return;
  }
  if (mode !== "play" || !playKeys.has(code)) return;
  if (e.target.closest?.("button,summary")) canvas.focus({ preventScroll: true });
  e.preventDefault();
  keys.add(code);
  if (!e.repeat) keyActions[code]?.();
});
window.addEventListener("keyup", (e) => {
  const wasDown = keys.delete(e.code);
  if (wasDown && e.code === "Space" && mode === "play" && shotId === null) {
    e.preventDefault();
    release();
  }
});

const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const pad = $("stick");
function setStick(x, y) {
  const len = Math.max(1, Math.hypot(x, y));
  joy.x = x / len;
  joy.y = y / len;
  $("nub").style.transform = `translate(${joy.x * 65}%,${joy.y * 65}%)`;
}
function stickMove(e) {
  const r = pad.getBoundingClientRect(),
    reach = r.width * 0.35;
  const x = (e.clientX - r.left - r.width / 2) / reach,
    y = (e.clientY - r.top - r.height / 2) / reach;
  if (Math.hypot(x, y) < 0.23) setStick(0, 0);
  else setStick(x, y);
}
pad.onpointerdown = (e) => {
  if (mode !== "play" || stickId !== null || e.button !== 0) return;
  stickId = e.pointerId;
  pad.setPointerCapture(stickId);
  e.preventDefault();
  stickMove(e);
  const dir = e.target.closest("[data-dir]")?.dataset.dir;
  if (dir && (joy.x || joy.y)) {
    setStick(...directions[dir]);
    nudgeLeft = 0.1;
  } else nudgeLeft = 0;
};
pad.onpointermove = (e) => {
  if (e.pointerId === stickId) stickMove(e);
};
pad.onpointerup = (e) => {
  if (e.pointerId === stickId) {
    stickId = null;
    if (!nudgeLeft) setStick(0, 0);
  }
};
pad.onpointercancel = pad.onlostpointercapture = (e) => {
  if (e.pointerId === stickId) {
    stickId = null;
    nudgeLeft = 0;
    setStick(0, 0);
  }
};
for (const button of pad.querySelectorAll("[data-dir]")) {
  button.onclick = (e) => {
    if (e.detail === 0 && mode === "play" && stickId === null) {
      setStick(...directions[button.dataset.dir]);
      nudgeLeft = 0.1;
    }
  };
}
function readSwipe(e) {
  const dx = e.clientX - shotX,
    dy = e.clientY - shotY;
  if (!swipeAxis) {
    const horizontal = portraitPitch.matches && Math.abs(dx) > Math.abs(dy);
    if (Math.abs(horizontal ? dx : dy) < 5) return;
    swipeAxis = horizontal ? "x" : "y";
  }
  const horizontal = swipeAxis === "x",
    delta = horizontal ? dx : dy,
    distance = Math.abs(delta);
  const start = horizontal ? shotX : shotY,
    size = horizontal ? innerWidth : innerHeight;
  const room = delta < 0 ? start : size - start,
    travel = clamp(room - 14, 25, 69);
  bend = Math.sign(delta) * clamp((distance - 5) / (travel - 5), 0, 1);
  aim = clamp(delta / travel, -1, 1);
  updateShotMeter();
}
for (const surface of [canvas, $("shoot")]) {
  surface.onpointerdown = (e) => {
    if (e.button !== 0 || shotId !== null || charging) return;
    if (surface === canvas) {
      canvas.focus({ preventScroll: true });
      startShot();
    } else shootOrTackle();
    if (!charging) return;
    shotId = e.pointerId;
    shotSurface = surface;
    shotX = e.clientX;
    shotY = e.clientY;
    swipeAxis = null;
    surface.setPointerCapture(shotId);
    e.preventDefault();
  };
  surface.onpointermove = (e) => {
    if (e.pointerId === shotId && charging) readSwipe(e);
  };
  surface.onpointerup = (e) => {
    if (e.pointerId === shotId && charging) {
      readSwipe(e);
      release();
    }
  };
  surface.onpointercancel = surface.onlostpointercapture = (e) => {
    if (e.pointerId === shotId) stopCharge();
  };
}
$("shoot").onclick = (e) => {
  if (e.detail === 0 && !charging) {
    shootOrTackle();
    release();
  }
};
for (const name of Object.keys(skillMoves)) {
  const button = $(name);
  button.onpointerdown = (e) => {
    if (e.button === 0) {
      e.preventDefault();
      startSkill(name);
    }
  };
  button.onclick = (e) => {
    if (e.detail === 0) startSkill(name);
  };
}
bindTap("pass", pass);
bindTap("dash", dash);
portraitPitch.addEventListener("change", () => {
  resetInput();
  paintedCurl = null;
  updateViewCopy();
});
touchLayout.addEventListener("change", () => {
  updateViewCopy();
  syncFullscreen();
});
updateViewCopy();
updateClock();
window.addEventListener("blur", () => {
  if (fullscreenPending && !document.hidden) return;
  if (mode === "play" || mode === "goal" || mode === "replay") pause();
  else resetInput();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (mode === "play" || mode === "goal" || mode === "replay")) pause();
});
if (!touchLayout.matches && document.activeElement === document.body)
  $("start").focus({ preventScroll: true });
