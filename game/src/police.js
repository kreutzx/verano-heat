// The Verano Bay PD: a five-star wanted level, patrol cars that hunt along
// the streets and break into free pursuit up close, gunfire at the highest
// levels, and the busted meter that fills while officers have you pinned.

import * as THREE from 'three';
import { Car, laneOffset, headingFor, steerToward } from './vehicles.js';
import { streetLines } from './config.js';

// How much heat each crime adds, and the star it can raise you to.
const CRIME_HEAT = {
  steal: 1, assault: 1, shots: 1, crash: 1, hitPed: 2, attackPolice: 2,
};

export class Police {
  constructor(G) {
    this.G = G;
    this.wanted = 0;
    this.cars = [];
    this.lines = streetLines();
    this.unseenT = 0;      // time since any officer had eyes on the player
    this.bustedMeter = 0;
    this.shotT = 0;
    this.flashT = 0;
  }

  targetUnits() {
    if (this.wanted === 0) return 0;
    return Math.min(2 + this.wanted, 6);
  }

  // Called for every crime; `witnessed` was decided by the game's crime().
  addCrime(kind) {
    const heat = CRIME_HEAT[kind] || 1;
    this.wanted = Math.min(5, this.wanted + heat);
    this.unseenT = 0;
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.unseenT = 0;
  }

  clear() {
    this.wanted = 0;
    this.bustedMeter = 0;
    this.unseenT = 0;
  }

  spawnUnit(playerPos) {
    const G = this.G;
    const car = new Car(G.scene, 0xffffff, { police: true });
    // Join a street some distance away, heading roughly at the player.
    const rng = G.rng;
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = this.lines[rng.int(0, this.lines.length - 1)];
    let along = axis === 'x' ? playerPos.x : playerPos.z;
    along += (rng.chance(0.5) ? -1 : 1) * rng.range(70, 110);
    const dir = axis === 'x'
      ? Math.sign(playerPos.x - along) || 1
      : Math.sign(playerPos.z - along) || 1;
    car.axis = axis;
    car.dir = dir;
    car.line = line;
    car.along = along;
    car.mode = 'lane';
    car.stuckT = 0;
    car.reverseT = 0;
    car.cruise = 17 + this.wanted * 1.6;
    this.syncLane(car, true);
    this.cars.push(car);
    return car;
  }

  syncLane(car, snap = false) {
    const off = laneOffset(car.axis, car.dir);
    if (car.axis === 'x') { car.pos.x = car.along; car.pos.z = car.line + off; }
    else { car.pos.x = car.line + off; car.pos.z = car.along; }
    const target = headingFor(car.axis, car.dir);
    if (snap) car.heading = target;
    else {
      let diff = target - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += diff * Math.min(1, 0.12 + Math.abs(car.speed) * 0.02);
    }
    car.mesh.rotation.y = car.heading;
  }

