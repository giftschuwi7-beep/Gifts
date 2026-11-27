import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { VOXLoader, buildMesh as buildVoxMesh } from 'three/examples/jsm/loaders/VOXLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';
import { XYZLoader } from 'three/examples/jsm/loaders/XYZLoader.js';
import { LWOLoader } from 'three/examples/jsm/loaders/LWOLoader.js';
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { parseBlendFile } from './blendParser';
import { inspectPrismaOrArchive } from './prismaParser';
import type { ImportReport } from '../types/studio';

export interface ImportedAsset {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  report: ImportReport;
}

export const ACCEPTED_MODEL_EXTENSIONS = [
  '.blend',
  '.prisma',
  '.p3d',
  '.proj',
  '.zip',
  '.glb',
  '.gltf',
  '.obj',
  '.mtl',
  '.fbx',
  '.dae',
  '.stl',
  '.ply',
  '.3ds',
  '.3mf',
  '.amf',
  '.usdz',
  '.usd',
  '.usda',
  '.usdc',
  '.vox',
  '.wrl',
  '.pcd',
  '.xyz',
  '.lwo',
  '.kmz',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bin',
];

export function countGeometryStats(root: THREE.Object3D): {
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
} {
  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;

  root.traverse((child) => {
    if (child.userData?.isLightVisual) return;
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      meshCount++;
      const geo = child.geometry;
      if (geo) {
        const pos = geo.getAttribute('position');
        if (pos) vertexCount += pos.count;
        if (child instanceof THREE.Mesh) {
          if (geo.index) {
            triangleCount += Math.floor(geo.index.count / 3);
          } else if (pos) {
            triangleCount += Math.floor(pos.count / 3);
          }
        }
      }
    }
  });

  return { meshCount, vertexCount, triangleCount };
}

export function normalizeAndGroundObject(root: THREE.Object3D, targetSize = 2.6): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    // Normalize overly huge (e.g. mm FBX/STL) or tiny models into studio scale
    if (maxDim > 8 || maxDim < 0.35) {
      const scaleFactor = targetSize / maxDim;
      root.scale.multiplyScalar(scaleFactor);
      root.updateMatrixWorld(true);
    }
  }

  // Recompute bounds and place bottom-center at origin (0, 0, 0)
  const scaledBox = new THREE.Box3().setFromObject(root);
  const center = scaledBox.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= scaledBox.min.y;

  // Enable shadows and ensure materials render nicely with PBR environment
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.geometry.getAttribute('normal')) {
        child.geometry.computeVertexNormals();
      }
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m && 'envMapIntensity' in m) {
          (m as THREE.MeshStandardMaterial).envMapIntensity = 1.0;
        }
      }
    }
  });
}

export function countObjectTextures(root: THREE.Object3D): number {
  const seen = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      const maps = [
        std.map,
        std.normalMap,
        std.bumpMap,
        std.roughnessMap,
        std.metalnessMap,
        std.emissiveMap,
        std.aoMap,
        std.alphaMap,
      ];
      for (const tex of maps) {
        if (tex) seen.add(tex);
      }
    }
  });
  return seen.size;
}

function registerResourceUrl(map: Map<string, string>, rawKey: string, url: string): void {
  const norm = rawKey.replace(/\\/g, '/');
  const base = norm.split('/').pop() ?? norm;
  map.set(rawKey, url);
  map.set(norm, url);
  map.set(base, url);
  map.set(norm.toLowerCase(), url);
  map.set(base.toLowerCase(), url);
}

