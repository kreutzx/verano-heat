// Pedestrians: low-poly Verano Bay citizens who stroll between sidewalk
// corners, cross streets, flee from gunfire and speeding cars, and go down
// when hit. Each one is a handful of boxes with swinging arms and legs.

import * as THREE from 'three';
import { HALF, ROAD_W, streetLines } from './config.js';

const SKIN = [0xf2c89b, 0xc68863, 0x8a5a3b, 0xffdbac];
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0xe56399, 0x1abc9c];
const PANTS = [0x2c3e50, 0x7f8c8d, 0x5d4037, 0x154360, 0xf5f5f5];

export function makePersonMesh(rng, { officer = false, fixer = false } = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[rng.int(0, SKIN.length - 1)] });
  const shirt = new THREE.MeshLambertMaterial({
    color: fixer ? 0xd6336c : officer ? 0x1c3d5a : SHIRTS[rng.int(0, SHIRTS.length - 1)],
  });
  const pants = new THREE.MeshLambertMaterial({
    color: officer ? 0x1c3d5a : PANTS[rng.int(0, PANTS.length - 1)],
  });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), shirt);
  torso.position.y = 1.06;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 7), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  if (officer || fixer) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.12, 8),
      new THREE.MeshLambertMaterial({ color: officer ? 0x1c3d5a : 0xf2b134 }));
    cap.position.y = 1.84;
    g.add(cap);
  }
  const limbs = {};
  const limbGeo = new THREE.BoxGeometry(0.15, 0.62, 0.15);
  for (const [name, x, mat] of [
    ['armL', -0.34, shirt], ['armR', 0.34, shirt],
    ['legL', -0.14, pants], ['legR', 0.14, pants],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, name.startsWith('arm') ? 1.36 : 0.68, 0);
    const limb = new THREE.Mesh(limbGeo, mat);
    limb.position.y = -0.28;
    limb.castShadow = true;
    pivot.add(limb);
    g.add(pivot);
    limbs[name] = pivot;
  }
  g.userData.limbs = limbs;
  return g;
}

let nextPedId = 1;

export class Ped {
  constructor(scene, rng, opts = {}) {
    this.id = nextPedId++;
    this.mesh = makePersonMesh(rng, opts);
    this.pos = this.mesh.position;
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = 0;
    this.walkSpeed = rng.range(1.6, 2.6);
    this.state = 'walk';       // walk | flee | down
    this.stateT = 0;
    this.phase = rng.range(0, Math.PI * 2);
    this.officer = !!opts.officer;
    this.down = false;
    this.corner = { vi: 0, hi: 0, sx: 1, sz: 1 };
    this.target = { x: 0, z: 0 };
    scene.add(this.mesh);
  }

  animate(dt, t) {
    const limbs = this.mesh.userData.limbs;
    const pace = 4 + this.walkSpeed * 2.4;
    const swing = Math.sin(t * pace + this.phase) * (this.speed > 0.2 ? 0.55 : 0);
    limbs.armL.rotation.x = swing;
    limbs.armR.rotation.x = -swing;
    limbs.legL.rotation.x = -swing;
    limbs.legR.rotation.x = swing;
    if (this.down) {
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
    } else {
      this.mesh.rotation.x = 0;
      // The little bob of a walking step (ground height is set by the system).
      this.mesh.position.y += Math.abs(Math.sin(t * pace + this.phase)) * 0.05 * (this.speed > 0.2 ? 1 : 0);
    }
    this.mesh.rotation.y = this.heading;
  }
}

const SIDE = ROAD_W / 2 + 2.6; // sidewalk offset from a street centre line

export class Pedestrians {
  constructor(scene, rng, world) {
    this.scene = scene;
    this.rng = rng;
    this.world = world;
    this.peds = [];
    this.lines = streetLines();
    for (let i = 0; i < 26; i++) {
      const ped = new Ped(scene, rng);
      this.placeAtRandomCorner(ped);
      this.chooseTarget(ped);
      this.peds.push(ped);
    }
  }

