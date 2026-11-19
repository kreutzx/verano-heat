// Verano Bay itself: streets, signed buildings, palms, the beach, the marina
// and the lighthouse. Everything is built procedurally from the seeded RNG —
// canvas textures for facades and signs, boxes and cylinders for geometry —
// so the game ships no image files at all.

import * as THREE from 'three';
import {
  GRID, PITCH, ROAD_W, BLOCK, HALF, BEACH_Z, WATER_Z, MARINA_X,
  LIGHTHOUSE_POS, COLORS, BUSINESSES, streetLines,
} from './config.js';

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A building facade: coloured render, a grid of windows, a shopfront band.
function facadeTexture(rng, base, floors, cols) {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    const fh = 256 / floors;
    const cw = 256 / cols;
    for (let f = 0; f < floors; f++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const lit = rng.chance(0.24);
        g.fillStyle = lit ? '#ffe9a8' : (rng.chance(0.5) ? '#2c3e50' : '#3d5a73');
        g.fillRect(cIdx * cw + cw * 0.22, f * fh + fh * 0.2, cw * 0.56, fh * 0.55);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, 256 - fh, 256, fh); // ground floor shade
  });
}

function signTexture(name, bg, fg) {
  return canvasTexture(512, 96, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = fg;
    g.lineWidth = 5;
    g.strokeRect(7, 7, 498, 82);
    g.fillStyle = fg;
    g.font = 'bold 44px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 256, 52);
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#4d545e';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 260; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    g.fillStyle = '#e8e4da';
    g.fillRect(0, 3, 128, 3);
    g.fillRect(0, 122, 128, 3);
    g.fillStyle = '#f2c230';
    g.fillRect(8, 61, 34, 5);
    g.fillRect(86, 61, 34, 5);
  });
}

