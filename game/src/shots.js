// Screenshot scenes. When the game is opened with ?shot=<name>, main.js
// starts immediately (no title screen) and calls applyShot to pose a real,
// playable moment of the game for the maker's screenshots: the same world,
// traffic and HUD as normal play, arranged so each required view is framed.

import { Car } from './vehicles.js';
import { MARISOL_POS } from './config.js';

function givePlayerCar(G, x, z, heading, speed, color = 0xd94f3d) {
  const car = new Car(G.scene, color, { sport: true });
  car.setPose(x, z, heading);
  car.wasStolen = true; // no crime for posing the scene
  G.traffic.cars.push(car);
  G.player.enterCar(car);
  G.hud.toastQueue.length = 0; // keep the frame clean of the "Press F" hint
  car.speed = speed;
  G.player.camYaw = heading;
  G.player.camPitch = 0.3;
  return car;
}

function teleportPeds(G, spots) {
  const peds = G.peds.peds;
  spots.forEach(([x, z], i) => {
    const ped = peds[i % peds.length];
    ped.pos.set(x, G.world.groundY(x, z), z);
    ped.target = { x: x + 14, z };
    ped.state = 'walk';
  });
}

export function applyShot(G, name) {
  const player = G.player;
  player.invulnerable = true; // a posed scene should not end in a hospital
  G.objectiveOverride = '';
  if (name === 'cover') {
    // Driving east through a downtown intersection, traffic all around,
    // two stars up and a job waiting at the marina.
    givePlayerCar(G, -52, 34, Math.PI / 2, 13, 0x3d7bd9);
    // Guarantee company on the road: two cars ahead, one coming the other way.
    const movers = G.traffic.cars.filter((c) => !c.parked);
    if (movers[0]) G.traffic.placeOnLane(movers[0], { axis: 'x', dir: 1, line: 30, along: -6 });
    if (movers[1]) G.traffic.placeOnLane(movers[1], { axis: 'x', dir: 1, line: 30, along: 26 });
    if (movers[2]) G.traffic.placeOnLane(movers[2], { axis: 'x', dir: -1, line: 30, along: 74 });
    G.police.setWanted(2);
    G.objectiveOverride = 'Meet Marisol at the marina café';
    G.scriptDrive = { throttle: 0.55, steer: 0 };
  } else if (name === 'coast') {
    // On foot near the promenade's water edge: boats in the bay, the piers,
    // and the lighthouse beyond.
    player.placeAt(283, 253, 0.85);
    player.camYaw = 0.85;
    player.camPitch = 0.16;
    teleportPeds(G, [[296, 258], [306, 246], [274, 292], [318, 262]]);
    G.objectiveOverride = 'Talk to Marisol — she has work for you';
  } else if (name === 'downtown') {
    // A busy downtown corner: signs, shoppers, traffic rolling past.
    player.placeAt(-19, -19, -2.35);
    player.camYaw = -2.35;
    player.camPitch = 0.26;
    teleportPeds(G, [[-24, -38], [-38, -22], [-14, -30], [-30, -12]]);
    G.objectiveOverride = 'Explore Verano Bay — work waits at the marina';
  } else if (name === 'chase') {
    // Full heat on the coast road: four stars, units all around the car.
    const car = givePlayerCar(G, -40, 214, Math.PI / 2, 23, 0xd94f3d);
    G.police.setWanted(4);
    // One unit ahead swinging round, one alongside, one on the tail — so
    // the chase reads in frame, not just on the minimap.
    const spots = [[-4, 220], [-38, 205], [-64, 216]];
    for (const [x, z] of spots) {
      const unit = G.police.spawnUnit(car.pos);
      unit.mode = 'chase';
      unit.pos.set(x, 0, z);
      unit.heading = Math.PI / 2;
      unit.mesh.rotation.y = Math.PI / 2;
      unit.speed = 21;
    }
    G.objectiveOverride = 'Lose the heat!';
    G.scriptDrive = { throttle: 0.85, steer: 0 };
  }
  // Marisol is part of the world in every scene.
  void MARISOL_POS;
}
