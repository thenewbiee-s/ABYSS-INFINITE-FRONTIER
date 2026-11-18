import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BASE_PARTS,
  ITEMS,
  SHIP_CLASSES,
} from './catalog';
import { SoundEngine } from './audio';
import {
  animateExplorerRig,
  createBaseStructureMesh,
  createExplorerModel,
  createSpacecraftModel,
  createSpaceStationModel,
  ExplorerRig,
  SpacecraftRig,
  updateSpacecraftRig,
} from './models';
import {
  createPlanetRuntime,
  PlanetRuntime,
  populatePlanetSurfaceDetails,
  samplePlanetMeshSurface,
} from './planetWorld';
import {
  canAffordBasePart,
  consumeBasePartCost,
  computeBasePowerGrid,
  stepSurvival,
} from './rules';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import {
  BasePartId,
  DiscoveryEntry,
  GamePhase,
  GraphicsSettings,
  HudTelemetry,
  PlacedStructure,
  PlanetProfile,
  PlayMode,
  SaveGameData,
  StarSystem,
} from './types';
import { generateStarSystem, samplePlanetSurfaceRadius } from './universe';

export interface EngineCallbacks {
  onTelemetry: (t: HudTelemetry) => void;
  onSyncSave: (patch: Partial<SaveGameData>) => void;
  onAddResource: (itemId: string, qty: number, source: 'mine' | 'combat') => void;
  onDiscovery: (entry: DiscoveryEntry) => void;
  onPlaceStructure: (structure: PlacedStructure, partId: BasePartId) => boolean;
  onAlert: (msg: string) => void;
  onGameOver: (reason: string) => void;
  onTogglePause: () => void;
  onToggleSystems: (tab?: 'inventory' | 'galaxy') => void;
}

interface PooledParticle {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  color: THREE.Color;
}

interface PlasmaBolt {
  active: boolean;
  fromEnemy: boolean;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
}

interface SpacePirate {
  id: string;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  maxHp: number;
  fireCooldown: number;
  windup: number;
  active: boolean;
}

interface SpaceAsteroid {
  id: string;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  hp: number;
  resourceId: string;
  active: boolean;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _mat4 = new THREE.Matrix4();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _spaceBg = new THREE.Color('#040712');

export class AbyssEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  public audio: SoundEngine;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isSoftwareGl = false;
  private textures!: ProceduralTextureSet;

  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private sunMesh!: THREE.Mesh;
  private starPoints!: THREE.Points;
  private warpStreaks!: THREE.Points;

  private explorer!: ExplorerRig;
  private spacecraft!: SpacecraftRig;
  private stationRig: { root: THREE.Group; ring: THREE.Group } | null = null;
  private miningBeam!: THREE.Mesh;
  private scanRing!: THREE.Mesh;
  private scanRingTimer = 0;

  // Pooled InstancedMesh for particles & bolts
  private particleMesh!: THREE.InstancedMesh;
  private particles: PooledParticle[] = [];
  private particleCursor = 0;
  private boltMesh!: THREE.InstancedMesh;
  private bolts: PlasmaBolt[] = [];

  // Active World Data
  private system!: StarSystem;
  private planetRuntimes: PlanetRuntime[] = [];
  private asteroids: SpaceAsteroid[] = [];
  private pirates: SpacePirate[] = [];
  private structureGroup = new THREE.Group();
  private buildPreviewGroup: THREE.Group | null = null;
  private buildPreviewPart: BasePartId = 'foundation';
  private buildPreviewCanPlace = true;
  private buildYaw = 0;

  // Mutable Gameplay State
  private phase: GamePhase = 'title';
  private playMode: PlayMode = 'on_foot';
  private saveData!: SaveGameData;

  private playerPos = new THREE.Vector3();
  private playerVel = new THREE.Vector3();
  private playerOnGround = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private playerYaw = 0;
  private tangentRefNorth = new THREE.Vector3(0, 0, -1);
  private camPitch = 0.08;
  private camYaw = 0;
  private camCurrentPos = new THREE.Vector3();
  private camCurrentLook = new THREE.Vector3();

  private shipPos = new THREE.Vector3();
  private shipVel = new THREE.Vector3();
  private shipQuat = new THREE.Quaternion();
  private shipLanded = true;
  private shipLandedPlanetId: string | null = null;
  private shipAutoLanding = false;
  private shipTakeoffGrace = 0;
  private shipFireCooldown = 0;

  private warpTimer = 0;
  private pendingWarpCoords: { x: number; y: number; z: number; index: number } | null = null;
  private pendingWarpFuelCost = 0;

  private scanTargetId: string | null = null;
  private scanProgress = 0;
  private miningTargetName: string | null = null;
  private miningTargetRatio = 0;
  private selectedHotbarIdx = 0;
  private selectedBuildPart: BasePartId = 'foundation';

  // Simulation pacing & juice
  private isMobileDevice =
    typeof window !== 'undefined' &&
    (navigator.maxTouchPoints > 0 ||
      window.matchMedia?.('(pointer: coarse)')?.matches ||
      window.innerWidth < 768);
  private frameId = 0;
  private disposed = false;
  private modalOpen = false;
  private lastTime = performance.now();
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private hudSyncTimer = 0;
  private saveSyncTimer = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private alertText: string | null = null;
  private alertTimer = 0;
  private titleAngle = 0;

  // Input state (held vs justPressed + mouse + touch)
  private heldKeys = new Set<string>();
  private justPressedKeys = new Set<string>();
  private mouseHeld = false;
  private rightMouseHeld = false;
  private pointerDeltaX = 0;
  private pointerDeltaY = 0;
  private isDraggingLook = false;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchActions = {
    jump: false,
    mine: false,
    scan: false,
    boost: false,
  };
  private raycaster = new THREE.Raycaster();

  constructor(container: HTMLElement, callbacks: EngineCallbacks, initialSave: SaveGameData) {
    this.container = container;
    this.callbacks = callbacks;
    this.saveData = initialSave;
    this.audio = new SoundEngine();

    this.initRendererAndScene();
    this.initParticlesAndPools();
    this.loadSaveState(initialSave, true);
    this.bindEvents();
    this.startLoop();
  }