function palmLeafTexture() {
  const tex = canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.lineCap = 'round';
    for (let i = 0; i < 15; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.strokeStyle = i % 2 ? '#3aa655' : '#57b96a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(64, 64);
      g.quadraticCurveTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34, 64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const FACADE_BASES = ['#e8dcc8', '#d9c6a5', '#c9d4d8', '#e3b7a0', '#b5c8b0', '#d8d8e0', '#ecc9d4', '#f0e6d2'];

export class World {
  constructor(scene, rng) {
    this.rng = rng;
    this.colliders = [];      // {minX, maxX, minZ, maxZ} solid building footprints
    this.piers = [];          // {minX, maxX, minZ, maxZ, y} walkable deck rectangles
    this.parkingSpots = [];   // {x, z, heading} where parked cars wait to be stolen
    this.group = new THREE.Group();
    scene.add(this.group);

    this.buildSky(scene);
    this.buildLights(scene);
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildCoast();
    this.buildMarina();
    this.waterMat = null; // set in buildCoast
  }

  buildSky(scene) {
    const tex = canvasTexture(4, 512, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#3f7fbf');
      grad.addColorStop(0.45, '#8ec9e8');
      grad.addColorStop(0.72, '#cfe3d8');
      grad.addColorStop(1, '#f6d9a8');
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 512);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 24, 12),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
    );
    this.group.add(sky);
    scene.fog = new THREE.Fog(0xd8e2da, 300, 1250);
  }

  buildLights(scene) {
    const hemi = new THREE.HemisphereLight(0xcfe5f5, 0x8a7a5f, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(COLORS.sun, 2.0);
    sun.position.set(-260, 300, 190);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -330;
    sun.shadow.camera.right = 330;
    sun.shadow.camera.top = 330;
    sun.shadow.camera.bottom = -330;
    sun.shadow.camera.far = 1100;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
  }

  buildGround() {
    // Landmass: stops at the marina basin so the sea plane shows through
    // around the piers instead of being buried under the ground.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(1700, 900),
      new THREE.MeshLambertMaterial({ color: COLORS.sidewalk }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(120, 0, -168);
    base.receiveShadow = true;
    this.group.add(base);
  }

  buildRoads() {
    const tex = roadTexture();
    const span = GRID * PITCH + ROAD_W + 90; // streets run out to the coast road
    for (const line of streetLines()) {
      // East–west street: the plane's local X already runs along the street,
      // so the canvas dashes run along it with a plain repeat.
      const t1 = tex.clone();
      t1.needsUpdate = true;
      t1.repeat.set(span / 16, 1);
      const m1 = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_W), new THREE.MeshLambertMaterial({ map: t1 }));
      m1.rotation.x = -Math.PI / 2;
      m1.position.set(18, 0.02, line);
      m1.receiveShadow = true;
      this.group.add(m1);
      // North–south street: same texture, rotated a quarter turn in UV
      // space so the dashes run along Z instead of across it.
      const t2 = tex.clone();
      t2.needsUpdate = true;
      t2.center.set(0.5, 0.5);
      t2.rotation = Math.PI / 2;
      t2.repeat.set(span / 16, 1);
      const m2 = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, span), new THREE.MeshLambertMaterial({ map: t2 }));
      m2.rotation.x = -Math.PI / 2;
      m2.position.set(line, 0.04, 18);
      m2.receiveShadow = true;
      this.group.add(m2);
    }
  }

  blockCenter(i) {
    return -HALF + PITCH / 2 + i * PITCH;
  }

  buildBlocks() {
    const rng = this.rng;
    const baseMat = new THREE.MeshLambertMaterial({ color: 0xcac0aa });
    for (let ix = 0; ix < GRID; ix++) {
      for (let iz = 0; iz < GRID; iz++) {
        const cx = this.blockCenter(ix);
        const cz = this.blockCenter(iz);
        // One special block is the plaza park, one is the parking lot.
        if (ix === 2 && iz === 5) { this.buildPark(cx, cz); continue; }
        if (ix === 5 && iz === 1) { this.buildParking(cx, cz); continue; }
        const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 6, 0.3, BLOCK + 6), baseMat);
        slab.position.set(cx, 0.15, cz);
        slab.receiveShadow = true;
        this.group.add(slab);
        const downtown = Math.hypot(cx, cz) < 135;
        const count = downtown ? rng.int(1, 2) : rng.int(2, 4);
        for (let b = 0; b < count; b++) {
          this.buildBuilding(cx, cz, downtown, count, b);
        }
      }
    }
    this.buildPalmsAndLights();
  }

  buildBuilding(cx, cz, downtown, count, index) {
    const rng = this.rng;
    let w; let d; let ox = 0; let oz = 0;
    if (count === 1) { w = rng.range(26, 34); d = rng.range(26, 34); }
    else if (count === 2) { w = rng.range(16, 20); d = rng.range(28, 36); ox = index === 0 ? -11 : 11; }
    else {
      w = rng.range(15, 19); d = rng.range(15, 19);
      ox = (index % 2 === 0 ? -11 : 11);
      oz = (index < 2 ? -11 : 11);
    }
    const h = downtown ? rng.range(26, 62) : rng.range(8, 24);
    const floors = Math.max(2, Math.round(h / 3.4));
    const cols = Math.max(3, Math.round(w / 4));
    const base = FACADE_BASES[rng.int(0, FACADE_BASES.length - 1)];
    const tex = facadeTexture(rng, base, floors, cols);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6259 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
    const x = cx + ox;
    const z = cz + oz;
    mesh.position.set(x, 0.3 + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    // Rooftop clutter on some buildings.
    if (rng.chance(0.5)) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(rng.range(2, 4), rng.range(1, 2), rng.range(2, 4)),
        new THREE.MeshLambertMaterial({ color: 0x9aa0a4 }),
      );
      ac.position.set(x + rng.range(-w / 4, w / 4), 0.3 + h + 0.7, z + rng.range(-d / 4, d / 4));
      ac.castShadow = true;
      this.group.add(ac);
    }
    // A signed shopfront facing the nearest street, on most buildings.
    if (rng.chance(0.62)) {
      const name = BUSINESSES[rng.int(0, BUSINESSES.length - 1)];
      const bg = ['#173f5f', '#7a1f2b', '#14532d', '#4a235a', '#7c4a12', '#0f4c4c'][rng.int(0, 5)];
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.92, 17), 3.1),
        new THREE.MeshBasicMaterial({ map: signTexture(name, bg, '#f7f3e8') }),
      );
      // Face south if the block's south street is nearer, else north.
      const faceSouth = (cz + BLOCK / 2) - z <= z - (cz - BLOCK / 2);
      sign.position.set(x, 4.6, z + (faceSouth ? d / 2 + 0.06 : -d / 2 - 0.06));
      if (!faceSouth) sign.rotation.y = Math.PI;
      this.group.add(sign);
    }
  }

  buildPark(cx, cz) {
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK + 6, 0.3, BLOCK + 6),
      new THREE.MeshLambertMaterial({ color: COLORS.grass }),
    );
    grass.position.set(cx, 0.15, cz);
    grass.receiveShadow = true;
    this.group.add(grass);
    const rng = this.rng;
    for (let i = 0; i < 9; i++) {
      const x = cx + rng.range(-17, 17);
      const z = cz + rng.range(-17, 17);
      if (Math.hypot(x - cx, z - cz) < 6) continue;
      this.addTree(x, z, rng.range(0.9, 1.3));
    }
    // A little fountain at the plaza centre.
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.8, 1, 18),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c2 }),
    );
    basin.position.set(cx, 0.8, cz);
    basin.castShadow = true;
    this.group.add(basin);
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 3.9, 0.3, 18),
      new THREE.MeshLambertMaterial({ color: COLORS.water }),
    );
    pool.position.set(cx, 1.25, cz);
    this.group.add(pool);
    this.colliders.push({ minX: cx - 4.8, maxX: cx + 4.8, minZ: cz - 4.8, maxZ: cz + 4.8 });
  }

  buildParking(cx, cz) {
    const lot = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK + 6, 0.3, BLOCK + 6),
      new THREE.MeshLambertMaterial({ color: 0x4a4f57 }),
    );
    lot.position.set(cx, 0.15, cz);
    lot.receiveShadow = true;
    this.group.add(lot);
    // Two rows of bays; vehicles.js fills some of them with stealable cars.
    for (let i = 0; i < 6; i++) {
      this.parkingSpots.push({ x: cx - 15 + i * 6, z: cz - 12, heading: Math.PI });
      this.parkingSpots.push({ x: cx - 15 + i * 6, z: cz + 12, heading: 0 });
    }
    // A row of kerbside spots on the coast road and near the marina too.
    for (let i = 0; i < 5; i++) {
      this.parkingSpots.push({ x: -HALF + 40 + i * 34, z: HALF - 11.5, heading: Math.PI / 2 });
    }
    for (let i = 0; i < 3; i++) {
      this.parkingSpots.push({ x: MARINA_X - 66, z: WATER_Z - 44 + i * 13, heading: -Math.PI / 2 });
    }
  }

  addTree(x, z, s = 1) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 2.4 * s, 6),
      new THREE.MeshLambertMaterial({ color: COLORS.palmTrunk }),
    );
    trunk.position.set(x, 1.2 * s + 0.3, z);
    trunk.castShadow = true;
    this.group.add(trunk);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(1.9 * s, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x4d8f3f }),
    );
    crown.position.set(x, 3.2 * s + 0.3, z);
    crown.castShadow = true;
    this.group.add(crown);
  }

  addPalm(x, z) {
    const rng = this.rng;
    const h = rng.range(7, 9.5);
    const lean = rng.range(-0.09, 0.09);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.26, h, 6),
      new THREE.MeshLambertMaterial({ color: COLORS.palmTrunk }),
    );
    trunk.position.set(x + lean * h * 2, h / 2, z);
    trunk.rotation.z = lean;
    trunk.castShadow = true;
    this.group.add(trunk);
    if (!this.leafTex) this.leafTex = palmLeafTexture();
    // Two drooped, crossed frond planes: a flat top-down star vanishes
    // edge-on from street level, so the crown is tilted toward the viewer.
    const leafMat = new THREE.MeshLambertMaterial({
      map: this.leafTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    });
    for (const turn of [0, Math.PI / 2]) {
      const geo = new THREE.PlaneGeometry(5, 5);
      geo.rotateX(-Math.PI / 2 + 0.42);
      geo.rotateY(turn + rng.range(0, 0.6));
      const fronds = new THREE.Mesh(geo, leafMat);
      fronds.position.set(x + lean * h * 4, h + 0.1, z);
      fronds.castShadow = true;
      this.group.add(fronds);
    }
  }

  buildPalmsAndLights() {
    const rng = this.rng;
    // Palms along the coast road and the beach.
    for (let x = -HALF - 6; x <= HALF + 30; x += rng.range(15, 22)) {
      this.addPalm(x, HALF + rng.range(11, 15));
      if (rng.chance(0.6)) this.addPalm(x + rng.range(4, 9), BEACH_Z + rng.range(2, 22));
    }
    // Palms framing the marina promenade.
    for (let i = 0; i < 5; i++) this.addPalm(MARINA_X - 70 + i * 4, WATER_Z - 34 + (i % 2) * 8);
    // Streetlights along the grid.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x555b63 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4 });
    for (const line of streetLines()) {
      for (let p = -HALF + 30; p < HALF; p += 60) {
        for (const [x, z] of [[p, line + ROAD_W / 2 + 1.2], [line + ROAD_W / 2 + 1.2, p]]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 5), poleMat);
          pole.position.set(x, 3, z);
          this.group.add(pole);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), lampMat);
          lamp.position.set(x, 6.05, z);
          this.group.add(lamp);
        }
      }
    }
  }

  buildCoast() {
    // Sand strip along the city front only — east of the promenade the
    // marina basin stays open water.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(540, 130),
      new THREE.MeshLambertMaterial({ color: COLORS.sand }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-15, 0.06, WATER_Z + 28);
    sand.receiveShadow = true;
    this.group.add(sand);
    // The sea.
    const waterTex = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#1d6f8e';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        const y = Math.random() * 256;
        g.beginPath();
        g.moveTo(Math.random() * 200, y);
        g.lineTo(Math.random() * 60 + 200, y);
        g.stroke();
      }
    }, 24, 10);
    this.waterMat = new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.94 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1700, 700), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(120, -0.25, WATER_Z + 330);
    this.group.add(water);
    // Beach umbrellas and towels for colour.
    const rng = this.rng;
    const umbrellaCols = [0xe74c3c, 0xf39c12, 0x2e86de, 0xe56399];
    for (let i = 0; i < 10; i++) {
      const x = rng.range(-HALF, HALF + 40);
      const z = BEACH_Z + rng.range(6, 30);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5),
        new THREE.MeshLambertMaterial({ color: 0xe8e4da }));
      pole.position.set(x, 1.1, z);
      this.group.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8),
        new THREE.MeshLambertMaterial({ color: umbrellaCols[i % umbrellaCols.length] }));
      top.position.set(x, 2.3, z);
      top.castShadow = true;
      this.group.add(top);
    }
    // The big welcome sign on the coast road.
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3.4),
      new THREE.MeshBasicMaterial({ map: signTexture('VERANO BAY', '#0d3b4c', '#ffd76a') }),
    );
    board.position.set(-HALF + 26, 4.4, HALF + 12);
    board.rotation.y = Math.PI;
    this.group.add(board);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    for (const dx of [-7, 7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.6, 6), postMat);
      post.position.set(-HALF + 26 + dx, 2.3, HALF + 12);
      this.group.add(post);
    }
  }

  buildMarina() {
    // Deck planks, drawn once and repeated along every pier.
    const plankTex = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#8a6844';
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) {
        g.fillStyle = y % 32 ? '#957449' : '#7d5c39';
        g.fillRect(0, y, 128, 14);
        g.fillStyle = 'rgba(60,40,20,0.5)';
        for (let i = 0; i < 22; i++) g.fillRect(Math.random() * 128, y + Math.random() * 13, 8, 1);
      }
    }, 10, 3);
    const woodMat = new THREE.MeshLambertMaterial({ map: plankTex });
    const deckY = 0.55;
    // Main promenade deck running east from the beach.
    const promenade = { minX: HALF + 6, maxX: MARINA_X + 44, minZ: WATER_Z - 40, maxZ: WATER_Z - 6, y: deckY };
    this.piers.push(promenade);
    this.addDeck(promenade, woodMat);
    // Three finger piers reaching into the bay.
    for (let i = 0; i < 3; i++) {
      const pier = { minX: HALF + 26 + i * 34, maxX: HALF + 34 + i * 34, minZ: WATER_Z - 6, maxZ: WATER_Z + 52, y: deckY };
      this.piers.push(pier);
      this.addDeck(pier, woodMat);
    }
    // The long lighthouse pier.
    const lp = { minX: LIGHTHOUSE_POS.x - 5, maxX: LIGHTHOUSE_POS.x + 5, minZ: WATER_Z - 6, maxZ: LIGHTHOUSE_POS.z, y: deckY };
    this.piers.push(lp);
    this.addDeck(lp, woodMat);
    // Moored boats: a hull, a cabin and a mast each.
    const hullCols = [0xe8e4da, 0xd94f3d, 0x3d7bd9, 0xf2b134];
    const rng = this.rng;
    for (let i = 0; i < 7; i++) {
      const bx = HALF + 40 + (i % 3) * 34 + rng.range(-3, 3);
      const bz = WATER_Z + 12 + Math.floor(i / 3) * 26 + rng.range(-3, 3);
      this.addBoat(bx, bz, hullCols[i % hullCols.length], rng);
    }
    // Crates and barrels on the promenade.
    for (let i = 0; i < 8; i++) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 1.4),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0xa9743f : 0x7a9e43 }),
      );
      crate.position.set(HALF + 16 + i * 13, deckY + 0.7, WATER_Z - 12 - (i % 2) * 6);
      crate.rotation.y = rng.range(0, 1);
      crate.castShadow = true;
      this.group.add(crate);
    }
    this.buildLighthouse();
  }

  addDeck(rect, mat) {
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, rect.y, d), mat);
    deck.position.set(rect.minX + w / 2, rect.y / 2, rect.minZ + d / 2);
    deck.receiveShadow = true;
    deck.castShadow = false;
    this.group.add(deck);
  }

  addBoat(x, z, color, rng) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 7.5),
      new THREE.MeshLambertMaterial({ color }));
    hull.position.y = 0.35;
    boat.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 4),
      new THREE.MeshLambertMaterial({ color }));
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.35, 4.9);
    boat.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 2.6),
      new THREE.MeshLambertMaterial({ color: 0xf4f1e8 }));
    cabin.position.set(0, 1.4, -0.6);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x8a6844 }));
    mast.position.set(0, 3.6, 1.2);
    boat.add(mast);
    boat.position.set(x, -0.15, z);
    boat.rotation.y = rng.range(-0.16, 0.16);
    this.group.add(boat);
  }

  buildLighthouse() {
    const { x, z } = LIGHTHOUSE_POS;
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 2.4, 10),
      new THREE.MeshLambertMaterial({ color: 0x7d7468 }));
    rock.position.set(x, 0.4, z);
    this.group.add(rock);
    const stripeTex = canvasTexture(64, 128, (g) => {
      g.fillStyle = '#f4f1e8';
      g.fillRect(0, 0, 64, 128);
      g.fillStyle = '#d94f3d';
      g.fillRect(0, 22, 64, 26);
      g.fillRect(0, 76, 64, 26);
    });
    stripeTex.wrapS = stripeTex.wrapT = THREE.ClampToEdgeWrapping;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 15, 12),
      new THREE.MeshLambertMaterial({ map: stripeTex }));
    tower.position.set(x, 9.3, z);
    tower.castShadow = true;
    this.group.add(tower);
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 2.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x2f3542 }));
    lampRoom.position.set(x, 18, z);
    this.group.add(lampRoom);
    const lampBall = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lampBall.position.set(x, 18, z);
    this.group.add(lampBall);
    // A slow rotating beam (two additive cones) — pretty at the marina.
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffedb5, transparent: true, opacity: 0.055,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Group();
    for (const dir of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 34, 12, 1, true), beamMat);
      cone.rotation.z = dir * Math.PI / 2;
      cone.position.x = dir * 17;
      this.beam.add(cone);
    }
    this.beam.position.set(x, 18, z);
    this.group.add(this.beam);
    this.colliders.push({ minX: x - 4, maxX: x + 4, minZ: z - 4, maxZ: z + 4 });
  }

  // Height of the walkable surface under a point (pier decks, block slabs).
  groundY(x, z) {
    for (const p of this.piers) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return p.y;
    }
    if (x > -HALF - 26 && x < HALF + 26 && z > -HALF - 26 && z < HALF + 26) {
      // Inside the city: 0.3 on a block slab, 0 on the streets.
      const fx = (x + HALF) % PITCH;
      const fz = (z + HALF) % PITCH;
      const onBlock = fx > ROAD_W / 2 - 3 && fx < PITCH - ROAD_W / 2 + 3 &&
                      fz > ROAD_W / 2 - 3 && fz < PITCH - ROAD_W / 2 + 3;
      if (onBlock) return 0.3;
    }
    return 0;
  }

  inWater(x, z) {
    if (z < WATER_Z - 2) return false;
    if (this.groundY(x, z) > 0) return false;
    return true;
  }

  // Push a circle (x, z, radius) out of every building AABB; returns true if
  // it hit anything (used for crash feedback).
  collideCircle(pos, radius) {
    let hit = false;
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest exit.
          const exits = [
            { d: pos.x - c.minX, x: c.minX - radius, z: pos.z },
            { d: c.maxX - pos.x, x: c.maxX + radius, z: pos.z },
            { d: pos.z - c.minZ, x: pos.x, z: c.minZ - radius },
            { d: c.maxZ - pos.z, x: pos.x, z: c.maxZ + radius },
          ];
          exits.sort((a, b) => a.d - b.d);
          pos.x = exits[0].x;
          pos.z = exits[0].z;
        }
      }
    }
    return hit;
  }

  update(dt, t) {
    if (this.waterMat && this.waterMat.map) {
      this.waterMat.map.offset.set((t * 0.008) % 1, (Math.sin(t * 0.1) * 0.01));
    }
    if (this.beam) this.beam.rotation.y = t * 0.35;
  }
}
