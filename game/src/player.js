// The player: one character who walks Verano Bay on foot and drives anything
// with wheels. Owns the third-person camera, fists-and-pistol combat, car
// entry/exit, and health. Game-wide consequences (wanted level, mission
// progress) are reported back through the context object.

import * as THREE from 'three';
import { Ped } from './peds.js';
import { driveCar } from './vehicles.js';

export class Player {
  constructor(G) {
    this.G = G;
    this.body = new Ped(G.scene, G.rng, {});
    // Give the player a recognisable teal hoodie.
    this.body.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x12b5a5 });
    this.pos = this.body.pos;
    this.heading = Math.PI; // facing the marina at spawn
    this.mode = 'foot';     // foot | car
    this.car = null;
    this.health = 100;
    this.weapon = 'fists';  // fists | pistol
    this.ammo = 12;
    this.reloadT = 0;
    this.attackCd = 0;
    this.punchT = 0;
    this.regenT = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.flashT = 0;

    // Muzzle flash: a small additive star at the gun hand.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g2 = c.getContext('2d');
    g2.translate(32, 32);
    g2.fillStyle = 'rgba(255,210,90,0.95)';
    for (let i = 0; i < 4; i++) {
      g2.rotate(Math.PI / 4);
      g2.fillRect(-2, -28, 4, 56);
    }
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.flash.scale.set(0.9, 0.9, 1);
    this.flash.visible = false;
    G.scene.add(this.flash);
    // Tracer line pool.
    this.tracers = [];
  }

  placeAt(x, z, heading = this.heading) {
    this.pos.set(x, this.G.world.groundY(x, z), z);
    this.heading = heading;
    this.body.heading = heading;
    this.camYaw = heading;
  }

  get speedNow() {
    return this.mode === 'car' && this.car ? Math.abs(this.car.speed) : this.body.speed;
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.G.traffic.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.pos.x - this.pos.x, car.pos.z - this.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    const G = this.G;
    car.taken = true;
    car.parked = false;
    this.car = car;
    this.mode = 'car';
    this.body.mesh.visible = false;
    G.audio.setEngine(true, 0);
    if (!car.wasStolen) {
      car.wasStolen = true;
      G.crime('steal', car.pos.x, car.pos.z);
    }
    G.hud.toast('Press F to get out', 1.6);
  }

  exitCar() {
    const G = this.G;
    const car = this.car;
    car.taken = false;
    car.parked = true;      // traffic leaves a dumped car where it lies
    car.speed = 0;
    this.car = null;
    this.mode = 'foot';
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    this.placeAt(car.pos.x + side.x * 2.6, car.pos.z + side.z * 2.6, car.heading);
    this.body.mesh.visible = true;
    G.audio.setEngine(false, 0);
  }

  hurt(amount) {
    if (this.invulnerable) return; // screenshot scenes pose, they don't punish
    this.health -= amount;
    this.regenT = 5;
    this.G.hud.damageFlash();
    if (this.health <= 0) {
      this.health = 0;
      this.G.onWasted();
    }
  }

  update(dt, t) {
    const G = this.G;
    const input = G.input;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = 12;
    }
    // Slow health regen while nobody is after the player.
    this.regenT -= dt;
    if (this.regenT <= 0 && G.police.wanted === 0 && this.health > 0) {
      this.health = Math.min(100, this.health + 2.2 * dt);
    }
    // Camera orbit from the mouse.
    if (input.pointerLocked) {
      this.camYaw -= input.mouseDX * 0.0032;
      this.camPitch = Math.max(0.06, Math.min(1.1, this.camPitch + input.mouseDY * 0.0026));
    }
    if (input.tapped('KeyF')) {
      if (this.mode === 'foot') {
        const car = this.nearestCar(4.2);
        if (car) this.enterCar(car);
      } else if (Math.abs(this.car.speed) < 4) {
        this.exitCar();
      }
    }
    if (input.tapped('Digit1')) this.weapon = 'fists';
    if (input.tapped('Digit2')) this.weapon = 'pistol';
    if (input.tapped('KeyR') && this.weapon === 'pistol' && this.ammo < 12 && this.reloadT <= 0) {
      this.reloadT = 1.1;
      G.hud.toast('Reloading…', 0.9);
    }
    if (this.mode === 'foot') this.updateFoot(dt, t);
    else this.updateDriving(dt, t);
    this.updateTracers(dt);
  }

  updateFoot(dt, t) {
    const G = this.G;
    const input = G.input;
    let mx = 0; let mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? 9.6 : 5.4;
    const len = Math.hypot(mx, mz);
    let vx = 0; let vz = 0;
    if (len > 0) {
      // Move relative to the camera: its forward is (sin yaw, cos yaw) in
      // world x/z, its right hand is (-cos yaw, sin yaw).
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const wx = (mz * sin - mx * cos) / len;
      const wz = (mz * cos + mx * sin) / len;
      vx = wx * speed;
      vz = wz * speed;
      this.heading = Math.atan2(vx, vz);
      if (!input.pointerLocked) this.camYaw += angDiff(this.heading, this.camYaw) * Math.min(1, dt * 2.4);
    }
    const oldX = this.pos.x; const oldZ = this.pos.z;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    G.world.collideCircle(this.pos, 0.55);
    // Cars are solid to walk into.
    for (const car of G.traffic.cars) {
      const dx = this.pos.x - car.pos.x;
      const dz = this.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.5 && d > 0.01) {
        this.pos.x = car.pos.x + (dx / d) * 2.5;
        this.pos.z = car.pos.z + (dz / d) * 2.5;
      }
    }
    if (G.world.inWater(this.pos.x, this.pos.z)) {
      this.pos.x = oldX;
      this.pos.z = oldZ;
    }
    this.body.speed = Math.hypot(vx, vz);
    this.body.heading = this.heading;
    this.pos.y = G.world.groundY(this.pos.x, this.pos.z);
    this.body.animate(dt, t);
    // Combat.
    if ((input.mouseDown || input.down('KeyJ')) && this.attackCd <= 0) {
      if (this.weapon === 'pistol') this.shoot();
      else this.punch();
    }
    // Swing the right arm while punching.
    const limbs = this.body.mesh.userData.limbs;
    if (this.punchT > 0) limbs.armR.rotation.x = -2.2 * Math.sin((this.punchT / 0.28) * Math.PI);
    // Interaction key is read by missions (Marisol, pickups) via input.tapped.
  }

  punch() {
    const G = this.G;
    this.attackCd = 0.34;
    this.punchT = 0.28;
    G.audio.punch();
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    for (const ped of G.peds.peds) {
      if (ped.down) continue;
      const dx = ped.pos.x - this.pos.x;
      const dz = ped.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) < 2.1 && dx * fx + dz * fz > 0) {
        G.peds.knockDown(ped);
        G.crime('assault', this.pos.x, this.pos.z);
        return;
      }
    }
  }

  shoot() {
    const G = this.G;
    if (this.reloadT > 0) return;
    if (this.ammo <= 0) {
      this.reloadT = 1.1;
      G.audio.blip(300, 200, 0.06, 0.15, 'square');
      return;
    }
    this.ammo--;
    this.attackCd = 0.21;
    G.audio.gunshot();
    G.peds.scare(this.pos.x, this.pos.z, 30);
    G.crime('shots', this.pos.x, this.pos.z);
    // Aim: from the camera, through the crosshair.
    const origin = G.camera.position.clone();
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.flash.position.copy(from).addScaledVector(dir, 0.7);
    this.flashT = 0.045;
    const hit = this.rayHit(origin, dir, 70);
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 70);
    this.addTracer(from.clone().addScaledVector(dir, 0.7), end);
    if (!hit) return;
    if (hit.ped) {
      G.peds.knockDown(hit.ped);
      G.crime('assault', this.pos.x, this.pos.z);
    } else if (hit.car) {
      hit.car.health -= 22;
      if (hit.car.police) G.crime('attackPolice', this.pos.x, this.pos.z);
      if (hit.car.health <= 0 && !hit.car.dead) {
        hit.car.dead = true;
        hit.car.speed = 0;
        G.audio.noiseBurst({ freq: 200, q: 0.5, dur: 0.5, gain: 0.8, type: 'lowpass' });
      }
    }
  }

  // Manual raycast against pedestrians, cars and building boxes.
  rayHit(origin, dir, maxDist) {
    const G = this.G;
    let best = null;
    // Buildings block the shot: step along the ray.
    let blockDist = maxDist;
    for (let d = 2; d < maxDist; d += 2) {
      const px = origin.x + dir.x * d;
      const pz = origin.z + dir.z * d;
      let inside = false;
      for (const c of G.world.colliders) {
        if (px > c.minX && px < c.maxX && pz > c.minZ && pz < c.maxZ) { inside = true; break; }
      }
      if (inside) { blockDist = d; break; }
    }
    const test = (point, radius, data) => {
      const to = point.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > blockDist) return;
      const closest = origin.clone().addScaledVector(dir, along);
      if (closest.distanceTo(point) < radius && (!best || along < best.dist)) {
        best = { dist: along, point: closest, ...data };
      }
    };
    for (const ped of G.peds.peds) {
      if (ped.down) continue;
      test(ped.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 0.75, { ped });
    }
    const allCars = [...G.traffic.cars, ...G.police.cars];
    for (const car of allCars) {
      if (car.dead) continue;
      test(car.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 2.5, { car });
    }
    return best;
  }

  addTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe08a, transparent: true, opacity: 0.9,
    }));
    this.G.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.9;
      if (tr.life <= 0) {
        this.G.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  updateDriving(dt, t) {
    const G = this.G;
    const input = G.input;
    const car = this.car;
    let throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) +
      (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
    let steer = (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) +
      (input.down('KeyD') || input.down('ArrowRight') ? -1 : 0);
    // Screenshot scenes drive themselves (see shots.js).
    if (G.scriptDrive) {
      throttle = G.scriptDrive.throttle;
      steer = G.scriptDrive.steer;
    }
    const impact = driveCar(car, dt, throttle, steer, G.world, car.sport ? 40 : 33);
    // Other cars are solid: shove out of any overlap and pay for it in speed.
    for (const other of [...G.traffic.cars, ...G.police.cars]) {
      if (other === car || other.dead) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.1 && d > 0.01) {
        car.pos.x = other.pos.x + (dx / d) * 4.1;
        car.pos.z = other.pos.z + (dz / d) * 4.1;
        if (Math.abs(car.speed) > 8) {
          this.hurt(3);
          G.crime('crash', car.pos.x, car.pos.z);
          G.audio.noiseBurst({ freq: 240, q: 0.6, dur: 0.2, gain: 0.4, type: 'lowpass' });
        }
        car.speed *= 0.45;
      }
    }
    if (impact > 7) {
      G.audio.noiseBurst({ freq: 240, q: 0.6, dur: 0.25, gain: 0.5, type: 'lowpass' });
      this.hurt(impact * 0.55);
      G.crime('crash', car.pos.x, car.pos.z);
    }
    car.onHitPed = () => G.crime('hitPed', car.pos.x, car.pos.z);
    car.updateVisual(dt, t);
    G.audio.setEngine(true, car.speed / 34);
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      G.hud.toast('This car is wrecked!', 2);
    }
    if (car.dead) this.exitCar();
    // The hidden body rides along inside the car.
    this.pos.copy(car.pos);
    this.heading = car.heading;
  }

  // Third-person camera, called once per rendered frame.
  updateCamera(dt) {
    const G = this.G;
    const target = this.mode === 'car' ? this.car.pos : this.pos;
    const dist = this.mode === 'car' ? 11.5 : this.camDist;
    const height = this.mode === 'car' ? 4.4 : 2.6;
    if (this.mode === 'car' && !G.input.pointerLocked) {
      // Ease behind the car when the mouse is not steering the camera: the
      // camera looks along (sin yaw, cos yaw), so yaw = heading is behind.
      this.camYaw += angDiff(this.car.heading, this.camYaw) * Math.min(1, dt * 1.7);
    }
    const cx = target.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = target.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = target.y + height + Math.sin(this.camPitch) * dist * 0.7;
    G.camera.position.set(cx, Math.max(1.1, cy), cz);
    G.camera.lookAt(target.x, target.y + 1.7, target.z);
  }
}

export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