function buildLoadingManager(resourceUrls: Map<string, string>): {
  manager: THREE.LoadingManager;
  waitForPending: () => Promise<void>;
} {
  let activeItems = 0;
  let resolveIdle: (() => void) | null = null;
  let startedAny = false;

  const manager = new THREE.LoadingManager();
  manager.onStart = (_url, itemsLoaded, itemsTotal) => {
    startedAny = true;
    activeItems = Math.max(0, itemsTotal - itemsLoaded);
  };
  manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
    activeItems = Math.max(0, itemsTotal - itemsLoaded);
  };
  manager.onLoad = () => {
    activeItems = 0;
    if (resolveIdle) {
      resolveIdle();
      resolveIdle = null;
    }
  };
  manager.onError = () => {
    if (activeItems <= 1 && resolveIdle) {
      activeItems = 0;
      resolveIdle();
      resolveIdle = null;
    }
  };

  manager.addHandler(/\.tga$/i, new TGALoader(manager));

  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const clean = url.split('?')[0].split('#')[0].replace(/\\/g, '/');
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
      // keep raw
    }
    const base = clean.split('/').pop() ?? clean;
    const decodedBase = decoded.split('/').pop() ?? decoded;
    return (
      resourceUrls.get(clean) ??
      resourceUrls.get(decoded) ??
      resourceUrls.get(base) ??
      resourceUrls.get(decodedBase) ??
      resourceUrls.get(clean.toLowerCase()) ??
      resourceUrls.get(base.toLowerCase()) ??
      resourceUrls.get(decodedBase.toLowerCase()) ??
      url
    );
  });

  const waitForPending = async () => {
    if (!startedAny || activeItems === 0) return;
    await Promise.race([
      new Promise<void>((res) => {
        resolveIdle = res;
      }),
      new Promise<void>((res) => setTimeout(res, 6000)),
    ]);
  };

  return { manager, waitForPending };
}

async function applyCompanionTexturesIfMissing(
  root: THREE.Object3D,
  textureEntries: Array<{ name: string; url: string }>,
  manager: THREE.LoadingManager
): Promise<void> {
  if (textureEntries.length === 0) return;

  let alreadyHasMap = false;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m && (m as THREE.MeshStandardMaterial).map) {
          alreadyHasMap = true;
        }
      }
    }
  });
  if (alreadyHasMap) return;

  // Classify companion textures by filename hints
  const isNormal = (n: string) => /(normal|nrm|norm|bump)/i.test(n);
  const isRough = (n: string) => /(rough|rgh)/i.test(n);
  const isMetal = (n: string) => /(metal|metallic)/i.test(n);
  const isAlbedo = (n: string) => /(albedo|diffuse|color|base|skin|tex)/i.test(n);

  const albedoEntry =
    textureEntries.find((t) => isAlbedo(t.name) && !isNormal(t.name)) ??
    textureEntries.find((t) => !isNormal(t.name) && !isRough(t.name) && !isMetal(t.name)) ??
    textureEntries[0];
  const normalEntry = textureEntries.find((t) => isNormal(t.name));
  const roughEntry = textureEntries.find((t) => isRough(t.name));

  const loader = new THREE.TextureLoader(manager);
  const loadTex = (entry: { name: string; url: string }, srgb: boolean) =>
    new Promise<THREE.Texture | null>((resolve) => {
      if (entry.name.toLowerCase().endsWith('.tga')) {
        const tga = new TGALoader(manager);
        tga.load(
          entry.url,
          (t) => {
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.needsUpdate = true;
            resolve(t);
          },
          undefined,
          () => resolve(null)
        );
        return;
      }
      loader.load(
        entry.url,
        (t) => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          t.needsUpdate = true;
          resolve(t);
        },
        undefined,
        () => resolve(null)
      );
    });

  const [albedoTex, normalTex, roughTex] = await Promise.all([
    albedoEntry ? loadTex(albedoEntry, true) : Promise.resolve(null),
    normalEntry ? loadTex(normalEntry, false) : Promise.resolve(null),
    roughEntry ? loadTex(roughEntry, false) : Promise.resolve(null),
  ]);

  if (!albedoTex && !normalTex && !roughTex) return;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.geometry.getAttribute('uv')) {
      const pos = child.geometry.getAttribute('position');
      if (pos) {
        const uvs = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          uvs[i * 2] = pos.getX(i) * 0.5 + 0.5;
          uvs[i * 2 + 1] = pos.getY(i) * 0.5 + 0.5;
        }
        child.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }
    }
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial) {
        if (albedoTex && !m.map) {
          m.map = albedoTex;
          m.color.set(0xffffff);
        }
        if (normalTex && !m.normalMap) m.normalMap = normalTex;
        if (roughTex && !m.roughnessMap) m.roughnessMap = roughTex;
        m.needsUpdate = true;
      }
    }
  });
}

