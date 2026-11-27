import * as THREE from 'three';
import JSZip from 'jszip';

export interface PrismaExtractResult {
  handledAsArchive: boolean;
  embeddedModels: Array<{
    name: string;
    ext: string;
    buffer: ArrayBuffer;
  }>;
  mtlContents: Map<string, string>;
  resourceUrls: Map<string, string>;
  jsonGroup?: THREE.Group;
  warnings: string[];
  cleanupUrls: string[];
}

function isZipHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

function tryParseJsonScene(text: string, baseName: string): THREE.Group | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // 1. Check Three.js ObjectLoader JSON format
  if (
    typeof data === 'object' &&
    data !== null &&
    ('object' in data || 'geometries' in data || ('metadata' in data && 'type' in (data as Record<string, unknown>)))
  ) {
    try {
      const loader = new THREE.ObjectLoader();
      const parsed = loader.parse(data);
      const group = new THREE.Group();
      group.name = baseName;
      group.add(parsed);
      return group;
    } catch {
      // fall through to generic scene JSON parser
    }
  }

  // 2. Generic / Prisma3D-style JSON object tree or vertex/face arrays
  const group = new THREE.Group();
  group.name = baseName;

  const createPrimitiveFromType = (typeStr: string): THREE.BufferGeometry => {
    const t = typeStr.toLowerCase();
    if (t.includes('sphere') || t.includes('ball')) return new THREE.SphereGeometry(0.6, 32, 24);
    if (t.includes('cylinder') || t.includes('tube')) return new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32);
    if (t.includes('cone')) return new THREE.ConeGeometry(0.6, 1.2, 32);
    if (t.includes('pyramid')) return new THREE.ConeGeometry(0.7, 1.1, 4);
    if (t.includes('prism')) return new THREE.CylinderGeometry(0.6, 0.6, 1.1, 3);
    if (t.includes('torus') || t.includes('donut')) return new THREE.TorusGeometry(0.55, 0.2, 20, 48);
    if (t.includes('plane') || t.includes('quad')) return new THREE.PlaneGeometry(1.5, 1.5);
    return new THREE.BoxGeometry(1, 1, 1);
  };

  const buildNode = (node: Record<string, unknown>, parent: THREE.Object3D) => {
    const nodeName = String(node.name ?? node.title ?? node.id ?? 'PrismaObject');
    const typeStr = String(node.type ?? node.primitive ?? node.shape ?? node.kind ?? '');

    let obj: THREE.Object3D | null = null;

    // Check explicit mesh geometry arrays (vertices / positions + faces / indices)
    const vertsRaw = (node.vertices ?? node.positions ?? node.verts) as number[] | number[][] | undefined;
    const facesRaw = (node.indices ?? node.faces ?? node.triangles) as number[] | number[][] | undefined;

    if (Array.isArray(vertsRaw) && vertsRaw.length > 0) {
      const flatVerts = Array.isArray(vertsRaw[0]) ? (vertsRaw as number[][]).flat() : (vertsRaw as number[]);
      if (flatVerts.length >= 9) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(flatVerts, 3));
        if (Array.isArray(facesRaw) && facesRaw.length > 0) {
          const flatIndices: number[] = [];
          if (Array.isArray(facesRaw[0])) {
            for (const f of facesRaw as number[][]) {
              if (f.length >= 3) {
                for (let k = 1; k < f.length - 1; k++) {
                  flatIndices.push(f[0], f[k], f[k + 1]);
                }
              }
            }
          } else {
            flatIndices.push(...(facesRaw as number[]));
          }
          if (flatIndices.length >= 3) {
            geo.setIndex(flatIndices);
          }
        }
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({
          color: typeof node.color === 'string' ? node.color : 0xb8bec8,
          roughness: typeof node.roughness === 'number' ? node.roughness : 0.45,
          metalness: typeof node.metalness === 'number' ? node.metalness : 0.1,
        });
        obj = new THREE.Mesh(geo, mat);
      }
    } else if (
      typeStr &&
      !typeStr.toLowerCase().includes('light') &&
      !typeStr.toLowerCase().includes('camera') &&
      (typeStr.toLowerCase().includes('cube') ||
        typeStr.toLowerCase().includes('box') ||
        typeStr.toLowerCase().includes('sphere') ||
        typeStr.toLowerCase().includes('cylinder') ||
        typeStr.toLowerCase().includes('cone') ||
        typeStr.toLowerCase().includes('pyramid') ||
        typeStr.toLowerCase().includes('prism') ||
        typeStr.toLowerCase().includes('torus') ||
        typeStr.toLowerCase().includes('plane') ||
        typeStr.toLowerCase().includes('mesh'))
    ) {
      const geo = createPrimitiveFromType(typeStr);
      const mat = new THREE.MeshStandardMaterial({
        color: typeof node.color === 'string' ? node.color : 0xb8bec8,
        roughness: typeof node.roughness === 'number' ? node.roughness : 0.45,
        metalness: typeof node.metalness === 'number' ? node.metalness : 0.1,
      });
      obj = new THREE.Mesh(geo, mat);
    }

    const container = obj ?? new THREE.Group();
    container.name = nodeName;

    // Transforms
    const pos = node.position ?? node.pos ?? node.translation;
    if (Array.isArray(pos) && pos.length >= 3) {
      container.position.set(Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0);
    } else if (pos && typeof pos === 'object') {
      const p = pos as Record<string, number>;
      container.position.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0);
    }

    const rot = node.rotation ?? node.rot ?? node.euler;
    if (Array.isArray(rot) && rot.length >= 3) {
      container.rotation.set(Number(rot[0]) || 0, Number(rot[1]) || 0, Number(rot[2]) || 0);
    } else if (rot && typeof rot === 'object') {
      const r = rot as Record<string, number>;
      container.rotation.set(Number(r.x) || 0, Number(r.y) || 0, Number(r.z) || 0);
    }

    const scl = node.scale ?? node.scl ?? node.size;
    if (Array.isArray(scl) && scl.length >= 3) {
      container.scale.set(Number(scl[0]) || 1, Number(scl[1]) || 1, Number(scl[2]) || 1);
    } else if (scl && typeof scl === 'object') {
      const s = scl as Record<string, number>;
      container.scale.set(Number(s.x) || 1, Number(s.y) || 1, Number(s.z) || 1);
    }

    const children = (node.children ?? node.objects ?? node.nodes ?? node.meshes) as unknown[];
    if (Array.isArray(children)) {
      for (const ch of children) {
        if (ch && typeof ch === 'object') {
          buildNode(ch as Record<string, unknown>, container);
        }
      }
    }

    // Only attach if it is a mesh or has mesh descendants
    let hasMesh = container instanceof THREE.Mesh;
    if (!hasMesh) {
      container.traverse((c) => {
        if (c instanceof THREE.Mesh) hasMesh = true;
      });
    }
    if (hasMesh) {
      if (container instanceof THREE.Mesh) {
        container.castShadow = true;
        container.receiveShadow = true;
      }
      parent.add(container);
    }
  };

  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') buildNode(item as Record<string, unknown>, group);
    }
  } else if (typeof data === 'object' && data !== null) {
    buildNode(data as Record<string, unknown>, group);
  }

  let meshCount = 0;
  group.traverse((c) => {
    if (c instanceof THREE.Mesh) meshCount++;
  });

  return meshCount > 0 ? group : null;
}

