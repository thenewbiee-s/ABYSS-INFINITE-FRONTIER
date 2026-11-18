import * as THREE from 'three';
import { PlanetProfile, CreatureSpecies, FloraSpecies } from './types';
import { mulberry32 } from './prng';
import { samplePlanetSurfaceRadius } from './universe';
import { ProceduralTextureSet } from './textures';
import { createAlienCreatureModel, createFloraMesh, CreatureRig } from './models';

export interface MineralNode {
  id: string;
  resourceId: string;
  name: string;
  mesh: THREE.Group;
  worldPos: THREE.Vector3;
  normal: THREE.Vector3;
  hp: number;
  maxHp: number;
  yieldQty: number;
  depleted: boolean;
  scanned: boolean;
}

export interface FloraEntity {
  id: string;
  species: FloraSpecies;
  mesh: THREE.Group;
  worldPos: THREE.Vector3;
  scanned: boolean;
}

export interface CreatureEntity {
  id: string;
  rig: CreatureRig;
  species: CreatureSpecies;
  localPos: THREE.Vector3; // relative to planet center
  velocity: THREE.Vector3;
  heading: number;
  hp: number;
  maxHp: number;
  state: 'roam' | 'flee' | 'hunt' | 'windup' | 'dead';
  stateTimer: number;
  windupTimer: number;
  scanned: boolean;
}

