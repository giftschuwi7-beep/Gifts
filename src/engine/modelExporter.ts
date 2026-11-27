import * as THREE from 'three';
import JSZip from 'jszip';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import type { ExportFormat } from '../types/studio';

export interface ExportResultInfo {
  fileName: string;
  textureCount: number;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Generous delay so iOS Safari & Android Chrome complete download writes
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function textureImageToCanvas(tex: THREE.Texture): HTMLCanvasElement | null {
  const img = tex.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | { data?: Uint8Array | Uint8ClampedArray; width?: number; height?: number }
    | undefined;
  if (!img) return null;

  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
    return img;
  }

  const width =
    'naturalWidth' in img && img.naturalWidth
      ? img.naturalWidth
      : 'width' in img && typeof img.width === 'number'
      ? img.width
      : 0;
  const height =
    'naturalHeight' in img && img.naturalHeight
      ? img.naturalHeight
      : 'height' in img && typeof img.height === 'number'
      ? img.height
      : 0;

  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if ('data' in img && img.data && (img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray)) {
    const clamped =
      img.data instanceof Uint8ClampedArray ? img.data : new Uint8ClampedArray(img.data);
    if (clamped.length === width * height * 4) {
      const imageData = new ImageData(new Uint8ClampedArray(clamped), width, height);
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    }
    return null;
  }

  try {
    ctx.drawImage(img as CanvasImageSource, 0, 0, width, height);
    return canvas;
  } catch {
    return null;
  }
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function normalizeTexturesAndNames(root: THREE.Object3D): number {
  let matCounter = 1;
  const seenTextures = new Set<THREE.Texture>();
  const matNames = new Map<THREE.Material, string>();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m) continue;
      if (!matNames.has(m)) {
        const clean = (m.name || `Material_${matCounter}`).replace(/[^a-zA-Z0-9_-]+/g, '_');
        const unique = Array.from(matNames.values()).includes(clean)
          ? `${clean}_${matCounter}`
          : clean;
        matCounter++;
        m.name = unique;
        matNames.set(m, unique);
      }

      const std = m as THREE.MeshStandardMaterial;
      const slots: Array<keyof THREE.MeshStandardMaterial> = [
        'map',
        'normalMap',
        'bumpMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
        'aoMap',
        'alphaMap',
      ];
      for (const slot of slots) {
        const tex = std[slot] as THREE.Texture | null | undefined;
        if (!tex) continue;
        seenTextures.add(tex);
        // Ensure DataTextures or ImageBitmaps become Canvas-backed so GLTFExporter/USDZExporter succeed
        if (tex instanceof THREE.DataTexture || (typeof ImageBitmap !== 'undefined' && tex.image instanceof ImageBitmap)) {
          const canvas = textureImageToCanvas(tex);
          if (canvas) {
            tex.image = canvas;
            tex.needsUpdate = true;
          }
        }
      }
    }
  });

  return seenTextures.size;
}

async function buildObjMtlZip(
  target: THREE.Object3D,
  safeName: string
): Promise<{ blob: Blob; fileName: string; textureCount: number } | null> {
  const materials: THREE.Material[] = [];
  const seenMats = new Set<THREE.Material>();

  target.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (m && !seenMats.has(m)) {
        seenMats.add(m);
        materials.push(m);
      }
    }
  });

  const texToZipPath = new Map<THREE.Texture, string>();
  const zip = new JSZip();
  let texIdx = 1;

  for (const m of materials) {
    const std = m as THREE.MeshStandardMaterial;
    const texSlots: Array<{ tex: THREE.Texture | null | undefined; tag: string }> = [
      { tex: std.map, tag: 'albedo' },
      { tex: std.normalMap ?? std.bumpMap, tag: 'normal' },
      { tex: std.roughnessMap, tag: 'roughness' },
      { tex: std.emissiveMap, tag: 'emissive' },
      { tex: std.alphaMap, tag: 'alpha' },
    ];
    for (const { tex, tag } of texSlots) {
      if (!tex || texToZipPath.has(tex)) continue;
      const canvas = textureImageToCanvas(tex);
      if (!canvas) continue;
      const pngBlob = await canvasToPngBlob(canvas);
      if (!pngBlob) continue;
      const rawTexName = (tex.name || `${tag}_${texIdx}`).replace(/[^a-zA-Z0-9_-]+/g, '_');
      const texPath = `textures/${rawTexName}_${texIdx++}.png`;
      texToZipPath.set(tex, texPath);
      zip.file(texPath, pngBlob);
    }
  }

  // Only package into ZIP when textures exist (keeps plain OBJ direct when untextured)
  if (texToZipPath.size === 0) {
    return null;
  }

  const exporter = new OBJExporter();
  const objBody = exporter.parse(target);
  const objText = `mtllib ${safeName}.mtl\n${objBody}`;

  const mtlLines: string[] = [`# PrismForge 3D MTL Export`];
  for (const m of materials) {
    const std = m as THREE.MeshStandardMaterial;
    const col = std.color ?? new THREE.Color(0xc5c9d1);
    const em = std.emissive ?? new THREE.Color(0x000000);
    const emStr = typeof std.emissiveIntensity === 'number' ? std.emissiveIntensity : 0;
    const roughness = typeof std.roughness === 'number' ? std.roughness : 0.45;
    const shininess = Math.max(1, Math.round((1 - roughness) * 250));
    const opacity = typeof std.opacity === 'number' ? std.opacity : 1;

    mtlLines.push(`\nnewmtl ${m.name}`);
    mtlLines.push(`Ka 0.1500 0.1500 0.1500`);
    mtlLines.push(`Kd ${col.r.toFixed(4)} ${col.g.toFixed(4)} ${col.b.toFixed(4)}`);
    mtlLines.push(`Ks 0.2500 0.2500 0.2500`);
    mtlLines.push(`Ke ${(em.r * emStr).toFixed(4)} ${(em.g * emStr).toFixed(4)} ${(em.b * emStr).toFixed(4)}`);
    mtlLines.push(`Ns ${shininess}`);
    mtlLines.push(`d ${opacity.toFixed(4)}`);
    mtlLines.push(`illum 2`);

    if (std.map && texToZipPath.has(std.map)) {
      mtlLines.push(`map_Kd ${texToZipPath.get(std.map)}`);
    }
    const bumpTex = std.normalMap ?? std.bumpMap;
    if (bumpTex && texToZipPath.has(bumpTex)) {
      mtlLines.push(`map_Bump ${texToZipPath.get(bumpTex)}`);
    }
    if (std.roughnessMap && texToZipPath.has(std.roughnessMap)) {
      mtlLines.push(`map_Ns ${texToZipPath.get(std.roughnessMap)}`);
    }
    if (std.emissiveMap && texToZipPath.has(std.emissiveMap)) {
      mtlLines.push(`map_Ke ${texToZipPath.get(std.emissiveMap)}`);
    }
    if (std.alphaMap && texToZipPath.has(std.alphaMap)) {
      mtlLines.push(`map_d ${texToZipPath.get(std.alphaMap)}`);
    }
  }

  zip.file(`${safeName}.obj`, objText);
  zip.file(`${safeName}.mtl`, mtlLines.join('\n'));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    fileName: `${safeName}_obj_textured.zip`,
    textureCount: texToZipPath.size,
  };
}

