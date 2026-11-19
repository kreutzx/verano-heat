// Verano Heat — entry point. Builds the world and every system, runs the
// fixed-timestep simulation (60 Hz) decoupled from rendering, owns the
// game state machine (title / playing / paused / wasted / busted), the
// crime-to-wanted-level wiring, and saving.

import * as THREE from 'three';
import { Rng } from './rng.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { World } from './world.js';
import { Traffic } from './vehicles.js';
import { Pedestrians } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { applyShot } from './shots.js';
import { SPAWN_POS, MARISOL_POS } from './config.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 20261);

const canvasHost = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3200);

const save = loadSave();

const G = {
  scene,
  camera,
  renderer,
  rng: new Rng(seed),
  state: {
    money: save ? save.money : 120,
    missionIndex: save ? save.missionIndex : 0,
  },
  mode: 'title', // title | playing | paused | wasted | busted
  time: 0,
  saveTimer: 0,
  objectiveOverride: '',
  scriptDrive: null,
};
window.__verano = G; // handy for debugging and screenshot tooling

G.world = new World(scene, G.rng);
G.input = new Input();
G.audio = new AudioEngine();
G.traffic = new Traffic(scene, G.rng, G.world);
G.peds = new Pedestrians(scene, G.rng, G.world);
G.police = new Police(G);
G.player = new Player(G);
G.missions = new Missions(G);
G.hud = new Hud(G);

// --- Game-wide wiring -------------------------------------------------------

G.addMoney = (n) => {
  G.state.money += n;
  G.audio.cash();
};

// A crime only raises the heat if someone sees it (or it is gunfire, which
// everyone hears). Hitting a pedestrian always costs at least one star.
G.crime = (kind, x, z) => {
  if (G.mode !== 'playing') return;
  const seenByCop = G.police.cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 65);
  const seenByPed = G.peds.peds.some((p) => !p.down && Math.hypot(p.pos.x - x, p.pos.z - z) < 26);
  const witnessed = kind === 'shots' || seenByCop || seenByPed;
  if (witnessed) G.police.addCrime(kind);
  else if (kind === 'hitPed') G.police.addCrime('crash');
};

G.saveGame = () => {
  const p = G.player;
  const at = p.mode === 'car' ? p.car.pos : p.pos;
  storeSave({
    money: G.state.money,
    missionIndex: G.missions.index,
    x: at.x,
    z: at.z,
    heading: p.heading,
    health: Math.max(40, Math.round(p.health)),
  });
};

function respawn(penalty) {
  G.state.money = Math.max(0, G.state.money - penalty);
  G.police.clear();
  if (G.player.mode === 'car') G.player.exitCar();
  G.player.health = 100;
  G.player.placeAt(SPAWN_POS.x, SPAWN_POS.z, 1.13);
  G.saveGame();
}

G.onWasted = () => {
  if (G.mode !== 'playing') return;
  G.mode = 'wasted';
  G.audio.sting();
  G.audio.setEngine(false, 0);
  G.audio.setSiren(false);
  showScreen('wasted-screen');
  G.input.unlockPointer();
};

G.onBusted = () => {
  if (G.mode !== 'playing') return;
  G.mode = 'busted';
  G.audio.sting();
  G.audio.setEngine(false, 0);
  G.audio.setSiren(false);
  showScreen('busted-screen');
  G.input.unlockPointer();
};

// --- Screens ----------------------------------------------------------------

const screens = ['title-screen', 'pause-screen', 'wasted-screen', 'busted-screen'];
function showScreen(id) {
  for (const s of screens) {
    document.getElementById(s).style.display = s === id ? 'flex' : 'none';
  }
  document.getElementById('hud').style.display = id ? 'none' : 'block';
}

function startGame(fresh) {
  G.audio.unlock();
  if (fresh) {
    clearSave();
    G.state.money = 120;
    G.missions.index = 0;
    G.state.missionIndex = 0;
    G.player.health = 100;
    G.player.placeAt(SPAWN_POS.x, SPAWN_POS.z, 1.13);
  } else if (save) {
    G.player.health = save.health || 100;
    G.player.placeAt(save.x ?? SPAWN_POS.x, save.z ?? SPAWN_POS.z, save.heading ?? 1.13);
  } else {
    G.player.placeAt(SPAWN_POS.x, SPAWN_POS.z, 1.13);
  }
  showScreen(null);
  G.mode = 'playing';
  G.input.lockPointer(renderer.domElement);
  if (fresh || !save) {
    G.hud.toast('Welcome to Verano Bay. Marisol Vega has work — find her at the marina café', 6);
  }
}

document.getElementById('btn-new').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', () => {
  G.audio.unlock();
  showScreen(null);
  G.mode = 'playing';
  G.input.lockPointer(renderer.domElement);
});
document.getElementById('btn-wasted').addEventListener('click', () => { respawn(150); showScreen(null); G.mode = 'playing'; });
document.getElementById('btn-busted').addEventListener('click', () => { respawn(100); showScreen(null); G.mode = 'playing'; });
if (!save) document.getElementById('btn-continue').style.display = 'none';

window.addEventListener('keydown', (e) => {
  G.audio.unlock();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.mode === 'playing' && !shotName) {
      G.mode = 'paused';
      showScreen('pause-screen');
      G.input.unlockPointer();
    }
  }
});
window.addEventListener('mousedown', () => G.audio.unlock());
renderer.domElement.addEventListener('click', () => {
  if (G.mode === 'playing' && !G.input.pointerLocked && !shotName) {
    G.input.lockPointer(renderer.domElement);
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Simulation -------------------------------------------------------------

function step(dt) {
  G.time += dt;
  if (G.mode === 'playing') {
    G.player.update(dt, G.time);
    const obstacles = [...G.traffic.cars, ...G.police.cars];
    if (G.player.mode === 'foot') obstacles.push({ pos: G.player.pos, speed: 0 });
    G.traffic.update(dt, obstacles, G.time);
    G.police.update(dt, G.time);
    const hazards = [...G.traffic.cars, ...G.police.cars];
    G.peds.update(dt, G.time, hazards);
    G.missions.update(dt, G.time);
    G.saveTimer += dt;
    if (G.saveTimer > 12) {
      G.saveTimer = 0;
      G.saveGame();
    }
  }
  G.world.update(dt, G.time);
  G.hud.update(dt);
  G.input.endStep();
}

// Screenshot mode: pose the scene and play without any screens.
if (shotName) {
  G.player.placeAt(SPAWN_POS.x, SPAWN_POS.z, 1.13);
  showScreen(null);
  G.mode = 'playing';
  applyShot(G, shotName);
  document.body.dataset.shot = shotName;
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }
  G.player.updateCamera(dt);
  renderer.render(scene, camera);
  document.body.dataset.booted = '1';
  document.body.dataset.state = G.mode;
}
requestAnimationFrame(frame);

// Surface errors where headless checks can see them.
window.addEventListener('error', (e) => {
  const el = document.getElementById('errlog');
  if (el) el.textContent += `${e.message}\n`;
});
void MARISOL_POS;
