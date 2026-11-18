import * as THREE from 'three';
import { PlanetProfile, CreatureSpecies, FloraSpecies } from './types';
import { ITEMS } from './catalog';
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

export interface SphericalCollider {
  positions: Float32Array;
  triCount: number;
  gridSize: number;
  buckets: number[][];
}

export interface PlanetRuntime {
  profile: PlanetProfile;
  group: THREE.Group;
  detailsGroup: THREE.Group;
  terrainMesh: THREE.Mesh;
  collider: SphericalCollider;
  atmosphereMesh: THREE.Mesh;
  cloudMesh: THREE.Mesh;
  waterMesh?: THREE.Mesh;
  ringMesh?: THREE.Mesh;
  minerals: MineralNode[];
  flora: FloraEntity[];
  creatures: CreatureEntity[];
  spinParts: THREE.Object3D[];
  outpostPos?: THREE.Vector3;
  detailsPopulated: boolean;
}

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

// Project unit direction (nx, ny, nz) onto cube-face index 0..5 and UV in [0, 1]
function dirToCubeFaceUV(nx: number, ny: number, nz: number): { face: number; u: number; v: number } {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  let face = 0;
  let u = 0;
  let v = 0;
  if (ax >= ay && ax >= az) {
    if (nx > 0) {
      face = 0;
      u = (-nz / ax + 1) * 0.5;
      v = (ny / ax + 1) * 0.5;
    } else {
      face = 1;
      u = (nz / ax + 1) * 0.5;
      v = (ny / ax + 1) * 0.5;
    }
  } else if (ay >= ax && ay >= az) {
    if (ny > 0) {
      face = 2;
      u = (nx / ay + 1) * 0.5;
      v = (-nz / ay + 1) * 0.5;
    } else {
      face = 3;
      u = (nx / ay + 1) * 0.5;
      v = (nz / ay + 1) * 0.5;
    }
  } else {
    if (nz > 0) {
      face = 4;
      u = (nx / az + 1) * 0.5;
      v = (ny / az + 1) * 0.5;
    } else {
      face = 5;
      u = (-nx / az + 1) * 0.5;
      v = (ny / az + 1) * 0.5;
    }
  }
  return {
    face,
    u: Math.max(0, Math.min(0.9999, u)),
    v: Math.max(0, Math.min(0.9999, v)),
  };
}

function projectToSpecificFace(face: number, x: number, y: number, z: number): { u: number; v: number } | null {
  const eps = 1e-4;
  let u = 0;
  let v = 0;
  if (face === 0 && x > eps) {
    u = (-z / x + 1) * 0.5;
    v = (y / x + 1) * 0.5;
  } else if (face === 1 && -x > eps) {
    u = (z / -x + 1) * 0.5;
    v = (y / -x + 1) * 0.5;
  } else if (face === 2 && y > eps) {
    u = (x / y + 1) * 0.5;
    v = (-z / y + 1) * 0.5;
  } else if (face === 3 && -y > eps) {
    u = (x / -y + 1) * 0.5;
    v = (z / -y + 1) * 0.5;
  } else if (face === 4 && z > eps) {
    u = (x / z + 1) * 0.5;
    v = (y / z + 1) * 0.5;
  } else if (face === 5 && -z > eps) {
    u = (-x / -z + 1) * 0.5;
    v = (y / -z + 1) * 0.5;
  } else {
    return null;
  }
  return { u, v };
}

export function buildSphericalCollider(geo: THREE.BufferGeometry): SphericalCollider {
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const positions = posAttr.array as Float32Array;
  const triCount = Math.floor(posAttr.count / 3);
  const gridSize = 16;
  const buckets: number[][] = new Array(6 * gridSize * gridSize);
  for (let i = 0; i < buckets.length; i++) buckets[i] = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 9;
    const x0 = positions[i0], y0 = positions[i0 + 1], z0 = positions[i0 + 2];
    const x1 = positions[i0 + 3], y1 = positions[i0 + 4], z1 = positions[i0 + 5];
    const x2 = positions[i0 + 6], y2 = positions[i0 + 7], z2 = positions[i0 + 8];

    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    const cz = (z0 + z1 + z2) / 3;

    const faces = new Set<number>();
    const pts = [
      [x0, y0, z0],
      [x1, y1, z1],
      [x2, y2, z2],
      [cx, cy, cz],
    ];
    for (const [px, py, pz] of pts) {
      const len = Math.hypot(px, py, pz) || 1;
      faces.add(dirToCubeFaceUV(px / len, py / len, pz / len).face);
    }

    for (const face of faces) {
      let minU = 1, maxU = 0, minV = 1, maxV = 0;
      let valid = false;
      for (const [px, py, pz] of pts) {
        const uv = projectToSpecificFace(face, px, py, pz);
        if (uv) {
          valid = true;
          if (uv.u < minU) minU = uv.u;
          if (uv.u > maxU) maxU = uv.u;
          if (uv.v < minV) minV = uv.v;
          if (uv.v > maxV) maxV = uv.v;
        }
      }
      if (!valid) continue;
      const u0 = Math.max(0, Math.floor(minU * gridSize) - 1);
      const u1 = Math.min(gridSize - 1, Math.floor(maxU * gridSize) + 1);
      const v0 = Math.max(0, Math.floor(minV * gridSize) - 1);
      const v1 = Math.min(gridSize - 1, Math.floor(maxV * gridSize) + 1);
      for (let iu = u0; iu <= u1; iu++) {
        for (let iv = v0; iv <= v1; iv++) {
          buckets[(face * gridSize + iv) * gridSize + iu].push(t);
        }
      }
    }
  }

  return { positions, triCount, gridSize, buckets };
}