export interface PlanetRuntime {
  profile: PlanetProfile;
  group: THREE.Group;
  detailsGroup: THREE.Group;
  terrainMesh: THREE.Mesh;
  atmosphereMesh: THREE.Mesh;
  cloudMesh: THREE.Mesh;
  waterMesh?: THREE.Mesh;
  ringMesh?: THREE.Mesh;
  minerals: MineralNode[];
  flora: FloraEntity[];
  creatures: CreatureEntity[];
  outpostPos?: THREE.Vector3;
  detailsPopulated: boolean;
}

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export function buildSphericalPlanetMesh(
  planet: PlanetProfile,
  detailSubdivisions: number,
  textures: ProceduralTextureSet
): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(planet.radius, detailSubdivisions);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const cLow = new THREE.Color(planet.groundLow);
  const cMid = new THREE.Color(planet.groundMid);
  const cHigh = new THREE.Color(planet.groundHigh);
  const cTmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;

    const r = samplePlanetSurfaceRadius(planet, nx, ny, nz);
    posAttr.setXYZ(i, nx * r, ny * r, nz * r);

    const elev = r - planet.radius;
    const normElev = THREE.MathUtils.clamp((elev + planet.terrainAmp * 0.6) / (planet.terrainAmp * 1.4), 0, 1);
    if (normElev < 0.42) {
      cTmp.copy(cLow).lerp(cMid, normElev / 0.42);
    } else {
      cTmp.copy(cMid).lerp(cHigh, (normElev - 0.42) / 0.58);
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: planet.archetype === 'ice_crystal' || planet.archetype === 'metallic' ? 0.38 : 0.85,
    metalness: planet.archetype === 'metallic' || planet.archetype === 'machine_world' ? 0.65 : 0.08,
    bumpMap: textures.terrainBump,
    bumpScale: 0.35,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

export function createAtmosphereMesh(planet: PlanetProfile): THREE.Mesh {
  const geo = new THREE.SphereGeometry(planet.radius * 1.18, 32, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(planet.skyHorizon) },
      intensity: { value: Math.max(0.35, planet.atmosphereStrength * 0.85) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float rim = 1.0 - max(0.0, dot(viewDir, -vNormal));
        float alpha = pow(rim, 2.4) * intensity * 0.62;
        gl_FragColor = vec4(glowColor, clamp(alpha, 0.0, 0.72));
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geo, mat);
}

export function createPlanetRuntime(
  planet: PlanetProfile,
  subdivisions: number,
  textures: ProceduralTextureSet
): PlanetRuntime {
  const group = new THREE.Group();
  group.position.set(planet.position[0], planet.position[1], planet.position[2]);

  const terrainMesh = buildSphericalPlanetMesh(planet, subdivisions, textures);
  group.add(terrainMesh);

  const atmosphereMesh = createAtmosphereMesh(planet);
  group.add(atmosphereMesh);

  // Cloud shell
  const cloudGeo = new THREE.SphereGeometry(planet.radius + planet.terrainAmp * 1.65 + 14, 28, 20);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: Math.min(0.45, planet.cloudDensity * 0.35),
    roughness: 0.95,
    depthWrite: false,
  });
  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  cloudMesh.visible = planet.cloudDensity > 0.1;
  group.add(cloudMesh);

  // Water or Lava ocean sphere
  let waterMesh: THREE.Mesh | undefined;
  if (planet.hasWater) {
    const wGeo = new THREE.SphereGeometry(planet.waterLevel, 36, 24);
    const wMat = planet.waterIsLava
      ? new THREE.MeshStandardMaterial({
          color: planet.waterColor,
          emissive: '#ff4500',
          emissiveIntensity: 1.25,
          roughness: 0.4,
        })
      : new THREE.MeshPhysicalMaterial({
          color: planet.waterColor,
          roughness: 0.12,
          metalness: 0.1,
          transparent: true,
          opacity: 0.78,
          clearcoat: 1.0,
        });
    waterMesh = new THREE.Mesh(wGeo, wMat);
    group.add(waterMesh);
  }

  // Planetary rings
  let ringMesh: THREE.Mesh | undefined;
  if (planet.hasRings) {
    const rGeo = new THREE.RingGeometry(planet.radius * 1.45, planet.radius * 2.25, 48);
    rGeo.rotateX(Math.PI / 2.4);
    const rMat = new THREE.MeshBasicMaterial({
      color: planet.ringColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    ringMesh = new THREE.Mesh(rGeo, rMat);
    group.add(ringMesh);
  }

  const detailsGroup = new THREE.Group();
  group.add(detailsGroup);

  return {
    profile: planet,
    group,
    detailsGroup,
    terrainMesh,
    atmosphereMesh,
    cloudMesh,
    waterMesh,
    ringMesh,
    minerals: [],
    flora: [],
    creatures: [],
    detailsPopulated: false,
  };
}

export function populatePlanetSurfaceDetails(runtime: PlanetRuntime, detailDensity = 1.0): void {
  if (runtime.detailsPopulated || !runtime.profile.landable) return;
  runtime.detailsPopulated = true;

  const planet = runtime.profile;
  const rng = mulberry32(planet.seed ^ 0x55aa3311);
  const density = THREE.MathUtils.clamp(detailDensity, 0.45, 1.0);

  // Place flora & mineral crystals around the sphere, denser around the primary northern hemisphere landing belt
  const shardGeo = new THREE.ConeGeometry(0.42, 1.85, 5);
  const plinthGeo = new THREE.CylinderGeometry(0.74, 1.05, 0.95, 7);
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.88, metalness: 0.1 });
  const resColors: Record<string, string> = {
    ferrite_dust: '#94a3b8',
    carbon: '#ef4444',
    oxygen: '#38bdf8',
    sodium: '#facc15',
    cobalt: '#3b82f6',
    emeril: '#10b981',
    indium: '#6366f1',
    quantum_crystal: '#c084fc',
  };

  // Mineral Nodes distributed across planet (scaled by device density, with guaranteed cluster near starter landing zone)
  const mineralCount = Math.round(42 * density);
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  for (let i = 0; i < mineralCount; i++) {
    let dir: THREE.Vector3;
    if (i < Math.round(12 * density)) {
      // Near primary landing pole (0, 0.968, 0.25) so player sees rich crystals immediately!
      dir = new THREE.Vector3(
        (rng() - 0.5) * 0.42,
        0.94 + rng() * 0.1,
        0.25 + (rng() - 0.5) * 0.42
      ).normalize();
    } else {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();
    }

    // Keep immediate ship spawn circle clear
    if (dir.distanceTo(_v.set(0, 0.968, 0.25).normalize()) * planet.radius < 7) continue;

    const r = samplePlanetSurfaceRadius(planet, dir.x, dir.y, dir.z);
    if (planet.hasWater && r < planet.waterLevel + 0.5) continue;

    const resId = planet.resources[i % planet.resources.length];
    const col = resColors[resId] || '#38bdf8';
    let mat = matCache.get(col);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.35,
        roughness: 0.22,
        metalness: 0.45,
      });
      matCache.set(col, mat);
    }
    const cluster = new THREE.Group();
    const scale = 0.75 + rng() * 0.7;
    const base = new THREE.Mesh(plinthGeo, plinthMat);
    base.position.y = 0.15;
    cluster.add(base);
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const shard = new THREE.Mesh(shardGeo, mat);
      const ang = (sIdx / 3) * Math.PI * 2 + rng() * 0.4;
      shard.position.set(Math.cos(ang) * 0.28, 0.85, Math.sin(ang) * 0.28);
      shard.rotation.set((rng() - 0.5) * 0.45, ang, (rng() - 0.5) * 0.45);
      shard.scale.setScalar(sIdx === 0 ? 1.15 : 0.85);
      shard.castShadow = density > 0.7;
      cluster.add(shard);
    }
    cluster.scale.setScalar(scale);
    cluster.position.copy(dir).multiplyScalar(r - 0.36);
    _quat.setFromUnitVectors(_up, dir);
    cluster.quaternion.copy(_quat);
    runtime.detailsGroup.add(cluster);

    const worldPos = cluster.position.clone().add(runtime.group.position);
    runtime.minerals.push({
      id: `min_${planet.id}_${i}`,
      resourceId: resId,
      name: `${resId.replace('_', ' ').toUpperCase()} Vein`,
      mesh: cluster,
      worldPos,
      normal: dir.clone(),
      hp: 36,
      maxHp: 36,
      yieldQty: 4 + Math.floor(rng() * 5),
      depleted: false,
      scanned: false,
    });
  }

  // Procedural Alien Flora across planet
  const floraCount = Math.round(48 * density);
  if (planet.floraSpecies.length > 0) {
    for (let i = 0; i < floraCount; i++) {
      let dir: THREE.Vector3;
      if (i < 14) {
        dir = new THREE.Vector3(
          (rng() - 0.5) * 0.5,
          0.92 + rng() * 0.1,
          0.25 + (rng() - 0.5) * 0.5
        ).normalize();
      } else {
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(2 * rng() - 1);
        dir = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        ).normalize();
      }
      // Keep direct ship spawn pad (0, 0.968, 0.25) clear within ~9m
      if (dir.distanceTo(_v.set(0, 0.968, 0.25).normalize()) * planet.radius < 10) continue;

      const r = samplePlanetSurfaceRadius(planet, dir.x, dir.y, dir.z);
      if (planet.hasWater && r < planet.waterLevel + 0.4) continue;

      const sp = planet.floraSpecies[i % planet.floraSpecies.length];
      const fMesh = createFloraMesh(sp);
      fMesh.position.copy(dir).multiplyScalar(r - 0.15);
      _quat.setFromUnitVectors(_up, dir);
      fMesh.quaternion.copy(_quat);
      fMesh.rotateY(rng() * Math.PI * 2);
      runtime.detailsGroup.add(fMesh);

      runtime.flora.push({
        id: `fl_${planet.id}_${i}`,
        species: sp,
        mesh: fMesh,
        worldPos: fMesh.position.clone().add(runtime.group.position),
        scanned: false,
      });
    }
  }

  // Alien Creatures (scaled by device density)
  const creatureCount = Math.max(5, Math.round(10 * density));
  if (planet.creatureSpecies.length > 0) {
    for (let i = 0; i < creatureCount; i++) {
      const sp = planet.creatureSpecies[i % planet.creatureSpecies.length];
      const dir = new THREE.Vector3(
        (rng() - 0.5) * 0.65,
        0.92,
        0.25 + (rng() - 0.5) * 0.65
      ).normalize();
      const r = samplePlanetSurfaceRadius(planet, dir.x, dir.y, dir.z);
      const rig = createAlienCreatureModel(sp);
      const localPos = dir.clone().multiplyScalar(r + (sp.bodyType === 'flyer' ? 8 : 0.05));
      rig.root.position.copy(localPos);
      _quat.setFromUnitVectors(_up, dir);
      rig.root.quaternion.copy(_quat);
      runtime.detailsGroup.add(rig.root);

      runtime.creatures.push({
        id: `cr_${planet.id}_${i}`,
        rig,
        species: sp,
        localPos,
        velocity: new THREE.Vector3(),
        heading: rng() * Math.PI * 2,
        hp: sp.hp,
        maxHp: sp.hp,
        state: 'roam',
        stateTimer: 2 + rng() * 4,
        windupTimer: 0,
        scanned: false,
      });
    }
  }

  // Ancient Ruin / Frontier Trading Outpost Landmark on surface
  if (planet.hasOutpost || planet.hasRuins) {
    const dir = new THREE.Vector3(0.28, 0.92, 0.27).normalize();
    const r = samplePlanetSurfaceRadius(planet, dir.x, dir.y, dir.z);
    const landmark = new THREE.Group();
    landmark.position.copy(dir).multiplyScalar(r);
    _quat.setFromUnitVectors(_up, dir);
    landmark.quaternion.copy(_quat);

    const baseMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.45, metalness: 0.6 });
    const glowMat = new THREE.MeshBasicMaterial({ color: planet.emissiveAccent });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 0.8, 8), baseMat);
    plinth.position.y = 0.4;
    landmark.add(plinth);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 7.5, 2.4), baseMat);
    tower.position.y = 4.2;
    landmark.add(tower);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), glowMat);
    beacon.position.y = 9.0;
    landmark.add(beacon);

    runtime.detailsGroup.add(landmark);
    runtime.outpostPos = landmark.position.clone().add(runtime.group.position);
  }
}
