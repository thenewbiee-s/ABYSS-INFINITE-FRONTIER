import { ARCHETYPE_LIST, PLANET_ARCHETYPES } from './catalog';
import { fbm3D, hashCoords, hashInt, mulberry32, ridgedFbm3D } from './prng';
import {
  CreatureSpecies,
  FactionId,
  FloraSpecies,
  PlanetArchetypeId,
  PlanetProfile,
  RarityTier,
  StarClass,
  StarSystem,
} from './types';

const SYLLABLES_A = [
  'Aet', 'Vael', 'Keth', 'Zor', 'Nyx', 'Oph', 'Thal', 'Cy', 'Vor', 'Sol',
  'Lyr', 'Drak', 'Elys', 'Kael', 'Myr', 'Xan', 'Ar', 'Bel', 'Cor', 'Iri',
];
const SYLLABLES_B = [
  'ora', 'is', 'ar', 'ion', 'en', 'ath', 'os', 'um', 'ia', 'ex',
  'ul', 'an', 'ei', 'or', 'us', 'al', 'ir', 'on', 'ys', 'oa',
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'Prime', 'Majoris', 'Minoris'];

const REGION_NAMES = [
  'Euclid Meridian',
  'Veil of Cygnus',
  'Obsidian Expanse',
  'Aetheris Drift',
  'Vaelori Reach',
  'Shattered Crown',
  'Helios Crucible',
  'Elysian Spiral',
];

const STAR_CLASSES: { cls: StarClass; color: string; weight: number }[] = [
  { cls: 'G-Yellow', color: '#fde68a', weight: 28 },
  { cls: 'K-Orange', color: '#fdba74', weight: 24 },
  { cls: 'M-Red', color: '#fca5a5', weight: 18 },
  { cls: 'F-YellowWhite', color: '#fef9c3', weight: 12 },
  { cls: 'A-White', color: '#e0f2fe', weight: 8 },
  { cls: 'B-Cyan', color: '#67e8f9', weight: 5 },
  { cls: 'O-Blue', color: '#60a5fa', weight: 3 },
  { cls: 'Binary', color: '#f9a8d4', weight: 6 },
];

export function generateProceduralName(rng: () => number, suffix = ''): string {
  const a = SYLLABLES_A[Math.floor(rng() * SYLLABLES_A.length)];
  const b = SYLLABLES_B[Math.floor(rng() * SYLLABLES_B.length)];
  const c = rng() > 0.55 ? SYLLABLES_B[Math.floor(rng() * SYLLABLES_B.length)] : '';
  return `${a}${b}${c}${suffix ? ' ' + suffix : ''}`;
}

export function getRegionName(x: number, y: number, z: number, universeSeed: number): string {
  const h = hashCoords(Math.floor(x / 4), Math.floor(y / 4), Math.floor(z / 4), universeSeed);
  return REGION_NAMES[h % REGION_NAMES.length];
}

function generateFloraSpecies(
  rng: () => number,
  archetype: PlanetArchetypeId,
  planetColor: string,
  accent: string
): FloraSpecies[] {
  const def = PLANET_ARCHETYPES[archetype];
  const count = def.floraStyle === 'sparse' ? 2 : 3 + Math.floor(rng() * 2);
  const resPool = ['carbon', 'oxygen', 'sodium', 'biolum_spore', 'ferrite_dust'];
  const list: FloraSpecies[] = [];
  for (let i = 0; i < count; i++) {
    const scale = 0.7 + rng() * 1.4;
    const rarity: RarityTier = i === count - 1 && rng() > 0.6 ? 'Rare' : rng() > 0.5 ? 'Uncommon' : 'Common';
    list.push({
      id: `flora_${i}_${Math.floor(rng() * 99999)}`,
      name: `${generateProceduralName(rng)} ${def.floraStyle === 'mushroom' ? 'Mycelia' : def.floraStyle === 'crystal' ? 'Spire' : 'Flora'}`,
      style: def.floraStyle,
      scale,
      trunkColor: planetColor,
      canopyColor: i % 2 === 0 ? accent : def.groundMid,
      glowColor: accent,
      primaryResource: resPool[Math.floor(rng() * resPool.length)],
      rarity,
    });
  }
  return list;
}