/**
 * Exact radial ray-triangle intersection against the rendered planet mesh.
 * Guarantees player, creatures, flora, minerals, buildings, and parked ship
 * align 100% flush with the visible terrain triangles without sinking or floating!
 */
export function samplePlanetMeshSurface(
  runtime: PlanetRuntime,
  nx: number,
  ny: number,
  nz: number,
  outNormal?: THREE.Vector3
): number {
  const col = runtime.collider;
  const { face, u, v } = dirToCubeFaceUV(nx, ny, nz);
  const iu = Math.min(col.gridSize - 1, Math.max(0, Math.floor(u * col.gridSize)));
  const iv = Math.min(col.gridSize - 1, Math.max(0, Math.floor(v * col.gridSize)));
  const triList = col.buckets[(face * col.gridSize + iv) * col.gridSize + iu];

  const pos = col.positions;
  const EPS = 1e-6;
  let bestT = -1;

  for (let k = 0; k < triList.length; k++) {
    const base = triList[k] * 9;
    const ax = pos[base], ay = pos[base + 1], az = pos[base + 2];
    const bx = pos[base + 3], by = pos[base + 4], bz = pos[base + 5];
    const cx = pos[base + 6], cy = pos[base + 7], cz = pos[base + 8];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    // pvec = cross(dir, e2)
    const px = ny * e2z - nz * e2y;
    const py = nz * e2x - nx * e2z;
    const pz = nx * e2y - ny * e2x;

    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < EPS) continue;
    const invDet = 1 / det;

    // ray origin = (0,0,0), so tvec = -A
    const tx = -ax, ty = -ay, tz = -az;
    const bu = (tx * px + ty * py + tz * pz) * invDet;
    if (bu < -0.002 || bu > 1.002) continue;

    // qvec = cross(tvec, e1)
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;

    const bv = (nx * qx + ny * qy + nz * qz) * invDet;
    if (bv < -0.002 || bu + bv > 1.004) continue;

    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    if (t > 10 && (bestT < 0 || t > bestT)) {
      bestT = t;
      if (outNormal) {
        // Outward face normal from cross(e1, e2) oriented outward along dir
        let nfx = e1y * e2z - e1z * e2y;
        let nfy = e1z * e2x - e1x * e2z;
        let nfz = e1x * e2y - e1y * e2x;
        if (nfx * nx + nfy * ny + nfz * nz < 0) {
          nfx = -nfx;
          nfy = -nfy;
          nfz = -nfz;
        }
        const nLen = Math.hypot(nfx, nfy, nfz) || 1;
        outNormal.set(nfx / nLen, nfy / nLen, nfz / nLen);
      }
    }
  }

  if (bestT > 0) return bestT;

  if (outNormal) outNormal.set(nx, ny, nz);
  return samplePlanetSurfaceRadius(runtime.profile, nx, ny, nz);
}

