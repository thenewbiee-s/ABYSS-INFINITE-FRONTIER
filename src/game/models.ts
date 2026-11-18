import * as THREE from 'three';
import {
  BasePartId,
  CreatureSpecies,
  FloraSpecies,
  ShipClassId,
} from './types';
import { ProceduralTextureSet } from './textures';

export interface ExplorerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  jetGlowL: THREE.Mesh;
  jetGlowR: THREE.Mesh;
  toolTip: THREE.Mesh;
  suitMaterials: THREE.MeshStandardMaterial[];
  visorMaterial: THREE.MeshPhysicalMaterial;
  gaitPhase: number;
  squashY: number;
}

export function createExplorerModel(
  suitColor = '#e2e8f0',
  visorColor = '#38bdf8',
  textures?: ProceduralTextureSet
): ExplorerRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const suitMat = new THREE.MeshStandardMaterial({
    color: suitColor,
    roughness: 0.38,
    metalness: 0.28,
    bumpMap: textures?.hullBump ?? null,
    bumpScale: 0.015,
  });
  const undersuitMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.82,
    metalness: 0.1,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#f97316',
    roughness: 0.35,
    metalness: 0.6,
  });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: visorColor,
    emissive: visorColor,
    emissiveIntensity: 0.55,
    roughness: 0.1,
    metalness: 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.0,
  });

  // Contact shadow disc grounded at y=0.02
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#000000',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(new THREE.CircleGeometry(0.52, 20), shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // Torso group (hip pivot at y=0.92)
  const torso = new THREE.Group();
  torso.position.y = 0.92;
  bodyPivot.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.58, 0.34), suitMat);
  chest.position.y = 0.34;
  chest.castShadow = true;
  torso.add(chest);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.22, 10), undersuitMat);
  waist.position.y = 0.04;
  torso.add(waist);

  const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.36), trimMat);
  chestStripe.position.y = 0.48;
  torso.add(chestStripe);

  // Life support backpack + twin O2 tanks + jetpack nozzles
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.24), suitMat);
  pack.position.set(0, 0.35, -0.27);
  pack.castShadow = true;
  torso.add(pack);

  const tankGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.46, 10);
  const tankL = new THREE.Mesh(tankGeo, trimMat);
  tankL.position.set(-0.12, 0.36, -0.37);
  torso.add(tankL);
  const tankR = new THREE.Mesh(tankGeo, trimMat);
  tankR.position.set(0.12, 0.36, -0.37);
  torso.add(tankR);

  const nozzleGeo = new THREE.ConeGeometry(0.07, 0.16, 8);
  const nozL = new THREE.Mesh(nozzleGeo, undersuitMat);
  nozL.position.set(-0.14, 0.08, -0.33);
  nozL.rotation.x = 0.2;
  torso.add(nozL);
  const nozR = new THREE.Mesh(nozzleGeo, undersuitMat);
  nozR.position.set(0.14, 0.08, -0.33);
  nozR.rotation.x = 0.2;
  torso.add(nozR);

  const jetFlameGeo = new THREE.ConeGeometry(0.06, 0.35, 8);
  jetFlameGeo.rotateX(Math.PI);
  const jetGlowL = new THREE.Mesh(jetFlameGeo, glowMat);
  jetGlowL.position.set(-0.14, -0.14, -0.37);
  torso.add(jetGlowL);
  const jetGlowR = new THREE.Mesh(jetFlameGeo, glowMat.clone());
  jetGlowR.position.set(0.14, -0.14, -0.37);
  torso.add(jetGlowR);

  // Helmet + Visor
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0);
  torso.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 14), suitMat);
  helmet.position.y = 0.14;
  helmet.castShadow = true;
  head.add(helmet);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12, 0, Math.PI, 0.3, 1.4), visorMat);
  visor.position.set(0, 0.14, 0.065);
  visor.rotation.y = -Math.PI / 2;
  head.add(visor);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), trimMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.01;
  head.add(collar);

  // Arms + Multi-tool
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.42, 4, 8);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.37, 0.56, 0);
  torso.add(leftArm);
  const leftArmMesh = new THREE.Mesh(armGeo, undersuitMat);
  leftArmMesh.position.y = -0.24;
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  const leftPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), suitMat);
  leftArm.add(leftPauldron);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.37, 0.56, 0);
  torso.add(rightArm);
  const rightArmMesh = new THREE.Mesh(armGeo, undersuitMat);
  rightArmMesh.position.y = -0.24;
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  const rightPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), suitMat);
  rightArm.add(rightPauldron);

  // Multi-tool scanner/mining rifle in right hand
  const toolGroup = new THREE.Group();
  toolGroup.position.set(0, -0.48, 0.24);
  const toolBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.44), trimMat);
  toolGroup.add(toolBody);
  const toolBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 8), undersuitMat);
  toolBarrel.rotation.x = Math.PI / 2;
  toolBarrel.position.z = 0.26;
  toolGroup.add(toolBarrel);
  const toolTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshBasicMaterial({ color: '#22d3ee' })
  );
  toolTip.position.z = 0.37;
  toolGroup.add(toolTip);
  rightArm.add(toolGroup);

  // Legs + Boots (grounded flush at y=0)
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.56, 4, 8);
  const bootGeo = new THREE.BoxGeometry(0.2, 0.16, 0.32);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0.86, 0);
  bodyPivot.add(leftLeg);
  const leftLegMesh = new THREE.Mesh(legGeo, undersuitMat);
  leftLegMesh.position.y = -0.38;
  leftLegMesh.castShadow = true;
  leftLeg.add(leftLegMesh);
  const leftBoot = new THREE.Mesh(bootGeo, suitMat);
  leftBoot.position.set(0, -0.78, 0.05);
  leftBoot.castShadow = true;
  leftLeg.add(leftBoot);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0.86, 0);
  bodyPivot.add(rightLeg);
  const rightLegMesh = new THREE.Mesh(legGeo, undersuitMat);
  rightLegMesh.position.y = -0.38;
  rightLegMesh.castShadow = true;
  rightLeg.add(rightLegMesh);
  const rightBoot = new THREE.Mesh(bootGeo, suitMat);
  rightBoot.position.set(0, -0.78, 0.05);
  rightBoot.castShadow = true;
  rightLeg.add(rightBoot);

  return {
    root,
    bodyPivot,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    jetGlowL,
    jetGlowR,
    toolTip,
    suitMaterials: [suitMat],
    visorMaterial: visorMat,
    gaitPhase: 0,
    squashY: 1,
  };
}

