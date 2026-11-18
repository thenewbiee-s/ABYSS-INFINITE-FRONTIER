import { BASE_PARTS, ITEMS, RECIPES, SHIP_CLASSES } from './catalog';
import {
  BasePartId,
  InventorySlot,
  MissionDef,
  PlanetProfile,
  PlayerSurvivalState,
  PlacedStructure,
  SaveGameData,
  SaveSlotSummary,
  ShipState,
  StarSystem,
} from './types';

export const SAVE_VERSION = 1;
const SAVE_STORAGE_PREFIX = 'abyss_frontier_slot_';
const SAVE_BACKUP_PREFIX = 'abyss_frontier_backup_';

export function countItem(slots: (InventorySlot | null)[], itemId: string): number {
  let total = 0;
  for (const s of slots) {
    if (s && s.itemId === itemId) total += s.quantity;
  }
  return total;
}

export function addItemToSlots(
  slots: (InventorySlot | null)[],
  itemId: string,
  quantity: number
): { nextSlots: (InventorySlot | null)[]; remaining: number } {
  const def = ITEMS[itemId];
  const maxStack = def ? def.maxStack : 99;
  const next = slots.map((s) => (s ? { ...s } : null));
  let left = Math.max(0, Math.floor(quantity));

  for (let i = 0; i < next.length && left > 0; i++) {
    const slot = next[i];
    if (slot && slot.itemId === itemId && slot.quantity < maxStack) {
      const add = Math.min(left, maxStack - slot.quantity);
      slot.quantity += add;
      left -= add;
    }
  }

  for (let i = 0; i < next.length && left > 0; i++) {
    if (!next[i]) {
      const add = Math.min(left, maxStack);
      next[i] = { itemId, quantity: add };
      left -= add;
    }
  }

  return { nextSlots: next, remaining: left };
}

export function removeItemFromSlots(
  slots: (InventorySlot | null)[],
  itemId: string,
  quantity: number
): { nextSlots: (InventorySlot | null)[]; removed: number; success: boolean } {
  const available = countItem(slots, itemId);
  if (available < quantity) {
    return { nextSlots: slots, removed: 0, success: false };
  }
  const next = slots.map((s) => (s ? { ...s } : null));
  let left = quantity;
  for (let i = next.length - 1; i >= 0 && left > 0; i--) {
    const slot = next[i];
    if (slot && slot.itemId === itemId) {
      const take = Math.min(left, slot.quantity);
      slot.quantity -= take;
      left -= take;
      if (slot.quantity <= 0) next[i] = null;
    }
  }
  return { nextSlots: next, removed: quantity - left, success: true };
}

export function sortInventorySlots(slots: (InventorySlot | null)[]): (InventorySlot | null)[] {
  const merged = new Map<string, number>();
  for (const s of slots) {
    if (!s || s.quantity <= 0) continue;
    merged.set(s.itemId, (merged.get(s.itemId) || 0) + s.quantity);
  }
  const sortedIds = Array.from(merged.keys()).sort((a, b) => {
    const da = ITEMS[a];
    const db = ITEMS[b];
    if (!da || !db) return a.localeCompare(b);
    if (da.category !== db.category) return da.category.localeCompare(db.category);
    return da.name.localeCompare(db.name);
  });

  const out: (InventorySlot | null)[] = new Array(slots.length).fill(null);
  let idx = 0;
  for (const id of sortedIds) {
    const maxStack = ITEMS[id]?.maxStack ?? 99;
    let qty = merged.get(id) || 0;
    while (qty > 0 && idx < out.length) {
      const take = Math.min(qty, maxStack);
      out[idx++] = { itemId: id, quantity: take };
      qty -= take;
    }
  }
  return out;
}

export function canCraftRecipe(slots: (InventorySlot | null)[], recipeId: string): boolean {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return false;
  return recipe.ingredients.every((ing) => countItem(slots, ing.itemId) >= ing.quantity);
}

