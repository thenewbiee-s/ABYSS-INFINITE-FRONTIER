export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type PlayMode = 'on_foot' | 'in_ship' | 'build_mode' | 'warping';

export type SystemsTab =
  | 'inventory'
  | 'crafting'
  | 'galaxy'
  | 'discoveries'
  | 'missions'
  | 'building'
  | 'ship'
  | 'settings';

export type StarClass = 'O-Blue' | 'B-Cyan' | 'A-White' | 'F-YellowWhite' | 'G-Yellow' | 'K-Orange' | 'M-Red' | 'Binary';

export type PlanetArchetypeId =
  | 'paradise'
  | 'tropical'
  | 'jungle'
  | 'giant_forest'
  | 'desert'
  | 'rocky_desert'
  | 'frozen'
  | 'ice_crystal'
  | 'volcanic'
  | 'lava'
  | 'toxic'
  | 'radioactive'
  | 'ocean'
  | 'deep_ocean'
  | 'swamp'
  | 'mushroom'
  | 'crystal'
  | 'floating_island'
  | 'mountain'
  | 'canyon'
  | 'barren'
  | 'ancient_ruins'
  | 'abandoned_colony'
  | 'bioluminescent'
  | 'alien_flower'
  | 'acid_rain'
  | 'extreme_storm'
  | 'dark'
  | 'gas_giant'
  | 'exotic_anomaly'
  | 'metallic'
  | 'machine_world'
  | 'terraforming_exp'
  | 'giant_cave'
  | 'high_gravity'
  | 'low_gravity';

export type HazardType = 'none' | 'heat' | 'cold' | 'toxic' | 'radiation' | 'pressure' | 'void';

export type WeatherType =
  | 'Clear'
  | 'Balmy Breeze'
  | 'Monsoon'
  | 'Sandstorm'
  | 'Blizzard'
  | 'Ashfall'
  | 'Acid Rain'
  | 'Rad Storm'
  | 'Ion Tempest'
  | 'Spore Mist'
  | 'Superheated Rain'
  | 'Gravity Anomaly';

export type RarityTier = 'Common' | 'Uncommon' | 'Rare' | 'Exotic' | 'Mythic';

export interface PlanetArchetypeDef {
  id: PlanetArchetypeId;
  name: string;
  rarity: RarityTier;
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  groundLow: string;
  groundMid: string;
  groundHigh: string;
  waterColor: string;
  emissiveAccent: string;
  cloudDensity: number;
  hasWater: boolean;
  waterIsLava?: boolean;
  waterLevelOffset: number; // relative to base radius
  terrainAmp: number;
  terrainFreq: number;
  ridgeWeight: number;
  craterWeight: number;
  gravityRange: [number, number];
  tempRange: [number, number];
  hazard: HazardType;
  weathers: WeatherType[];
  floraStyle: 'lush' | 'jungle' | 'mushroom' | 'crystal' | 'desert' | 'frozen' | 'biolum' | 'flower' | 'ruin' | 'machine' | 'sparse';
  landable: boolean;
  hasRingsChance: number;
  atmosphereStrength: number;
}

export interface CreatureSpecies {
  id: string;
  name: string;
  bodyType: 'quadruped' | 'biped' | 'flyer' | 'aquatic' | 'crawler' | 'floater';
  temperament: 'docile' | 'skittish' | 'predator' | 'guardian';
  scale: number;
  primaryColor: string;
  secondaryColor: string;
  eyeColor: string;
  bioluminescent: boolean;
  nocturnal: boolean;
  limbs: number;
  speed: number;
  hp: number;
  rarity: RarityTier;
  diet: string;
}

export interface FloraSpecies {
  id: string;
  name: string;
  style: PlanetArchetypeDef['floraStyle'];
  scale: number;
  trunkColor: string;
  canopyColor: string;
  glowColor: string;
  primaryResource: string;
  rarity: RarityTier;
}

