// Story and work: Marisol Vega, a fixer who runs jobs out of the marina
// café, gives the player a four-mission chain; afterwards she always has a
// repeatable taxi or parcel run going. A small step engine drives every job:
// go somewhere, take something, deliver it, lose the heat.

import * as THREE from 'three';
import { Ped } from './peds.js';
import { Car } from './vehicles.js';
import { MARISOL_POS, LIGHTHOUSE_POS, MARINA_X, WATER_Z, HALF, GRID, PITCH } from './config.js';

const PARK_FOUNTAIN = { x: -60, z: 120 };       // plaza park block centre
const CLUB_FARO = { x: -30, z: -88 };           // a downtown corner
const GARAGE = { x: MARINA_X - 40, z: WATER_Z - 22 }; // Marina Motors, promenade
const PIER_END = { x: HALF + 30, z: WATER_Z + 44 };   // end of the first finger pier
const DOCKS_CRATES = { x: MARINA_X - 30, z: WATER_Z - 14 };

const CHAIN = [
  {
    title: 'First Run',
    brief: 'Marisol: "Easy money, cariño. Pick up the package by the docks and drop it at the plaza fountain."',
    reward: 250,
    steps: [
      { type: 'goto', pos: DOCKS_CRATES, r: 4, label: 'Pick up the package at the docks' },
      { type: 'goto', pos: PARK_FOUNTAIN, r: 7, label: 'Drop the package at the plaza fountain' },
    ],
  },
  {
    title: 'Salt & Smoke',
    brief: 'Marisol: "A crate came in on the tide. Collect it from the pier — and the patrols are jumpy today."',
    reward: 450,
    steps: [
      { type: 'goto', pos: PIER_END, r: 4, label: 'Collect the crate at the end of the pier', heat: 2 },
      { type: 'goto', pos: CLUB_FARO, r: 7, label: 'Deliver the crate to Club Faro downtown' },
    ],
  },
  {
    title: 'Borrowed Wheels',
    brief: 'Marisol: "See the gold coupé in the north lot? Its owner owes me. Bring it to Marina Motors."',
    reward: 700,
    steps: [
      { type: 'steal', pos: { x: 120, z: -120 }, r: 5, label: 'Steal the gold coupé from the parking lot', heat: 2 },
      { type: 'drive', pos: GARAGE, r: 8, label: 'Deliver the coupé to Marina Motors' },
    ],
  },
  {
    title: 'Heat Wave',
    brief: 'Marisol: "Last one, and it is hot. Grab the case at the lighthouse, lose the police, then come see me."',
    reward: 1200,
    steps: [
      { type: 'goto', pos: LIGHTHOUSE_POS, r: 6, label: 'Take the case at the lighthouse', heat: 4 },
      { type: 'escape', label: 'Lose the police' },
      { type: 'goto', pos: MARISOL_POS, r: 5, label: 'Return to Marisol at the marina café' },
    ],
  },
];