export function executeCraftRecipe(
  slots: (InventorySlot | null)[],
  recipeId: string
): { nextSlots: (InventorySlot | null)[]; crafted: boolean; reason?: string } {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { nextSlots: slots, crafted: false, reason: 'Unknown recipe' };
  if (!canCraftRecipe(slots, recipeId)) {
    return { nextSlots: slots, crafted: false, reason: 'Insufficient materials' };
  }

  let working = slots.map((s) => (s ? { ...s } : null));
  for (const ing of recipe.ingredients) {
    const res = removeItemFromSlots(working, ing.itemId, ing.quantity);
    if (!res.success) return { nextSlots: slots, crafted: false, reason: 'Missing ingredients' };
    working = res.nextSlots;
  }

  const added = addItemToSlots(working, recipe.outputId, recipe.outputQty);
  if (added.remaining > 0) {
    return { nextSlots: slots, crafted: false, reason: 'Inventory full' };
  }
  return { nextSlots: added.nextSlots, crafted: true };
}

export function canAffordBasePart(slots: (InventorySlot | null)[], partId: BasePartId): boolean {
  const part = BASE_PARTS[partId];
  if (!part) return false;
  return part.cost.every((c) => countItem(slots, c.itemId) >= c.quantity);
}

export function consumeBasePartCost(
  slots: (InventorySlot | null)[],
  partId: BasePartId
): { nextSlots: (InventorySlot | null)[]; success: boolean } {
  const part = BASE_PARTS[partId];
  if (!part || !canAffordBasePart(slots, partId)) return { nextSlots: slots, success: false };
  let working = slots.map((s) => (s ? { ...s } : null));
  for (const c of part.cost) {
    const res = removeItemFromSlots(working, c.itemId, c.quantity);
    if (!res.success) return { nextSlots: slots, success: false };
    working = res.nextSlots;
  }
  return { nextSlots: working, success: true };
}

export function computeBasePowerGrid(
  structures: PlacedStructure[],
  planetId: string | null
): { produced: number; consumed: number; net: number } {
  let produced = 0;
  let consumed = 0;
  for (const s of structures) {
    if (planetId && s.planetId !== planetId) continue;
    const def = BASE_PARTS[s.partId];
    if (!def) continue;
    if (def.powerDelta > 0) produced += def.powerDelta;
    else if (def.powerDelta < 0) consumed += Math.abs(def.powerDelta);
  }
  return { produced, consumed, net: produced - consumed };
}

export function stepSurvival(
  survival: PlayerSurvivalState,
  planet: PlanetProfile | null,
  dt: number,
  isInWater: boolean,
  isJetpacking: boolean,
  nearHydroponics: boolean,
  nearShip: boolean
): PlayerSurvivalState {
  const next = { ...survival };
  const oxygenDrainRate = isInWater ? 2.8 : planet && planet.hazard === 'void' ? 1.5 : 0.48;

  if (nearShip || nearHydroponics) {
    next.oxygen = Math.min(next.maxOxygen, next.oxygen + 18 * dt);
    next.hazardShield = Math.min(next.maxHazardShield, next.hazardShield + 16 * dt);
  } else {
    next.oxygen = Math.max(0, next.oxygen - oxygenDrainRate * dt);
  }

  const hasEnvHazard = planet && planet.hazard !== 'none' && planet.hazard !== 'void' && !nearShip;
  if (hasEnvHazard) {
    const severity =
      planet.weather === 'Ion Tempest' ||
      planet.weather === 'Acid Rain' ||
      planet.weather === 'Rad Storm' ||
      planet.weather === 'Blizzard'
        ? 2.1
        : 1.1;
    next.hazardShield = Math.max(0, next.hazardShield - severity * dt);
  } else if (!nearShip) {
    next.hazardShield = Math.min(next.maxHazardShield, next.hazardShield + 3.5 * dt);
  }

  if (next.oxygen <= 0 || (hasEnvHazard && next.hazardShield <= 0)) {
    next.health = Math.max(0, next.health - 6.5 * dt);
  }

  if (isJetpacking) {
    const burn = 26 / (1 + (next.jetpackLevel - 1) * 0.25);
    next.jetpack = Math.max(0, next.jetpack - burn * dt);
  } else {
    next.jetpack = Math.min(next.maxJetpack, next.jetpack + 28 * dt);
  }

  return next;
}

