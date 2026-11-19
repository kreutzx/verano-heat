// Cars: one mesh factory for every vehicle in Verano Bay, an arcade driving
// model shared by the player and the police, and the traffic system that
// keeps the streets alive with lane-following drivers.

import * as THREE from 'three';
import { LANE, CAR_COLORS, streetLines } from './config.js';

const FORWARD = {
  x: (dir) => new THREE.Vector3(dir, 0, 0),
  z: (dir) => new THREE.Vector3(0, 0, dir),
};

// Lane offset from the street centre for right-hand traffic.
export function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? LANE : -LANE;
  return dir > 0 ? -LANE : LANE;
}

export function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

// Build a low-poly car. It faces +Z at rotation 0. Police cars get a light
// bar whose two halves the police system flashes.
export function makeCarMesh(color, { police = false, sport = false } = {}) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f2 : color });
  const darkPaint = new THREE.MeshLambertMaterial({ color: police ? 0x1c2733 : color });
  const bodyH = sport ? 0.55 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, bodyH, 4.3), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.66, 0.55, sport ? 1.9 : 2.2),
    new THREE.MeshLambertMaterial({ color: 0x22303c }),
  );
  cabin.position.set(0, 1.08, sport ? -0.2 : 0);
  cabin.castShadow = true;
  car.add(cabin);
  if (police) {
    const doors = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.5, 2.2), darkPaint);
    doors.position.y = 0.55;
    car.add(doors);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x15181c });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    car.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6bf });
  for (const lx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMat);
    head.position.set(lx, 0.62, 2.16);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xd23b2e }));
    tail.position.set(lx, 0.62, -2.16);
    car.add(tail);
  }
  let lightMats = null;
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
    bar.position.set(0, 1.44, 0);
    car.add(bar);
    const red = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.44), red);
    rl.position.set(-0.33, 1.46, 0);
    car.add(rl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.44), blue);
    bl.position.set(0.33, 1.46, 0);
    car.add(bl);
    lightMats = { red, blue };
  }
  car.userData.wheels = wheels;
  car.userData.lightMats = lightMats;
  return car;
}

let nextCarId = 1;

export class Car {
  constructor(scene, color, opts = {}) {
    this.id = nextCarId++;
    this.mesh = makeCarMesh(color, opts);
    this.police = !!opts.police;
    this.sport = !!opts.sport;
    this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.radius = 2.25;
    this.taken = false;      // the player is driving this one
    this.dead = false;
    scene.add(this.mesh);
  }

  get pos() {
    return this.mesh.position;
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  setPose(x, z, heading) {
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
  }

  // Smoke puff anchor above the bonnet once the car is badly damaged.
  updateVisual(dt, t) {
    const spin = this.speed * dt * 2.4;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.health < 35 && !this.dead) {
      if (!this.smoke) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
        grad.addColorStop(0, 'rgba(40,40,40,0.55)');
        grad.addColorStop(1, 'rgba(40,40,40,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        this.smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
        this.mesh.add(this.smoke);
      }
      const s = 1.4 + Math.sin(t * 7 + this.id) * 0.5;
      this.smoke.scale.set(s, s, 1);
      this.smoke.position.set(0, 1.6 + Math.sin(t * 3 + this.id) * 0.2, 1.6);
    }
  }
}

// Arcade driving used directly by the player and, through a steering helper,
// by police in free pursuit. throttle -1..1, steer -1..1.
export function driveCar(car, dt, throttle, steer, world, maxSpeed = 34) {
  const accel = throttle > 0 ? 15 : 19;
  car.speed += throttle * accel * dt;
  // Rolling drag and a soft top speed / reverse limit.
  car.speed -= car.speed * 0.55 * dt;
  car.speed = Math.max(-10, Math.min(maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.04 && throttle === 0) car.speed = 0;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 6) * Math.sign(car.speed);
  // Positive steer turns toward larger heading (the driver's left, since
  // forward is (sin heading, cos heading)); callers pass left as +1.
  car.heading += steer * 1.55 * steerAuthority * dt;
  const f = car.forward();
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;
  const before = Math.abs(car.speed);
  if (world.collideCircle(car.pos, car.radius)) {
    if (before > 9) car.health -= (before - 8) * 1.6;
    car.speed *= -0.18;
  }
  car.mesh.position.y = world.groundY(car.pos.x, car.pos.z) > 0.4 ? 0.55 : 0;
  car.mesh.rotation.y = car.heading;
  // A touch of body roll in corners for feel.
  car.mesh.rotation.z = -steer * Math.min(0.06, Math.abs(car.speed) * 0.002);
  return before - Math.abs(car.speed); // impact size, for crash feedback
}

// Steer a car freely toward a world point (police pursuit, mission drivers).
export function steerToward(car, dt, target, world, maxSpeed = 30) {
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.9));
  const throttle = Math.abs(diff) > 2.2 ? -0.5 : 1;
  driveCar(car, dt, throttle, steer, world, maxSpeed);
  return dist;
}