export function animateExplorerRig(
  rig: ExplorerRig,
  dt: number,
  speed: number,
  isGrounded: boolean,
  isJetpacking: boolean,
  isMiningOrScanning: boolean
): void {
  const moveFactor = Math.min(1, speed / 9);
  if (isGrounded && speed > 0.3) {
    rig.gaitPhase += dt * (4.5 + speed * 0.85);
    const swing = Math.sin(rig.gaitPhase) * 0.65 * moveFactor;
    rig.leftLeg.rotation.x = swing;
    rig.rightLeg.rotation.x = -swing;
    rig.leftArm.rotation.x = -swing * 0.7;
    rig.rightArm.rotation.x = isMiningOrScanning ? -1.25 : swing * 0.45;
    rig.torso.position.y = 0.92 + Math.abs(Math.cos(rig.gaitPhase)) * 0.045 * moveFactor;
  } else if (!isGrounded) {
    rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, 0.3, 8, dt);
    rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, -0.25, 8, dt);
    rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, -0.45, 8, dt);
    rig.rightArm.rotation.x = THREE.MathUtils.damp(
      rig.rightArm.rotation.x,
      isMiningOrScanning ? -1.25 : -0.35,
      8,
      dt
    );
  } else {
    rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, 0, 10, dt);
    rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, 0, 10, dt);
    rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, 0, 10, dt);
    rig.rightArm.rotation.x = THREE.MathUtils.damp(
      rig.rightArm.rotation.x,
      isMiningOrScanning ? -1.25 : 0,
      10,
      dt
    );
    rig.torso.position.y = 0.92 + Math.sin(performance.now() * 0.002) * 0.015;
  }

  // Jetpack flames
  const jMatL = rig.jetGlowL.material as THREE.MeshBasicMaterial;
  const jMatR = rig.jetGlowR.material as THREE.MeshBasicMaterial;
  const targetOp = isJetpacking ? 0.85 : 0.0;
  jMatL.opacity = THREE.MathUtils.damp(jMatL.opacity, targetOp, 14, dt);
  jMatR.opacity = jMatL.opacity;
  const flameScale = isJetpacking ? 0.9 + Math.random() * 0.45 : 0.2;
  rig.jetGlowL.scale.set(1, flameScale, 1);
  rig.jetGlowR.scale.set(1, flameScale, 1);

  // Squash & stretch recovery
  rig.squashY = THREE.MathUtils.damp(rig.squashY, 1.0, 11, dt);
  const xzScale = 1 / Math.sqrt(Math.max(0.65, rig.squashY));
  rig.bodyPivot.scale.set(xzScale, rig.squashY, xzScale);
}

export interface SpacecraftRig {
  root: THREE.Group;
  hullMesh: THREE.Group;
  gearGroup: THREE.Group;
  gearStruts: THREE.Group[];
  thrusterFlames: THREE.Mesh[];
  hullMaterials: THREE.MeshStandardMaterial[];
  accentMaterials: THREE.MeshStandardMaterial[];
  gearDeploy: number;
}