export function buildSphericalPlanetMesh(
  planet: PlanetProfile,
  detailSubdivisions: number,
  textures: ProceduralTextureSet
): { mesh: THREE.Mesh; collider: SphericalCollider } {
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

  const collider = buildSphericalCollider(geo);

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
  return { mesh, collider };
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

  const { mesh: terrainMesh, collider } = buildSphericalPlanetMesh(planet, subdivisions, textures);
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
    collider,
    atmosphereMesh,
    cloudMesh,
    waterMesh,
    ringMesh,
    minerals: [],
    flora: [],
    creatures: [],
    spinParts: [],
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

  // Mineral Nodes distributed across planet (scaled by device density, with guaranteed cluster near starter landing zone)
  const mineralCount = Math.round(48 * density);
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  for (let i = 0; i < mineralCount; i++) {
    let dir: THREE.Vector3;
    if (i < Math.round(14 * density)) {
      // Near primary landing pole (0, 0.968, 0.25) so player sees rich crystals immediately!
      dir = new THREE.Vector3(
        (rng() - 0.5) * 0.44,
        0.94 + rng() * 0.1,
        0.25 + (rng() - 0.5) * 0.44
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
    if (dir.distanceTo(_v.set(0, 0.968, 0.25).normalize()) * planet.radius < 7.5) continue;

    const r = samplePlanetMeshSurface(runtime, dir.x, dir.y, dir.z);
    if (planet.hasWater && r < planet.waterLevel + 0.45) continue;

    const resId = planet.resources[i % planet.resources.length];
    const itemDef = ITEMS[resId];
    const col = itemDef?.color || '#38bdf8';
    let mat = matCache.get(col);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.38,
        roughness: 0.22,
        metalness: 0.45,
      });
      matCache.set(col, mat);
    }
    const cluster = new THREE.Group();
    const scale = 0.78 + rng() * 0.72;
    const base = new THREE.Mesh(plinthGeo, plinthMat);
    base.position.y = 0.12;
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
      name: `${itemDef?.name || resId.replace('_', ' ')} Vein`,
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
  const floraCount = Math.round(54 * density);
  if (planet.floraSpecies.length > 0) {
    for (let i = 0; i < floraCount; i++) {
      let dir: THREE.Vector3;
      if (i < 16) {
        dir = new THREE.Vector3(
          (rng() - 0.5) * 0.52,
          0.92 + rng() * 0.1,
          0.25 + (rng() - 0.5) * 0.52
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
      // Keep direct ship spawn pad (0, 0.968, 0.25) clear within ~10m
      if (dir.distanceTo(_v.set(0, 0.968, 0.25).normalize()) * planet.radius < 10) continue;

      const r = samplePlanetMeshSurface(runtime, dir.x, dir.y, dir.z);
      if (planet.hasWater && r < planet.waterLevel + 0.35) continue;

      const sp = planet.floraSpecies[i % planet.floraSpecies.length];
      const fMesh = createFloraMesh(sp);
      fMesh.position.copy(dir).multiplyScalar(r - 0.15);
      _quat.setFromUnitVectors(_up, dir);
      fMesh.quaternion.copy(_quat);
      fMesh.rotateY(rng() * Math.PI * 2);
      runtime.detailsGroup.add(fMesh);

      fMesh.traverse((child) => {
        if (child.userData.spinPart) runtime.spinParts.push(child);
      });

      runtime.flora.push({
        id: `fl_${planet.id}_${i}`,
        species: sp,
        mesh: fMesh,
        worldPos: fMesh.position.clone().add(runtime.group.position),
        scanned: false,
      });
    }
  }

  // Alien Creatures (scaled by device density, with aquatic species placed in ocean/lakes when water exists)
  const creatureCount = Math.max(6, Math.round(13 * density));
  if (planet.creatureSpecies.length > 0) {
    for (let i = 0; i < creatureCount; i++) {
      const sp = planet.creatureSpecies[i % planet.creatureSpecies.length];
      let dir = new THREE.Vector3(
        (rng() - 0.5) * 0.68,
        0.92,
        0.25 + (rng() - 0.5) * 0.68
      ).normalize();
      let r = samplePlanetMeshSurface(runtime, dir.x, dir.y, dir.z);

      // Search a nearby spot for aquatic swimmers in real oceans if planet has water
      if (sp.bodyType === 'aquatic' && planet.hasWater && !planet.waterIsLava) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const cand = new THREE.Vector3(
            (rng() - 0.5) * 1.4,
            0.5 + rng() * 0.6,
            (rng() - 0.5) * 1.4
          ).normalize();
          const cr = samplePlanetMeshSurface(runtime, cand.x, cand.y, cand.z);
          if (cr < planet.waterLevel - 0.9) {
            dir = cand;
            r = cr;
            break;
          }
        }
      }

      const rig = createAlienCreatureModel(sp);
      let hoverOffset = 0.04;
      if (sp.bodyType === 'flyer') hoverOffset = 7.5;
      else if (sp.bodyType === 'floater') hoverOffset = 1.1;
      else if (sp.bodyType === 'aquatic' && planet.hasWater && !planet.waterIsLava && r < planet.waterLevel - 0.4) {
        hoverOffset = Math.max(0.4, (planet.waterLevel - r) * 0.55);
      }

      const localPos = dir.clone().multiplyScalar(r + hoverOffset);
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
    const r = samplePlanetMeshSurface(runtime, dir.x, dir.y, dir.z);
    const landmark = new THREE.Group();
    landmark.position.copy(dir).multiplyScalar(r - 0.1);
    _quat.setFromUnitVectors(_up, dir);
    landmark.quaternion.copy(_quat);

    const baseMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.45, metalness: 0.6 });
    const glowMat = new THREE.MeshBasicMaterial({ color: planet.emissiveAccent });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 0.9, 8), baseMat);
    plinth.position.y = 0.4;
    landmark.add(plinth);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 7.5, 2.4), baseMat);
    tower.position.y = 4.2;
    landmark.add(tower);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), glowMat);
    beacon.position.y = 9.0;
    runtime.spinParts.push(beacon);
    landmark.add(beacon);

    runtime.detailsGroup.add(landmark);
    runtime.outpostPos = landmark.position.clone().add(runtime.group.position);
  }
}