async function parseSingleModelBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  ext: string,
  resourceUrls: Map<string, string>,
  mtlContents: Map<string, string>,
  companionTextures: Array<{ name: string; url: string }>
): Promise<{ object: THREE.Object3D; animations: THREE.AnimationClip[]; warnings: string[]; notes?: string }> {
  const { manager, waitForPending } = buildLoadingManager(resourceUrls);
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const warnings: string[] = [];

  const finalizeAsset = async (
    result: { object: THREE.Object3D; animations: THREE.AnimationClip[]; warnings: string[]; notes?: string }
  ) => {
    await waitForPending();
    await applyCompanionTexturesIfMissing(result.object, companionTextures, manager);
    await waitForPending();
    return result;
  };

  switch (ext) {
    case 'blend': {
      const res = await parseBlendFile(buffer, fileName);
      return {
        object: res.group,
        animations: [],
        warnings: res.warnings,
        notes: `Blender v${res.version} (${res.pointerSize * 8}-bit SDNA)`,
      };
    }

    case 'glb':
    case 'gltf': {
      const loader = new GLTFLoader(manager);
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      loader.setDRACOLoader(draco);
      const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
        loader.parse(buffer, '', resolve, reject);
      });
      draco.dispose();
      gltf.scene.name = gltf.scene.name || baseName;
      return finalizeAsset({ object: gltf.scene, animations: gltf.animations ?? [], warnings });
    }

    case 'obj': {
      const text = new TextDecoder('utf-8').decode(buffer);
      const objLoader = new OBJLoader(manager);

      // Look for matching .mtl referenced by mtllib or any .mtl in the upload batch
      const mtlMatch = text.match(/^mtllib\s+(.+)$/im);
      let mtlText: string | undefined;
      if (mtlMatch) {
        const mtlName = mtlMatch[1].trim().split('/').pop() ?? '';
        mtlText = mtlContents.get(mtlName);
      }
      if (!mtlText && mtlContents.size > 0) {
        mtlText = mtlContents.values().next().value;
      }

      if (mtlText) {
        const mtlLoader = new MTLLoader(manager);
        const materials = mtlLoader.parse(mtlText, '');
        materials.preload();
        objLoader.setMaterials(materials);
      }

      const obj = objLoader.parse(text);
      obj.name = obj.name || baseName;
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && !child.material) {
          child.material = new THREE.MeshStandardMaterial({ color: 0xc5c9d1, roughness: 0.48, metalness: 0.08 });
        }
      });
      return finalizeAsset({ object: obj, animations: [], warnings });
    }

    case 'fbx': {
      const loader = new FBXLoader(manager);
      const fbx = loader.parse(buffer, '');
      fbx.name = fbx.name || baseName;
      return finalizeAsset({ object: fbx, animations: fbx.animations ?? [], warnings });
    }

    case 'stl': {
      const loader = new STLLoader(manager);
      const geometry = loader.parse(buffer);
      geometry.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xbec4ce,
        roughness: 0.42,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = baseName;
      return finalizeAsset({ object: mesh, animations: [], warnings });
    }

    case 'ply': {
      const loader = new PLYLoader(manager);
      const geometry = loader.parse(buffer);
      geometry.computeVertexNormals();
      const hasColors = !!geometry.getAttribute('color');
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: hasColors,
        roughness: 0.5,
        metalness: 0.08,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = baseName;
      return finalizeAsset({ object: mesh, animations: [], warnings });
    }

    case 'dae': {
      const text = new TextDecoder('utf-8').decode(buffer);
      const loader = new ColladaLoader(manager);
      const dae = loader.parse(text, '');
      if (!dae || !dae.scene) {
        throw new Error(`Could not parse Collada scene from "${fileName}".`);
      }
      dae.scene.name = dae.scene.name || baseName;
      return finalizeAsset({ object: dae.scene, animations: dae.scene.animations ?? [], warnings });
    }

    case '3ds': {
      const loader = new TDSLoader(manager);
      const obj = loader.parse(buffer, '');
      obj.name = obj.name || baseName;
      return finalizeAsset({ object: obj, animations: [], warnings });
    }

    case '3mf': {
      const loader = new ThreeMFLoader(manager);
      const obj = loader.parse(buffer);
      obj.name = obj.name || baseName;
      return { object: obj, animations: [], warnings };
    }

    case 'amf': {
      const loader = new AMFLoader(manager);
      const obj = loader.parse(buffer);
      obj.name = obj.name || baseName;
      return { object: obj, animations: [], warnings };
    }

    case 'usdz':
    case 'usd':
    case 'usda':
    case 'usdc': {
      const loader = new USDLoader(manager);
      const obj = loader.parse(buffer);
      obj.name = obj.name || baseName;
      return { object: obj, animations: [], warnings };
    }

    case 'vox': {
      const loader = new VOXLoader(manager);
      const vox = loader.parse(buffer);
      const group = new THREE.Group();
      group.name = baseName;
      if (vox.chunks && vox.chunks.length > 0) {
        vox.chunks.forEach((chunk, idx) => {
          const mesh = buildVoxMesh(chunk);
          mesh.name = `${baseName}_voxel_${idx + 1}`;
          group.add(mesh);
        });
      } else if (vox.scene) {
        group.add(vox.scene);
      }
      return { object: group, animations: [], warnings };
    }

    case 'wrl': {
      const text = new TextDecoder('utf-8').decode(buffer);
      const loader = new VRMLLoader(manager);
      const obj = loader.parse(text, '');
      obj.name = obj.name || baseName;
      return { object: obj, animations: [], warnings };
    }

    case 'pcd': {
      const loader = new PCDLoader(manager);
      const points = loader.parse(buffer);
      points.name = points.name || baseName;
      return { object: points, animations: [], warnings };
    }

    case 'xyz': {
      const text = new TextDecoder('utf-8').decode(buffer);
      const loader = new XYZLoader(manager);
      const geometry = await new Promise<THREE.BufferGeometry>((resolve) => {
        loader.parse(text, resolve);
      });
      const hasColors = !!geometry.getAttribute('color');
      const mat = new THREE.PointsMaterial({ size: 0.03, vertexColors: hasColors, color: 0xe2e8f0 });
      const points = new THREE.Points(geometry, mat);
      points.name = baseName;
      return { object: points, animations: [], warnings };
    }

    case 'lwo': {
      const loader = new LWOLoader(manager);
      const lwo = loader.parse(buffer, '', fileName);
      const group = new THREE.Group();
      group.name = baseName;
      lwo.meshes.forEach((m) => group.add(m));
      return { object: group, animations: [], warnings };
    }

    case 'kmz': {
      const blob = new Blob([buffer]);
      const url = URL.createObjectURL(blob);
      try {
        const loader = new KMZLoader(manager);
        const kmz = await loader.loadAsync(url);
        kmz.scene.name = kmz.scene.name || baseName;
        return { object: kmz.scene, animations: [], warnings };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    case 'svg': {
      const text = new TextDecoder('utf-8').decode(buffer);
      const loader = new SVGLoader(manager);
      const svgData = loader.parse(text);
      const group = new THREE.Group();
      group.name = baseName;
      svgData.paths.forEach((path, idx) => {
        const style = path.userData?.style as { fill?: string } | undefined;
        const fillColor = style?.fill;
        if (fillColor && fillColor !== 'none') {
          const shapes = SVGLoader.createShapes(path);
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setStyle(fillColor),
            roughness: 0.45,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });
          shapes.forEach((shape, sIdx) => {
            const geo = new THREE.ExtrudeGeometry(shape, {
              depth: 12,
              bevelEnabled: true,
              bevelThickness: 2,
              bevelSize: 1.5,
              bevelSegments: 2,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = `${baseName}_path_${idx}_${sIdx}`;
            group.add(mesh);
          });
        }
      });
      group.scale.y = -1; // SVG Y is inverted
      return { object: group, animations: [], warnings };
    }

    default:
      throw new Error(`Unsupported model extension ".${ext}".`);
  }
}