export interface PlanetProfile {
  id: string;
  seed: number;
  systemId: string;
  orbitIndex: number;
  name: string;
  archetype: PlanetArchetypeId;
  archetypeName: string;
  rarity: RarityTier;
  radius: number; // Gameplay world radius in meters/units
  orbitDistance: number;
  orbitAngle: number;
  position: [number, number, number];
  gravity: number; // m/s^2 (Earth ~ 9.8)
  temperatureC: number;
  atmosphere: string;
  atmosphereStrength: number;
  waterLevel: number;
  hasWater: boolean;
  waterIsLava: boolean;
  hazard: HazardType;
  weather: WeatherType;
  biomes: string[];
  resources: string[];
  floraSpecies: FloraSpecies[];
  creatureSpecies: CreatureSpecies[];
  hasRings: boolean;
  ringColor: string;
  hasRuins: boolean;
  hasOutpost: boolean;
  landable: boolean;
  discovered: boolean;
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  groundLow: string;
  groundMid: string;
  groundHigh: string;
  waterColor: string;
  emissiveAccent: string;
  cloudDensity: number;
  terrainAmp: number;
  terrainFreq: number;
  ridgeWeight: number;
  craterWeight: number;
}

export interface FactionId {
  id: 'vaelori' | 'kethrax' | 'aetheris';
  name: string;
  specialty: string;
  accentColor: string;
}

export interface StarSystem {
  id: string;
  seed: number;
  name: string;
  regionName: string;
  coords: { x: number; y: number; z: number }; // Galaxy grid coords
  starClass: StarClass;
  starColor: string;
  secondaryStarColor?: string;
  isBinary: boolean;
  faction: FactionId['id'];
  economyTier: 1 | 2 | 3;
  dangerLevel: 'Low' | 'Moderate' | 'High';
  planets: PlanetProfile[];
  hasStation: boolean;
  stationName: string;
  stationPosition: [number, number, number];
  hasAnomaly: boolean;
  discovered: boolean;
}

export type ItemCategory = 'resource' | 'component' | 'consumable' | 'fuel' | 'artifact' | 'upgrade';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: RarityTier;
  color: string;
  maxStack: number;
  baseValue: number;
  description: string;
  usableEffect?: {
    type: 'heal' | 'oxygen' | 'hazard' | 'warp_fuel' | 'launch_fuel' | 'shield';
    amount: number;
  };
}

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  outputId: string;
  outputQty: number;
  station: 'suit' | 'refinery';
  ingredients: { itemId: string; quantity: number }[];
  description: string;
}

export type BasePartId =
  | 'foundation'
  | 'floor'
  | 'wall'
  | 'window_wall'
  | 'roof'
  | 'door'
  | 'solar_panel'
  | 'reactor'
  | 'battery'
  | 'storage_vault'
  | 'landing_pad'
  | 'research_beacon'
  | 'hydroponics';

export interface BasePartDef {
  id: BasePartId;
  name: string;
  category: 'structure' | 'power' | 'utility';
  cost: { itemId: string; quantity: number }[];
  powerDelta: number; // + produces, - consumes
  size: [number, number, number];
  description: string;
}

export interface PlacedStructure {
  uid: string;
  partId: BasePartId;
  planetId: string;
  position: [number, number, number]; // Planet-local surface pos
  normal: [number, number, number]; // Surface up normal
  yaw: number;
  integrity: number;
}

export type ShipClassId = 'explorer' | 'fighter' | 'hauler' | 'scientific' | 'mining' | 'transport' | 'exotic';

export interface ShipClassDef {
  id: ShipClassId;
  name: string;
  role: string;
  hullColor: string;
  accentColor: string;
  maxSpeed: number;
  boostSpeed: number;
  turnRate: number;
  maxShield: number;
  maxHull: number;
  cargoCapacity: number;
  warpRange: number;
  weaponDamage: number;
  costCredits: number;
}