export function useConsumableItem(
  slots: (InventorySlot | null)[],
  itemId: string,
  survival: PlayerSurvivalState,
  ship: ShipState
): {
  nextSlots: (InventorySlot | null)[];
  nextSurvival: PlayerSurvivalState;
  nextShip: ShipState;
  used: boolean;
  message: string;
} {
  const def = ITEMS[itemId];
  if (!def || !def.usableEffect || countItem(slots, itemId) < 1) {
    return {
      nextSlots: slots,
      nextSurvival: survival,
      nextShip: ship,
      used: false,
      message: 'Item cannot be used right now.',
    };
  }
  const rem = removeItemFromSlots(slots, itemId, 1);
  if (!rem.success) {
    return { nextSlots: slots, nextSurvival: survival, nextShip: ship, used: false, message: 'Missing item.' };
  }
  const nextSurvival = { ...survival };
  const nextShip = { ...ship };
  const eff = def.usableEffect;
  let message = `${def.name} activated`;

  if (eff.type === 'heal') {
    nextSurvival.health = Math.min(nextSurvival.maxHealth, nextSurvival.health + eff.amount);
    message = `Restored +${eff.amount} Health`;
  } else if (eff.type === 'oxygen') {
    nextSurvival.oxygen = Math.min(nextSurvival.maxOxygen, nextSurvival.oxygen + eff.amount);
    if (itemId === 'life_gel') {
      nextSurvival.health = Math.min(nextSurvival.maxHealth, nextSurvival.health + 40);
    }
    message = `Replenished +${eff.amount}% Oxygen`;
  } else if (eff.type === 'hazard') {
    nextSurvival.hazardShield = Math.min(nextSurvival.maxHazardShield, nextSurvival.hazardShield + eff.amount);
    nextShip.shield = Math.min(nextShip.maxShield, nextShip.shield + eff.amount);
    message = `Recharged +${eff.amount}% Protection & Shields`;
  } else if (eff.type === 'launch_fuel') {
    nextShip.launchFuel = Math.min(100, nextShip.launchFuel + eff.amount);
    message = `Refueled +${eff.amount}% Launch Thrusters`;
  } else if (eff.type === 'warp_fuel') {
    nextShip.warpFuel = Math.min(100, nextShip.warpFuel + eff.amount);
    message = `Charged +${eff.amount}% Hyperdrive Core`;
  }

  return { nextSlots: rem.nextSlots, nextSurvival, nextShip, used: true, message };
}

export function calculateSystemDistance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 38);
}

export function canWarpToSystem(
  ship: ShipState,
  fromCoords: { x: number; y: number; z: number },
  toCoords: { x: number; y: number; z: number }
): { ok: boolean; distLy: number; fuelCost: number; reason?: string } {
  const distLy = calculateSystemDistance(fromCoords, toCoords);
  if (distLy === 0) return { ok: false, distLy: 0, fuelCost: 0, reason: 'Already in this star system' };
  const shipDef = SHIP_CLASSES[ship.classId];
  const maxRange = shipDef.warpRange + (ship.upgrades.hyperdriveLevel - 1) * 90;
  if (distLy > maxRange) {
    return {
      ok: false,
      distLy,
      fuelCost: 0,
      reason: `Out of range (${distLy} LY > ${maxRange} LY max)`,
    };
  }
  const fuelCost = Math.max(15, Math.round((distLy / maxRange) * 40));
  if (ship.warpFuel < fuelCost) {
    return {
      ok: false,
      distLy,
      fuelCost,
      reason: `Insufficient Warp Fuel (${Math.round(ship.warpFuel)}% < ${fuelCost}%)`,
    };
  }
  return { ok: true, distLy, fuelCost };
}