export async function exportObject3D(
  target: THREE.Object3D,
  format: ExportFormat,
  baseName: string,
  animations?: THREE.AnimationClip[]
): Promise<ExportResultInfo> {
  const safeName = baseName.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'prismforge_model';
  const textureCount = normalizeTexturesAndNames(target);

  switch (format) {
    case 'glb': {
      const exporter = new GLTFExporter();
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          target,
          (result) => {
            if (result instanceof ArrayBuffer) {
              resolve(result);
            } else {
              const json = JSON.stringify(result);
              resolve(new TextEncoder().encode(json).buffer);
            }
          },
          reject,
          { binary: true, animations: animations && animations.length > 0 ? animations : undefined }
        );
      });
      const fileName = `${safeName}.glb`;
      triggerDownload(new Blob([buffer], { type: 'model/gltf-binary' }), fileName);
      return { fileName, textureCount };
    }

    case 'gltf': {
      const exporter = new GLTFExporter();
      const json = await new Promise<string>((resolve, reject) => {
        exporter.parse(
          target,
          (result) => resolve(JSON.stringify(result, null, 2)),
          reject,
          { binary: false, animations: animations && animations.length > 0 ? animations : undefined }
        );
      });
      const fileName = `${safeName}.gltf`;
      triggerDownload(new Blob([json], { type: 'model/gltf+json' }), fileName);
      return { fileName, textureCount };
    }

    case 'obj': {
      const zipBundle = await buildObjMtlZip(target, safeName);
      if (zipBundle) {
        triggerDownload(zipBundle.blob, zipBundle.fileName);
        return { fileName: zipBundle.fileName, textureCount: zipBundle.textureCount };
      }
      const exporter = new OBJExporter();
      const objText = exporter.parse(target);
      const fileName = `${safeName}.obj`;
      triggerDownload(new Blob([objText], { type: 'text/plain' }), fileName);
      return { fileName, textureCount: 0 };
    }

    case 'stl': {
      const exporter = new STLExporter();
      const result = exporter.parse(target, { binary: true });
      const blobPart: BlobPart =
        result instanceof DataView
          ? new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
          : String(result);
      const fileName = `${safeName}.stl`;
      triggerDownload(new Blob([blobPart], { type: 'application/octet-stream' }), fileName);
      return { fileName, textureCount: 0 };
    }

    case 'ply': {
      const exporter = new PLYExporter();
      const data = await new Promise<string | ArrayBuffer>((resolve) => {
        exporter.parse(target, (res) => resolve(res), { binary: true });
      });
      const blob =
        typeof data === 'string'
          ? new Blob([data], { type: 'text/plain' })
          : new Blob([data], { type: 'application/octet-stream' });
      const fileName = `${safeName}.ply`;
      triggerDownload(blob, fileName);
      return { fileName, textureCount: 0 };
    }

    case 'usdz': {
      const exporter = new USDZExporter();
      const arrayBuffer = await exporter.parseAsync(target);
      const fileName = `${safeName}.usdz`;
      triggerDownload(new Blob([arrayBuffer], { type: 'model/vnd.usdz+zip' }), fileName);
      return { fileName, textureCount };
    }
  }
}