export function createSpacecraftModel(
  classId: ShipClassId,
  primaryColor: string,
  accentColor: string,
  textures?: ProceduralTextureSet
): SpacecraftRig {
  const root = new THREE.Group();
  const hullMesh = new THREE.Group();
  root.add(hullMesh);

  const hullMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.34,
    metalness: 0.65,
    bumpMap: textures?.hullBump ?? null,
    bumpScale: 0.02,
    roughnessMap: textures?.hullRoughness ?? null,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.3,
    metalness: 0.55,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.65,
    metalness: 0.75,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: '#0f172a',
    emissive: '#0c4a6e',
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });

  // Beveled main fuselage silhouette via ExtrudeGeometry (nose pointing -Z)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(0, -3.4);
  bodyShape.lineTo(0.85, -1.2);
  bodyShape.lineTo(1.15, 1.6);
  bodyShape.lineTo(0.65, 2.7);
  bodyShape.lineTo(-0.65, 2.7);
  bodyShape.lineTo(-1.15, 1.6);
  bodyShape.lineTo(-0.85, -1.2);
  bodyShape.closePath();

  const fuselageGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 0.75,
    bevelEnabled: true,
    bevelThickness: 0.22,
    bevelSize: 0.18,
    bevelSegments: 2,
  });
  fuselageGeo.rotateX(Math.PI / 2);
  fuselageGeo.translate(0, 1.35, 0);
  const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  hullMesh.add(fuselage);

  // Glazed cockpit canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.74, 16, 12), canopyMat);
  canopy.scale.set(0.85, 0.62, 1.85);
  canopy.position.set(0, 1.55, -0.45);
  hullMesh.add(canopy);

  // Class-specific wings & pods
  const wingShape = new THREE.Shape();
  if (classId === 'fighter' || classId === 'exotic') {
    wingShape.moveTo(0.8, -0.8);
    wingShape.lineTo(4.2, 1.5);
    wingShape.lineTo(3.8, 2.2);
    wingShape.lineTo(0.9, 1.7);
  } else if (classId === 'hauler' || classId === 'transport') {
    wingShape.moveTo(0.9, -1.1);
    wingShape.lineTo(3.5, -0.2);
    wingShape.lineTo(3.5, 2.0);
    wingShape.lineTo(0.9, 2.3);
  } else {
    wingShape.moveTo(0.85, -0.6);
    wingShape.lineTo(3.8, 0.7);
    wingShape.lineTo(3.6, 1.75);
    wingShape.lineTo(0.9, 1.9);
  }
  wingShape.closePath();

  const wingGeoR = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 1,
  });
  wingGeoR.rotateX(Math.PI / 2);
  const wingR = new THREE.Mesh(wingGeoR, accentMat);
  wingR.position.set(0, 1.12, 0);
  wingR.castShadow = true;
  hullMesh.add(wingR);

  const wingL = wingR.clone();
  wingL.scale.x = -1;
  hullMesh.add(wingL);

  // Exotic halo ring or Scientific twin dishes or Hauler cargo pods
  if (classId === 'exotic') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.12, 10, 32), accentMat);
    halo.position.set(0, 1.25, 0.8);
    hullMesh.add(halo);
  } else if (classId === 'hauler' || classId === 'transport') {
    const podGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.6, 12);
    podGeo.rotateX(Math.PI / 2);
    const podL = new THREE.Mesh(podGeo, darkMetal);
    podL.position.set(-2.3, 1.05, 0.75);
    hullMesh.add(podL);
    const podR = new THREE.Mesh(podGeo, darkMetal);
    podR.position.set(2.3, 1.05, 0.75);
    hullMesh.add(podR);
  } else {
    const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 1.6), accentMat);
    dorsalFin.position.set(0, 1.9, 1.4);
    hullMesh.add(dorsalFin);
  }

  // Twin engine nacelles + thruster flames
  const thrusterFlames: THREE.Mesh[] = [];
  const enginePositions = [-1.15, 1.15];
  for (const ex of enginePositions) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 2.1, 12), darkMetal);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(ex, 1.15, 1.65);
    nacelle.castShadow = true;
    hullMesh.add(nacelle);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12),
      new THREE.MeshBasicMaterial({ color: '#38bdf8' })
    );
    core.rotation.x = Math.PI / 2;
    core.position.set(ex, 1.15, 2.71);
    hullMesh.add(core);

    const flameGeo = new THREE.ConeGeometry(0.32, 1.8, 10);
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 0.9);
    const flame = new THREE.Mesh(
      flameGeo,
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.0,
      })
    );
    flame.position.set(ex, 1.15, 2.72);
    hullMesh.add(flame);
    thrusterFlames.push(flame);
  }

  // Twin forward laser cannons
  for (const cx of [-1.45, 1.45]) {
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 8), darkMetal);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(cx, 0.92, -0.9);
    hullMesh.add(cannon);
  }

  // Retractable 3-strut landing gear (bottom at y=0 when deployed!)
  const gearGroup = new THREE.Group();
  root.add(gearGroup);
  const gearStruts: THREE.Group[] = [];
  const strutCoords: [number, number, number][] = [
    [0, 0.72, -1.9],
    [-1.4, 0.72, 1.2],
    [1.4, 0.72, 1.2],
  ];
  for (const [gx, gy, gz] of strutCoords) {
    const sg = new THREE.Group();
    sg.position.set(gx, gy, gz);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 8), darkMetal);
    strut.position.y = -0.35;
    sg.add(strut);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 10), accentMat);
    pad.position.y = -0.66;
    sg.add(pad);
    gearGroup.add(sg);
    gearStruts.push(sg);
  }

  return {
    root,
    hullMesh,
    gearGroup,
    gearStruts,
    thrusterFlames,
    hullMaterials: [hullMat],
    accentMaterials: [accentMat],
    gearDeploy: 1,
  };
}