  cornerPos(c) {
    return {
      x: this.lines[c.vi] + c.sx * SIDE,
      z: this.lines[c.hi] + c.sz * SIDE,
    };
  }

  placeAtRandomCorner(ped) {
    const rng = this.rng;
    ped.corner = {
      vi: rng.int(0, this.lines.length - 1),
      hi: rng.int(0, this.lines.length - 1),
      sx: rng.chance(0.5) ? 1 : -1,
      sz: rng.chance(0.5) ? 1 : -1,
    };
    const p = this.cornerPos(ped.corner);
    ped.pos.set(p.x, this.world.groundY(p.x, p.z), p.z);
    ped.state = 'walk';
    ped.down = false;
    ped.speed = 0;
  }

  // From one corner, stroll to a neighbouring one (or cross the street).
  chooseTarget(ped) {
    const rng = this.rng;
    const c = { ...ped.corner };
    const move = rng.next();
    const last = this.lines.length - 1;
    if (move < 0.38) c.vi = Math.max(0, Math.min(last, c.vi + (rng.chance(0.5) ? 1 : -1)));
    else if (move < 0.76) c.hi = Math.max(0, Math.min(last, c.hi + (rng.chance(0.5) ? 1 : -1)));
    else if (move < 0.88) c.sx = -c.sx;  // cross the north–south street
    else c.sz = -c.sz;                  // cross the east–west street
    ped.corner = c;
    ped.target = this.cornerPos(c);
  }

  scare(x, z, radius = 26) {
    for (const ped of this.peds) {
      if (ped.down || ped.state === 'flee') continue;
      if (Math.hypot(ped.pos.x - x, ped.pos.z - z) < radius) {
        ped.state = 'flee';
        ped.stateT = this.rng.range(1.6, 3);
        ped.fleeFrom = { x, z };
      }
    }
  }

  knockDown(ped) {
    ped.down = true;
    ped.state = 'down';
    ped.stateT = 6;
    ped.speed = 0;
  }

  update(dt, t, hazards) {
    for (const ped of this.peds) {
      ped.stateT -= dt;
      if (ped.state === 'down') {
        if (ped.stateT <= 0) this.placeAtRandomCorner(ped); // replaced across town
        ped.animate(dt, t);
        continue;
      }
      let vx = 0; let vz = 0;
      if (ped.state === 'flee') {
        const dx = ped.pos.x - ped.fleeFrom.x;
        const dz = ped.pos.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        vx = (dx / d) * 5.2;
        vz = (dz / d) * 5.2;
        ped.pos.x += vx * dt;
        ped.pos.z += vz * dt;
        this.world.collideCircle(ped.pos, 0.5);
        if (ped.stateT <= 0) { ped.state = 'walk'; this.chooseTarget(ped); }
      } else {
        const dx = ped.target.x - ped.pos.x;
        const dz = ped.target.z - ped.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          this.chooseTarget(ped);
        } else {
          vx = (dx / d) * ped.walkSpeed;
          vz = (dz / d) * ped.walkSpeed;
          ped.pos.x += vx * dt;
          ped.pos.z += vz * dt;
        }
      }
      ped.speed = Math.hypot(vx, vz);
      if (ped.speed > 0.2) ped.heading = Math.atan2(vx, vz);
      // Cars are hazards: a moving car very close knocks a pedestrian down,
      // and a fast one nearby sends them running.
      for (const h of hazards) {
        const d = Math.hypot(ped.pos.x - h.pos.x, ped.pos.z - h.pos.z);
        if (d < 2.4 && Math.abs(h.speed) > 3.5) {
          this.knockDown(ped);
          if (h.onHitPed) h.onHitPed(ped);
          break;
        }
        if (d < 7 && Math.abs(h.speed) > 16 && ped.state === 'walk') {
          ped.state = 'flee';
          ped.stateT = 1.4;
          ped.fleeFrom = { x: h.pos.x, z: h.pos.z };
        }
      }
      ped.pos.y = this.world.groundY(ped.pos.x, ped.pos.z);
      ped.animate(dt, t);
    }
  }
}