function generateCreatureSpecies(rng: () => number, archetype: PlanetArchetypeId): CreatureSpecies[] {
  const def = PLANET_ARCHETYPES[archetype];
  if (!def.landable) return [];
  const count = def.hazard === 'void' ? 2 : 3 + Math.floor(rng() * 3);
  const bodies: CreatureSpecies['bodyType'][] = def.hasWater
    ? ['quadruped', 'biped', 'flyer', 'aquatic', 'crawler', 'floater']
    : ['quadruped', 'biped', 'flyer', 'crawler', 'floater'];

  const list: CreatureSpecies[] = [];
  const palette = ['#f59e0b', '#38bdf8', '#a855f7', '#10b981', '#fb7185', '#eab308', '#22d3ee', '#f97316'];

  for (let i = 0; i < count; i++) {
    const bodyType = bodies[Math.floor(rng() * bodies.length)];
    const isPredator = i === count - 1 && rng() > 0.35;
    const temperament: CreatureSpecies['temperament'] = isPredator
      ? 'predator'
      : rng() > 0.6
        ? 'skittish'
        : 'docile';
    const scale = bodyType === 'quadruped' && rng() > 0.65 ? 1.5 + rng() * 0.9 : 0.65 + rng() * 0.8;
    const primary = palette[Math.floor(rng() * palette.length)];
    const secondary = palette[Math.floor(rng() * palette.length)];
    list.push({
      id: `fauna_${i}_${Math.floor(rng() * 99999)}`,
      name: generateProceduralName(rng),
      bodyType,
      temperament,
      scale,
      primaryColor: primary,
      secondaryColor: secondary,
      eyeColor: temperament === 'predator' ? '#ff2d55' : '#38bdf8',
      bioluminescent: def.id === 'bioluminescent' || def.id === 'dark' || rng() > 0.65,
      nocturnal: rng() > 0.72,
      limbs: bodyType === 'crawler' ? 6 : bodyType === 'quadruped' ? 4 : 2,
      speed: temperament === 'predator' ? 7.2 + rng() * 2.5 : 3.5 + rng() * 3.0,
      hp: Math.round((temperament === 'predator' ? 85 : 50) * scale),
      rarity: scale > 1.8 ? 'Rare' : rng() > 0.6 ? 'Uncommon' : 'Common',
      diet: temperament === 'predator' ? 'Carnivore' : 'Herbivore',
    });
  }
  return list;
}