export interface ShipState {
  classId: ShipClassId;
  name: string;
  primaryColor: string;
  accentColor: string;
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  launchFuel: number; // 0-100
  warpFuel: number; // 0-100
  upgrades: {
    thrusterLevel: number;
    shieldLevel: number;
    weaponLevel: number;
    hyperdriveLevel: number;
  };
}

export interface PlayerSurvivalState {
  health: number;
  maxHealth: number;
  oxygen: number;
  maxOxygen: number;
  hazardShield: number;
  maxHazardShield: number;
  jetpack: number;
  maxJetpack: number;
  suitColor: string;
  visorColor: string;
  miningLevel: number;
  scannerLevel: number;
  jetpackLevel: number;
}

export interface DiscoveryEntry {
  id: string;
  kind: 'planet' | 'fauna' | 'flora' | 'mineral' | 'ruin' | 'system' | 'anomaly';
  name: string;
  planetName: string;
  planetId: string;
  systemName: string;
  biome: string;
  rarity: RarityTier;
  scientificNote: string;
  creditsAwarded: number;
  timestamp: number;
}

export interface MissionDef {
  id: string;
  title: string;
  faction: FactionId['id'];
  type: 'scan' | 'mine' | 'explore' | 'combat' | 'build' | 'warp';
  targetId: string;
  targetLabel: string;
  requiredCount: number;
  progress: number;
  rewardCredits: number;
  rewardItem?: { itemId: string; quantity: number };
  completed: boolean;
  claimed: boolean;
}

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  fov: number;
  sensitivity: number;
  invertY: boolean;
  muted: boolean;
  volume: number;
  showControlsHint: boolean;
  touchControls?: 'auto' | 'on' | 'off';
}

export interface SaveSlotSummary {
  slotId: string;
  label: string;
  universeSeed: number;
  systemName: string;
  planetName: string;
  credits: number;
  discoveriesCount: number;
  playTimeSec: number;
  updatedAt: number;
  version: number;
}

export interface SaveGameData {
  version: number;
  checksum: string;
  slotId: string;
  label: string;
  updatedAt: number;
  playTimeSec: number;
  universeSeed: number;
  currentSystemCoords: { x: number; y: number; z: number; index: number };
  currentPlanetId: string | null;
  playMode: PlayMode;
  playerLocalPos: [number, number, number];
  shipLocalPos: [number, number, number];
  credits: number;
  reputation: Record<FactionId['id'], number>;
  survival: PlayerSurvivalState;
  ship: ShipState;
  playerInventory: (InventorySlot | null)[];
  shipInventory: (InventorySlot | null)[];
  baseStorage: (InventorySlot | null)[];
  hotbarItemIds: (string | null)[];
  discoveries: DiscoveryEntry[];
  missions: MissionDef[];
  structures: PlacedStructure[];
  discoveredSystemIds: string[];
  discoveredPlanetIds: string[];
  settings: GraphicsSettings;
}

export interface HudTelemetry {
  playMode: PlayMode;
  fps: number;
  speed: number;
  altitude: number;
  nearestPlanetId: string | null;
  nearestPlanetName: string;
  nearestPlanetType: string;
  nearestPlanetGravity: number;
  nearestPlanetTemp: number;
  nearestPlanetWeather: WeatherType;
  nearestPlanetHazard: HazardType;
  inAtmosphere: boolean;
  canAutoLand: boolean;
  nearShip: boolean;
  nearStation: boolean;
  nearOutpost: boolean;
  scanTargetName: string | null;
  scanTargetKind: string | null;
  scanTargetProgress: number; // 0..1
  miningTargetName: string | null;
  miningTargetHpRatio: number;
  alertMessage: string | null;
  compassHeadingDeg: number;
  shipDistance: number;
  powerProduced: number;
  powerConsumed: number;
  selectedHotbarIdx: number;
  selectedBuildPart: BasePartId;
  canPlaceBuild: boolean;
  warpChargeProgress: number; // 0..1
  piratesNearby: number;
  outcomeReason?: string;
}
