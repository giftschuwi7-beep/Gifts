import * as THREE from 'three';

export type SceneLightKind = 'directional' | 'point' | 'spot';
export type StudioLightRole = 'key' | 'fill' | 'rim' | 'custom';

export interface CreateSceneLightOptions {
  name?: string;
  kind?: SceneLightKind;
  role?: StudioLightRole;
  color?: string;
  intensity?: number;
  position?: [number, number, number];
  aimAt?: [number, number, number];
  castShadow?: boolean;
  isMobileDevice?: boolean;
}

const DEFAULT_TARGET = new THREE.Vector3(0, 0.65, 0);
const _worldPos = new THREE.Vector3();
const _localFloor = new THREE.Vector3();
const _targetWorld = new THREE.Vector3();
const _color = new THREE.Color();

let sharedGlowTex: THREE.CanvasTexture | null = null;
let sharedSphereGeo: THREE.SphereGeometry | null = null;
let sharedRingGeo: THREE.TorusGeometry | null = null;
let sharedConeGeo: THREE.ConeGeometry | null = null;
let sharedFloorRingGeo: THREE.RingGeometry | null = null;

function getSharedGlowTexture(): THREE.CanvasTexture {
  if (sharedGlowTex) return sharedGlowTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 2, c, c, c);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.24, 'rgba(255, 255, 255, 0.72)');
    grad.addColorStop(0.52, 'rgba(255, 255, 255, 0.22)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  sharedGlowTex = tex;
  return tex;
}

function getSharedGeos() {
  if (!sharedSphereGeo) sharedSphereGeo = new THREE.SphereGeometry(0.16, 20, 14);
  if (!sharedRingGeo) sharedRingGeo = new THREE.TorusGeometry(0.24, 0.015, 10, 32);
  if (!sharedConeGeo) sharedConeGeo = new THREE.ConeGeometry(0.068, 0.22, 12);
  if (!sharedFloorRingGeo) {
    sharedFloorRingGeo = new THREE.RingGeometry(0.11, 0.165, 24);
    sharedFloorRingGeo.rotateX(-Math.PI / 2);
  }
  return {
    sphereGeo: sharedSphereGeo,
    ringGeo: sharedRingGeo,
    coneGeo: sharedConeGeo,
    floorRingGeo: sharedFloorRingGeo,
  };
}