export async function importModelFiles(fileList: FileList | File[]): Promise<ImportedAsset[]> {
  const files = Array.from(fileList);
  if (files.length === 0) return [];

  // Pre-register auxiliary files (textures, .mtl, .bin) so multi-file OBJ/GLTF/FBX drops work automatically
  const resourceUrls = new Map<string, string>();
  const mtlContents = new Map<string, string>();
  const companionTextures: Array<{ name: string; url: string }> = [];
  const cleanupUrls: string[] = [];

  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'mtl') {
      mtlContents.set(f.name, await f.text());
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'gif', 'bin', 'mtl'].includes(ext)) {
      const url = URL.createObjectURL(f);
      cleanupUrls.push(url);
      registerResourceUrl(resourceUrls, f.name, url);
      if (['png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp'].includes(ext)) {
        companionTextures.push({ name: f.name, url });
      }
    }
  }

  const primaryFiles = files.filter((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    return !['mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'gif'].includes(ext);
  });

  if (primaryFiles.length === 0) {
    throw new Error('Please drop or select a 3D model file (.blend, .prisma, .p3d, .glb, .gltf, .obj, .fbx, .stl, .ply, .dae, .3ds, .usdz, .zip).');
  }

  const results: ImportedAsset[] = [];

  try {
    for (const file of primaryFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const buffer = await file.arrayBuffer();

      // Handle Prisma3D (.prisma, .p3d, .proj) or .zip bundles
      if (['prisma', 'p3d', 'proj', 'zip'].includes(ext)) {
        const archiveRes = await inspectPrismaOrArchive(buffer, file.name);
        cleanupUrls.push(...archiveRes.cleanupUrls);
        const mergedResources = new Map(resourceUrls);
        const archiveTextures = [...companionTextures];
        for (const [key, val] of archiveRes.resourceUrls.entries()) {
          registerResourceUrl(mergedResources, key, val);
          const kExt = key.split('.').pop()?.toLowerCase() ?? '';
          if (['png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp'].includes(kExt)) {
            if (!archiveTextures.some((t) => t.url === val)) {
              archiveTextures.push({ name: key, url: val });
            }
          }
        }
        const mergedMtls = new Map([...mtlContents, ...archiveRes.mtlContents]);

        if (archiveRes.embeddedModels.length > 0) {
          for (const emb of archiveRes.embeddedModels) {
            const parsed = await parseSingleModelBuffer(
              emb.buffer,
              emb.name,
              emb.ext,
              mergedResources,
              mergedMtls,
              archiveTextures
            );
            normalizeAndGroundObject(parsed.object);
            const stats = countGeometryStats(parsed.object);
            results.push({
              object: parsed.object,
              animations: parsed.animations,
              report: {
                fileName: `${file.name} → ${emb.name}`,
                format: `Prisma3D / ${emb.ext.toUpperCase()}`,
                objectCount: stats.meshCount,
                vertexCount: stats.vertexCount,
                triangleCount: stats.triangleCount,
                animationCount: parsed.animations.length,
                textureCount: countObjectTextures(parsed.object),
                warnings: [...archiveRes.warnings, ...parsed.warnings],
                notes: parsed.notes,
              },
            });
          }
        } else if (archiveRes.jsonGroup) {
          normalizeAndGroundObject(archiveRes.jsonGroup);
          const stats = countGeometryStats(archiveRes.jsonGroup);
          results.push({
            object: archiveRes.jsonGroup,
            animations: [],
            report: {
              fileName: file.name,
              format: 'Prisma3D Scene',
              objectCount: stats.meshCount,
              vertexCount: stats.vertexCount,
              triangleCount: stats.triangleCount,
              animationCount: 0,
              textureCount: countObjectTextures(archiveRes.jsonGroup),
              warnings: archiveRes.warnings,
            },
          });
        }
        continue;
      }

      // Handle JSON Three.js scenes directly
      if (ext === 'json') {
        const archiveRes = await inspectPrismaOrArchive(buffer, file.name);
        if (archiveRes.jsonGroup) {
          normalizeAndGroundObject(archiveRes.jsonGroup);
          const stats = countGeometryStats(archiveRes.jsonGroup);
          results.push({
            object: archiveRes.jsonGroup,
            animations: [],
            report: {
              fileName: file.name,
              format: 'JSON Scene',
              objectCount: stats.meshCount,
              vertexCount: stats.vertexCount,
              triangleCount: stats.triangleCount,
              animationCount: 0,
              textureCount: countObjectTextures(archiveRes.jsonGroup),
              warnings: archiveRes.warnings,
            },
          });
          continue;
        }
      }

      // Standard single-file format
      const parsed = await parseSingleModelBuffer(
        buffer,
        file.name,
        ext,
        resourceUrls,
        mtlContents,
        companionTextures
      );
      normalizeAndGroundObject(parsed.object);
      const stats = countGeometryStats(parsed.object);
      results.push({
        object: parsed.object,
        animations: parsed.animations,
        report: {
          fileName: file.name,
          format: ext.toUpperCase(),
          objectCount: stats.meshCount,
          vertexCount: stats.vertexCount,
          triangleCount: stats.triangleCount,
          animationCount: parsed.animations.length,
          textureCount: countObjectTextures(parsed.object),
          warnings: parsed.warnings,
          notes: parsed.notes,
        },
      });
    }
  } finally {
    // Allow Three.js loaders and mobile browsers to finish decoding blobs before revoking
    setTimeout(() => {
      cleanupUrls.forEach((u) => URL.revokeObjectURL(u));
    }, 15000);
  }

  return results;
}