export class Missions {
  constructor(G) {
    this.G = G;
    this.index = G.state.missionIndex || 0; // chain progress (persisted)
    this.active = null;      // { def, stepIndex, specialCar, passenger }
    this.jobCount = 0;
    // Marisol herself, waiting on the promenade.
    this.marisol = new Ped(G.scene, G.rng, { fixer: true });
    this.marisol.pos.set(MARISOL_POS.x, G.world.groundY(MARISOL_POS.x, MARISOL_POS.z), MARISOL_POS.z);
    this.marisol.heading = -Math.PI / 2;
    // The package: a small glowing crate shown at pickup steps.
    this.packageMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color: 0xf2b134, emissive: 0x664400 }),
    );
    this.packageMesh.visible = false;
    this.packageMesh.castShadow = true;
    G.scene.add(this.packageMesh);
    // Target marker: a pillar of light plus a pulsing ground ring.
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23e, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 17;
    this.marker.add(beam);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.25;
    this.marker.add(this.ring);
    this.marker.visible = false;
    G.scene.add(this.marker);
    // Marisol's availability ring.
    this.marisolRing = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.9, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5da2, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.marisolRing.rotation.x = -Math.PI / 2;
    this.marisolRing.position.set(MARISOL_POS.x, G.world.groundY(MARISOL_POS.x, MARISOL_POS.z) + 0.22, MARISOL_POS.z);
    G.scene.add(this.marisolRing);
  }

  get chainDone() {
    return this.index >= CHAIN.length;
  }

  objectiveText() {
    if (this.active) {
      const step = this.active.def.steps[this.active.stepIndex];
      return step ? step.label : '';
    }
    if (!this.chainDone) return `Talk to Marisol at the marina café (E) — job ${this.index + 1}: ${CHAIN[this.index].title}`;
    return 'Talk to Marisol at the marina café (E) for more work';
  }

  targetPos() {
    if (this.active) {
      const step = this.active.def.steps[this.active.stepIndex];
      if (step && step.pos) return step.pos;
      return null; // escape steps have no fixed target
    }
    return MARISOL_POS;
  }

  startNext() {
    const G = this.G;
    if (!this.chainDone) {
      const def = CHAIN[this.index];
      this.begin(def, false);
    } else {
      this.begin(this.makeSideJob(), true);
    }
  }

  makeSideJob() {
    const G = this.G;
    this.jobCount++;
    if (this.jobCount % 2 === 1) {
      // Parcel dash between two random street corners.
      const a = this.randomCorner();
      const b = this.randomCorner();
      return {
        title: 'Parcel Dash',
        brief: 'Marisol: "Quick parcel run. No questions, no scratches."',
        reward: 130,
        side: true,
        steps: [
          { type: 'goto', pos: a, r: 4, label: 'Pick up the parcel' },
          { type: 'goto', pos: b, r: 6, label: 'Deliver the parcel' },
        ],
      };
    }
    const a = this.randomCorner();
    const b = this.randomCorner();
    return {
      title: 'Taxi Run',
      brief: 'Marisol: "A friend needs a ride. Pick them up, drop them off, drive nice."',
      reward: 110,
      side: true,
      taxi: true,
      steps: [
        { type: 'taxiPickup', pos: a, r: 6, label: 'Pick up the passenger (stop beside them)' },
        { type: 'drive', pos: b, r: 7, label: 'Drop the passenger at the destination' },
      ],
    };
  }

  randomCorner() {
    const lines = [-180, -120, -60, 0, 60, 120, 180];
    const G = this.G;
    return {
      x: lines[G.rng.int(0, lines.length - 1)] + G.rng.pick([-11, 11]),
      z: lines[G.rng.int(0, lines.length - 1)] + G.rng.pick([-11, 11]),
    };
  }

  begin(def, isSide) {
    const G = this.G;
    this.active = { def, stepIndex: 0, isSide, specialCar: null, passenger: null };
    G.hud.toast(def.brief, 6);
    G.hud.showTitle(def.title);
    this.setupStep();
  }

  setupStep() {
    const G = this.G;
    const step = this.active.def.steps[this.active.stepIndex];
    if (!step) return;
    if (step.heat) G.police.setWanted(Math.max(G.police.wanted, step.heat));
    if (step.type === 'goto' && this.active.stepIndex === 0 && this.active.def.steps.length > 1) {
      // A pickup-style first step shows the package.
      this.packageMesh.visible = true;
      this.packageMesh.position.set(step.pos.x, G.world.groundY(step.pos.x, step.pos.z) + 0.7, step.pos.z);
    }
    if (step.type === 'steal' && !this.active.specialCar) {
      const car = new Car(G.scene, 0xd4af37, { sport: true });
      car.setPose(step.pos.x, step.pos.z, Math.PI);
      car.parked = true;
      car.missionCar = true;
      G.traffic.cars.push(car);
      this.active.specialCar = car;
    }
    if (step.type === 'taxiPickup' && !this.active.passenger) {
      const ped = new Ped(G.scene, G.rng, {});
      ped.pos.set(step.pos.x, G.world.groundY(step.pos.x, step.pos.z), step.pos.z);
      ped.heading = Math.PI;
      this.active.passenger = ped;
    }
  }

  completeStep() {
    const G = this.G;
    this.packageMesh.visible = false;
    this.active.stepIndex++;
    G.audio.pickup();
    if (this.active.stepIndex >= this.active.def.steps.length) {
      const def = this.active.def;
      G.addMoney(def.reward);
      G.audio.missionDone();
      G.hud.showTitle(def.side ? 'Job complete' : 'Mission complete');
      G.hud.toast(`+ $${def.reward} — ${def.title} done`, 4);
      if (!def.side) {
        this.index++;
        G.state.missionIndex = this.index;
        G.saveGame();
      }
      if (this.active.passenger) {
        G.scene.remove(this.active.passenger.mesh);
        this.active.passenger = null;
      }
      this.active = null;
      this.marker.visible = false;
    } else {
      this.setupStep();
    }
  }

  failActive(reason) {
    const G = this.G;
    G.hud.toast(reason, 4);
    if (this.active && this.active.passenger) G.scene.remove(this.active.passenger.mesh);
    this.active = null;
    this.marker.visible = false;
    this.packageMesh.visible = false;
  }

  update(dt, t) {
    const G = this.G;
    const player = G.player;
    // Marisol idles with a little sway; her ring pulses while she has work.
    this.marisol.animate(dt, t);
    this.marisolRing.visible = !this.active;
    const pulse = 1 + Math.sin(t * 3) * 0.12;
    this.marisolRing.scale.set(pulse, pulse, 1);
    // Talk to Marisol.
    if (!this.active && player.mode === 'foot' &&
        Math.hypot(player.pos.x - MARISOL_POS.x, player.pos.z - MARISOL_POS.z) < 3.4) {
      G.hud.setPrompt('Press E — talk to Marisol');
      if (G.input.tapped('KeyE')) this.startNext();
    }
    if (!this.active) return;
    const step = this.active.def.steps[this.active.stepIndex];
    if (!step) return;
    // Marker and package visuals.
    const target = step.pos;
    if (target) {
      this.marker.visible = true;
      this.marker.position.set(target.x, G.world.groundY(target.x, target.z), target.z);
      this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.15);
    } else {
      this.marker.visible = false;
    }
    if (this.packageMesh.visible) {
      this.packageMesh.rotation.y = t * 1.6;
      this.packageMesh.position.y = G.world.groundY(this.packageMesh.position.x, this.packageMesh.position.z) + 0.7 + Math.sin(t * 2.4) * 0.15;
    }
    if (this.active.passenger && this.active.stepIndex === 0) {
      this.active.passenger.animate(dt, t);
    }
    // Step completion checks.
    const pPos = player.mode === 'car' ? player.car.pos : player.pos;
    const dist = target ? Math.hypot(pPos.x - target.x, pPos.z - target.z) : Infinity;
    switch (step.type) {
      case 'goto':
        if (dist < step.r) this.completeStep();
        break;
      case 'drive':
        if (player.mode === 'car' && dist < step.r) {
          if (this.active.def.taxi && this.active.passenger) {
            // Passenger hops out and joins the sidewalk crowd.
            const ped = this.active.passenger;
            ped.mesh.visible = true;
            ped.pos.set(pPos.x + 3, G.world.groundY(pPos.x + 3, pPos.z), pPos.z);
            ped.corner = {
              vi: Math.max(0, Math.min(GRID, Math.round((ped.pos.x + HALF) / PITCH))),
              hi: Math.max(0, Math.min(GRID, Math.round((ped.pos.z + HALF) / PITCH))),
              sx: 1, sz: 1,
            };
            G.peds.peds.push(ped);
            G.peds.chooseTarget(ped);
            this.active.passenger = null;
          }
          this.completeStep();
        }
        break;
      case 'steal':
        if (player.mode === 'car' && player.car === this.active.specialCar) this.completeStep();
        else if (dist < step.r && player.mode === 'foot') G.hud.setPrompt('Press F — steal the gold coupé');
        break;
      case 'taxiPickup':
        if (player.mode === 'car' && Math.abs(player.car.speed) < 1.5 && dist < step.r) {
          // Passenger gets in and rides along (mesh hidden until drop-off).
          this.active.passenger.mesh.visible = false;
          G.hud.toast('Passenger in — drive them over', 3);
          this.completeStep();
        } else if (dist < step.r + 4) {
          G.hud.setPrompt('Stop your car beside the passenger');
        }
        break;
      case 'escape':
        if (G.police.wanted === 0) this.completeStep();
        break;
      default:
        break;
    }
    // The special car getting wrecked fails Borrowed Wheels.
    if (this.active.specialCar && this.active.specialCar.dead && this.active.def.title === 'Borrowed Wheels') {
      this.failActive('The coupé is wrecked — Marisol is not pleased');
    }
  }
}
