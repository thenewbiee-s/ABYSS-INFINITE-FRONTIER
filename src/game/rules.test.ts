import test from 'node:test';
import assert from 'node:assert/strict';
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
import { generateStarSystem, samplePlanetSurfaceRadius } from './universe';
import { ARCHETYPE_LIST } from './catalog';
import { PlacedStructure } from './types';

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

test('inventory stacking, removal, sorting, and crafting execute cleanly', () => {
  let slots = new Array(8).fill(null);
  slots = addItemToSlots(slots, 'ferrite_dust', 10).nextSlots;
  slots = addItemToSlots(slots, 'carbon', 10).nextSlots;
  assert.equal(countItem(slots, 'ferrite_dust'), 10);

  assert.equal(canCraftRecipe(slots, 'craft_launch_fuel'), true);
  const crafted = executeCraftRecipe(slots, 'craft_launch_fuel');
  assert.equal(crafted.crafted, true);
  assert.equal(countItem(crafted.nextSlots, 'launch_fuel'), 1);
  assert.equal(countItem(crafted.nextSlots, 'ferrite_dust'), 5);

  const rem = removeItemFromSlots(crafted.nextSlots, 'ferrite_dust', 99);
  assert.equal(rem.success, false);

  const sorted = sortInventorySlots(crafted.nextSlots);
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

test('survival drain, consumables, and warp checks behave accurately', () => {
  const sys = generateStarSystem(1337, { x: 0, y: 0, z: 0, index: 0 }, true);
  const save = createInitialSaveGame('slot_1', 'Test', 1337, sys);

  const toxicPlanet = { ...sys.planets[2], hazard: 'heat' as const };
  const drained = stepSurvival(save.survival, toxicPlanet, 5, false, true, false, false);
  assert.ok(drained.oxygen < save.survival.oxygen);
  assert.ok(drained.hazardShield < save.survival.hazardShield);
  assert.ok(drained.jetpack < save.survival.jetpack);

  const healed = useConsumableItem(save.playerInventory, 'life_gel', drained, save.ship);
  assert.equal(healed.used, true);
  assert.ok(healed.nextSurvival.oxygen > drained.oxygen);

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