const SUPPORTED_MODEL_EXTS = new Set([
  'glb',
  'gltf',
  'obj',
  'fbx',
  'stl',
  'ply',
  'dae',
  '3ds',
  '3mf',
  'amf',
  'usdz',
  'vox',
  'wrl',
  'lwo',
  'blend',
]);

const TEXTURE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tga', 'gif']);

export async function inspectPrismaOrArchive(buffer: ArrayBuffer, fileName: string): Promise<PrismaExtractResult> {
  const bytes = new Uint8Array(buffer);
  const resourceUrls = new Map<string, string>();
  const mtlContents = new Map<string, string>();
  const embeddedModels: Array<{ name: string; ext: string; buffer: ArrayBuffer }> = [];
  const cleanupUrls: string[] = [];
  const warnings: string[] = [];

  if (isZipHeader(bytes)) {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files).filter((f) => !f.dir);
    let jsonGroup: THREE.Group | undefined;
    const foundProjFiles: string[] = [];

    for (const entry of entries) {
      const cleanName = entry.name.split('/').pop() ?? entry.name;
      const ext = cleanName.split('.').pop()?.toLowerCase() ?? '';

      if (TEXTURE_EXTS.has(ext) || ext === 'bin' || ext === 'mtl') {
        const blob = await entry.async('blob');
        const url = URL.createObjectURL(blob);
        cleanupUrls.push(url);
        resourceUrls.set(entry.name, url);
        resourceUrls.set(cleanName, url);
        if (ext === 'mtl') {
          mtlContents.set(cleanName, await entry.async('text'));
        }
      }

      if (SUPPORTED_MODEL_EXTS.has(ext)) {
        const modelBuf = await entry.async('arraybuffer');
        embeddedModels.push({ name: cleanName, ext, buffer: modelBuf });
      } else if (ext === 'json' || ext === 'p3d' || ext === 'proj') {
        if (ext === 'proj') foundProjFiles.push(cleanName);
        try {
          const text = await entry.async('text');
          const parsed = tryParseJsonScene(text, cleanName.replace(/\.[^.]+$/, ''));
          if (parsed && !jsonGroup) {
            jsonGroup = parsed;
          }
        } catch {
          // binary .proj
        }
      }
    }

    if (embeddedModels.length === 0 && !jsonGroup) {
      if (foundProjFiles.length > 0) {
        throw new Error(
          `Opened Prisma3D archive "${fileName}" (${entries.length} files, workspace "${foundProjFiles[0]}"). This .prisma archive stores Prisma3D's proprietary binary .proj workspace without an embedded .obj/.glb mesh. In Prisma3D, tap Export → OBJ / GLB / FBX (or zip the exported files) to load the full 3D geometry here.`
        );
      }
      throw new Error(
        `Archive "${fileName}" contains ${entries.length} files, but no supported 3D geometry (.glb, .obj, .fbx, .stl, .dae, .blend, or JSON scene) was found inside.`
      );
    }

    return {
      handledAsArchive: true,
      embeddedModels,
      mtlContents,
      resourceUrls,
      jsonGroup,
      warnings,
      cleanupUrls,
    };
  }

  // Non-ZIP .p3d / .prisma / .proj / .json file: try UTF-8 JSON scene parsing
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const parsed = tryParseJsonScene(text, fileName.replace(/\.[^.]+$/, ''));
  if (parsed) {
    return {
      handledAsArchive: false,
      embeddedModels: [],
      mtlContents,
      resourceUrls,
      jsonGroup: parsed,
      warnings,
      cleanupUrls,
    };
  }

  // Check if it starts with OBJ vertices/faces despite .p3d/.prisma extension
  if (/^\s*(v|vn|vt|o|g|f)\s+/m.test(text.slice(0, 2048))) {
    return {
      handledAsArchive: false,
      embeddedModels: [{ name: fileName, ext: 'obj', buffer }],
      mtlContents,
      resourceUrls,
      warnings: [`Detected Wavefront OBJ mesh content inside "${fileName}".`],
      cleanupUrls,
    };
  }

  throw new Error(
    `"${fileName}" uses a proprietary binary Prisma3D project layout without standard mesh blocks. To import any Prisma3D model into PrismForge 3D, open it in Prisma3D and export as OBJ, GLB, or FBX (all supported directly).`
  );
}