export function generateStarterMissions(system: StarSystem): MissionDef[] {
  const firstPlanet = system.planets[0];
  return [
    {
      id: `m_scan_${system.id}`,
      title: `Biosphere Survey: ${firstPlanet?.name ?? 'Frontier World'}`,
      faction: 'aetheris',
      type: 'scan',
      targetId: 'any',
      targetLabel: 'Scan alien flora, fauna, or minerals',
      requiredCount: 3,
      progress: 0,
      rewardCredits: 950,
      rewardItem: { itemId: 'quantum_crystal', quantity: 2 },
      completed: false,
      claimed: false,
    },
    {
      id: `m_mine_${system.id}`,
      title: 'Resource Extraction Contract',
      faction: 'kethrax',
      type: 'mine',
      targetId: 'any',
      targetLabel: 'Mine mineral veins or crystals',
      requiredCount: 4,
      progress: 0,
      rewardCredits: 750,
      rewardItem: { itemId: 'nano_alloy', quantity: 2 },
      completed: false,
      claimed: false,
    },
    {
      id: `m_explore_${system.id}`,
      title: 'Seamless Orbital Pioneer',
      faction: 'vaelori',
      type: 'explore',
      targetId: 'planet_land',
      targetLabel: 'Fly from surface to space and land on another planet',
      requiredCount: 2,
      progress: 0,
      rewardCredits: 1400,
      rewardItem: { itemId: 'warp_cell', quantity: 1 },
      completed: false,
      claimed: false,
    },
    {
      id: `m_build_${system.id}`,
      title: 'Frontier Outpost Anchor',
      faction: 'vaelori',
      type: 'build',
      targetId: 'any',
      targetLabel: 'Construct base modules on any planetary surface',
      requiredCount: 2,
      progress: 0,
      rewardCredits: 850,
      rewardItem: { itemId: 'ion_battery', quantity: 2 },
      completed: false,
      claimed: false,
    },
  ];
}

export function computeSaveChecksum(data: Omit<SaveGameData, 'checksum'>): string {
  const raw = JSON.stringify({
    v: data.version,
    seed: data.universeSeed,
    credits: data.credits,
    coords: data.currentSystemCoords,
    planet: data.currentPlanetId,
    disc: data.discoveries.length,
    struct: data.structures.length,
  });
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createInitialSaveGame(
  slotId: string,
  label: string,
  universeSeed: number,
  homeSystem: StarSystem
): SaveGameData {
  const starterPlanet = homeSystem.planets[0];
  const shipDef = SHIP_CLASSES.explorer;

  let playerInventory: (InventorySlot | null)[] = new Array(24).fill(null);
  playerInventory = addItemToSlots(playerInventory, 'ferrite_dust', 28).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'carbon', 18).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'oxygen', 15).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'sodium', 12).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'cobalt', 6).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'life_gel', 2).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'ion_battery', 2).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'launch_fuel', 2).nextSlots;
  playerInventory = addItemToSlots(playerInventory, 'warp_cell', 1).nextSlots;

  const shipInventory: (InventorySlot | null)[] = new Array(24).fill(null);
  const baseStorage: (InventorySlot | null)[] = new Array(24).fill(null);

  const partial: Omit<SaveGameData, 'checksum'> = {
    version: SAVE_VERSION,
    slotId,
    label,
    updatedAt: Date.now(),
    playTimeSec: 0,
    universeSeed,
    currentSystemCoords: { ...homeSystem.coords, index: 0 },
    currentPlanetId: starterPlanet.id,
    playMode: 'on_foot',
    playerLocalPos: [0, starterPlanet.radius + 10, starterPlanet.radius * 0.25],
    shipLocalPos: [8, starterPlanet.radius + 10, starterPlanet.radius * 0.25 + 6],
    credits: 1200,
    reputation: { vaelori: 5, kethrax: 0, aetheris: 5 },
    survival: {
      health: 100,
      maxHealth: 100,
      oxygen: 100,
      maxOxygen: 100,
      hazardShield: 100,
      maxHazardShield: 100,
      jetpack: 100,
      maxJetpack: 100,
      suitColor: '#e2e8f0',
      visorColor: '#38bdf8',
      miningLevel: 1,
      scannerLevel: 1,
      jetpackLevel: 1,
    },
    ship: {
      classId: 'explorer',
      name: shipDef.name,
      primaryColor: shipDef.hullColor,
      accentColor: shipDef.accentColor,
      hull: shipDef.maxHull,
      maxHull: shipDef.maxHull,
      shield: shipDef.maxShield,
      maxShield: shipDef.maxShield,
      launchFuel: 100,
      warpFuel: 75,
      upgrades: { thrusterLevel: 1, shieldLevel: 1, weaponLevel: 1, hyperdriveLevel: 1 },
    },
    playerInventory,
    shipInventory,
    baseStorage,
    hotbarItemIds: ['life_gel', 'ion_battery', 'med_nanite', 'launch_fuel', 'warp_cell'],
    discoveries: [],
    missions: generateStarterMissions(homeSystem),
    structures: [],
    discoveredSystemIds: [homeSystem.id],
    discoveredPlanetIds: [starterPlanet.id],
    settings: {
      quality: 'high',
      fov: 70,
      sensitivity: 1.0,
      invertY: false,
      muted: false,
      volume: 0.55,
      showControlsHint: true,
      touchControls: 'auto',
    },
  };

  return {
    ...partial,
    checksum: computeSaveChecksum(partial),
  };
}