export function updateSpacecraftRig(
  rig: SpacecraftRig,
  dt: number,
  thrustIntensity: number,
  gearTarget: number,
  isBoosting: boolean
): void {
  rig.gearDeploy = THREE.MathUtils.damp(rig.gearDeploy, gearTarget, 5, dt);
  for (const sg of rig.gearStruts) {
    sg.scale.y = Math.max(0.01, rig.gearDeploy);
    sg.visible = rig.gearDeploy > 0.05;
  }
  const flameColor = isBoosting ? '#c084fc' : '#38bdf8';
  for (const flame of rig.thrusterFlames) {
    const mat = flame.material as THREE.MeshBasicMaterial;
    mat.color.set(flameColor);
    mat.opacity = THREE.MathUtils.damp(mat.opacity, thrustIntensity > 0.05 ? 0.85 : 0.0, 12, dt);
    const len = (isBoosting ? 2.1 : 1.0) * Math.max(0.2, thrustIntensity) * (0.88 + Math.random() * 0.24);
    flame.scale.set(1, 1, len);
  }
}

export interface CreatureRig {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Group[];
  wings: THREE.Group[];
  tentacles: THREE.Group[];
  tailFin?: THREE.Group;
  species: CreatureSpecies;
  phase: number;
}

export function createAlienCreatureModel(species: CreatureSpecies): CreatureRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skinMat = new THREE.MeshStandardMaterial({
    color: species.primaryColor,
    roughness: 0.58,
    metalness: 0.12,
    emissive: species.bioluminescent ? species.primaryColor : '#000000',
    emissiveIntensity: species.bioluminescent ? 0.42 : 0,
  });
  const crestMat = new THREE.MeshStandardMaterial({
    color: species.secondaryColor,
    roughness: 0.34,
    metalness: 0.28,
    emissive: species.bioluminescent ? species.secondaryColor : '#000000',
    emissiveIntensity: species.bioluminescent ? 0.55 : 0,
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: species.eyeColor });

  const s = species.scale;
  const legs: THREE.Group[] = [];
  const wings: THREE.Group[] = [];
  const tentacles: THREE.Group[] = [];
  let tailFin: THREE.Group | undefined;

  if (species.bodyType === 'floater') {
    // Bioluminescent jellyfish / atmospheric gasbag with dangling tendrils
    const hoverY = 2.6;
    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.68 * s, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshPhysicalMaterial({
        color: species.primaryColor,
        emissive: species.primaryColor,
        emissiveIntensity: 0.55,
        roughness: 0.2,
        transparent: true,
        opacity: 0.85,
      })
    );
    bell.position.y = hoverY;
    bell.castShadow = true;
    body.add(bell);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 * s, 0), eyeMat);
    core.position.y = hoverY - 0.1 * s;
    body.add(core);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64 * s, 0.06 * s, 8, 20), crestMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = hoverY - 0.14 * s;
    body.add(rim);

    const tentacleGeo = new THREE.CapsuleGeometry(0.045 * s, 1.05 * s, 4, 6);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const tPivot = new THREE.Group();
      tPivot.position.set(Math.cos(ang) * 0.38 * s, hoverY - 0.18 * s, Math.sin(ang) * 0.38 * s);
      const tMesh = new THREE.Mesh(tentacleGeo, crestMat);
      tMesh.position.y = -0.58 * s;
      tPivot.add(tMesh);
      body.add(tPivot);
      tentacles.push(tPivot);
    }
  } else if (species.bodyType === 'aquatic') {
    // Streamlined leviathan / alien swimmer with pectoral & caudal tail fins
    const swimY = 0.7 * s;
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 14, 10), skinMat);
    torso.scale.set(0.75, 0.85, 1.85);
    torso.position.y = swimY;
    torso.castShadow = true;
    body.add(torso);

    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.65 * s, 4), crestMat);
    dorsal.position.set(0, swimY + 0.42 * s, 0.05 * s);
    dorsal.rotation.x = -0.45;
    body.add(dorsal);

    // Pectoral fins
    for (const side of [-1, 1]) {
      const pPivot = new THREE.Group();
      pPivot.position.set(side * 0.28 * s, swimY - 0.05 * s, -0.25 * s);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.65 * s, 0.04 * s, 0.34 * s), crestMat);
      fin.position.x = side * 0.34 * s;
      fin.rotation.y = side * -0.35;
      pPivot.add(fin);
      body.add(pPivot);
      wings.push(pPivot);
    }

    // Articulated caudal tail fin
    tailFin = new THREE.Group();
    tailFin.position.set(0, swimY, 0.72 * s);
    const tailBlade = new THREE.Mesh(new THREE.ConeGeometry(0.38 * s, 0.85 * s, 4), crestMat);
    tailBlade.rotation.x = Math.PI / 2;
    tailBlade.scale.set(0.18, 1.0, 1.2);
    tailBlade.position.z = 0.42 * s;
    tailFin.add(tailBlade);
    body.add(tailFin);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06 * s, 8, 8);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.22 * s, swimY + 0.1 * s, -0.58 * s);
      body.add(eye);
    }
  } else {
    const torsoY = species.bodyType === 'flyer' ? 2.5 : species.bodyType === 'crawler' ? 0.48 * s : 0.78 * s;

    // Torso
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.45 * s, 12, 10), skinMat);
    if (species.bodyType === 'crawler') {
      torso.scale.set(1.05, 0.55, 1.65);
    } else if (species.bodyType === 'biped') {
      torso.scale.set(0.75, 0.95, 1.25);
    } else {
      torso.scale.set(0.88, 0.78, 1.5);
    }
    torso.position.y = torsoY;
    torso.castShadow = true;
    body.add(torso);

    // Dorsal spine plates / shell segments
    const plateCount = species.bodyType === 'crawler' ? 4 : 3;
    for (let i = 0; i < plateCount; i++) {
      const fin =
        species.bodyType === 'crawler'
          ? new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.14 * s, 0.24 * s), crestMat)
          : new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.38 * s, 6), crestMat);
      fin.position.set(0, torsoY + (species.bodyType === 'crawler' ? 0.24 : 0.34) * s, (-0.35 + i * 0.28) * s);
      if (species.bodyType !== 'crawler') fin.rotation.x = -0.35;
      body.add(fin);
    }

    // Neck + Head + Horns/Mandibles
    const neckLen = species.bodyType === 'quadruped' && species.scale > 1.35 ? 0.45 * s : 0;
    const head = new THREE.Mesh(
      species.bodyType === 'flyer'
        ? new THREE.ConeGeometry(0.22 * s, 0.58 * s, 6)
        : new THREE.BoxGeometry(0.36 * s, 0.28 * s, 0.46 * s),
      skinMat
    );
    if (species.bodyType === 'flyer') head.rotation.x = -Math.PI / 2;
    head.position.set(0, torsoY + 0.22 * s + neckLen * 0.65, -0.72 * s);
    body.add(head);

    if (species.bodyType === 'quadruped' && neckLen > 0) {
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, neckLen + 0.25 * s, 8), skinMat);
      neck.position.set(0, torsoY + 0.2 * s, -0.52 * s);
      neck.rotation.x = 0.45;
      body.add(neck);
    }

    // Mandibles or horns
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.28 * s, 5), crestMat);
      if (species.bodyType === 'crawler') {
        horn.rotation.x = -Math.PI / 2;
        horn.rotation.z = side * 0.35;
        horn.position.set(side * 0.14 * s, torsoY + 0.12 * s, -0.95 * s);
      } else {
        horn.rotation.z = side * -0.4;
        horn.position.set(side * 0.15 * s, torsoY + 0.4 * s + neckLen * 0.65, -0.68 * s);
      }
      body.add(horn);
    }

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.065 * s, 8, 8);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.14 * s, torsoY + 0.26 * s + neckLen * 0.65, -0.92 * s);
      body.add(eye);
    }

    // Counter-balance tail for quadruped / biped / flyer
    if (species.bodyType !== 'crawler') {
      tailFin = new THREE.Group();
      tailFin.position.set(0, torsoY + 0.05 * s, 0.6 * s);
      const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.72 * s, 6), crestMat);
      tailMesh.rotation.x = Math.PI / 2 + 0.25;
      tailMesh.position.z = 0.32 * s;
      tailFin.add(tailMesh);
      body.add(tailFin);
    }

    if (species.bodyType === 'flyer') {
      const wingGeo = new THREE.BoxGeometry(1.45 * s, 0.05 * s, 0.58 * s);
      for (const side of [-1, 1]) {
        const wg = new THREE.Group();
        wg.position.set(side * 0.3 * s, torsoY + 0.1 * s, 0);
        const wm = new THREE.Mesh(wingGeo, crestMat);
        wm.position.x = side * 0.72 * s;
        wm.rotation.y = side * -0.18;
        wg.add(wm);
        body.add(wg);
        wings.push(wg);
      }
    } else {
      const legCount = species.bodyType === 'biped' ? 2 : species.bodyType === 'crawler' ? 6 : 4;
      const legLen = species.bodyType === 'crawler' ? 0.34 * s : 0.54 * s;
      const legGeo = new THREE.CapsuleGeometry(0.075 * s, legLen, 4, 6);
      for (let i = 0; i < legCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const zOff = legCount === 2 ? 0 : (-0.38 + row * (0.76 / Math.max(1, legCount / 2 - 1))) * s;
        const legPivot = new THREE.Group();
        legPivot.position.set(side * (species.bodyType === 'crawler' ? 0.42 : 0.34) * s, torsoY - 0.12 * s, zOff);
        const lm = new THREE.Mesh(legGeo, crestMat);
        lm.position.y = -legLen * 0.56;
        if (species.bodyType === 'crawler') {
          lm.rotation.z = side * 0.45;
          lm.position.x = side * 0.12 * s;
        }
        lm.castShadow = true;
        legPivot.add(lm);
        body.add(legPivot);
        legs.push(legPivot);
      }
    }
  }

  return { root, body, legs, wings, tentacles, tailFin, species, phase: Math.random() * Math.PI * 2 };
}