// Lane-following traffic. Cars pick a street, drive it, and turn at
// intersections; they brake for whatever is ahead of them in their lane.
export class Traffic {
  constructor(scene, rng, world) {
    this.scene = scene;
    this.rng = rng;
    this.world = world;
    this.cars = [];
    this.lines = streetLines();
    for (let i = 0; i < 20; i++) this.spawnCar();
    this.spawnParked(world);
  }

  randomLane() {
    const rng = this.rng;
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const dir = rng.chance(0.5) ? 1 : -1;
    const line = this.lines[rng.int(0, this.lines.length - 1)];
    const along = rng.range(-260, 300);
    return { axis, dir, line, along };
  }

  placeOnLane(car, lane) {
    car.axis = lane.axis;
    car.dir = lane.dir;
    car.line = lane.line;
    car.along = lane.along;
    car.cruise = this.rng.range(9, 15);
    car.turnBlend = 0;
    this.syncMesh(car, true);
  }

  syncMesh(car, snap = false) {
    const off = laneOffset(car.axis, car.dir);
    let x; let z;
    if (car.axis === 'x') { x = car.along; z = car.line + off; }
    else { x = car.line + off; z = car.along; }
    if (snap || car.blendT === undefined || car.blendT >= 1) {
      car.pos.x = x;
      car.pos.z = z;
    } else {
      // Just turned: glide from the pre-turn spot into the new lane.
      const k = car.blendT * car.blendT * (3 - 2 * car.blendT);
      car.pos.x = car.fromX + (x - car.fromX) * k;
      car.pos.z = car.fromZ + (z - car.fromZ) * k;
    }
    const targetHeading = headingFor(car.axis, car.dir);
    if (snap) {
      car.heading = targetHeading;
    } else {
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += diff * Math.min(1, car.turnBlend * 6);
    }
    car.mesh.rotation.y = car.heading;
    car.mesh.position.y = 0;
  }

  spawnCar() {
    const car = new Car(this.scene, CAR_COLORS[this.rng.int(0, CAR_COLORS.length - 1)],
      { sport: this.rng.chance(0.25) });
    this.placeOnLane(car, this.randomLane());
    car.speed = car.cruise;
    this.cars.push(car);
    return car;
  }

  spawnParked(world) {
    this.parked = [];
    for (const spot of world.parkingSpots) {
      if (this.rng.chance(0.28)) continue; // leave some bays empty
      const car = new Car(this.scene, CAR_COLORS[this.rng.int(0, CAR_COLORS.length - 1)],
        { sport: this.rng.chance(0.3) });
      car.setPose(spot.x, spot.z, spot.heading);
      car.parked = true;
      this.parked.push(car);
      this.cars.push(car);
    }
  }

  // Is something (another car, the player) just ahead of this traffic car?
  blockedAhead(car, obstacles) {
    const f = FORWARD[car.axis](car.dir);
    for (const o of obstacles) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const ahead = dx * f.x + dz * f.z;
      if (ahead < 1 || ahead > 13) continue;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (side < 2.6) return ahead;
    }
    return 0;
  }

  update(dt, obstacles, t) {
    for (const car of this.cars) {
      if (car.taken || car.parked || car.dead) continue;
      const gap = this.blockedAhead(car, obstacles);
      let target = car.cruise;
      if (gap) target = gap < 6 ? 0 : car.cruise * 0.4;
      car.speed += Math.max(-22 * dt, Math.min(9 * dt, target - car.speed));
      car.along += car.dir * car.speed * dt;
      car.turnBlend = Math.min(1, car.turnBlend + dt);
      if (car.blendT !== undefined && car.blendT < 1) car.blendT = Math.min(1, car.blendT + dt / 0.35);
      // Turn (or not) at the next intersection.
      const nextLine = this.nextIntersection(car);
      if (nextLine !== null && Math.abs(car.along - nextLine) < 0.9) {
        car.along = nextLine;
        if (this.rng.chance(0.38)) this.turn(car, nextLine);
      }
      // Recycle cars that leave the world toward the far side.
      if (car.along > 330 || car.along < -290) {
        const lane = this.randomLane();
        lane.along = car.dir > 0 ? -285 : 325;
        this.placeOnLane(car, lane);
      }
      this.syncMesh(car);
      car.updateVisual(dt, t);
    }
  }

  nextIntersection(car) {
    let best = null;
    for (const line of this.lines) {
      const d = (line - car.along) * car.dir;
      if (d > -0.5 && (best === null || d < best.d)) best = { line, d };
    }
    return best ? best.line : null;
  }

  turn(car, crossLine) {
    const oldAxis = car.axis;
    const f = FORWARD[oldAxis](car.dir);
    // Right-hand vector of the current heading (heading rotated by -90°).
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const nf = this.rng.chance(0.5) ? right : right.clone().negate();
    car.fromX = car.pos.x;
    car.fromZ = car.pos.z;
    car.blendT = 0;
    car.axis = oldAxis === 'x' ? 'z' : 'x';
    car.dir = car.axis === 'x' ? Math.sign(nf.x) : Math.sign(nf.z);
    car.line = crossLine;
    // Continue along the new street from where the car actually is.
    car.along = oldAxis === 'x' ? car.pos.z : car.pos.x;
    car.turnBlend = 0;
  }
}