function createBadgeTexture(label: string): THREE.CanvasTexture {
  const width = 160;
  const height = 48;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(18, 20, 26, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
    ctx.lineWidth = 2;

    const r = 10;
    const x = 6;
    const y = 6;
    const w = width - 12;
    const h = height - 12;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 18px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label.slice(0, 12), width / 2, height / 2 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSceneLightObject(opts: CreateSceneLightOptions = {}): THREE.Group {
  const kind: SceneLightKind = opts.kind ?? 'point';
  const role: StudioLightRole = opts.role ?? 'custom';
  const colorHex = opts.color ?? '#fff5ea';
  const intensity = opts.intensity ?? 2.2;
  const name =
    opts.name ??
    (kind === 'directional' ? 'Directional Light' : kind === 'spot' ? 'Spot Light' : 'Point Light');

  const group = new THREE.Group();
  group.name = name;
  group.userData.isSceneLight = true;
  group.userData.lightKind = kind;
  group.userData.lightRole = role;
  group.userData.lightColor = colorHex;
  group.userData.lightIntensity = intensity;
  group.userData.castShadow = Boolean(opts.castShadow);
  group.userData.autoTrackCenter = kind !== 'point';

  const pos = opts.position ?? [2.5, 3.0, 2.5];
  group.position.set(pos[0], pos[1], pos[2]);

  // Real Three.js Light mounted at local origin of group
  let realLight: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
  if (kind === 'directional') {
    const dir = new THREE.DirectionalLight(colorHex, intensity);
    dir.castShadow = Boolean(opts.castShadow);
    const shadowSize = opts.isMobileDevice ? 1024 : 2048;
    dir.shadow.mapSize.set(shadowSize, shadowSize);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 35;
    const d = 6;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = 0.02;
    dir.target.position.set(0, 0, -5);
    group.add(dir.target);
    group.add(dir);
    realLight = dir;
  } else if (kind === 'spot') {
    const spot = new THREE.SpotLight(colorHex, intensity * 3.5, 28, Math.PI / 5, 0.45, 1.4);
    spot.castShadow = Boolean(opts.castShadow);
    spot.shadow.mapSize.set(opts.isMobileDevice ? 512 : 1024, opts.isMobileDevice ? 512 : 1024);
    spot.shadow.bias = -0.0004;
    spot.target.position.set(0, 0, -5);
    group.add(spot.target);
    group.add(spot);
    realLight = spot;
  } else {
    const pt = new THREE.PointLight(colorHex, intensity * 3.0, 24, 1.4);
    pt.castShadow = Boolean(opts.castShadow);
    pt.shadow.bias = -0.002;
    group.add(pt);
    realLight = pt;
  }
  group.userData.realLight = realLight;

  // Aim light group along -Z toward studio target
  const aimAt = opts.aimAt ?? [DEFAULT_TARGET.x, DEFAULT_TARGET.y, DEFAULT_TARGET.z];
  _targetWorld.set(aimAt[0], aimAt[1], aimAt[2]);
  group.lookAt(_targetWorld);

  // Visual Helper Group (hidden automatically in PNG snapshots or when Light Guides toggled off)
  const visualRoot = new THREE.Group();
  visualRoot.name = '__LightVisual';
  visualRoot.userData.isLightVisual = true;
  group.userData.visualRoot = visualRoot;

  const { sphereGeo, ringGeo, coneGeo, floorRingGeo } = getSharedGeos();

  const bulbMat = new THREE.MeshBasicMaterial({ color: colorHex });
  const bulbMesh = new THREE.Mesh(sphereGeo, bulbMat);
  bulbMesh.name = name;
  bulbMesh.userData.isLightVisual = true;
  visualRoot.add(bulbMesh);

  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.7,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.userData.isLightVisual = true;
  visualRoot.add(ringMesh);

  const glowMat = new THREE.SpriteMaterial({
    map: getSharedGlowTexture(),
    color: colorHex,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowSprite = new THREE.Sprite(glowMat);
  glowSprite.scale.setScalar(1.05);
  glowSprite.userData.isLightVisual = true;
  visualRoot.add(glowSprite);

  const badgeText =
    role === 'key'
      ? 'KEY'
      : role === 'fill'
        ? 'FILL'
        : role === 'rim'
          ? 'RIM'
          : name.toUpperCase();
  const badgeTex = createBadgeTexture(badgeText);
  const labelMat = new THREE.SpriteMaterial({
    map: badgeTex,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const labelSprite = new THREE.Sprite(labelMat);
  labelSprite.scale.set(0.68, 0.21, 1);
  labelSprite.position.set(0, 0.34, 0);
  labelSprite.userData.isLightVisual = true;
  visualRoot.add(labelSprite);

  // Aim beam extending along local -Z axis (rotating or moving light updates the ray automatically)
  const rayLength = kind === 'point' ? 1.4 : 4.6;
  const aimLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -rayLength),
  ]);
  const aimLineMat = new THREE.LineDashedMaterial({
    color: colorHex,
    transparent: true,
    opacity: kind === 'point' ? 0.38 : 0.72,
    dashSize: 0.22,
    gapSize: 0.12,
    depthWrite: false,
  });
  const aimLine = new THREE.Line(aimLineGeo, aimLineMat);
  aimLine.computeLineDistances();
  aimLine.userData.isLightVisual = true;
  visualRoot.add(aimLine);

  const coneMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: kind === 'point' ? 0.45 : 0.9,
  });
  const coneMesh = new THREE.Mesh(coneGeo, coneMat);
  coneMesh.rotation.x = -Math.PI / 2; // point tip along local -Z
  coneMesh.position.set(0, 0, -Math.min(1.2, rayLength * 0.55));
  coneMesh.userData.isLightVisual = true;
  visualRoot.add(coneMesh);

  // World-space floor drop plumb line & floor marker ring (converted dynamically to local space)
  const plumbGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -pos[1], 0),
  ]);
  const plumbMat = new THREE.LineDashedMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.3,
    dashSize: 0.14,
    gapSize: 0.14,
    depthWrite: false,
  });
  const plumbLine = new THREE.Line(plumbGeo, plumbMat);
  plumbLine.computeLineDistances();
  plumbLine.userData.isLightVisual = true;
  visualRoot.add(plumbLine);

  const floorRingMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const floorRing = new THREE.Mesh(floorRingGeo, floorRingMat);
  floorRing.userData.isLightVisual = true;
  visualRoot.add(floorRing);

  group.add(visualRoot);

  group.userData.lightVisualRefs = {
    bulbMesh,
    bulbMat,
    ringMat,
    glowSprite,
    glowMat,
    labelSprite,
    labelMat,
    badgeTex,
    aimLine,
    aimLineMat,
    coneMesh,
    coneMat,
    plumbLine,
    plumbMat,
    floorRing,
    floorRingMat,
  };

  syncSceneLightVisuals(group, true);
  return group;
}