  removeUnit(car) {
    this.G.scene.remove(car.mesh);
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  // At an intersection, take the exit that closes on the player fastest.
  greedyTurn(car, crossLine, playerPos) {
    const options = [];
    const cur = { axis: car.axis, dir: car.dir };
    options.push(cur);
    options.push({ axis: car.axis === 'x' ? 'z' : 'x', dir: 1 });
    options.push({ axis: car.axis === 'x' ? 'z' : 'x', dir: -1 });
    let best = cur;
    let bestScore = Infinity;
    for (const o of options) {
      // Project 30 units along the option from the intersection.
      let px = crossLine; let pz = crossLine;
      if (car.axis === 'x') { px = crossLine; pz = car.line; }
      else { px = car.line; pz = crossLine; }
      if (o.axis === 'x') px += o.dir * 30;
      else pz += o.dir * 30;
      const score = Math.hypot(px - playerPos.x, pz - playerPos.z) +
        (o === cur ? 0 : 2); // slight bias against turning
      if (score < bestScore) { bestScore = score; best = o; }
    }
    if (best !== cur) {
      // The coordinate along the NEW axis is the car's current position on
      // it: turning off an x-street onto a z-street, `along` becomes pos.z.
      const alongNow = car.axis === 'x' ? car.pos.z : car.pos.x;
      car.axis = best.axis;
      car.dir = best.dir;
      car.line = crossLine;
      car.along = alongNow;
    }
  }

  update(dt, t) {
    const G = this.G;
    const player = G.player;
    const pPos = player.mode === 'car' ? player.car.pos : player.pos;
    // Spawn or retire units to match the wanted level.
    while (this.cars.length < this.targetUnits()) this.spawnUnit(pPos);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const d = Math.hypot(car.pos.x - pPos.x, car.pos.z - pPos.z);
      if ((this.cars.length > this.targetUnits() && d > 60) || d > 320 || car.dead) {
        this.removeUnit(car);
      }
    }
    // Eyes on the player?
    let nearest = Infinity;
    for (const car of this.cars) {
      nearest = Math.min(nearest, Math.hypot(car.pos.x - pPos.x, car.pos.z - pPos.z));
    }
    if (nearest < 55) this.unseenT = 0;
    else this.unseenT += dt;
    // Lying low works: a star fades every few unseen seconds.
    if (this.wanted > 0 && this.unseenT > 9) {
      this.wanted -= 1;
      this.unseenT = 3;
      if (this.wanted === 0) G.hud.toast('You lost the cops', 2);
    }
    G.audio.setSiren(this.wanted > 0 && nearest < 60);

    this.flashT += dt;
    const flashPhase = Math.floor(this.flashT * 2.4) % 2 === 0;
    this.shotT -= dt;

    for (const car of this.cars) {
      const dist = Math.hypot(car.pos.x - pPos.x, car.pos.z - pPos.z);
      if (car.mode === 'lane' && dist < 30) car.mode = 'chase';
      if (car.mode === 'chase' && dist > 58) {
        car.mode = 'lane';
        this.snapToLane(car);
      }
      if (car.mode === 'lane') this.driveLane(car, dt, pPos);
      else this.driveChase(car, dt, pPos);
      // Flash the light bar.
      const lm = car.mesh.userData.lightMats;
      if (lm) {
        lm.red.color.setHex(flashPhase ? 0xff2a1a : 0x57120c);
        lm.blue.color.setHex(flashPhase ? 0x571245 : 0x2266ff);
      }
      car.updateVisual(dt, t);
      // At four stars and up, officers stop and shoot at a player on foot.
      if (this.wanted >= 4 && player.mode === 'foot' && dist < 25 && dist > 5 && this.shotT <= 0) {
        this.shotT = 0.55;
        G.audio.gunshot();
        const from = car.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
        const to = player.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        player.addTracer(from, to);
        if (G.rng.chance(0.55)) player.hurt(G.rng.range(3, 7));
      }
    }
    // Busted: pinned by a nearby unit while barely moving.
    const pSpeed = player.mode === 'car' ? Math.abs(player.car.speed) : player.body.speed;
    if (this.wanted > 0 && nearest < 10.5 && pSpeed < 2.4) {
      this.bustedMeter += dt / 2.6;
      if (this.bustedMeter >= 1) {
        this.bustedMeter = 0;
        G.onBusted();
      }
    } else {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt / 1.8);
    }
  }

  snapToLane(car) {
    // Rejoin the nearest street line in the direction of travel.
    let bestLine = this.lines[0];
    let bestD = Infinity;
    const cross = car.axis === 'x' ? car.pos.z : car.pos.x;
    for (const l of this.lines) {
      const d = Math.abs(l - cross);
      if (d < bestD) { bestD = d; bestLine = l; }
    }
    car.line = bestLine;
    car.along = car.axis === 'x' ? car.pos.x : car.pos.z;
    this.syncLane(car, true);
  }

  driveLane(car, dt, pPos) {
    car.speed += Math.max(-20 * dt, Math.min(8 * dt, car.cruise - car.speed));
    car.along += car.dir * car.speed * dt;
    // Greedy choice at the next intersection.
    let nextLine = null;
    let bestD = Infinity;
    for (const l of this.lines) {
      const d = (l - car.along) * car.dir;
      if (d > -0.5 && d < bestD) { bestD = d; nextLine = l; }
    }
    if (nextLine !== null && Math.abs(car.along - nextLine) < 1) {
      car.along = nextLine;
      this.greedyTurn(car, nextLine, pPos);
    }
    this.syncLane(car);
  }

  driveChase(car, dt, pPos) {
    // Free pursuit; if wedged against a building, back out and try again.
    if (car.reverseT > 0) {
      car.reverseT -= dt;
      steerToward(car, dt, { x: car.pos.x - Math.sin(car.heading) * 10, z: car.pos.z - Math.cos(car.heading) * 10 }, this.G.world, 12);
      return;
    }
    const dist = steerToward(car, dt, pPos, this.G.world, 21 + this.wanted * 2.4);
    if (Math.abs(car.speed) < 1.2 && dist > 8) {
      car.stuckT += dt;
      if (car.stuckT > 1.1) { car.reverseT = 0.7; car.stuckT = 0; }
    } else {
      car.stuckT = 0;
    }
    // Nudge the player's car when they make contact (a soft ram).
    const player = this.G.player;
    if (player.mode === 'car' && dist < 4.4 && Math.abs(car.speed) > 6) {
      player.car.speed *= 0.82;
      player.hurt(2);
    }
  }
}