  private initRendererAndScene(): void {
    this.isSoftwareGl = (() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && !this.isMobileDevice,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl
        ? 1
        : this.isMobileDevice
          ? Math.min(window.devicePixelRatio, 1.35)
          : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && !this.isMobileDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = _spaceBg.clone();
    this.scene.fog = new THREE.FogExp2('#040712', 0.00025);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    this.camera = new THREE.PerspectiveCamera(
      this.saveData.settings.fov || 70,
      (this.container.clientWidth || window.innerWidth) / (this.container.clientHeight || window.innerHeight),
      0.2,
      14000
    );

    // Warm/cool 3D outdoor lighting rig
    this.hemiLight = new THREE.HemisphereLight('#8dd5ff', '#1e293b', 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff4d6', 2.2);
    this.sunLight.position.set(1600, 1200, 900);
    this.sunLight.castShadow = !this.isSoftwareGl && !this.isMobileDevice;
    this.sunLight.shadow.mapSize.set(this.isMobileDevice ? 512 : 1024, this.isMobileDevice ? 512 : 1024);
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    const d = 95;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 600;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Sun visual sphere
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(130, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#fde68a' })
    );
    this.sunMesh.position.set(4200, 1400, -2400);
    this.scene.add(this.sunMesh);

    // Deep-space procedural starfield
    const starCount = this.isMobileDevice ? 1100 : 2400;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dist = 5200 + Math.random() * 3500;
      starPos[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = dist * Math.cos(phi);
      starPos[i * 3 + 2] = dist * Math.sin(phi) * Math.sin(theta);
      const tint = 0.75 + Math.random() * 0.25;
      starCol[i * 3] = tint;
      starCol[i * 3 + 1] = tint;
      starCol[i * 3 + 2] = 0.9 + Math.random() * 0.1;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    this.starPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 22, vertexColors: true, transparent: true, opacity: 0.9 })
    );
    this.scene.add(this.starPoints);

    // Warp streaks overlay points
    const wCount = 320;
    const wPos = new Float32Array(wCount * 3);
    for (let i = 0; i < wCount; i++) {
      wPos[i * 3] = (Math.random() - 0.5) * 90;
      wPos[i * 3 + 1] = (Math.random() - 0.5) * 90;
      wPos[i * 3 + 2] = -Math.random() * 160;
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    this.warpStreaks = new THREE.Points(
      wGeo,
      new THREE.PointsMaterial({ color: '#7dd3fc', size: 0.9, transparent: true, opacity: 0.85 })
    );
    this.warpStreaks.visible = false;
    this.camera.add(this.warpStreaks);
    this.scene.add(this.camera);

    // Explorer & Spacecraft rigs
    this.explorer = createExplorerModel(
      this.saveData.survival.suitColor,
      this.saveData.survival.visorColor,
      this.textures
    );
    this.scene.add(this.explorer.root);

    this.spacecraft = createSpacecraftModel(
      this.saveData.ship.classId,
      this.saveData.ship.primaryColor,
      this.saveData.ship.accentColor,
      this.textures
    );
    this.scene.add(this.spacecraft.root);

    // Mining laser beam mesh
    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 0.5);
    this.miningBeam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.85 })
    );
    this.miningBeam.visible = false;
    this.scene.add(this.miningBeam);

    // Scanner expanding ring
    this.scanRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 36),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    this.scanRing.visible = false;
    this.scene.add(this.scanRing);

    this.scene.add(this.structureGroup);
  }

  private initParticlesAndPools(): void {
    const pCount = 160;
    const pGeo = new THREE.OctahedronGeometry(0.24, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, pCount);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < pCount; i++) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 0,
        color: new THREE.Color('#38bdf8'),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _colorA.set('#38bdf8'));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleMesh);

    const bCount = 48;
    const bGeo = new THREE.CapsuleGeometry(0.18, 1.6, 4, 6);
    bGeo.rotateX(Math.PI / 2);
    const bMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.boltMesh = new THREE.InstancedMesh(bGeo, bMat, bCount);
    this.boltMesh.frustumCulled = false;
    for (let i = 0; i < bCount; i++) {
      this.bolts.push({
        active: false,
        fromEnemy: false,
        life: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        damage: 20,
      });
      _mat4.makeScale(0, 0, 0);
      this.boltMesh.setMatrixAt(i, _mat4);
      this.boltMesh.setColorAt(i, _colorA.set('#38bdf8'));
    }
    this.boltMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.boltMesh);
  }

  private spawnParticle(pos: THREE.Vector3, vel: THREE.Vector3, colorHex: string, scale = 1, life = 0.5): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particles.length;
    p.active = true;
    p.life = life;
    p.maxLife = life;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.scale = scale;
    p.color.set(colorHex);
  }

  private spawnBurst(pos: THREE.Vector3, colorHex: string, count = 10, speed = 8): void {
    for (let i = 0; i < count; i++) {
      _v5.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)
        .normalize()
        .multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      this.spawnParticle(pos, _v5, colorHex, 0.9 + Math.random() * 0.7, 0.35 + Math.random() * 0.35);
    }
  }

  private fireBolt(pos: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, fromEnemy: boolean): void {
    const slot = this.bolts.find((b) => !b.active);
    if (!slot) return;
    slot.active = true;
    slot.fromEnemy = fromEnemy;
    slot.life = 2.4;
    slot.pos.copy(pos);
    slot.vel.copy(dir).normalize().multiplyScalar(speed);
    slot.damage = damage;
  }

  public loadSaveState(save: SaveGameData, rebuildSystem = true): void {
    this.saveData = save;
    this.applySettings(save.settings);

    const coords = save.currentSystemCoords;
    const isHome = coords.x === 0 && coords.y === 0 && coords.z === 0;
    if (rebuildSystem || !this.system || this.system.coords.x !== coords.x || this.system.coords.z !== coords.z) {
      this.buildStarSystemScene(generateStarSystem(save.universeSeed, coords, isHome));
    }

    const targetPlanet =
      this.planetRuntimes.find((p) => p.profile.id === save.currentPlanetId) || this.planetRuntimes[0];

    const detailDensity = this.getDetailDensity();
    if (targetPlanet) {
      populatePlanetSurfaceDetails(targetPlanet, detailDensity);
      const pCenter = targetPlanet.group.position;

      // Ground player & ship cleanly on the exact rendered mesh surface
      const lp = save.playerLocalPos;
      const pDir = new THREE.Vector3(lp[0], lp[1], lp[2]).normalize();
      if (pDir.lengthSq() < 0.01) pDir.set(0, 0.968, 0.25).normalize();
      const surfR = samplePlanetMeshSurface(targetPlanet, pDir.x, pDir.y, pDir.z);
      this.playerPos.copy(pCenter).addScaledVector(pDir, surfR + 0.05);

      // Initialize continuous tangent North orthogonal to pDir
      this.tangentRefNorth.set(0, 0, -1);
      this.tangentRefNorth.addScaledVector(pDir, -this.tangentRefNorth.dot(pDir));
      if (this.tangentRefNorth.lengthSq() < 1e-4) this.tangentRefNorth.set(1, 0, 0);
      this.tangentRefNorth.normalize();
      this.camYaw = 0;
      this.camPitch = 0.06;

      const sp = save.shipLocalPos;
      const sDir = new THREE.Vector3(sp[0], sp[1], sp[2]).normalize();
      if (sDir.lengthSq() < 0.01) sDir.set(0.05, 0.968, 0.26).normalize();
      const candidateShipPos = pCenter.clone().addScaledVector(sDir, targetPlanet.profile.radius + 30);
      this.shipLanded = save.playMode !== 'in_ship';
      this.shipLandedPlanetId = targetPlanet.profile.id;
      this.playMode = save.playMode === 'build_mode' ? 'on_foot' : save.playMode;
      if (this.shipLanded) {
        const parked = this.alignShipToSurface(targetPlanet, candidateShipPos, this.tangentRefNorth);
        this.shipPos.copy(parked.pos);
        this.shipQuat.copy(parked.quat);
      } else {
        const shipSurfR = samplePlanetMeshSurface(targetPlanet, sDir.x, sDir.y, sDir.z);
        this.shipPos.copy(pCenter).addScaledVector(sDir, shipSurfR + 0.05);
        _q1.setFromUnitVectors(_up, sDir);
        this.shipQuat.copy(_q1);
      }

      // Align camera cleanly behind player facing tangentNorth
      this.camCurrentPos
        .copy(this.playerPos)
        .addScaledVector(pDir, 2.5)
        .addScaledVector(this.tangentRefNorth, -6.2);
      this.camCurrentLook.copy(this.playerPos).addScaledVector(pDir, 1.5).addScaledVector(this.tangentRefNorth, 6);
    }

    this.rebuildSpacecraftModel();
    this.rebuildExplorerColors();
    this.rebuildStructuresMesh();
  }

  private getDetailDensity(): number {
    const q = this.saveData?.settings?.quality ?? 'high';
    if (q === 'low') return 0.5;
    if (this.isMobileDevice || q === 'medium') return 0.65;
    return 1.0;
  }

  private buildStarSystemScene(system: StarSystem): void {
    // Clean previous planets, station, asteroids, pirates
    for (const pr of this.planetRuntimes) {
      this.scene.remove(pr.group);
    }
    this.planetRuntimes = [];

    if (this.stationRig) {
      this.scene.remove(this.stationRig.root);
      this.stationRig = null;
    }
    for (const ast of this.asteroids) this.scene.remove(ast.mesh);
    this.asteroids = [];
    for (const pir of this.pirates) this.scene.remove(pir.mesh);
    this.pirates = [];

    this.system = system;
    (this.sunMesh.material as THREE.MeshBasicMaterial).color.set(system.starColor);
    this.sunLight.color.set(system.starColor);

    const subdiv = this.isSoftwareGl ? 10 : this.isMobileDevice ? 14 : 20;
    const density = this.getDetailDensity();
    for (let i = 0; i < system.planets.length; i++) {
      const p = system.planets[i];
      const runtime = createPlanetRuntime(p, subdiv, this.textures);
      if (i === 0) populatePlanetSurfaceDetails(runtime, density);
      this.scene.add(runtime.group);
      this.planetRuntimes.push(runtime);
    }

    if (system.hasStation) {
      this.stationRig = createSpaceStationModel(system.starColor, this.textures);
      this.stationRig.root.position.set(
        system.stationPosition[0],
        system.stationPosition[1],
        system.stationPosition[2]
      );
      this.scene.add(this.stationRig.root);
    }

    // Spawn mineable asteroid belt between Planet 0 and Planet 1
    const p0 = system.planets[0]?.position ?? [0, 0, 0];
    const astGeo = new THREE.DodecahedronGeometry(3.8, 0);
    const astResources = [
      'ferrite_dust',
      'tritium_cluster',
      'copper_ore',
      'cobalt',
      'silver_vein',
      'gold_deposit',
      'emeril',
      'quantum_crystal',
    ];
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const dist = 520 + (i % 4) * 95;
      const pos = new THREE.Vector3(
        p0[0] + Math.cos(angle) * dist,
        p0[1] + ((i % 3) - 1) * 65,
        p0[2] + Math.sin(angle) * dist
      );
      const resId = astResources[i % astResources.length];
      const mat = new THREE.MeshStandardMaterial({
        color: ITEMS[resId]?.color || '#64748b',
        roughness: 0.68,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(astGeo, mat);
      mesh.position.copy(pos);
      mesh.scale.setScalar(0.8 + (i % 3) * 0.45);
      this.scene.add(mesh);
      this.asteroids.push({ id: `ast_${i}`, mesh, pos, hp: 45, resourceId: resId, active: true });
    }

    // Spawn 3 Pirate Drones in deep space near the station/belt
    const pirateCount = system.dangerLevel === 'High' ? 4 : 2;
    for (let i = 0; i < pirateCount; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.6, 0),
        new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.35, metalness: 0.7 })
      );
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(7.2, 0.3, 1.8),
        new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.8 })
      );
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#ef4444' })
      );
      eye.position.z = -2.1;
      g.add(body, wing, eye);
      const pos = new THREE.Vector3(
        system.stationPosition[0] + (i - 1) * 140,
        system.stationPosition[1] + 55,
        system.stationPosition[2] - 180
      );
      g.position.copy(pos);
      this.scene.add(g);
      this.pirates.push({
        id: `pir_${i}`,
        mesh: g,
        pos,
        vel: new THREE.Vector3(),
        hp: 90,
        maxHp: 90,
        fireCooldown: 1.5 + i * 0.5,
        windup: 0,
        active: true,
      });
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public getCurrentSystem(): StarSystem {
    return this.system;
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
    document.body.dataset.state = phase;
    if (phase !== 'playing') {
      this.clearAllInputs();
      this.audio.silenceLoops();
      if (document.pointerLockElement) document.exitPointerLock?.();
    } else {
      this.audio.unlock();
    }
  }

  public setModalOpen(open: boolean): void {
    this.modalOpen = open;
    if (open) {
      this.clearAllInputs();
      if (document.pointerLockElement) document.exitPointerLock?.();
    }
  }

  private clearAllInputs(): void {
    this.heldKeys.clear();
    this.mouseHeld = false;
    this.rightMouseHeld = false;
    this.isDraggingLook = false;
    this.lastClientX = null;
    this.lastClientY = null;
    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchActions.jump = false;
    this.touchActions.mine = false;
    this.touchActions.scan = false;
    this.touchActions.boost = false;
  }

  public setTouchMoveVector(x: number, y: number): void {
    this.touchMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.touchMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public addTouchLookDelta(dx: number, dy: number): void {
    if (this.phase !== 'playing' || this.modalOpen) return;
    const sens = 0.0042 * (this.saveData.settings.sensitivity || 1);
    const ySign = this.saveData.settings.invertY ? -1 : 1;
    this.pointerDeltaX += dx * sens;
    this.pointerDeltaY += dy * sens * ySign;
  }

  public setTouchAction(action: 'jump' | 'mine' | 'scan' | 'boost' | 'board' | 'build', active: boolean): void {
    if (this.phase !== 'playing') return;
    this.audio.unlock();
    if (action === 'board' && active) {
      this.justPressedKeys.add('KeyF');
      return;
    }
    if (action === 'build' && active) {
      this.toggleBuildMode();
      return;
    }
    if (action === 'jump') {
      if (active && !this.touchActions.jump) this.justPressedKeys.add('Space');
      this.touchActions.jump = active;
    } else if (action === 'mine') {
      if (active && this.playMode === 'build_mode') {
        this.tryPlaceStructure();
      }
      this.touchActions.mine = active;
    } else if (action === 'scan') {
      if (active && !this.touchActions.scan) this.justPressedKeys.add('KeyV');
      this.touchActions.scan = active;
    } else if (action === 'boost') {
      this.touchActions.boost = active;
    }
  }

  public applySettings(settings: GraphicsSettings): void {
    this.saveData.settings = { ...settings };
    if (this.camera) {
      this.camera.fov = settings.fov;
      this.camera.updateProjectionMatrix();
    }
    this.audio.setMuted(settings.muted);
    this.audio.setVolume(settings.volume);
    if (this.renderer && !this.isSoftwareGl) {
      const cap = this.isMobileDevice ? 1.35 : 2;
      const ratio =
        settings.quality === 'low' ? 1 : settings.quality === 'medium' ? Math.min(1.25, cap) : Math.min(window.devicePixelRatio, cap);
      this.renderer.setPixelRatio(ratio);
      this.renderer.shadowMap.enabled = !this.isMobileDevice && settings.quality !== 'low';
    }
  }

  public rebuildSpacecraftModel(): void {
    const pos = this.spacecraft.root.position.clone();
    const quat = this.spacecraft.root.quaternion.clone();
    this.scene.remove(this.spacecraft.root);
    this.spacecraft = createSpacecraftModel(
      this.saveData.ship.classId,
      this.saveData.ship.primaryColor,
      this.saveData.ship.accentColor,
      this.textures
    );
    this.spacecraft.root.position.copy(pos);
    this.spacecraft.root.quaternion.copy(quat);
    this.scene.add(this.spacecraft.root);
  }

  public rebuildExplorerColors(): void {
    for (const m of this.explorer.suitMaterials) m.color.set(this.saveData.survival.suitColor);
    this.explorer.visorMaterial.color.set(this.saveData.survival.visorColor);
    this.explorer.visorMaterial.emissive.set(this.saveData.survival.visorColor);
  }

  public rebuildStructuresMesh(): void {
    while (this.structureGroup.children.length > 0) {
      this.structureGroup.remove(this.structureGroup.children[0]);
    }
    for (const st of this.saveData.structures) {
      const planet = this.planetRuntimes.find((p) => p.profile.id === st.planetId);
      if (!planet) continue;
      const mesh = createBaseStructureMesh(st.partId, this.textures, false, true);
      mesh.position.set(st.position[0], st.position[1], st.position[2]).add(planet.group.position);
      const norm = new THREE.Vector3(st.normal[0], st.normal[1], st.normal[2]).normalize();
      _q1.setFromUnitVectors(_up, norm);
      _q2.setFromAxisAngle(_up, st.yaw);
      mesh.quaternion.copy(_q1).multiply(_q2);
      this.structureGroup.add(mesh);
    }
  }

  public setBuildPart(partId: BasePartId): void {
    this.selectedBuildPart = partId;
    if (this.buildPreviewGroup) {
      this.scene.remove(this.buildPreviewGroup);
      this.buildPreviewGroup = null;
    }
  }

  public toggleBuildMode(): void {
    if (this.playMode === 'in_ship' || this.playMode === 'warping') return;
    this.playMode = this.playMode === 'build_mode' ? 'on_foot' : 'build_mode';
    if (this.playMode !== 'build_mode' && this.buildPreviewGroup) {
      this.scene.remove(this.buildPreviewGroup);
      this.buildPreviewGroup = null;
    }
  }

  public selectHotbarSlot(idx: number): void {
    this.selectedHotbarIdx = Math.max(0, Math.min(4, idx));
  }

  public initiateSystemWarp(coords: { x: number; y: number; z: number; index: number }, fuelCost: number): void {
    this.pendingWarpCoords = coords;
    this.pendingWarpFuelCost = fuelCost;
    this.playMode = 'warping';
    this.warpTimer = 2.0;
    this.warpStreaks.visible = true;
    this.audio.playWarpTransition();
    this.pushAlert('HYPERDRIVE ENGAGED — TRAVERSING SUBSPACE');
  }

  public pushAlert(msg: string): void {
    this.alertText = msg;
    this.alertTimer = 3.2;
    this.callbacks.onAlert(msg);
  }

  public respawnAfterDefeat(): void {
    const starter = this.planetRuntimes[0];
    if (!starter) return;
    const pDir = new THREE.Vector3(0, 0.968, 0.25).normalize();
    const r = samplePlanetMeshSurface(starter, pDir.x, pDir.y, pDir.z);
    this.playerPos.copy(starter.group.position).addScaledVector(pDir, r + 0.15);
    const shipSpot = this.playerPos.clone().add(new THREE.Vector3(8, 0, 4));
    const parked = this.alignShipToSurface(starter, shipSpot, this.tangentRefNorth);
    this.shipPos.copy(parked.pos);
    this.shipQuat.copy(parked.quat);
    this.playMode = 'on_foot';
    this.shipLanded = true;
    this.saveData.survival.health = 100;
    this.saveData.survival.oxygen = 100;
    this.saveData.survival.hazardShield = 100;
    this.saveData.ship.hull = this.saveData.ship.maxHull;
    this.saveData.ship.shield = this.saveData.ship.maxShield;
    this.setPhase('playing');
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    dom.addEventListener('contextmenu', this.onContextMenu);
  }

  private onPointerLockChange = (): void => {
    this.lastClientX = null;
    this.lastClientY = null;
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.isMobileDevice =
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.('(pointer: coarse)')?.matches ||
      w < 768;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onWindowBlur = (): void => {
    this.clearAllInputs();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.onWindowBlur();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const code = e.code;
    if (!this.heldKeys.has(code)) {
      this.justPressedKeys.add(code);
    }
    this.heldKeys.add(code);

    if (this.phase === 'playing') {
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        this.callbacks.onTogglePause();
      } else if (code === 'Tab') {
        e.preventDefault();
        this.callbacks.onToggleSystems('inventory');
      } else if (code === 'KeyM') {
        e.preventDefault();
        this.callbacks.onToggleSystems('galaxy');
      } else if (!this.modalOpen && code === 'KeyB') {
        this.toggleBuildMode();
      } else if (!this.modalOpen && code === 'KeyR' && this.playMode === 'build_mode') {
        this.buildYaw += Math.PI / 4;
      } else if (!this.modalOpen && code === 'Digit1') this.selectHotbarSlot(0);
      else if (!this.modalOpen && code === 'Digit2') this.selectHotbarSlot(1);
      else if (!this.modalOpen && code === 'Digit3') this.selectHotbarSlot(2);
      else if (!this.modalOpen && code === 'Digit4') this.selectHotbarSlot(3);
      else if (!this.modalOpen && code === 'Digit5') this.selectHotbarSlot(4);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private requestCanvasPointerLock(): void {
    const dom = this.renderer.domElement;
    if (this.isMobileDevice || document.pointerLockElement === dom) return;
    try {
      const maybePromise = dom.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch {
      // Sandboxed iframes or browsers disallowing pointer lock fall back cleanly to free mouse-look
    }
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (this.phase !== 'playing' || this.modalOpen) return;
    this.audio.unlock();
    this.lastClientX = e.clientX;
    this.lastClientY = e.clientY;

    if (e.target === this.renderer.domElement) {
      this.requestCanvasPointerLock();
    }

    if (e.button === 0) {
      this.mouseHeld = true;
      this.isDraggingLook = true;
      if (this.playMode === 'build_mode') {
        this.tryPlaceStructure();
      }
    } else if (e.button === 2) {
      this.rightMouseHeld = true;
      this.isDraggingLook = true;
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseHeld = false;
    if (e.button === 2) this.rightMouseHeld = false;
    if (!this.mouseHeld && !this.rightMouseHeld) this.isDraggingLook = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.phase !== 'playing' || this.modalOpen) {
      this.lastClientX = null;
      this.lastClientY = null;
      return;
    }

    const dom = this.renderer.domElement;
    const isLocked = document.pointerLockElement === dom;
    const isOverCanvas = e.target === dom;

    if (!isLocked && !this.isDraggingLook && !isOverCanvas) {
      this.lastClientX = null;
      this.lastClientY = null;
      return;
    }

    let rawDx = 0;
    let rawDy = 0;
    if (isLocked) {
      rawDx = e.movementX;
      rawDy = e.movementY;
    } else {
      rawDx =
        e.movementX !== 0
          ? e.movementX
          : this.lastClientX !== null
            ? e.clientX - this.lastClientX
            : 0;
      rawDy =
        e.movementY !== 0
          ? e.movementY
          : this.lastClientY !== null
            ? e.clientY - this.lastClientY
            : 0;
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;
      // Ignore giant cursor warp on first hover entry
      if (Math.abs(rawDx) > 140 || Math.abs(rawDy) > 140) return;
    }

    const sens = 0.0028 * (this.saveData.settings.sensitivity || 1);
    const ySign = this.saveData.settings.invertY ? -1 : 1;
    this.pointerDeltaX += rawDx * sens;
    this.pointerDeltaY += rawDy * sens * ySign;
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private getNearestPlanet(): { runtime: PlanetRuntime; distCenter: number; altitude: number } {
    let best = this.planetRuntimes[0];
    let bestDist = Infinity;
    const refPos = this.playMode === 'in_ship' || this.playMode === 'warping' ? this.shipPos : this.playerPos;
    for (const pr of this.planetRuntimes) {
      const d = refPos.distanceTo(pr.group.position);
      if (d < bestDist) {
        bestDist = d;
        best = pr;
      }
    }
    const dir = _v1.copy(refPos).sub(best.group.position).normalize();
    const surfR =
      bestDist < best.profile.radius * 2.5
        ? samplePlanetMeshSurface(best, dir.x, dir.y, dir.z)
        : samplePlanetSurfaceRadius(best.profile, dir.x, dir.y, dir.z);
    return { runtime: best, distCenter: bestDist, altitude: bestDist - surfR };
  }

  /**
   * Align spacecraft 3 landing struts cleanly to rendered terrain triangles so all 3 pads touch ground flush
   * without sinking or hovering, while preserving the ship's horizontal heading.
   */
  private alignShipToSurface(
    planetRt: PlanetRuntime,
    desiredWorldPos: THREE.Vector3,
    headingFwdHint?: THREE.Vector3
  ): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const pCenter = planetRt.group.position;
    const radialUp = desiredWorldPos.clone().sub(pCenter).normalize();

    const curFwd = headingFwdHint
      ? headingFwdHint.clone()
      : new THREE.Vector3(0, 0, -1).applyQuaternion(this.shipQuat);
    curFwd.addScaledVector(radialUp, -curFwd.dot(radialUp));
    if (curFwd.lengthSq() < 1e-4) {
      curFwd.set(0, 0, -1).addScaledVector(radialUp, radialUp.z);
      if (curFwd.lengthSq() < 1e-4) curFwd.set(1, 0, 0);
    }
    curFwd.normalize();
    const right = new THREE.Vector3().crossVectors(curFwd, radialUp).normalize();

    const samplePoint = (rightOff: number, fwdOff: number): THREE.Vector3 => {
      const dir = radialUp
        .clone()
        .multiplyScalar(planetRt.profile.radius)
        .addScaledVector(right, rightOff)
        .addScaledVector(curFwd, fwdOff)
        .normalize();
      const r = samplePlanetMeshSurface(planetRt, dir.x, dir.y, dir.z);
      return pCenter.clone().addScaledVector(dir, r);
    };

    const pCenterSurf = samplePoint(0, 0);
    const pNose = samplePoint(0, 1.9);
    const pLeft = samplePoint(-1.4, -1.2);
    const pRight = samplePoint(1.4, -1.2);

    // Best-fit surface normal from the 3 landing gear pads (nose, rear-left, rear-right)
    const surfNormal = new THREE.Vector3().crossVectors(
      pLeft.clone().sub(pNose),
      pRight.clone().sub(pNose)
    );
    if (surfNormal.dot(radialUp) < 0) surfNormal.negate();
    if (surfNormal.lengthSq() < 1e-6) surfNormal.copy(radialUp);
    surfNormal.normalize();

    // Clamp excessive slope tilt to max ~26 deg from radialUp so parked ship never tips awkwardly on cliffs
    const cosTilt = THREE.MathUtils.clamp(surfNormal.dot(radialUp), -1, 1);
    const maxCos = Math.cos((26 * Math.PI) / 180);
    if (cosTilt < maxCos) {
      surfNormal.lerp(radialUp, 0.55).normalize();
    }

    const fwd = curFwd.clone().addScaledVector(surfNormal, -curFwd.dot(surfNormal)).normalize();
    const adjRight = new THREE.Vector3().crossVectors(fwd, surfNormal).normalize();
    const basis = new THREE.Matrix4().makeBasis(adjRight, surfNormal, fwd.clone().negate());
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    // Compute minimum radial lift so none of the 3 pads or fuselage center clips below terrain
    let liftH = pCenterSurf.distanceTo(pCenter);
    for (const [gx, gz] of [
      [0, -1.9],
      [-1.4, 1.2],
      [1.4, 1.2],
    ]) {
      const padWorldOffset = new THREE.Vector3(gx, 0, gz).applyQuaternion(quat);
      const padDir = pCenterSurf.clone().add(padWorldOffset).sub(pCenter).normalize();
      const padGroundR = samplePlanetMeshSurface(planetRt, padDir.x, padDir.y, padDir.z);
      // Solve r such that (pCenterSurfDir*r + padWorldOffset) has radius >= padGroundR
      const radialProj = padWorldOffset.dot(radialUp);
      const requiredCenterR = padGroundR - radialProj;
      if (requiredCenterR > liftH) liftH = requiredCenterR;
    }

    const pos = pCenter.clone().addScaledVector(radialUp, liftH + 0.03);
    return { pos, quat };
  }

  private tryPlaceStructure(): void {
    const nearest = this.getNearestPlanet();
    if (!nearest.runtime.profile.landable) return;
    if (!this.buildPreviewCanPlace || !this.buildPreviewGroup) {
      this.pushAlert('Cannot place module: invalid position or missing resources');
      return;
    }

    const planet = nearest.runtime.profile;
    const localPos = this.buildPreviewGroup.position.clone().sub(nearest.runtime.group.position);
    const norm = localPos.clone().normalize();
    const st: PlacedStructure = {
      uid: `st_${Date.now().toString(36)}_${Math.floor(Math.random() * 999)}`,
      partId: this.selectedBuildPart,
      planetId: planet.id,
      position: [localPos.x, localPos.y, localPos.z],
      normal: [norm.x, norm.y, norm.z],
      yaw: this.buildYaw,
      integrity: 100,
    };

    const ok = this.callbacks.onPlaceStructure(st, this.selectedBuildPart);
    if (ok) {
      this.audio.playBuildPlace();
      this.spawnBurst(this.buildPreviewGroup.position, '#38bdf8', 12, 6);
      this.rebuildStructuresMesh();
      this.pushAlert(`Constructed ${BASE_PARTS[this.selectedBuildPart].name}`);
    }
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      this.fpsAccum += rawDt;
      this.fpsFrames++;
      if (this.fpsAccum >= 0.5) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }

      this.update(dt);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private update(dt: number): void {
    if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) this.alertText = null;
    }

    // Rotate clouds, rings, and orbital station smoothly in all states
    for (const pr of this.planetRuntimes) {
      pr.cloudMesh.rotation.y += dt * 0.015;
    }
    if (this.stationRig) {
      this.stationRig.ring.rotation.y += dt * 0.22;
    }

    if (this.phase === 'title') {
      this.updateTitleCamera(dt);
      this.explorer.root.position.copy(this.playerPos);
      this.spacecraft.root.position.copy(this.shipPos);
      this.spacecraft.root.quaternion.copy(this.shipQuat);
      animateExplorerRig(this.explorer, dt, 0, true, false, false);
      updateSpacecraftRig(this.spacecraft, dt, 0.15, 1, false);
      this.justPressedKeys.clear();
      return;
    }

    if (this.phase !== 'playing') {
      this.pointerDeltaX = 0;
      this.pointerDeltaY = 0;
      this.justPressedKeys.clear();
      return;
    }

    // Hitstop freeze for heavy impacts while keeping visual shake ticking
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.8);
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.pointerDeltaX = 0;
      this.pointerDeltaY = 0;
      this.justPressedKeys.clear();
      return;
    }

    if (this.modalOpen) {
      this.pointerDeltaX = 0;
      this.pointerDeltaY = 0;
    }

    if (this.playMode === 'warping') {
      this.updateWarpSequence(dt);
    } else if (this.playMode === 'in_ship') {
      this.updateShipMode(dt);
    } else {
      this.updateOnFootMode(dt);
    }

    this.updateCreaturesAndWorld(dt);
    this.updateBoltsAndParticles(dt);
    this.updateAtmosphereAndSky(dt);

    // Sync save state & HUD at <= 10Hz
    this.hudSyncTimer += dt;
    this.saveSyncTimer += dt;
    if (this.hudSyncTimer >= 0.1) {
      this.hudSyncTimer = 0;
      this.emitTelemetry();
    }
    if (this.saveSyncTimer >= 1.0) {
      this.saveSyncTimer = 0;
      const nearest = this.getNearestPlanet();
      const pCenter = nearest.runtime.group.position;
      this.callbacks.onSyncSave({
        playTimeSec: this.saveData.playTimeSec + 1,
        currentPlanetId: nearest.runtime.profile.id,
        playMode: this.playMode === 'build_mode' ? 'on_foot' : this.playMode,
        playerLocalPos: [
          this.playerPos.x - pCenter.x,
          this.playerPos.y - pCenter.y,
          this.playerPos.z - pCenter.z,
        ],
        shipLocalPos: [
          this.shipPos.x - pCenter.x,
          this.shipPos.y - pCenter.y,
          this.shipPos.z - pCenter.z,
        ],
        survival: { ...this.saveData.survival },
        ship: { ...this.saveData.ship },
      });
    }

    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;
    this.justPressedKeys.clear();
  }

  private updateTitleCamera(dt: number): void {
    this.titleAngle += dt * 0.12;
    const starter = this.planetRuntimes[0];
    if (!starter) return;
    const upDir = _v1.copy(this.playerPos).sub(starter.group.position).normalize();
    const orbitOffset = _v2.set(
      Math.cos(this.titleAngle) * 26,
      11,
      Math.sin(this.titleAngle) * 26
    );
    this.camera.position.copy(this.playerPos).addScaledVector(upDir, 4).add(orbitOffset);
    this.camera.up.copy(upDir);
    this.camera.lookAt(this.shipPos.x, this.shipPos.y + 1.5, this.shipPos.z);
  }

  private updateWarpSequence(dt: number): void {
    this.warpTimer -= dt;
    const wPos = this.warpStreaks.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wPos.count; i++) {
      let z = wPos.getZ(i) + dt * 260;
      if (z > 5) z = -160;
      wPos.setZ(i, z);
    }
    wPos.needsUpdate = true;

    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 102, 5, dt);
    this.camera.updateProjectionMatrix();

    if (this.warpTimer <= 0 && this.pendingWarpCoords) {
      const target = this.pendingWarpCoords;
      this.pendingWarpCoords = null;
      this.warpStreaks.visible = false;
      this.camera.fov = this.saveData.settings.fov || 70;
      this.camera.updateProjectionMatrix();

      const nextSys = generateStarSystem(
        this.saveData.universeSeed,
        target,
        target.x === 0 && target.y === 0 && target.z === 0
      );
      this.saveData.ship.warpFuel = Math.max(0, this.saveData.ship.warpFuel - this.pendingWarpFuelCost);
      this.buildStarSystemScene(nextSys);

      // Position ship smoothly in approach orbit of Planet 0 of new system
      const destPlanet = this.planetRuntimes[0];
      populatePlanetSurfaceDetails(destPlanet);
      const approachDir = new THREE.Vector3(0.25, 0.92, 0.3).normalize();
      this.shipPos.copy(destPlanet.group.position).addScaledVector(approachDir, destPlanet.profile.radius + 170);
      this.shipVel.set(0, 0, 0);
      this.shipLanded = false;
      this.playMode = 'in_ship';

      this.callbacks.onSyncSave({
        currentSystemCoords: target,
        currentPlanetId: destPlanet.profile.id,
      });

      const sysDisc: DiscoveryEntry = {
        id: `disc_sys_${nextSys.id}`,
        kind: 'system',
        name: nextSys.name,
        planetName: destPlanet.profile.name,
        planetId: destPlanet.profile.id,
        systemName: nextSys.name,
        biome: nextSys.starClass,
        rarity: nextSys.isBinary ? 'Rare' : 'Uncommon',
        scientificNote: `Charted ${nextSys.starClass} star system in ${nextSys.regionName}.`,
        creditsAwarded: 450,
        timestamp: Date.now(),
      };
      this.callbacks.onDiscovery(sysDisc);
      this.pushAlert(`ARRIVED IN ${nextSys.name.toUpperCase()} SYSTEM`);
    }
  }

  private updateOnFootMode(dt: number): void {
    const nearest = this.getNearestPlanet();
    const planet = nearest.runtime.profile;
    const pCenter = nearest.runtime.group.position;
    populatePlanetSurfaceDetails(nearest.runtime, this.getDetailDensity());

    // Local spherical up axis
    const localUp = _v1.copy(this.playerPos).sub(pCenter).normalize();

    // Board ship with F if within 11.5m
    const distToShip = this.playerPos.distanceTo(this.shipPos);
    if (this.justPressedKeys.has('KeyF') && distToShip < 11.5) {
      this.playMode = 'in_ship';
      this.explorer.root.visible = false;
      this.miningBeam.visible = false;
      if (this.buildPreviewGroup) {
        this.scene.remove(this.buildPreviewGroup);
        this.buildPreviewGroup = null;
      }
      this.audio.playUiClick();
      this.pushAlert('SYSTEMS ONLINE — THRUSTERS READY FOR LAUNCH');
      return;
    }

    // Camera POV look update (mouse pointer-lock OR free mouse move OR touch drag OR arrow keys)
    this.camYaw += this.pointerDeltaX;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch - this.pointerDeltaY, -0.82, 0.92);
    if (this.heldKeys.has('ArrowLeft')) this.camYaw -= dt * 2.1;
    if (this.heldKeys.has('ArrowRight')) this.camYaw += dt * 2.1;
    if (this.heldKeys.has('ArrowUp')) this.camPitch = THREE.MathUtils.clamp(this.camPitch + dt * 1.4, -0.82, 0.92);
    if (this.heldKeys.has('ArrowDown')) this.camPitch = THREE.MathUtils.clamp(this.camPitch - dt * 1.4, -0.82, 0.92);

    // Parallel-transport tangent basis around spherical normal (singularity-free across whole globe)
    this.tangentRefNorth.addScaledVector(localUp, -this.tangentRefNorth.dot(localUp));
    if (this.tangentRefNorth.lengthSq() < 1e-4) {
      this.tangentRefNorth.set(0, 0, -1).addScaledVector(localUp, localUp.z);
      if (this.tangentRefNorth.lengthSq() < 1e-4) this.tangentRefNorth.set(1, 0, 0);
    }
    this.tangentRefNorth.normalize();
    const tangentNorth = this.tangentRefNorth;
    const tangentRight = _v3.crossVectors(tangentNorth, localUp).normalize();

    // Camera-relative horizontal forward & right on tangent plane
    const camDirForward = tangentNorth
      .clone()
      .multiplyScalar(Math.cos(this.camYaw))
      .addScaledVector(tangentRight, Math.sin(this.camYaw))
      .normalize();
    const camDirRight = _v5.crossVectors(camDirForward, localUp).normalize();

    // Full 3D camera aim ray for crosshair, mining, scanning, and POV pitch
    const lookDir = camDirForward
      .clone()
      .multiplyScalar(Math.cos(this.camPitch))
      .addScaledVector(localUp, Math.sin(this.camPitch))
      .normalize();

    let moveX = this.touchMoveX;
    let moveZ = this.touchMoveY;
    if (this.heldKeys.has('KeyW')) moveZ += 1;
    if (this.heldKeys.has('KeyS')) moveZ -= 1;
    if (this.heldKeys.has('KeyD')) moveX += 1;
    if (this.heldKeys.has('KeyA')) moveX -= 1;
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    const isSprinting = this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight') || this.touchActions.boost;
    const isCrouching = this.heldKeys.has('ControlLeft') || this.heldKeys.has('KeyC');
    const moveSpeed = isCrouching ? 4.2 : isSprinting ? 14.5 : 8.5;

    const wishDir = new THREE.Vector3()
      .addScaledVector(camDirForward, moveZ)
      .addScaledVector(camDirRight, moveX);
    if (wishDir.lengthSq() > 0.001) {
      wishDir.normalize();
      this.playerYaw = Math.atan2(wishDir.dot(tangentRight), wishDir.dot(tangentNorth));
    }

    // Separate vertical velocity along localUp from tangential velocity
    const vRad = this.playerVel.dot(localUp);
    const vTan = this.playerVel.clone().addScaledVector(localUp, -vRad);
    const targetTan = wishDir.multiplyScalar(moveSpeed);
    vTan.lerp(targetTan, 1 - Math.exp(-12 * dt));

    // Coyote time & jump buffering
    if (this.playerOnGround) this.coyoteTimer = 0.1;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (this.justPressedKeys.has('Space')) this.jumpBufferTimer = 0.12;
    else this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    let nextRad = vRad;
    let isJetpacking = false;
    const isInWater = planet.hasWater && !planet.waterIsLava && nearest.distCenter < planet.waterLevel;
    const jumpHeld = this.heldKeys.has('Space') || this.touchActions.jump;

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      nextRad = 7.8;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.playerOnGround = false;
      this.explorer.squashY = 1.18;
      this.audio.playTone(180, 320, 0.12, 'sine', 0.1);
    } else if (jumpHeld && !this.playerOnGround && this.saveData.survival.jetpack > 1) {
      isJetpacking = true;
      nextRad = Math.min(12.5, nextRad + 22 * dt);
      this.spawnParticle(this.playerPos.clone().addScaledVector(localUp, 0.7), localUp.clone().multiplyScalar(-4), '#38bdf8', 0.65, 0.25);
    }

    if (isInWater && jumpHeld) {
      nextRad = 5.0;
    }

    // Spherical gravity
    const g = isInWater ? planet.gravity * 0.28 : planet.gravity;
    nextRad -= g * dt;

    this.playerVel.copy(vTan).addScaledVector(localUp, nextRad);
    this.playerPos.addScaledVector(this.playerVel, dt);

    // Clamp cleanly to exact rendered triangle mesh surface (zero ground clipping!)
    const newDir = this.playerPos.clone().sub(pCenter).normalize();
    const groundR = samplePlanetMeshSurface(nearest.runtime, newDir.x, newDir.y, newDir.z);
    const distFromCenter = this.playerPos.distanceTo(pCenter);
    if (distFromCenter <= groundR + 0.06) {
      if (!this.playerOnGround && nextRad < -4) {
        this.explorer.squashY = 0.78;
        this.audio.playImpact(false);
      }
      this.playerPos.copy(pCenter).addScaledVector(newDir, groundR + 0.02);
      if (this.playerVel.dot(newDir) < 0) {
        const rad = this.playerVel.dot(newDir);
        this.playerVel.addScaledVector(newDir, -rad);
      }
      this.playerOnGround = true;
    } else {
      this.playerOnGround = false;
    }

    const isMining =
      this.playMode === 'on_foot' &&
      !this.modalOpen &&
      (this.mouseHeld || this.heldKeys.has('KeyG') || this.touchActions.mine);

    // Update explorer rig orientation aligned cleanly to spherical surface & facing direction
    const faceAngle = isMining ? this.camYaw : this.playerYaw;
    const charFwd = tangentNorth
      .clone()
      .multiplyScalar(Math.cos(faceAngle))
      .addScaledVector(tangentRight, Math.sin(faceAngle))
      .normalize();
    charFwd.addScaledVector(newDir, -charFwd.dot(newDir)).normalize();
    const charLeft = _v2.crossVectors(newDir, charFwd).normalize();
    _mat4.makeBasis(charLeft, newDir, charFwd);
    _q1.setFromRotationMatrix(_mat4);

    this.explorer.root.visible = true;
    this.explorer.root.position.copy(this.playerPos);
    this.explorer.root.quaternion.slerp(_q1, 1 - Math.exp(-16 * dt));

    const groundSpeed = vTan.length();
    if (this.playerOnGround && groundSpeed > 1.2) {
      this.audio.playFootstep();
    }
    this.audio.updateThruster(isJetpacking ? 0.65 : 0, 0.3);

    // Survival step
    const nearHydro = this.saveData.structures.some((s) => {
      if (s.planetId !== planet.id || s.partId !== 'hydroponics') return false;
      _v5.set(s.position[0], s.position[1], s.position[2]).add(pCenter);
      return _v5.distanceTo(this.playerPos) < 12;
    });
    this.saveData.survival = stepSurvival(
      this.saveData.survival,
      planet,
      dt,
      isInWater,
      isJetpacking,
      nearHydro,
      distToShip < 12
    );
    if (this.saveData.survival.health <= 0) {
      this.setPhase('gameover');
      this.callbacks.onGameOver('Suit life support failure on ' + planet.name);
      return;
    }

    // Scanning (V key, Right Mouse, or Touch Scan)
    if (this.justPressedKeys.has('KeyV') || this.heldKeys.has('KeyV') || this.rightMouseHeld || this.touchActions.scan) {
      this.performScan(nearest.runtime, dt);
    } else {
      this.scanProgress = Math.max(0, this.scanProgress - dt * 1.5);
    }
    if (this.scanRingTimer > 0) {
      this.scanRingTimer -= dt;
      const p = 1 - this.scanRingTimer / 0.85;
      this.scanRing.visible = true;
      this.scanRing.position.copy(this.playerPos).addScaledVector(newDir, 0.35);
      _q1.setFromUnitVectors(new THREE.Vector3(0, 0, 1), newDir);
      this.scanRing.quaternion.copy(_q1);
      this.scanRing.scale.setScalar(1 + p * 38);
      (this.scanRing.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.7;
    } else {
      this.scanRing.visible = false;
    }

    // Mining & Combat Tool aiming along 3D crosshair POV lookDir
    if (isMining) {
      this.performMiningOrToolAttack(nearest.runtime, lookDir, newDir, dt);
    } else {
      this.miningBeam.visible = false;
      this.miningTargetName = null;
      this.audio.updateMiningBeam(false);
    }

    animateExplorerRig(this.explorer, dt, groundSpeed, this.playerOnGround, isJetpacking, isMining);

    // Build mode holographic preview
    if (this.playMode === 'build_mode') {
      this.updateBuildPreview(nearest.runtime, camDirForward, newDir);
    }

    // Smooth 3rd-person over-shoulder camera follow + terrain guard
    const camAnchor = this.playerPos.clone().addScaledVector(newDir, 1.7);
    const camBackDist = 5.8;
    const camDesired = camAnchor
      .clone()
      .addScaledVector(lookDir, -camBackDist)
      .addScaledVector(camDirRight, 0.65)
      .addScaledVector(newDir, 0.35);

    const camDirFromCenter = camDesired.clone().sub(pCenter).normalize();
    const camMinR = samplePlanetMeshSurface(nearest.runtime, camDirFromCenter.x, camDirFromCenter.y, camDirFromCenter.z) + 1.25;
    if (camDesired.distanceTo(pCenter) < camMinR) {
      camDesired.copy(pCenter).addScaledVector(camDirFromCenter, camMinR);
    }

    const dampK = 1 - Math.exp(-16 * dt);
    this.camCurrentPos.lerp(camDesired, dampK);
    this.camCurrentLook.lerp(camAnchor.clone().addScaledVector(lookDir, 16), dampK);

    this.camera.position.copy(this.camCurrentPos);
    if (this.cameraTrauma > 0) {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    this.camera.up.copy(newDir);
    this.camera.lookAt(this.camCurrentLook);

    // Keep sun shadow frustum centered on player
    this.sunLight.target.position.copy(this.playerPos);
    this.sunLight.position.copy(this.playerPos).addScaledVector(newDir, 140).add(new THREE.Vector3(80, 40, 60));

    // Park spacecraft rig flush
    this.spacecraft.root.position.copy(this.shipPos);
    this.spacecraft.root.quaternion.copy(this.shipQuat);
    updateSpacecraftRig(this.spacecraft, dt, 0, 1, false);
  }

  private performScan(planetRt: PlanetRuntime, dt: number): void {
    if (this.scanRingTimer <= 0) {
      this.scanRingTimer = 0.85;
      this.audio.playScanPulse();
    }

    // Discover planet first if undiscovered
    if (!planetRt.profile.discovered) {
      planetRt.profile.discovered = true;
      this.callbacks.onDiscovery({
        id: `disc_pl_${planetRt.profile.id}`,
        kind: 'planet',
        name: planetRt.profile.name,
        planetName: planetRt.profile.name,
        planetId: planetRt.profile.id,
        systemName: this.system.name,
        biome: planetRt.profile.archetypeName,
        rarity: planetRt.profile.rarity,
        scientificNote: `Gravity ${planetRt.profile.gravity} m/s², ${planetRt.profile.temperatureC}°C, ${planetRt.profile.weather}.`,
        creditsAwarded: 350,
        timestamp: Date.now(),
      });
    }

    // Find closest unscanned flora, creature, or mineral within 32m
    let bestObj: { id: string; kind: 'fauna' | 'flora' | 'mineral'; name: string; rarity: DiscoveryEntry['rarity']; note: string; dist: number; mark: () => void } | null = null;
    for (const c of planetRt.creatures) {
      if (c.scanned || c.state === 'dead') continue;
      const wp = c.localPos.clone().add(planetRt.group.position);
      const d = wp.distanceTo(this.playerPos);
      if (d < 34 && (!bestObj || d < bestObj.dist)) {
        bestObj = {
          id: `disc_cr_${c.species.id}`,
          kind: 'fauna',
          name: c.species.name,
          rarity: c.species.rarity,
          note: `${c.species.diet} (${c.species.temperament}), ${c.species.bodyType}.`,
          dist: d,
          mark: () => { c.scanned = true; },
        };
      }
    }
    for (const f of planetRt.flora) {
      if (f.scanned) continue;
      const d = f.worldPos.distanceTo(this.playerPos);
      if (d < 28 && (!bestObj || d < bestObj.dist)) {
        bestObj = {
          id: `disc_fl_${f.species.id}`,
          kind: 'flora',
          name: f.species.name,
          rarity: f.species.rarity,
          note: `Rich in ${ITEMS[f.species.primaryResource]?.name ?? f.species.primaryResource}.`,
          dist: d,
          mark: () => { f.scanned = true; },
        };
      }
    }
    for (const m of planetRt.minerals) {
      if (m.scanned || m.depleted) continue;
      const d = m.worldPos.distanceTo(this.playerPos);
      if (d < 24 && (!bestObj || d < bestObj.dist)) {
        bestObj = {
          id: `disc_mn_${m.id}`,
          kind: 'mineral',
          name: m.name,
          rarity: 'Common',
          note: `Extractable ${ITEMS[m.resourceId]?.name ?? m.resourceId} deposit.`,
          dist: d,
          mark: () => { m.scanned = true; },
        };
      }
    }

    if (bestObj) {
      if (this.scanTargetId !== bestObj.id) {
        this.scanTargetId = bestObj.id;
        this.scanProgress = 0;
      }
      const speed = 1.4 + (this.saveData.survival.scannerLevel - 1) * 0.45;
      this.scanProgress = Math.min(1, this.scanProgress + dt * speed);
      if (this.scanProgress >= 1) {
        bestObj.mark();
        this.scanProgress = 0;
        this.scanTargetId = null;
        this.audio.playDiscovery();
        this.callbacks.onDiscovery({
          id: bestObj.id,
          kind: bestObj.kind,
          name: bestObj.name,
          planetName: planetRt.profile.name,
          planetId: planetRt.profile.id,
          systemName: this.system.name,
          biome: planetRt.profile.archetypeName,
          rarity: bestObj.rarity,
          scientificNote: bestObj.note,
          creditsAwarded: bestObj.kind === 'fauna' ? 280 : bestObj.kind === 'flora' ? 160 : 90,
          timestamp: Date.now(),
        });
      }
    }
  }

  private performMiningOrToolAttack(
    planetRt: PlanetRuntime,
    forward: THREE.Vector3,
    up: THREE.Vector3,
    dt: number
  ): void {
    const toolOrigin = new THREE.Vector3();
    this.explorer.toolTip.getWorldPosition(toolOrigin);

    // Find best mineral or hostile creature within 22m in forward cone
    let bestMin: { node: typeof planetRt.minerals[number]; dist: number } | null = null;
    for (const m of planetRt.minerals) {
      if (m.depleted) continue;
      const toM = m.worldPos.clone().sub(toolOrigin);
      const d = toM.length();
      if (d < 22 && toM.normalize().dot(forward) > 0.45) {
        if (!bestMin || d < bestMin.dist) bestMin = { node: m, dist: d };
      }
    }

    let bestCr: { cr: typeof planetRt.creatures[number]; dist: number } | null = null;
    for (const c of planetRt.creatures) {
      if (c.state === 'dead') continue;
      const wp = c.localPos.clone().add(planetRt.group.position);
      const toC = wp.sub(toolOrigin);
      const d = toC.length();
      if (d < 22 && toC.normalize().dot(forward) > 0.55) {
        if (!bestCr || d < bestCr.dist) bestCr = { cr: c, dist: d };
      }
    }

    const targetPoint = toolOrigin.clone().addScaledVector(forward, 16);
    if (bestMin && (!bestCr || bestMin.dist <= bestCr.dist)) {
      const m = bestMin.node;
      targetPoint.copy(m.worldPos);
      this.miningTargetName = m.name;
      const dmg = (26 + (this.saveData.survival.miningLevel - 1) * 12) * dt;
      m.hp -= dmg;
      this.miningTargetRatio = Math.max(0, m.hp / m.maxHp);
      this.audio.updateMiningBeam(true);

      if (Math.random() < 0.35) {
        this.spawnParticle(m.worldPos, up.clone().multiplyScalar(5).add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)), '#fde047', 0.6, 0.35);
      }
      if (m.hp <= 0) {
        m.depleted = true;
        m.mesh.visible = false;
        this.hitstopTimer = 0.04;
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);
        this.audio.playImpact(true);
        this.spawnBurst(m.worldPos, '#38bdf8', 16, 10);
        this.callbacks.onAddResource(m.resourceId, m.yieldQty, 'mine');
        this.miningTargetName = null;
      }
    } else if (bestCr) {
      const c = bestCr.cr;
      const wp = c.localPos.clone().add(planetRt.group.position);
      targetPoint.copy(wp).addScaledVector(up, 0.8);
      this.miningTargetName = c.species.name;
      c.hp -= 30 * dt;
      this.miningTargetRatio = Math.max(0, c.hp / c.maxHp);
      this.audio.updateMiningBeam(true);
      if (c.species.temperament === 'docile' || c.species.temperament === 'skittish') c.state = 'flee';
      else c.state = 'hunt';

      if (c.hp <= 0) {
        c.state = 'dead';
        c.rig.root.visible = false;
        this.hitstopTimer = 0.045;
        this.audio.playImpact(true);
        this.spawnBurst(wp, '#f43f5e', 14, 9);
        const dropId =
          c.species.bodyType === 'aquatic'
            ? 'kelp_sac'
            : c.species.bioluminescent
              ? 'biolum_spore'
              : 'mordite';
        this.callbacks.onAddResource(dropId, 2, 'combat');
      }
    } else {
      this.miningTargetName = null;
      this.audio.updateMiningBeam(true);
    }

    this.miningBeam.visible = true;
    this.miningBeam.position.copy(toolOrigin);
    this.miningBeam.lookAt(targetPoint);
    this.miningBeam.scale.set(1, 1, toolOrigin.distanceTo(targetPoint));
  }

  private updateBuildPreview(planetRt: PlanetRuntime, forward: THREE.Vector3, up: THREE.Vector3): void {
    const placePos = this.playerPos.clone().addScaledVector(forward, 7.5);
    const dir = placePos.clone().sub(planetRt.group.position).normalize();
    const surfR = samplePlanetMeshSurface(planetRt, dir.x, dir.y, dir.z);
    // Grid-quantized snap along local tangent coordinates
    const snappedPos = planetRt.group.position.clone().addScaledVector(dir, surfR);

    const canAfford = canAffordBasePart(this.saveData.playerInventory, this.selectedBuildPart);
    if (!this.buildPreviewGroup || this.buildPreviewPart !== this.selectedBuildPart || this.buildPreviewCanPlace !== canAfford) {
      if (this.buildPreviewGroup) this.scene.remove(this.buildPreviewGroup);
      this.buildPreviewPart = this.selectedBuildPart;
      this.buildPreviewCanPlace = canAfford;
      this.buildPreviewGroup = createBaseStructureMesh(this.selectedBuildPart, this.textures, true, canAfford);
      this.scene.add(this.buildPreviewGroup);
    }
    this.buildPreviewGroup.position.copy(snappedPos);
    _q1.setFromUnitVectors(_up, dir);
    _q2.setFromAxisAngle(_up, this.buildYaw);
    this.buildPreviewGroup.quaternion.copy(_q1).multiply(_q2);
    void up;
  }

  private updateShipMode(dt: number): void {
    const nearest = this.getNearestPlanet();
    const planet = nearest.runtime.profile;
    const pCenter = nearest.runtime.group.position;
    populatePlanetSurfaceDetails(nearest.runtime, this.getDetailDensity());
    const shipDef = SHIP_CLASSES[this.saveData.ship.classId];

    // Disembark with F ONLY when landed
    if (this.justPressedKeys.has('KeyF') && this.shipLanded) {
      this.playMode = 'on_foot';
      const localUp = this.shipPos.clone().sub(pCenter).normalize();
      const tangent = new THREE.Vector3(1, 0, 0).cross(localUp).normalize();
      if (tangent.lengthSq() < 0.01) tangent.set(0, 0, 1);
      const exitPos = this.shipPos.clone().addScaledVector(tangent, 5.5);
      const eDir = exitPos.clone().sub(pCenter).normalize();
      const eR = samplePlanetMeshSurface(nearest.runtime, eDir.x, eDir.y, eDir.z);
      this.playerPos.copy(pCenter).addScaledVector(eDir, eR + 0.08);
      this.playerVel.set(0, 0, 0);
      this.explorer.root.visible = true;
      this.audio.silenceLoops();
      this.audio.playUiClick();
      return;
    }

    const thrustInput = this.heldKeys.has('KeyW') || this.heldKeys.has('Space') || this.touchActions.jump;
    const brakeInput = this.heldKeys.has('KeyS');
    const isBoosting = (this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight') || this.touchActions.boost) && this.saveData.ship.launchFuel > 0;

    // Takeoff from landed state automatically when holding W or Space! (NO E-key!)
    if (this.shipLanded) {
      if (thrustInput) {
        if (this.saveData.ship.launchFuel <= 0) {
          this.pushAlert('OUT OF LAUNCH FUEL — CRAFT LAUNCH FUEL IN INVENTORY [TAB]');
        } else {
          this.shipLanded = false;
          this.shipAutoLanding = false;
          this.shipTakeoffGrace = 2.6;
          this.saveData.ship.launchFuel = Math.max(0, this.saveData.ship.launchFuel - 8);
          const localUp = this.shipPos.clone().sub(pCenter).normalize();
          _q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.55);
          this.shipQuat.multiply(_q1).normalize();
          this.shipVel.copy(localUp).multiplyScalar(42);
          this.shipPos.addScaledVector(localUp, 3.0);
          this.audio.playTone(90, 260, 0.45, 'sawtooth', 0.18);
          this.pushAlert('LIFTOFF — ASCENDING THROUGH ATMOSPHERE');
        }
      }
      this.spacecraft.root.position.copy(this.shipPos);
      this.spacecraft.root.quaternion.copy(this.shipQuat);
      updateSpacecraftRig(this.spacecraft, dt, 0, 1, false);
      this.audio.updateThruster(0, 0);

      // Orbit view around parked ship using camYaw & camPitch
      this.camYaw += this.pointerDeltaX;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - this.pointerDeltaY, -0.35, 0.9);
      const up = this.shipPos.clone().sub(pCenter).normalize();
      const baseFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.shipQuat).normalize();
      const baseRight = new THREE.Vector3().crossVectors(baseFwd, up).normalize();
      const orbitFwd = baseFwd
        .clone()
        .multiplyScalar(Math.cos(this.camYaw))
        .addScaledVector(baseRight, Math.sin(this.camYaw))
        .normalize();
      const lookRay = orbitFwd
        .clone()
        .multiplyScalar(Math.cos(this.camPitch))
        .addScaledVector(up, Math.sin(this.camPitch))
        .normalize();
      const desired = this.shipPos.clone().addScaledVector(lookRay, -14.5).addScaledVector(up, 3.2);
      this.camCurrentPos.lerp(desired, 1 - Math.exp(-12 * dt));
      this.camCurrentLook.lerp(this.shipPos.clone().addScaledVector(up, 1.5), 1 - Math.exp(-12 * dt));
      this.camera.position.copy(this.camCurrentPos);
      this.camera.up.copy(up);
      this.camera.lookAt(this.camCurrentLook);
      return;
    }

    this.shipTakeoffGrace = Math.max(0, this.shipTakeoffGrace - dt);

    // Responsive flight steering (mouse delta + touch joystick + keyboard A/D/Arrows/Q/E)
    const turnRate = shipDef.turnRate;
    let kbYaw = -this.touchMoveX * 1.25;
    let kbPitch = this.touchMoveY * 1.1;
    let kbRoll = 0;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) kbYaw += 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) kbYaw -= 1;
    if (this.heldKeys.has('ArrowUp')) kbPitch += 1;
    if (this.heldKeys.has('ArrowDown')) kbPitch -= 1;
    if (this.heldKeys.has('KeyQ')) kbRoll += 1;
    if (this.heldKeys.has('KeyE')) kbRoll -= 1;

    // Mouse displacement already represents integrated frame movement; apply directly scaled by turnRate
    const mouseYaw = -this.pointerDeltaX * 0.9 * turnRate;
    const mousePitch = -this.pointerDeltaY * 0.9 * turnRate;
    const totalYaw = mouseYaw + kbYaw * turnRate * dt;
    const totalPitch = mousePitch + kbPitch * turnRate * dt;
    const totalRoll = kbRoll * turnRate * 1.4 * dt + mouseYaw * 0.35;

    _q1.setFromAxisAngle(new THREE.Vector3(0, 1, 0), totalYaw);
    this.shipQuat.multiply(_q1);
    _q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), totalPitch);
    this.shipQuat.multiply(_q1);
    _q1.setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalRoll);
    this.shipQuat.multiply(_q1);
    this.shipQuat.normalize();

    const shipFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.shipQuat).normalize();
    const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.shipQuat).normalize();

    const thrusterMult = 1 + (this.saveData.ship.upgrades.thrusterLevel - 1) * 0.2;
    const targetSpeed = isBoosting
      ? shipDef.boostSpeed * thrusterMult
      : thrustInput
        ? shipDef.maxSpeed * thrusterMult
        : brakeInput
          ? 0
          : 26;

    const desiredVel = shipFwd.clone().multiplyScalar(targetSpeed);
    if ((this.heldKeys.has('Space') || this.touchActions.jump) && nearest.altitude < 160) {
      const climbUp = this.shipPos.clone().sub(pCenter).normalize();
      desiredVel.addScaledVector(climbUp, 36);
    }
    this.shipVel.lerp(desiredVel, 1 - Math.exp((brakeInput ? -6 : -3.2) * dt));
    this.shipPos.addScaledVector(this.shipVel, dt);

    if (isBoosting) {
      this.saveData.ship.launchFuel = Math.max(0, this.saveData.ship.launchFuel - 1.2 * dt);
    }

    // Weapons fire (Left click, KeyG, or Touch Mine/Fire)
    this.shipFireCooldown = Math.max(0, this.shipFireCooldown - dt);
    if (!this.modalOpen && (this.mouseHeld || this.heldKeys.has('KeyG') || this.touchActions.mine) && this.shipFireCooldown <= 0) {
      this.shipFireCooldown = 0.16;
      const dmg = shipDef.weaponDamage * (1 + (this.saveData.ship.upgrades.weaponLevel - 1) * 0.3);
      const wingOff = new THREE.Vector3(1.5, 0, -2).applyQuaternion(this.shipQuat);
      this.fireBolt(this.shipPos.clone().add(wingOff), shipFwd, 420, dmg, false);
      this.fireBolt(this.shipPos.clone().sub(wingOff), shipFwd, 420, dmg, false);
      this.audio.playLaserBolt();
    }

    // Precision Planetary Landing & 3-Point Surface Parking
    const nextNearest = this.getNearestPlanet();
    const speed = this.shipVel.length();
    const dirFromCenter = this.shipPos.clone().sub(nextNearest.runtime.group.position).normalize();
    const surfR = samplePlanetMeshSurface(nextNearest.runtime, dirFromCenter.x, dirFromCenter.y, dirFromCenter.z);
    const alt = this.shipPos.distanceTo(nextNearest.runtime.group.position) - surfR;

    const overWater =
      nextNearest.runtime.profile.hasWater && surfR < nextNearest.runtime.profile.waterLevel + 0.45;
    const manualLandRequest =
      (this.justPressedKeys.has('KeyL') || this.justPressedKeys.has('KeyF')) &&
      this.shipTakeoffGrace <= 0 &&
      nextNearest.runtime.profile.landable &&
      !overWater &&
      alt < 34;

    const canAutoLand =
      manualLandRequest ||
      (this.shipTakeoffGrace <= 0 &&
        nextNearest.runtime.profile.landable &&
        !overWater &&
        alt < 18 &&
        speed < 85 &&
        !thrustInput);

    if (canAutoLand || this.shipAutoLanding) {
      this.shipAutoLanding = true;
      this.shipVel.multiplyScalar(Math.exp(-7.5 * dt));
      const parked = this.alignShipToSurface(nextNearest.runtime, this.shipPos);
      this.shipPos.lerp(parked.pos, 1 - Math.exp(-6.5 * dt));
      this.shipQuat.slerp(parked.quat, 1 - Math.exp(-7.5 * dt));

      if (this.shipPos.distanceTo(parked.pos) < 0.75) {
        this.shipPos.copy(parked.pos);
        this.shipVel.set(0, 0, 0);
        this.shipQuat.copy(parked.quat);
        this.shipLanded = true;
        this.shipAutoLanding = false;
        this.shipLandedPlanetId = nextNearest.runtime.profile.id;
        this.audio.playImpact(false);
        this.pushAlert(`LANDED ON ${nextNearest.runtime.profile.name.toUpperCase()} — PRESS [F] TO DISEMBARK`);

        if (!nextNearest.runtime.profile.discovered) {
          nextNearest.runtime.profile.discovered = true;
          this.callbacks.onDiscovery({
            id: `disc_pl_${nextNearest.runtime.profile.id}`,
            kind: 'planet',
            name: nextNearest.runtime.profile.name,
            planetName: nextNearest.runtime.profile.name,
            planetId: nextNearest.runtime.profile.id,
            systemName: this.system.name,
            biome: nextNearest.runtime.profile.archetypeName,
            rarity: nextNearest.runtime.profile.rarity,
            scientificNote: `First landing completed. Gravity ${nextNearest.runtime.profile.gravity} m/s².`,
            creditsAwarded: 500,
            timestamp: Date.now(),
          });
        }
      }
    } else if (alt < 2.2) {
      if (nextNearest.runtime.profile.landable && !overWater && speed < 92) {
        // Gentle touchdown initiates clean surface parking instead of bouncing into orbit!
        this.shipAutoLanding = true;
        this.shipVel.multiplyScalar(0.35);
      } else {
        // Soft collision bounce off non-landing terrain / ocean / gas giant cloud deck
        this.shipPos.copy(nextNearest.runtime.group.position).addScaledVector(dirFromCenter, surfR + 2.5);
        const radV = this.shipVel.dot(dirFromCenter);
        if (radV < 0) this.shipVel.addScaledVector(dirFromCenter, -radV * 1.15);
      }
    }

    // Shield passive regen
    this.saveData.ship.shield = Math.min(this.saveData.ship.maxShield, this.saveData.ship.shield + 4 * dt);

    // Visuals & thruster audio
    this.spacecraft.root.position.copy(this.shipPos);
    this.spacecraft.root.quaternion.copy(this.shipQuat);
    const gearTarget = alt < 30 && nextNearest.runtime.profile.landable ? 1 : 0;
    const thrustNorm = Math.min(1, speed / shipDef.maxSpeed);
    updateSpacecraftRig(this.spacecraft, dt, thrustNorm, gearTarget, isBoosting);
    this.audio.updateThruster(thrustInput || isBoosting ? 0.9 : 0.25, isBoosting ? 1 : 0);

    // Exhaust particles
    if ((thrustInput || isBoosting) && Math.random() < 0.7) {
      const exhaustPos = this.shipPos.clone().addScaledVector(shipFwd, -3.2);
      this.spawnParticle(exhaustPos, shipFwd.clone().multiplyScalar(-18), isBoosting ? '#c084fc' : '#38bdf8', 0.85, 0.3);
    }

    // Ship chase camera + FOV boost kick
    const desiredCamPos = this.shipPos.clone().addScaledVector(shipFwd, -15.5).addScaledVector(shipUp, 4.6);
    const desiredLook = this.shipPos.clone().addScaledVector(shipFwd, 18);
    this.camCurrentPos.lerp(desiredCamPos, 1 - Math.exp(-9 * dt));
    this.camCurrentLook.lerp(desiredLook, 1 - Math.exp(-12 * dt));
    this.camera.position.copy(this.camCurrentPos);
    this.camera.up.lerp(shipUp, 1 - Math.exp(-6 * dt)).normalize();
    this.camera.lookAt(this.camCurrentLook);

    const targetFov = (this.saveData.settings.fov || 70) + (isBoosting ? 18 : thrustInput ? 6 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateCreaturesAndWorld(dt: number): void {
    const nearest = this.getNearestPlanet();
    if (nearest.altitude > 140) return;

    const planet = nearest.runtime.profile;
    const pCenter = nearest.runtime.group.position;

    for (const c of nearest.runtime.creatures) {
      if (c.state === 'dead') continue;
      const worldPos = c.localPos.clone().add(pCenter);
      const distPlayer = worldPos.distanceTo(this.playerPos);
      const dir = c.localPos.clone().normalize();
      const refFwd = Math.abs(dir.y) < 0.92 ? _v2.set(0, 1, 0) : _v2.set(0, 0, 1);
      const east = _v3.crossVectors(refFwd, dir).normalize();
      const north = _v4.crossVectors(dir, east).normalize();

      c.stateTimer -= dt;
      if (c.species.temperament === 'predator' && distPlayer < 24 && this.playMode === 'on_foot') {
        if (distPlayer < 3.4 && c.state !== 'windup') {
          c.state = 'windup';
          c.windupTimer = 0.45;
          this.audio.playTone(320, 520, 0.25, 'sawtooth', 0.08);
        } else if (c.state !== 'windup') {
          c.state = 'hunt';
        }
      } else if (c.species.temperament === 'skittish' && distPlayer < 14 && this.playMode === 'on_foot') {
        c.state = 'flee';
      } else if (c.stateTimer <= 0) {
        c.state = 'roam';
        c.stateTimer = 2.5 + Math.random() * 4;
        c.heading += (Math.random() - 0.5) * 2.2;
      }

      if (c.state === 'windup') {
        c.windupTimer -= dt;
        // Visual windup scale telegraph
        c.rig.body.scale.setScalar(1 + Math.sin(performance.now() * 0.03) * 0.14);
        if (c.windupTimer <= 0) {
          c.rig.body.scale.setScalar(1);
          c.state = 'hunt';
          if (distPlayer < 4.5 && this.playMode === 'on_foot') {
            this.saveData.survival.health = Math.max(0, this.saveData.survival.health - 12);
            this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.5);
            this.audio.playImpact(true);
            this.pushAlert(`PREDATOR STRIKE BY ${c.species.name.toUpperCase()}`);
          }
        }
      } else {
        c.rig.body.scale.setScalar(1);
        let speed = c.species.speed * 0.45;
        if (c.state === 'hunt') {
          const toP = this.playerPos.clone().sub(worldPos);
          c.heading = Math.atan2(toP.dot(east), toP.dot(north));
          speed = c.species.speed;
        } else if (c.state === 'flee') {
          const awayP = worldPos.clone().sub(this.playerPos);
          c.heading = Math.atan2(awayP.dot(east), awayP.dot(north));
          speed = c.species.speed * 1.15;
        }

        const moveTan = north.clone().multiplyScalar(Math.cos(c.heading)).addScaledVector(east, Math.sin(c.heading));
        c.localPos.addScaledVector(moveTan, speed * dt);
        const newDir = c.localPos.clone().normalize();
        const r = samplePlanetMeshSurface(nearest.runtime, newDir.x, newDir.y, newDir.z);
        const nowSec = performance.now() * 0.003;
        let hover = 0.03;
        if (c.species.bodyType === 'flyer') {
          hover = 7.5 + Math.sin(nowSec + c.rig.phase) * 1.6;
        } else if (c.species.bodyType === 'floater') {
          hover = 1.1 + Math.sin(nowSec * 0.8 + c.rig.phase) * 0.45;
        } else if (c.species.bodyType === 'aquatic' && planet.hasWater && !planet.waterIsLava && r < planet.waterLevel - 0.4) {
          hover = Math.max(0.35, (planet.waterLevel - r) * 0.52 + Math.sin(nowSec + c.rig.phase) * 0.25);
        }
        c.localPos.copy(newDir).multiplyScalar(r + hover);

        c.rig.root.position.copy(c.localPos);
        _q1.setFromUnitVectors(_up, newDir);
        _q2.setFromAxisAngle(_up, c.heading + Math.PI);
        c.rig.root.quaternion.copy(_q1).multiply(_q2);

        // Animate limbs, wings, tentacles, and aquatic tail fins
        c.rig.phase += dt * speed * 1.8;
        for (let i = 0; i < c.rig.legs.length; i++) {
          c.rig.legs[i].rotation.x = Math.sin(c.rig.phase + i * Math.PI) * 0.55;
        }
        for (let i = 0; i < c.rig.wings.length; i++) {
          const sign = i === 0 ? 1 : -1;
          c.rig.wings[i].rotation.z = Math.sin(c.rig.phase * 1.6) * 0.52 * sign;
        }
        for (let i = 0; i < c.rig.tentacles.length; i++) {
          c.rig.tentacles[i].rotation.x = Math.sin(c.rig.phase * 0.7 + i * 1.1) * 0.28;
          c.rig.tentacles[i].rotation.z = Math.cos(c.rig.phase * 0.6 + i * 0.9) * 0.22;
        }
        if (c.rig.tailFin) {
          c.rig.tailFin.rotation.y = Math.sin(c.rig.phase * 1.8) * (c.species.bodyType === 'aquatic' ? 0.48 : 0.24);
        }
      }
    }

    // Spin levitating crystal cores & ancient glyphs gently
    for (const part of nearest.runtime.spinParts) {
      part.rotation.y += dt * 1.3;
    }
  }

  private updateBoltsAndParticles(dt: number): void {
    // Update space pirates AI in space
    for (const pir of this.pirates) {
      if (!pir.active) continue;
      pir.mesh.rotation.y += dt * 0.8;
      const d = pir.pos.distanceTo(this.shipPos);
      if (this.playMode === 'in_ship' && d < 520) {
        const toShip = this.shipPos.clone().sub(pir.pos).normalize();
        if (d > 95) pir.pos.addScaledVector(toShip, 38 * dt);
        pir.mesh.position.copy(pir.pos);
        pir.mesh.lookAt(this.shipPos);
        pir.fireCooldown -= dt;
        if (pir.fireCooldown <= 0) {
          pir.fireCooldown = 2.1;
          this.fireBolt(pir.pos, toShip, 220, 14, true);
        }
      }
    }

    // Update bolts
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.active) {
        _mat4.makeScale(0, 0, 0);
        this.boltMesh.setMatrixAt(i, _mat4);
        continue;
      }
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      if (b.life <= 0) {
        b.active = false;
        continue;
      }

      if (!b.fromEnemy) {
        // Check asteroid hits
        for (const ast of this.asteroids) {
          if (!ast.active) continue;
          if (b.pos.distanceTo(ast.pos) < 6.5) {
            b.active = false;
            ast.hp -= b.damage;
            this.spawnBurst(b.pos, '#facc15', 8, 12);
            if (ast.hp <= 0) {
              ast.active = false;
              ast.mesh.visible = false;
              this.hitstopTimer = 0.04;
              this.audio.playImpact(true);
              this.spawnBurst(ast.pos, '#38bdf8', 18, 16);
              this.callbacks.onAddResource(ast.resourceId, 5, 'mine');
            }
            break;
          }
        }
        // Check pirate hits
        if (b.active) {
          for (const pir of this.pirates) {
            if (!pir.active) continue;
            if (b.pos.distanceTo(pir.pos) < 5.5) {
              b.active = false;
              pir.hp -= b.damage;
              this.spawnBurst(b.pos, '#fb923c', 10, 14);
              if (pir.hp <= 0) {
                pir.active = false;
                pir.mesh.visible = false;
                this.hitstopTimer = 0.055;
                this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.45);
                this.audio.playImpact(true);
                this.spawnBurst(pir.pos, '#f43f5e', 24, 22);
                this.callbacks.onAddResource('nano_alloy', 2, 'combat');
                this.pushAlert('HOSTILE INTERCEPTOR DESTROYED (+2 NANO-ALLOY)');
              }
              break;
            }
          }
        }
      } else if (this.playMode === 'in_ship' && b.pos.distanceTo(this.shipPos) < 4.5) {
        b.active = false;
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.4);
        this.audio.playImpact(true);
        if (this.saveData.ship.shield > 0) {
          this.saveData.ship.shield = Math.max(0, this.saveData.ship.shield - b.damage);
        } else {
          this.saveData.ship.hull = Math.max(0, this.saveData.ship.hull - b.damage);
          if (this.saveData.ship.hull <= 0) {
            this.setPhase('gameover');
            this.callbacks.onGameOver('Starship hull destroyed in orbital combat');
          }
        }
      }

      if (b.active) {
        _q1.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.vel.clone().normalize());
        _mat4.compose(b.pos, _q1, _v5.set(1, 1, 1));
        this.boltMesh.setMatrixAt(i, _mat4);
        this.boltMesh.setColorAt(i, _colorA.set(b.fromEnemy ? '#ef4444' : '#38bdf8'));
      }
    }
    this.boltMesh.instanceMatrix.needsUpdate = true;
    if (this.boltMesh.instanceColor) this.boltMesh.instanceColor.needsUpdate = true;

    // Update particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) {
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      const s = p.scale * (p.life / p.maxLife);
      _mat4.compose(p.pos, _q1.identity(), _v5.set(s, s, s));
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private updateAtmosphereAndSky(dt: number): void {
    const refPos = this.playMode === 'in_ship' || this.playMode === 'warping' ? this.shipPos : this.playerPos;
    for (const pr of this.planetRuntimes) {
      if (pr.detailsPopulated) {
        const dist = refPos.distanceTo(pr.group.position);
        pr.detailsGroup.visible = dist < pr.profile.radius * 4.5;
      }
    }

    const nearest = this.getNearestPlanet();
    const planet = nearest.runtime.profile;
    // Continuous transition from planetary atmosphere (0..120m) to deep space (>120m)!
    const atmoFactor = THREE.MathUtils.clamp(1 - nearest.altitude / 120, 0, 1) * planet.atmosphereStrength;

    _colorA.copy(_spaceBg);
    _colorB.set(planet.skyHorizon);
    _colorA.lerp(_colorB, atmoFactor);

    (this.scene.background as THREE.Color).lerp(_colorA, 1 - Math.exp(-6 * dt));
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.scene.background as THREE.Color);
    fog.density = THREE.MathUtils.lerp(0.00018, 0.0038, atmoFactor);

    const starMat = this.starPoints.material as THREE.PointsMaterial;
    starMat.opacity = THREE.MathUtils.clamp(1 - atmoFactor * 0.9, 0.08, 0.95);
  }

  private emitTelemetry(): void {
    const nearest = this.getNearestPlanet();
    const planet = nearest.runtime.profile;
    const speed =
      this.playMode === 'in_ship' ? this.shipVel.length() : this.playerVel.length();
    const inAtmosphere = nearest.altitude < 120;
    const canAutoLand =
      this.playMode === 'in_ship' &&
      !this.shipLanded &&
      planet.landable &&
      nearest.altitude < 22 &&
      speed < 75;

    const nearStation = Boolean(
      this.stationRig && this.shipPos.distanceTo(this.stationRig.root.position) < 120
    );
    const nearOutpost = Boolean(
      nearest.runtime.outpostPos && this.playerPos.distanceTo(nearest.runtime.outpostPos) < 22
    );
    const grid = computeBasePowerGrid(this.saveData.structures, planet.id);
    const piratesNearby = this.pirates.filter(
      (p) => p.active && p.pos.distanceTo(this.shipPos) < 420
    ).length;

    const heading = ((Math.round((this.camYaw * 180) / Math.PI) % 360) + 360) % 360;

    this.callbacks.onTelemetry({
      playMode: this.playMode,
      fps: this.currentFps,
      speed: Math.round(speed),
      altitude: Math.max(0, Math.round(nearest.altitude)),
      nearestPlanetId: planet.id,
      nearestPlanetName: planet.name,
      nearestPlanetType: planet.archetypeName,
      nearestPlanetGravity: planet.gravity,
      nearestPlanetTemp: planet.temperatureC,
      nearestPlanetWeather: planet.weather,
      nearestPlanetHazard: planet.hazard,
      inAtmosphere,
      canAutoLand,
      nearShip: this.playerPos.distanceTo(this.shipPos) < 11.5,
      nearStation,
      nearOutpost,
      scanTargetName: this.scanTargetId ? 'Scanning Signature...' : null,
      scanTargetKind: null,
      scanTargetProgress: this.scanProgress,
      miningTargetName: this.miningTargetName,
      miningTargetHpRatio: this.miningTargetRatio,
      alertMessage: this.alertText,
      compassHeadingDeg: heading,
      shipDistance: Math.round(this.playerPos.distanceTo(this.shipPos)),
      powerProduced: grid.produced,
      powerConsumed: grid.consumed,
      selectedHotbarIdx: this.selectedHotbarIdx,
      selectedBuildPart: this.selectedBuildPart,
      canPlaceBuild: this.buildPreviewCanPlace,
      warpChargeProgress: this.playMode === 'warping' ? 1 - this.warpTimer / 2.0 : 0,
      piratesNearby,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    const dom = this.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('mousedown', this.onMouseDown);
      dom.removeEventListener('contextmenu', this.onContextMenu);
      dom.remove();
    }
    this.audio.dispose();
    this.renderer?.dispose();
  }
}

// Re-export consumeBasePartCost so UI/App share exact builder checks
export { consumeBasePartCost };