export function validateSaveGame(raw: unknown): { valid: boolean; data?: SaveGameData; error?: string } {
  if (!raw || typeof raw !== 'object') return { valid: false, error: 'Corrupted save payload' };
  const obj = raw as SaveGameData;
  if (typeof obj.version !== 'number' || typeof obj.universeSeed !== 'number' || !obj.slotId) {
    return { valid: false, error: 'Missing required save metadata' };
  }
  const { checksum, ...rest } = obj;
  const expected = computeSaveChecksum(rest);
  if (checksum !== expected) {
    return { valid: false, error: 'Save checksum mismatch (data integrity check failed)' };
  }
  return { valid: true, data: obj };
}

export function writeSaveSlot(save: SaveGameData, storage: Storage = window.localStorage): { ok: boolean; error?: string } {
  try {
    const key = SAVE_STORAGE_PREFIX + save.slotId;
    const existing = storage.getItem(key);
    if (existing) {
      storage.setItem(SAVE_BACKUP_PREFIX + save.slotId, existing);
    }
    const { checksum: _old, ...rest } = save;
    const updated: SaveGameData = {
      ...rest,
      updatedAt: Date.now(),
      checksum: computeSaveChecksum(rest),
    };
    storage.setItem(key, JSON.stringify(updated));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Storage write failed' };
  }
}

export function loadSaveSlot(slotId: string, storage: Storage = window.localStorage): { ok: boolean; data?: SaveGameData; recoveredFromBackup?: boolean; error?: string } {
  try {
    const raw = storage.getItem(SAVE_STORAGE_PREFIX + slotId);
    if (raw) {
      const parsed = JSON.parse(raw);
      const checked = validateSaveGame(parsed);
      if (checked.valid && checked.data) return { ok: true, data: checked.data };
    }
    const backupRaw = storage.getItem(SAVE_BACKUP_PREFIX + slotId);
    if (backupRaw) {
      const parsedBackup = JSON.parse(backupRaw);
      const checkedBackup = validateSaveGame(parsedBackup);
      if (checkedBackup.valid && checkedBackup.data) {
        return { ok: true, data: checkedBackup.data, recoveredFromBackup: true };
      }
    }
    return { ok: false, error: 'Save slot empty or corrupted' };
  } catch {
    return { ok: false, error: 'Failed to parse save data' };
  }
}

export function deleteSaveSlot(slotId: string, storage: Storage = window.localStorage): void {
  storage.removeItem(SAVE_STORAGE_PREFIX + slotId);
  storage.removeItem(SAVE_BACKUP_PREFIX + slotId);
}

export function listSaveSlots(
  resolveNames: (save: SaveGameData) => { systemName: string; planetName: string },
  storage: Storage = window.localStorage
): SaveSlotSummary[] {
  const summaries: SaveSlotSummary[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(SAVE_STORAGE_PREFIX)) continue;
    const slotId = key.slice(SAVE_STORAGE_PREFIX.length);
    const loaded = loadSaveSlot(slotId, storage);
    if (loaded.ok && loaded.data) {
      const names = resolveNames(loaded.data);
      summaries.push({
        slotId: loaded.data.slotId,
        label: loaded.data.label,
        universeSeed: loaded.data.universeSeed,
        systemName: names.systemName,
        planetName: names.planetName,
        credits: loaded.data.credits,
        discoveriesCount: loaded.data.discoveries.length,
        playTimeSec: loaded.data.playTimeSec,
        updatedAt: loaded.data.updatedAt,
        version: loaded.data.version,
      });
    }
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}