export function generatePlanetProfile(
  planetSeed: number,
  systemId: string,
  systemName: string,
  orbitIndex: number,
  forcedArchetype?: PlanetArchetypeId
): PlanetProfile {
  const rng = mulberry32(planetSeed);
  const archetypeDef = forcedArchetype
    ? PLANET_ARCHETYPES[forcedArchetype]
    : ARCHETYPE_LIST[Math.floor(rng() * ARCHETYPE_LIST.length)];

  // Keep starter-friendly radius range 170..260 so spherical curvature is obvious and travel is engaging
  const radius = archetypeDef.id === 'gas_giant' ? 280 + rng() * 60 : 175 + rng() * 75;
  const orbitDistance = 950 + orbitIndex * 980 + rng() * 320;
  const orbitAngle = rng() * Math.PI * 2;
  const tiltY = (rng() - 0.5) * 260;

  const position: [number, number, number] = [
    Math.cos(orbitAngle) * orbitDistance,
    tiltY,
    Math.sin(orbitAngle) * orbitDistance,
  ];

  const gravity = Number(
    (
      archetypeDef.gravityRange[0] +
      rng() * (archetypeDef.gravityRange[1] - archetypeDef.gravityRange[0])
    ).toFixed(1)
  );
  const temperatureC = Math.round(
    archetypeDef.tempRange[0] + rng() * (archetypeDef.tempRange[1] - archetypeDef.tempRange[0])
  );
  const weather = archetypeDef.weathers[Math.floor(rng() * archetypeDef.weathers.length)];

  const resourcePool = ['ferrite_dust', 'carbon', 'oxygen', 'sodium', 'cobalt'];
  if (archetypeDef.rarity === 'Rare' || archetypeDef.rarity === 'Exotic' || rng() > 0.55) {
    resourcePool.push('emeril');
  }
  if (archetypeDef.rarity === 'Exotic' || archetypeDef.rarity === 'Mythic' || rng() > 0.78) {
    resourcePool.push('indium', 'quantum_crystal');
  }

  const biomes = [
    `${archetypeDef.name.replace(' Planet', '')} Highlands`,
    archetypeDef.hasWater ? 'Coastal Shallows' : 'Basalt Flats',
    rng() > 0.5 ? 'Crystalline Ridges' : 'Sunken Basins',
  ];

  const hasRings = rng() < archetypeDef.hasRingsChance;
  const suffix = ROMAN[orbitIndex % ROMAN.length];
  const name = orbitIndex === 0 && forcedArchetype ? `${systemName} Prime` : `${generateProceduralName(rng)} ${suffix}`;

  return {
    id: `pl_${planetSeed.toString(36)}`,
    seed: planetSeed,
    systemId,
    orbitIndex,
    name,
    archetype: archetypeDef.id,
    archetypeName: archetypeDef.name,
    rarity: archetypeDef.rarity,
    radius,
    orbitDistance,
    orbitAngle,
    position,
    gravity,
    temperatureC,
    atmosphere:
      archetypeDef.atmosphereStrength < 0.45
        ? 'Trace Vacuum'
        : archetypeDef.hazard === 'toxic'
          ? 'Sulfur-Methane Dense'
          : archetypeDef.hazard === 'radiation'
            ? 'Ionized Argon-Nitrogen'
            : 'Nitrogen-Oxygen Rich',
    atmosphereStrength: archetypeDef.atmosphereStrength,
    waterLevel: radius + archetypeDef.waterLevelOffset,
    hasWater: archetypeDef.hasWater,
    waterIsLava: Boolean(archetypeDef.waterIsLava),
    hazard: archetypeDef.hazard,
    weather,
    biomes,
    resources: resourcePool,
    floraSpecies: generateFloraSpecies(rng, archetypeDef.id, archetypeDef.groundHigh, archetypeDef.emissiveAccent),
    creatureSpecies: generateCreatureSpecies(rng, archetypeDef.id),
    hasRings,
    ringColor: archetypeDef.emissiveAccent,
    hasRuins: archetypeDef.id === 'ancient_ruins' || rng() > 0.65,
    hasOutpost: archetypeDef.landable && rng() > 0.45,
    landable: archetypeDef.landable,
    discovered: false,
    skyTop: archetypeDef.skyTop,
    skyHorizon: archetypeDef.skyHorizon,
    fogColor: archetypeDef.fogColor,
    groundLow: archetypeDef.groundLow,
    groundMid: archetypeDef.groundMid,
    groundHigh: archetypeDef.groundHigh,
    waterColor: archetypeDef.waterColor,
    emissiveAccent: archetypeDef.emissiveAccent,
    cloudDensity: archetypeDef.cloudDensity,
    terrainAmp: archetypeDef.terrainAmp,
    terrainFreq: archetypeDef.terrainFreq,
    ridgeWeight: archetypeDef.ridgeWeight,
    craterWeight: archetypeDef.craterWeight,
  };
}

export function generateStarSystem(
  universeSeed: number,
  coords: { x: number; y: number; z: number; index: number },
  isHomeSystem = false
): StarSystem {
  const sysSeed = hashCoords(
    coords.x * 31 + coords.index,
    coords.y * 17,
    coords.z * 53,
    universeSeed
  );
  const rng = mulberry32(sysSeed);

  let starPicked = STAR_CLASSES[0];
  let roll = rng() * 104;
  for (const s of STAR_CLASSES) {
    roll -= s.weight;
    if (roll <= 0) {
      starPicked = s;
      break;
    }
  }

  const factions: FactionId['id'][] = ['vaelori', 'kethrax', 'aetheris'];
  const faction = factions[Math.floor(rng() * factions.length)];
  const systemName = generateProceduralName(rng);
  const planetCount = isHomeSystem ? 5 : 3 + Math.floor(rng() * 4);
  const planets: PlanetProfile[] = [];

  for (let i = 0; i < planetCount; i++) {
    const pSeed = hashInt(sysSeed ^ ((i + 1) * 0x9e3779b9));
    // Guarantee the starter system has a breathtaking lush/bioluminescent starter planet + diverse neighbors
    let forced: PlanetArchetypeId | undefined;
    if (isHomeSystem) {
      if (i === 0) forced = 'paradise';
      else if (i === 1) forced = 'bioluminescent';
      else if (i === 2) forced = 'volcanic';
      else if (i === 3) forced = 'ice_crystal';
      else if (i === 4) forced = 'ancient_ruins';
    }
    planets.push(generatePlanetProfile(pSeed, `sys_${sysSeed.toString(36)}`, systemName, i, forced));
  }

  const stationAngle = rng() * Math.PI * 2;
  const stationDist = 1480;

  return {
    id: `sys_${sysSeed.toString(36)}`,
    seed: sysSeed,
    name: systemName,
    regionName: getRegionName(coords.x, coords.y, coords.z, universeSeed),
    coords: { x: coords.x, y: coords.y, z: coords.z },
    starClass: starPicked.cls,
    starColor: starPicked.color,
    isBinary: starPicked.cls === 'Binary',
    secondaryStarColor: starPicked.cls === 'Binary' ? '#60a5fa' : undefined,
    faction,
    economyTier: ((Math.floor(rng() * 3) + 1) as 1 | 2 | 3),
    dangerLevel: rng() > 0.72 ? 'High' : rng() > 0.35 ? 'Moderate' : 'Low',
    planets,
    hasStation: isHomeSystem || rng() > 0.15,
    stationName: `${systemName} Orbital Nexus`,
    stationPosition: [
      Math.cos(stationAngle) * stationDist,
      190,
      Math.sin(stationAngle) * stationDist,
    ],
    hasAnomaly: rng() > 0.65,
    discovered: isHomeSystem,
  };
}