export function createFloraMesh(flora: FloraSpecies): THREE.Group {
  const group = new THREE.Group();
  const s = flora.scale;
  const trunkMat = new THREE.MeshStandardMaterial({
    color: flora.trunkColor,
    roughness: 0.78,
    metalness: 0.08,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: flora.canopyColor,
    roughness: 0.46,
    metalness: 0.18,
    emissive:
      flora.style === 'biolum' || flora.style === 'crystal' || flora.style === 'mushroom' || flora.style === 'flower'
        ? flora.glowColor
        : '#000000',
    emissiveIntensity:
      flora.style === 'biolum' || flora.style === 'crystal' ? 0.65 : flora.style === 'flower' ? 0.35 : 0.18,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: flora.glowColor });

  if (flora.style === 'crystal') {
    for (let i = 0; i < 4; i++) {
      const h = (1.6 + i * 0.6) * s;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.32 * s, h, 5), canopyMat);
      shard.position.set((i - 1.5) * 0.28 * s, h * 0.45, ((i % 2) - 0.5) * 0.3 * s);
      shard.rotation.z = (i - 1.5) * 0.22;
      shard.castShadow = true;
      group.add(shard);
    }
    const coreShard = new THREE.Mesh(new THREE.OctahedronGeometry(0.32 * s, 0), glowMat);
    coreShard.position.y = 3.6 * s;
    coreShard.userData.spinPart = true;
    group.add(coreShard);
  } else if (flora.style === 'frozen') {
    // Faceted ice-fern pine spire + frost rings
    const trunk = new THREE.Mesh(new THREE.ConeGeometry(0.45 * s, 2.8 * s, 6), trunkMat);
    trunk.position.y = 1.4 * s;
    group.add(trunk);
    for (let tier = 0; tier < 3; tier++) {
      const tierMesh = new THREE.Mesh(new THREE.ConeGeometry((1.25 - tier * 0.3) * s, 1.15 * s, 6), canopyMat);
      tierMesh.position.y = (1.35 + tier * 0.85) * s;
      tierMesh.castShadow = true;
      group.add(tierMesh);
    }
  } else if (flora.style === 'mushroom') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.35 * s, 2.1 * s, 8), trunkMat);
    stem.position.y = 1.05 * s;
    stem.castShadow = true;
    group.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.15 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), canopyMat);
    cap.position.y = 1.95 * s;
    cap.castShadow = true;
    group.add(cap);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.08 * s, 0.08 * s, 6, 16), glowMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.95 * s;
    group.add(rim);
    // Baby side toadstool
    const miniStem = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.85 * s, 6), trunkMat);
    miniStem.position.set(0.72 * s, 0.42 * s, 0.35 * s);
    group.add(miniStem);
    const miniCap = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.52), canopyMat);
    miniCap.position.set(0.72 * s, 0.82 * s, 0.35 * s);
    group.add(miniCap);
  } else if (flora.style === 'flower') {
    // Giant alien blossom petals around glowing stamen core
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.28 * s, 2.0 * s, 8), trunkMat);
    stalk.position.y = 1.0 * s;
    stalk.castShadow = true;
    group.add(stalk);
    const stamen = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 10, 8), glowMat);
    stamen.position.y = 2.15 * s;
    group.add(stamen);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.42 * s, 1.25 * s, 5), canopyMat);
      petal.position.set(Math.cos(ang) * 0.65 * s, 2.05 * s, Math.sin(ang) * 0.65 * s);
      petal.rotation.order = 'YXZ';
      petal.rotation.y = -ang;
      petal.rotation.z = -1.1;
      petal.castShadow = true;
      group.add(petal);
    }
  } else if (flora.style === 'biolum') {
    // Curved alien stalks with hanging glowing spore lanterns
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.16 * s, (2.2 + b * 0.35) * s, 6), trunkMat);
      branch.position.set(Math.cos(ang) * 0.42 * s, (1.1 + b * 0.15) * s, Math.sin(ang) * 0.42 * s);
      branch.rotation.z = -Math.cos(ang) * 0.38;
      branch.rotation.x = Math.sin(ang) * 0.38;
      group.add(branch);
      const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.32 * s, 1), glowMat);
      lantern.position.set(Math.cos(ang) * 0.9 * s, (2.0 + b * 0.25) * s, Math.sin(ang) * 0.9 * s);
      group.add(lantern);
    }
  } else if (flora.style === 'jungle') {
    // Tall alien rainforest tree with multi-tier broad canopy fronds
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.45 * s, 3.6 * s, 8), trunkMat);
    trunk.position.y = 1.8 * s;
    trunk.castShadow = true;
    group.add(trunk);
    for (let tier = 0; tier < 2; tier++) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry((1.4 - tier * 0.35) * s, (1.6 - tier * 0.4) * s, 0.45 * s, 9), canopyMat);
      disc.position.y = (3.1 + tier * 0.85) * s;
      disc.castShadow = true;
      group.add(disc);
    }
  } else if (flora.style === 'desert') {
    const col = new THREE.Mesh(new THREE.CapsuleGeometry(0.26 * s, 1.8 * s, 4, 8), canopyMat);
    col.position.y = 1.05 * s;
    col.castShadow = true;
    group.add(col);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * s, 0.8 * s, 4, 8), canopyMat);
    arm.position.set(0.45 * s, 1.3 * s, 0);
    arm.rotation.z = -0.6;
    group.add(arm);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 8, 6), glowMat);
    bloom.position.y = 2.25 * s;
    group.add(bloom);
  } else if (flora.style === 'ruin' || flora.style === 'machine') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.2 * s, 0.4 * s, 1.2 * s), trunkMat);
    plinth.position.y = 0.2 * s;
    group.add(plinth);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 3.2 * s, 0.6 * s), trunkMat);
    pillar.position.y = 1.8 * s;
    pillar.castShadow = true;
    group.add(pillar);
    const glyph = new THREE.Mesh(new THREE.OctahedronGeometry(0.38 * s, 0), glowMat);
    glyph.position.y = 3.9 * s;
    glyph.userData.spinPart = true;
    group.add(glyph);
  } else if (flora.style === 'sparse') {
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72 * s, 0), canopyMat);
    bush.position.y = 0.5 * s;
    bush.scale.set(1.2, 0.75, 1.1);
    group.add(bush);
  } else {
    // Lush alien canopy tree
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.34 * s, 2.6 * s, 8), trunkMat);
    trunk.position.y = 1.3 * s;
    trunk.castShadow = true;
    group.add(trunk);
    const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15 * s, 1), canopyMat);
    crown1.position.y = 2.9 * s;
    crown1.castShadow = true;
    group.add(crown1);
    const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 * s, 1), canopyMat);
    crown2.position.set(0.55 * s, 2.5 * s, 0.35 * s);
    group.add(crown2);
  }

  return group;
}

