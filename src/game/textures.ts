import * as THREE from 'three';

export interface ProceduralTextureSet {
  terrainBump: THREE.CanvasTexture;
  hullBump: THREE.CanvasTexture;
  hullRoughness: THREE.CanvasTexture;
  glowSprite: THREE.CanvasTexture;
  hexGrid: THREE.CanvasTexture;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Tileable planetary rock/soil micro-relief bump map
  const tCanvas = document.createElement('canvas');
  tCanvas.width = 256;
  tCanvas.height = 256;
  const tCtx = tCanvas.getContext('2d')!;
  const tImg = tCtx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const n =
        Math.sin(x * 0.14) * Math.cos(y * 0.14) * 28 +
        Math.sin((x + y) * 0.31) * 18 +
        ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 32;
      const v = Math.max(0, Math.min(255, 128 + n));
      tImg.data[i] = v;
      tImg.data[i + 1] = v;
      tImg.data[i + 2] = v;
      tImg.data[i + 3] = 255;
    }
  }
  tCtx.putImageData(tImg, 0, 0);
  const terrainBump = new THREE.CanvasTexture(tCanvas);
  terrainBump.wrapS = THREE.RepeatWrapping;
  terrainBump.wrapT = THREE.RepeatWrapping;
  terrainBump.repeat.set(16, 16);
  terrainBump.anisotropy = maxAnisotropy;

  // 2. Brushed spacecraft panel bump & roughness maps
  const hCanvas = document.createElement('canvas');
  hCanvas.width = 256;
  hCanvas.height = 256;
  const hCtx = hCanvas.getContext('2d')!;
  hCtx.fillStyle = '#909090';
  hCtx.fillRect(0, 0, 256, 256);
  hCtx.strokeStyle = '#383838';
  hCtx.lineWidth = 2;
  for (let p = 0; p <= 256; p += 64) {
    hCtx.strokeRect(p + 2, 2, 60, 124);
    hCtx.strokeRect(p + 2, 130, 60, 124);
  }
  hCtx.fillStyle = '#555555';
  for (let y = 12; y < 256; y += 64) {
    for (let x = 12; x < 256; x += 64) {
      hCtx.fillRect(x, y, 4, 4);
      hCtx.fillRect(x + 40, y, 4, 4);
    }
  }
  const hullBump = new THREE.CanvasTexture(hCanvas);
  hullBump.wrapS = THREE.RepeatWrapping;
  hullBump.wrapT = THREE.RepeatWrapping;
  hullBump.anisotropy = maxAnisotropy;

  const rCanvas = document.createElement('canvas');
  rCanvas.width = 256;
  rCanvas.height = 256;
  const rCtx = rCanvas.getContext('2d')!;
  rCtx.fillStyle = '#585858';
  rCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    rCtx.fillStyle = y % 4 === 0 ? '#666666' : '#4a4a4a';
    rCtx.fillRect(0, y, 256, 1);
  }
  const hullRoughness = new THREE.CanvasTexture(rCanvas);
  hullRoughness.wrapS = THREE.RepeatWrapping;
  hullRoughness.wrapT = THREE.RepeatWrapping;

  // 3. Radial soft glow sprite for stars, sun corona, thruster flares
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 128;
  gCanvas.height = 128;
  const gCtx = gCanvas.getContext('2d')!;
  const grad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  gCtx.fillStyle = grad;
  gCtx.fillRect(0, 0, 128, 128);
  const glowSprite = new THREE.CanvasTexture(gCanvas);
  glowSprite.colorSpace = THREE.SRGBColorSpace;

  // 4. Sci-fi hex grid texture for landing pads & holographic build previews
  const xCanvas = document.createElement('canvas');
  xCanvas.width = 256;
  xCanvas.height = 256;
  const xCtx = xCanvas.getContext('2d')!;
  xCtx.fillStyle = '#0f172a';
  xCtx.fillRect(0, 0, 256, 256);
  xCtx.strokeStyle = '#38bdf8';
  xCtx.lineWidth = 3;
  xCtx.strokeRect(8, 8, 240, 240);
  xCtx.beginPath();
  xCtx.arc(128, 128, 76, 0, Math.PI * 2);
  xCtx.stroke();
  xCtx.font = 'bold 48px monospace';
  xCtx.fillStyle = '#38bdf8';
  xCtx.textAlign = 'center';
  xCtx.textBaseline = 'middle';
  xCtx.fillText('H', 128, 128);
  const hexGrid = new THREE.CanvasTexture(xCanvas);
  hexGrid.colorSpace = THREE.SRGBColorSpace;
  hexGrid.anisotropy = maxAnisotropy;

  return { terrainBump, hullBump, hullRoughness, glowSprite, hexGrid };
}