// Generate nearby galaxy star nodes around a 3D galaxy coordinate for the Galaxy Map
export function generateNearbyGalaxySystems(
  universeSeed: number,
  center: { x: number; y: number; z: number },
  radius = 3
): { coords: { x: number; y: number; z: number; index: number }; system: StarSystem }[] {
  const results: { coords: { x: number; y: number; z: number; index: number }; system: StarSystem }[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > radius * radius + 1) continue;
      const gx = center.x + dx;
      const gz = center.z + dz;
      const gy = center.y;
      const isOrigin = gx === 0 && gy === 0 && gz === 0;
      const cellHash = hashCoords(gx, gy, gz, universeSeed);
      // ~55% sector occupancy (plus origin always exists) -> millions of addressable systems across 3D sector grid
      if (isOrigin || (cellHash % 100) < 58) {
        const coords = { x: gx, y: gy, z: gz, index: 0 };
        results.push({
          coords,
          system: generateStarSystem(universeSeed, coords, isOrigin),
        });
      }
    }
  }
  return results;
}

/**
 * Deterministic spherical terrain height at a unit direction (nx, ny, nz) from planet center.
 * Used identically by mesh generation, player/ship collision, flora/base grounding!
 */
export function samplePlanetSurfaceRadius(
  planet: PlanetProfile,
  nx: number,
  ny: number,
  nz: number
): number {
  const freq = planet.terrainFreq;
  const seed = planet.seed;

  const baseNoise = fbm3D(nx * freq, ny * freq, nz * freq, seed, 4);
  const ridgeNoise = ridgedFbm3D(nx * (freq * 1.4), ny * (freq * 1.4), nz * (freq * 1.4), seed + 777, 3);
  const detailNoise = fbm3D(nx * (freq * 4.5), ny * (freq * 4.5), nz * (freq * 4.5), seed + 3331, 2);

  let h = baseNoise * planet.terrainAmp;
  h += (ridgeNoise - 0.35) * planet.terrainAmp * planet.ridgeWeight * 1.3;
  h += detailNoise * (planet.terrainAmp * 0.22);

  if (planet.craterWeight > 0.05) {
    const craterField = fbm3D(nx * 5.2, ny * 5.2, nz * 5.2, seed + 9191, 2);
    if (craterField > 0.28) {
      const bowl = Math.min(1, (craterField - 0.28) * 3.5);
      h -= bowl * bowl * planet.terrainAmp * planet.craterWeight * 1.25;
    }
  }

  // Smooth safe landing plateau near initial spawn pole (+Y north-east patch around (0, 0.968, 0.25))
  const spawnDot = nx * 0.0 + ny * 0.968 + nz * 0.25;
  if (spawnDot > 0.91 && planet.landable) {
    const flatten = Math.min(1, (spawnDot - 0.91) / 0.06);
    const targetFlat = planet.hasWater && !planet.waterIsLava
      ? Math.max(4.8, planet.waterLevel - planet.radius + 4.8)
      : 3.4;
    h = h * (1 - flatten) + targetFlat * flatten;
  }

  return planet.radius + h;
}
