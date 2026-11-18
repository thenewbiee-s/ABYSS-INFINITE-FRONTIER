import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addItemToSlots,
  canCraftRecipe,
  canWarpToSystem,
  computeBasePowerGrid,
  consumeBasePartCost,
  countItem,
  createInitialSaveGame,
  executeCraftRecipe,
  loadSaveSlot,
  removeItemFromSlots,
  sortInventorySlots,
  stepSurvival,
  useConsumableItem,
  validateSaveGame,
  writeSaveSlot,
} from './rules';
import { generatePlanetProfile, generateStarSystem, samplePlanetSurfaceRadius } from './universe';
import { ARCHETYPE_LIST, ITEM_LIST, ITEMS, RECIPES } from './catalog';
import { PlacedStructure } from './types';
import { createPlanetRuntime, samplePlanetMeshSurface } from './planetWorld';
import { ProceduralTextureSet } from './textures';

function makeMockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

function makeDummyTextures(): ProceduralTextureSet {
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) as unknown as THREE.CanvasTexture;
  tex.needsUpdate = true;
  return {
    terrainBump: tex,
    hullBump: tex,
    hullRoughness: tex,
    hexGrid: tex,
    glowSprite: tex,
  };
}

test('universe has 36 distinct planetary archetypes and deterministic generation', () => {
  assert.equal(ARCHETYPE_LIST.length, 36);
  const sysA = generateStarSystem(424242, { x: 0, y: 0, z: 0, index: 0 }, true);
  const sysB = generateStarSystem(424242, { x: 0, y: 0, z: 0, index: 0 }, true);
  assert.equal(sysA.id, sysB.id);
  assert.equal(sysA.name, sysB.name);
  assert.equal(sysA.planets.length, 5);
  assert.equal(sysA.planets[0].archetype, 'paradise');

  const p = sysA.planets[0];
  const r1 = samplePlanetSurfaceRadius(p, 0, 1, 0);
  const r2 = samplePlanetSurfaceRadius(p, 0, 1, 0);
  assert.equal(r1, r2);
  assert.ok(r1 > p.radius - 30 && r1 < p.radius + 40);
});

test('expanded catalog has 40+ items, 18+ valid recipes, and biome-authentic planet resources & biota', () => {
  assert.ok(ITEM_LIST.length >= 40, `Expected >=40 items, got ${ITEM_LIST.length}`);
  assert.ok(RECIPES.length >= 18, `Expected >=18 recipes, got ${RECIPES.length}`);

  for (const r of RECIPES) {
    assert.ok(ITEMS[r.outputId], `Missing output item ${r.outputId} for ${r.id}`);
    for (const ing of r.ingredients) {
      assert.ok(ITEMS[ing.itemId], `Missing ingredient ${ing.itemId} for ${r.id}`);
    }
  }

  // Verify biome resource and creature specialization across distinct planet archetypes
  const ocean = generatePlanetProfile(101, 'sys_t', 'Test', 1, 'ocean');
  assert.ok(ocean.resources.includes('kelp_sac'));
  assert.ok(ocean.creatureSpecies.some((c) => c.bodyType === 'aquatic'));

  const frozen = generatePlanetProfile(202, 'sys_t', 'Test', 2, 'frozen');
  assert.ok(frozen.resources.includes('frost_crystal'));

  const volcanic = generatePlanetProfile(303, 'sys_t', 'Test', 3, 'volcanic');
  assert.ok(volcanic.resources.includes('solanium') && volcanic.resources.includes('basalt_shard'));

  const machine = generatePlanetProfile(404, 'sys_t', 'Test', 4, 'machine_world');
  assert.ok(machine.resources.includes('machine_core'));
});

test('exact triangle mesh collider matches rendered planet surface triangles with zero clipping', () => {
  const sys = generateStarSystem(424242, { x: 0, y: 0, z: 0, index: 0 }, true);
  const planet = sys.planets[2]; // volcanic with bumpy ridges
  const rt = createPlanetRuntime(planet, 10, makeDummyTextures());
  rt.group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const outerDist = planet.radius + 150;

  for (let i = 0; i < 60; i++) {
    const theta = (i / 60) * Math.PI * 2;
    const phi = ((i * 7) % 19) / 20 * Math.PI + 0.05;
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ).normalize();

    const meshR = samplePlanetMeshSurface(rt, dir.x, dir.y, dir.z);
    const origin = rt.group.position.clone().addScaledVector(dir, outerDist);
    raycaster.set(origin, dir.clone().negate());
    const hits = raycaster.intersectObject(rt.terrainMesh, false);
    assert.ok(hits.length >= 1, `Expected raycast hit for sample ${i}`);
    const exactDist = outerDist - hits[0].distance;
    assert.ok(
      Math.abs(meshR - exactDist) < 0.02,
      `Collider radius ${meshR} differed from rendered triangle ${exactDist} by ${Math.abs(meshR - exactDist)}`
    );
  }
});

