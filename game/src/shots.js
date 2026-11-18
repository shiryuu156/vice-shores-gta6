// Vice Shores — the screenshot scenes behind ?shot=start|street|chase|mission.
// Each one stages the real game in a fixed, seeded state and then lets the
// live loop run, so the frame is what a player actually sees and the same
// seed always gives the same frame. The screenshot script waits for
// window.__shotReady, which main.js sets after two rendered frames.

export function stageShot(name, G) {
  const { missions, police, vehicles, traffic, player } = G;
  // a clean slate for every shot
  police.reset();
  missions.abort();
  G.combat.clearGuards();
  G.cash = 2450;
  G.state = 'play';

  if (name === 'start') {
    G.state = 'title';
    G.cameraMode = 'orbit';
    return;
  }

  if (name === 'street') {
    // on foot at a busy downtown intersection, HUD and minimap visible
    player.reset(6, 6, Math.PI * 0.85);
    G.cameraYaw = Math.PI * 0.85;
    G.cameraPitch = 0.32;
    traffic.spawnPedestrianNear(6, 6, 15);
    traffic.spawnPedestrianNear(6, 6, 20);
    traffic.spawnPedestrianNear(6, 6, 25);
    return;
  }

  if (name === 'chase') {
    // driving a Vulture GT down the avenue at wanted level 3, police behind
    const car = vehicles.spawnCar(G.carModels[1], 0, 40, 0, false, null);
    G.enterCar(car);
    car.speed = 24;
    G.cameraYaw = 0;
    police.addCrime(3, 'staged chase');
    police.update(0.01, player.state.pos, car, car.speed, false);
    return;
  }

  if (name === 'mission') {
    // mission 1, The Debt Run, in progress: package picked up, racing to the
    // Harbor Warehouse with the waypoint beacon ahead. The car starts on the
    // x=54 road, on asphalt, heading for the warehouse corner.
    const car = vehicles.spawnCar(G.carModels[1], 54, 58, 0.25, false, null);
    G.enterCar(car);
    car.speed = 18;
    missions.startMission(0);
    // skip straight to the delivery leg so the beacon and timer show
    missions.setStage(1, 64);
    G.cameraYaw = Math.PI * 0.75;
    return;
  }

  // unknown shot name: plain free roam
  player.reset(0, 20, Math.PI);
}