export function syncSceneLightVisuals(
  group: THREE.Group,
  guidesVisible: boolean,
  shadowsGloballyEnabled = true,
  ecoMode = false
): void {
  if (!group.userData?.isSceneLight) return;

  const colorHex = String(group.userData.lightColor ?? '#fff5ea');
  const intensity = Number(group.userData.lightIntensity ?? 2);
  const kind = (group.userData.lightKind as SceneLightKind) ?? 'point';
  const wantShadow = Boolean(group.userData.castShadow);
  const realLight = group.userData.realLight as
    | THREE.DirectionalLight
    | THREE.PointLight
    | THREE.SpotLight
    | undefined;

  _color.set(colorHex);

  if (realLight) {
    realLight.color.copy(_color);
    if (kind === 'spot') {
      realLight.intensity = intensity * 3.5;
    } else if (kind === 'point') {
      realLight.intensity = intensity * 3.0;
    } else {
      realLight.intensity = intensity;
    }
    realLight.castShadow = wantShadow && shadowsGloballyEnabled && !ecoMode;
  }

  const visualRoot = group.userData.visualRoot as THREE.Group | undefined;
  const refs = group.userData.lightVisualRefs as
    | {
        bulbMesh: THREE.Mesh;
        bulbMat: THREE.MeshBasicMaterial;
        ringMat: THREE.MeshBasicMaterial;
        glowSprite: THREE.Sprite;
        glowMat: THREE.SpriteMaterial;
        labelSprite: THREE.Sprite;
        labelMat: THREE.SpriteMaterial;
        aimLine: THREE.Line;
        aimLineMat: THREE.LineDashedMaterial;
        coneMesh: THREE.Mesh;
        coneMat: THREE.MeshBasicMaterial;
        plumbLine: THREE.Line;
        plumbMat: THREE.LineDashedMaterial;
        floorRing: THREE.Mesh;
        floorRingMat: THREE.MeshBasicMaterial;
      }
    | undefined;

  if (!visualRoot || !refs) return;
  visualRoot.visible = guidesVisible;
  if (!guidesVisible) return;

  const clampedInt = THREE.MathUtils.clamp(intensity, 0, 6);
  const activeFactor =
    clampedInt <= 0.02 ? 0.2 : THREE.MathUtils.clamp(0.45 + clampedInt * 0.2, 0.45, 1.0);

  refs.bulbMat.color.copy(_color);
  refs.ringMat.color.copy(_color);
  refs.ringMat.opacity = 0.72 * activeFactor;
  refs.glowMat.color.copy(_color);
  refs.glowMat.opacity = clampedInt <= 0.02 ? 0.14 : THREE.MathUtils.clamp(0.45 + clampedInt * 0.16, 0.45, 0.95);
  refs.glowSprite.scale.setScalar(0.92 + Math.min(clampedInt, 3.5) * 0.18);
  refs.labelMat.opacity = clampedInt <= 0.02 ? 0.48 : 0.92;

  refs.aimLineMat.color.copy(_color);
  refs.aimLineMat.opacity = (kind === 'point' ? 0.35 : 0.74) * activeFactor;
  refs.coneMat.color.copy(_color);
  refs.coneMat.opacity = (kind === 'point' ? 0.45 : 0.9) * activeFactor;

  // Keep floor plumb line + ring vertically aligned below light world position
  group.updateMatrixWorld(true);
  group.getWorldPosition(_worldPos);
  _localFloor.set(_worldPos.x, 0.012, _worldPos.z);
  group.worldToLocal(_localFloor);

  const plumbPosAttr = refs.plumbLine.geometry.attributes.position as THREE.BufferAttribute;
  plumbPosAttr.setXYZ(0, 0, 0, 0);
  plumbPosAttr.setXYZ(1, _localFloor.x, _localFloor.y, _localFloor.z);
  plumbPosAttr.needsUpdate = true;
  refs.plumbLine.computeLineDistances();
  refs.plumbMat.color.copy(_color);
  refs.plumbMat.opacity = 0.3 * activeFactor;

  refs.floorRing.position.copy(_localFloor);
  // Orient floor ring flat on world XZ by cancelling parent quaternion
  refs.floorRing.quaternion.copy(group.quaternion).invert();
  refs.floorRingMat.color.copy(_color);
  refs.floorRingMat.opacity = 0.42 * activeFactor;
}

export function disposeSceneLightObject(group: THREE.Group): void {
  const refs = group.userData?.lightVisualRefs as
    | {
        bulbMat: THREE.MeshBasicMaterial;
        ringMat: THREE.MeshBasicMaterial;
        glowMat: THREE.SpriteMaterial;
        labelMat: THREE.SpriteMaterial;
        badgeTex: THREE.CanvasTexture;
        aimLine: THREE.Line;
        aimLineMat: THREE.LineDashedMaterial;
        coneMat: THREE.MeshBasicMaterial;
        plumbLine: THREE.Line;
        plumbMat: THREE.LineDashedMaterial;
        floorRingMat: THREE.MeshBasicMaterial;
      }
    | undefined;
  if (!refs) return;
  refs.bulbMat.dispose();
  refs.ringMat.dispose();
  refs.glowMat.dispose();
  refs.labelMat.dispose();
  refs.badgeTex.dispose();
  refs.aimLine.geometry.dispose();
  refs.aimLineMat.dispose();
  refs.coneMat.dispose();
  refs.plumbLine.geometry.dispose();
  refs.plumbMat.dispose();
  refs.floorRingMat.dispose();
}