test('inventory stacking, removal, sorting, and new crafting recipes execute cleanly', () => {
  let slots = new Array(12).fill(null);
  slots = addItemToSlots(slots, 'ferrite_dust', 10).nextSlots;
  slots = addItemToSlots(slots, 'carbon', 10).nextSlots;
  slots = addItemToSlots(slots, 'copper_ore', 8).nextSlots;
  slots = addItemToSlots(slots, 'silicate_powder', 4).nextSlots;
  assert.equal(countItem(slots, 'ferrite_dust'), 10);

  assert.equal(canCraftRecipe(slots, 'craft_launch_fuel'), true);
  const crafted = executeCraftRecipe(slots, 'craft_launch_fuel');
  assert.equal(crafted.crafted, true);
  assert.equal(countItem(crafted.nextSlots, 'launch_fuel'), 1);
  assert.equal(countItem(crafted.nextSlots, 'ferrite_dust'), 5);

  assert.equal(canCraftRecipe(crafted.nextSlots, 'craft_chromatic_metal'), true);
  const craftedChroma = executeCraftRecipe(crafted.nextSlots, 'craft_chromatic_metal');
  assert.equal(craftedChroma.crafted, true);
  assert.equal(countItem(craftedChroma.nextSlots, 'chromatic_metal'), 2);

  const rem = removeItemFromSlots(craftedChroma.nextSlots, 'ferrite_dust', 99);
  assert.equal(rem.success, false);

  const sorted = sortInventorySlots(craftedChroma.nextSlots);
  assert.ok(sorted[0] !== null);
});

test('base building power grid and resource consumption', () => {
  let slots = new Array(8).fill(null);
  slots = addItemToSlots(slots, 'ferrite_dust', 20).nextSlots;
  slots = addItemToSlots(slots, 'cobalt', 5).nextSlots;

  const built = consumeBasePartCost(slots, 'solar_panel');
  assert.equal(built.success, true);
  assert.equal(countItem(built.nextSlots, 'cobalt'), 3);

  const structures: PlacedStructure[] = [
    {
      uid: '1',
      partId: 'solar_panel',
      planetId: 'p1',
      position: [0, 0, 0],
      normal: [0, 1, 0],
      yaw: 0,
      integrity: 100,
    },
    {
      uid: '2',
      partId: 'research_beacon',
      planetId: 'p1',
      position: [3, 0, 0],
      normal: [0, 1, 0],
      yaw: 0,
      integrity: 100,
    },
  ];
  const grid = computeBasePowerGrid(structures, 'p1');
  assert.equal(grid.produced, 25);
  assert.equal(grid.consumed, 8);
  assert.equal(grid.net, 17);
});

test('survival drain, consumables including repair_kit/thermal_cell, and warp checks behave accurately', () => {
  const sys = generateStarSystem(1337, { x: 0, y: 0, z: 0, index: 0 }, true);
  const save = createInitialSaveGame('slot_1', 'Test', 1337, sys);
  assert.equal(save.playerInventory.length, 30);

  const toxicPlanet = { ...sys.planets[2], hazard: 'heat' as const };
  const drained = stepSurvival(save.survival, toxicPlanet, 5, false, true, false, false);
  assert.ok(drained.oxygen < save.survival.oxygen);
  assert.ok(drained.hazardShield < save.survival.hazardShield);
  assert.ok(drained.jetpack < save.survival.jetpack);

  const healed = useConsumableItem(save.playerInventory, 'life_gel', drained, save.ship);
  assert.equal(healed.used, true);
  assert.ok(healed.nextSurvival.oxygen > drained.oxygen);

  const withKit = addItemToSlots(save.playerInventory, 'repair_kit', 1).nextSlots;
  const damagedShip = { ...save.ship, hull: 50, shield: 10 };
  const repaired = useConsumableItem(withKit, 'repair_kit', drained, damagedShip);
  assert.equal(repaired.used, true);
  assert.equal(repaired.nextShip.hull, 95);

  const warpOk = canWarpToSystem(save.ship, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 });
  assert.equal(warpOk.ok, true);

  const warpTooFar = canWarpToSystem(save.ship, { x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 50 });
  assert.equal(warpTooFar.ok, false);
});

test('save checksum, corruption detection, and backup recovery work', () => {
  const storage = makeMockStorage();
  const sys = generateStarSystem(9001, { x: 0, y: 0, z: 0, index: 0 }, true);
  const save1 = createInitialSaveGame('slot_1', 'Alpha', 9001, sys);

  assert.equal(writeSaveSlot(save1, storage).ok, true);
  const save2 = { ...save1, credits: 5500 };
  assert.equal(writeSaveSlot(save2, storage).ok, true);

  // Corrupt primary save -> backup should recover save1!
  storage.setItem('abyss_frontier_slot_slot_1', '{"version":1,"checksum":"deadbeef"}');
  const recovered = loadSaveSlot('slot_1', storage);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recoveredFromBackup, true);
  assert.equal(recovered.data?.credits, 1200);

  const badCheck = validateSaveGame({ ...save1, credits: 999999 });
  assert.equal(badCheck.valid, false);
});