export function createBaseStructureMesh(
  partId: BasePartId,
  textures?: ProceduralTextureSet,
  isPreview = false,
  canPlace = true
): THREE.Group {
  const group = new THREE.Group();
  const wallMat = isPreview
    ? new THREE.MeshBasicMaterial({
        color: canPlace ? '#22d3ee' : '#ef4444',
        transparent: true,
        opacity: 0.45,
        wireframe: false,
      })
    : new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.42,
        metalness: 0.52,
        bumpMap: textures?.hullBump ?? null,
        bumpScale: 0.02,
      });

  const darkMat = isPreview
    ? wallMat
    : new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6, metalness: 0.7 });
  const glowMat = isPreview
    ? wallMat
    : new THREE.MeshBasicMaterial({ color: '#38bdf8' });

  if (partId === 'foundation' || partId === 'floor' || partId === 'roof') {
    const h = partId === 'foundation' ? 0.8 : 0.35;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), wallMat);
    slab.position.y = h / 2;
    slab.receiveShadow = !isPreview;
    slab.castShadow = !isPreview;
    group.add(slab);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.1, 6.1), darkMat);
    rim.position.y = h - 0.05;
    group.add(rim);
  } else if (partId === 'wall' || partId === 'window_wall' || partId === 'door') {
    if (partId === 'wall') {
      const w = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 0.36), wallMat);
      w.position.y = 1.8;
      w.castShadow = !isPreview;
      group.add(w);
    } else if (partId === 'window_wall') {
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.36), wallMat);
      bottom.position.y = 0.55;
      group.add(bottom);
      const top = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.36), wallMat);
      top.position.y = 3.2;
      group.add(top);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, 1.7, 0.12),
        isPreview
          ? wallMat
          : new THREE.MeshPhysicalMaterial({ color: '#38bdf8', transparent: true, opacity: 0.38, roughness: 0.1 })
      );
      glass.position.y = 1.95;
      group.add(glass);
    } else {
      const jambL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.6, 0.4), wallMat);
      jambL.position.set(-2.1, 1.8, 0);
      group.add(jambL);
      const jambR = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.6, 0.4), wallMat);
      jambR.position.set(2.1, 1.8, 0);
      group.add(jambR);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.4), wallMat);
      lintel.position.set(0, 3.15, 0);
      group.add(lintel);
    }
  } else if (partId === 'solar_panel') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.6, 8), darkMat);
    post.position.y = 0.8;
    group.add(post);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.12, 2.4),
      isPreview
        ? wallMat
        : new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.2, metalness: 0.8 })
    );
    panel.position.y = 1.65;
    panel.rotation.x = 0.42;
    group.add(panel);
  } else if (partId === 'reactor') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.8, 12), darkMat);
    base.position.y = 0.4;
    group.add(base);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.4, 12), glowMat);
    core.position.y = 2.0;
    group.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.14, 8, 20), wallMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.0;
    group.add(ring);
  } else if (partId === 'landing_pad') {
    const padMat = isPreview
      ? wallMat
      : new THREE.MeshStandardMaterial({
          map: textures?.hexGrid ?? null,
          color: '#ffffff',
          roughness: 0.45,
          metalness: 0.5,
        });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(11, 0.45, 11), padMat);
    deck.position.y = 0.22;
    deck.receiveShadow = !isPreview;
    group.add(deck);
    for (const [bx, bz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.9, 8), glowMat);
      beacon.position.set(bx, 0.6, bz);
      group.add(beacon);
    }
  } else if (partId === 'research_beacon') {
    const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 1.2, 6), darkMat);
    tri.position.y = 0.6;
    group.add(tri);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 3.8, 8), wallMat);
    mast.position.y = 2.8;
    group.add(mast);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), glowMat);
    orb.position.y = 4.9;
    group.add(orb);
  } else {
    // battery, storage_vault, hydroponics
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.6), wallMat);
    box.position.y = 1.1;
    box.castShadow = !isPreview;
    group.add(box);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.22, 2.7), glowMat);
    strip.position.y = 1.65;
    group.add(strip);
  }

  return group;
}

export function createSpaceStationModel(accentColor: string, textures?: ProceduralTextureSet): {
  root: THREE.Group;
  ring: THREE.Group;
} {
  const root = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.35,
    metalness: 0.72,
    bumpMap: textures?.hullBump ?? null,
    bumpScale: 0.03,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6, metalness: 0.8 });
  const glowMat = new THREE.MeshBasicMaterial({ color: accentColor });

  // Central docking core
  const core = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 56, 12), hullMat);
  root.add(core);

  const dockBay = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 44), darkMat);
  dockBay.position.y = -6;
  root.add(dockBay);

  const dockHalo = new THREE.Mesh(new THREE.TorusGeometry(9, 0.65, 8, 24), glowMat);
  dockHalo.position.set(0, -6, 22);
  root.add(dockHalo);

  // Rotating habitat ring
  const ring = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(44, 4.2, 12, 36), hullMat);
  torus.rotation.x = Math.PI / 2;
  ring.add(torus);

  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(88, 2.2, 3.2), darkMat);
    spoke.rotation.y = (i * Math.PI) / 4;
    ring.add(spoke);
  }
  root.add(ring);

  return { root, ring };
}
