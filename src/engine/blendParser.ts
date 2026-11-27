import * as THREE from 'three';
import { decompress as decompressZstd } from 'fzstd';

interface BHead {
  code: string;
  size: number;
  old: bigint;
  sdnaNr: number;
  len: number;
  dataOffset: number;
}

interface SdnasField {
  typeIdx: number;
  typeName: string;
  typeSize: number;
  name: string;
  baseName: string;
  isPointer: boolean;
  arrayCount: number;
  offset: number;
  byteSize: number;
}

interface SdnasStruct {
  typeIdx: number;
  name: string;
  byteSize: number;
  fields: SdnasField[];
  fieldMap: Map<string, SdnasField>;
}

export interface BlendParseResult {
  group: THREE.Group;
  version: string;
  pointerSize: number;
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  warnings: string[];
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    const c = bytes[offset + i];
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

function readCString(bytes: Uint8Array, offset: number, maxEnd: number): { str: string; next: number } {
  let end = offset;
  while (end < maxEnd && bytes[end] !== 0) end++;
  const str = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset, end));
  return { str, next: end + 1 };
}

function parseArrayInfo(rawName: string): { baseName: string; isPointer: boolean; arrayCount: number } {
  let isPointer = rawName.startsWith('*') || rawName.startsWith('(*');
  let clean = rawName.replace(/^\*+/, '');
  // Handle function pointers like (*func)()
  if (clean.includes('(')) {
    isPointer = true;
    const m = clean.match(/\(\*?([a-zA-Z0-9_]+)\)/);
    clean = m ? m[1] : clean;
  }
  const brackets = [...clean.matchAll(/\[(\d+)\]/g)];
  let arrayCount = 1;
  for (const b of brackets) {
    arrayCount *= parseInt(b[1], 10);
  }
  const baseName = clean.replace(/\[.*?\]/g, '').trim();
  return { baseName, isPointer, arrayCount };
}

async function decompressIfNeeded(buffer: ArrayBuffer): Promise<Uint8Array> {
  const raw = new Uint8Array(buffer);
  // GZIP magic: 1f 8b
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([raw]).stream().pipeThrough(ds);
      const decompressed = await new Response(stream).arrayBuffer();
      return new Uint8Array(decompressed);
    }
    throw new Error('GZIP-compressed .blend file requires browser DecompressionStream support.');
  }
  // Zstandard magic: 28 b5 2f fd
  if (raw.length >= 4 && raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd) {
    return decompressZstd(raw);
  }
  return raw;
}

function parseSDNA(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  size: number,
  littleEndian: boolean,
  pointerSize: number
): { structs: SdnasStruct[]; structsByName: Map<string, SdnasStruct> } {
  const end = offset + size;
  let pos = offset;
  const sig = readAscii(bytes, pos, 4);
  if (sig !== 'SDNA') {
    throw new Error('Invalid DNA1 block in .blend file.');
  }
  pos += 4;

  const align4 = (p: number) => (p + 3) & ~3;

  // NAME
  if (readAscii(bytes, pos, 4) !== 'NAME') throw new Error('Missing NAME in SDNA');
  pos += 4;
  const numNames = view.getInt32(pos, littleEndian);
  pos += 4;
  const names: string[] = [];
  for (let i = 0; i < numNames; i++) {
    const { str, next } = readCString(bytes, pos, end);
    names.push(str);
    pos = next;
  }
  pos = align4(pos);

  // TYPE
  if (readAscii(bytes, pos, 4) !== 'TYPE') throw new Error('Missing TYPE in SDNA');
  pos += 4;
  const numTypes = view.getInt32(pos, littleEndian);
  pos += 4;
  const types: string[] = [];
  for (let i = 0; i < numTypes; i++) {
    const { str, next } = readCString(bytes, pos, end);
    types.push(str);
    pos = next;
  }
  pos = align4(pos);

  // TLEN
  if (readAscii(bytes, pos, 4) !== 'TLEN') throw new Error('Missing TLEN in SDNA');
  pos += 4;
  const typeLens: number[] = [];
  for (let i = 0; i < numTypes; i++) {
    typeLens.push(view.getUint16(pos, littleEndian));
    pos += 2;
  }
  pos = align4(pos);

  // STRC
  if (readAscii(bytes, pos, 4) !== 'STRC') throw new Error('Missing STRC in SDNA');
  pos += 4;
  const numStructs = view.getInt32(pos, littleEndian);
  pos += 4;

  const structs: SdnasStruct[] = [];
  const structsByName = new Map<string, SdnasStruct>();

  for (let i = 0; i < numStructs; i++) {
    const typeIdx = view.getUint16(pos, littleEndian);
    const numFields = view.getUint16(pos + 2, littleEndian);
    pos += 4;

    const structName = types[typeIdx] ?? `Struct_${i}`;
    const fields: SdnasField[] = [];
    const fieldMap = new Map<string, SdnasField>();
    let fieldOffset = 0;

    for (let f = 0; f < numFields; f++) {
      const fTypeIdx = view.getUint16(pos, littleEndian);
      const fNameIdx = view.getUint16(pos + 2, littleEndian);
      pos += 4;

      const rawName = names[fNameIdx] ?? '';
      const typeName = types[fTypeIdx] ?? 'unknown';
      const { baseName, isPointer, arrayCount } = parseArrayInfo(rawName);
      const unitSize = isPointer ? pointerSize : (typeLens[fTypeIdx] ?? 0);
      const byteSize = unitSize * arrayCount;

      const field: SdnasField = {
        typeIdx: fTypeIdx,
        typeName,
        typeSize: unitSize,
        name: rawName,
        baseName,
        isPointer,
        arrayCount,
        offset: fieldOffset,
        byteSize,
      };
      fields.push(field);
      if (baseName) fieldMap.set(baseName, field);
      fieldOffset += byteSize;
    }

    const s: SdnasStruct = {
      typeIdx,
      name: structName,
      byteSize: typeLens[typeIdx] ?? fieldOffset,
      fields,
      fieldMap,
    };
    structs.push(s);
    structsByName.set(structName, s);
  }

  return { structs, structsByName };
}

export async function parseBlendFile(buffer: ArrayBuffer, fileName: string): Promise<BlendParseResult> {
  const bytes = await decompressIfNeeded(buffer);
  if (bytes.length < 16 || readAscii(bytes, 0, 7) !== 'BLENDER') {
    throw new Error(`"${fileName}" does not have a valid BLENDER header.`);
  }

  const pointerChar = String.fromCharCode(bytes[7]);
  const endianChar = String.fromCharCode(bytes[8]);
  const pointerSize = pointerChar === '-' ? 8 : 4;
  const littleEndian = endianChar === 'v';
  const rawVer = readAscii(bytes, 9, 3);
  const version = rawVer.length === 3 ? `${rawVer[0]}.${rawVer.slice(1)}` : rawVer;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bheads: BHead[] = [];
  const blockByOldPtr = new Map<bigint, BHead>();
  let dnaBlock: BHead | null = null;

  let pos = 12;
  const bheadSize = pointerSize === 8 ? 24 : 16;

  while (pos + bheadSize <= bytes.length) {
    const code = readAscii(bytes, pos, 4);
    const size = view.getInt32(pos + 4, littleEndian);
    let old: bigint;
    let sdnaNr: number;
    let len: number;

    if (pointerSize === 8) {
      old = view.getBigUint64(pos + 8, littleEndian);
      sdnaNr = view.getInt32(pos + 16, littleEndian);
      len = view.getInt32(pos + 20, littleEndian);
    } else {
      old = BigInt(view.getUint32(pos + 8, littleEndian));
      sdnaNr = view.getInt32(pos + 12, littleEndian);
      len = view.getInt32(pos + 16, littleEndian);
    }

    const dataOffset = pos + bheadSize;
    if (size < 0 || dataOffset + size > bytes.length) {
      break;
    }

    const bh: BHead = { code, size, old, sdnaNr, len, dataOffset };
    bheads.push(bh);
    if (old !== 0n) {
      blockByOldPtr.set(old, bh);
    }
    if (code === 'DNA1') {
      dnaBlock = bh;
    }
    pos = dataOffset + size;
    if (code === 'ENDB') break;
  }

  if (!dnaBlock) {
    throw new Error('Could not find SDNA structure block (DNA1) inside .blend file.');
  }

  const { structs, structsByName } = parseSDNA(
    bytes,
    view,
    dnaBlock.dataOffset,
    dnaBlock.size,
    littleEndian,
    pointerSize
  );

  // Helpers to read typed fields from a struct instance in bytes
  const readPtr = (baseOffset: number, field?: SdnasField): bigint => {
    if (!field) return 0n;
    const p = baseOffset + field.offset;
    if (p + pointerSize > bytes.length) return 0n;
    return pointerSize === 8 ? view.getBigUint64(p, littleEndian) : BigInt(view.getUint32(p, littleEndian));
  };

  const readInt32 = (baseOffset: number, field?: SdnasField, index = 0): number => {
    if (!field) return 0;
    const p = baseOffset + field.offset + index * 4;
    if (p + 4 > bytes.length) return 0;
    return view.getInt32(p, littleEndian);
  };

  const readInt16 = (baseOffset: number, field?: SdnasField, index = 0): number => {
    if (!field) return 0;
    const p = baseOffset + field.offset + index * 2;
    if (p + 2 > bytes.length) return 0;
    return view.getInt16(p, littleEndian);
  };

  const readFloat32 = (baseOffset: number, field?: SdnasField, index = 0): number => {
    if (!field) return 0;
    const p = baseOffset + field.offset + index * 4;
    if (p + 4 > bytes.length) return 0;
    return view.getFloat32(p, littleEndian);
  };

  const readStringField = (baseOffset: number, field?: SdnasField): string => {
    if (!field) return '';
    return readAscii(bytes, baseOffset + field.offset, Math.min(field.byteSize, 128));
  };

  const warnings: string[] = [];

  // Helper to decode a PackedFile struct into an Image-backed THREE.Texture
  const decodePackedImage = async (imgBlock: BHead): Promise<THREE.Texture | null> => {
    const imgStruct = structs[imgBlock.sdnaNr] ?? structsByName.get('Image');
    if (!imgStruct) return null;

    let packedPtr = readPtr(imgBlock.dataOffset, imgStruct.fieldMap.get('packedfile'));
    if (packedPtr === 0n) {
      const packedfilesField = imgStruct.fieldMap.get('packedfiles');
      const listBaseStruct = structsByName.get('ListBase');
      const imgPackedStruct = structsByName.get('ImagePackedFile');
      if (packedfilesField && listBaseStruct && imgPackedStruct) {
        const firstPtr = readPtr(
          imgBlock.dataOffset + packedfilesField.offset,
          listBaseStruct.fieldMap.get('first')
        );
        if (firstPtr !== 0n) {
          const ipfBlock = blockByOldPtr.get(firstPtr);
          if (ipfBlock) {
            packedPtr = readPtr(ipfBlock.dataOffset, imgPackedStruct.fieldMap.get('packedfile'));
          }
        }
      }
    }
    if (packedPtr === 0n) return null;

    const pfBlock = blockByOldPtr.get(packedPtr);
    const pfStruct = structsByName.get('PackedFile');
    if (!pfBlock || !pfStruct) return null;

    const size = readInt32(pfBlock.dataOffset, pfStruct.fieldMap.get('size'));
    const dataPtr = readPtr(pfBlock.dataOffset, pfStruct.fieldMap.get('data'));
    if (size <= 0 || dataPtr === 0n) return null;

    const dataBlock = blockByOldPtr.get(dataPtr);
    if (!dataBlock || dataBlock.size < size) return null;

    const rawBytes = bytes.slice(dataBlock.dataOffset, dataBlock.dataOffset + size);
    const blob = new Blob([rawBytes]);
    const url = URL.createObjectURL(blob);
    try {
      const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to decode packed .blend texture'));
        image.src = url;
      });
      const imgName = readStringField(imgBlock.dataOffset, imgStruct.fieldMap.get('id')).replace(/^IM/, '') || 'BlendTexture';
      const tex = new THREE.Texture(imgEl);
      tex.name = imgName;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.flipY = true;
      tex.needsUpdate = true;
      return tex;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Parse packed Images (IM)
  const imageTextureMap = new Map<bigint, THREE.Texture>();
  for (const bh of bheads) {
    if (bh.code !== 'IM') continue;
    const tex = await decodePackedImage(bh);
    if (tex) {
      imageTextureMap.set(bh.old, tex);
    }
  }

  // Helper to resolve an Image texture referenced inside a Material's ShaderNodeTree
  const findNodeTreeImage = (nodeTreePtr: bigint): THREE.Texture | null => {
    if (nodeTreePtr === 0n || imageTextureMap.size === 0) return null;
    const ntBlock = blockByOldPtr.get(nodeTreePtr);
    const ntStruct = structsByName.get('bNodeTree');
    const listBaseStruct = structsByName.get('ListBase');
    const nodeStruct = structsByName.get('bNode');
    if (!ntBlock || !ntStruct || !listBaseStruct || !nodeStruct) return null;

    const nodesField = ntStruct.fieldMap.get('nodes');
    if (!nodesField) return null;
    let nodePtr = readPtr(ntBlock.dataOffset + nodesField.offset, listBaseStruct.fieldMap.get('first'));
    const nextField = nodeStruct.fieldMap.get('next');
    const idField = nodeStruct.fieldMap.get('id');
    const idnameField = nodeStruct.fieldMap.get('idname');

    let guard = 0;
    while (nodePtr !== 0n && guard++ < 512) {
      const nb = blockByOldPtr.get(nodePtr);
      if (!nb) break;
      const idPtr = readPtr(nb.dataOffset, idField);
      if (idPtr !== 0n && imageTextureMap.has(idPtr)) {
        const idname = readStringField(nb.dataOffset, idnameField).toLowerCase();
        const tex = imageTextureMap.get(idPtr)!;
        // Prefer color/diffuse image over normal/roughness masks
        if (!idname || idname.includes('teximage')) {
          const tName = tex.name.toLowerCase();
          if (!tName.includes('normal') && !tName.includes('rough') && !tName.includes('bump')) {
            return tex;
          }
        }
      }
      nodePtr = readPtr(nb.dataOffset, nextField);
    }
    return null;
  };

  // Parse materials (MA)
  const materialMap = new Map<bigint, THREE.MeshStandardMaterial>();
  for (const bh of bheads) {
    if (bh.code !== 'MA') continue;
    const st = structs[bh.sdnaNr] ?? structsByName.get('Material');
    if (!st) continue;
    const r = readFloat32(bh.dataOffset, st.fieldMap.get('r'));
    const g = readFloat32(bh.dataOffset, st.fieldMap.get('g'));
    const b = readFloat32(bh.dataOffset, st.fieldMap.get('b'));
    const roughnessField = st.fieldMap.get('roughness');
    const metallicField = st.fieldMap.get('metallic');
    const roughness = roughnessField ? THREE.MathUtils.clamp(readFloat32(bh.dataOffset, roughnessField), 0.05, 1) : 0.45;
    const metallic = metallicField ? THREE.MathUtils.clamp(readFloat32(bh.dataOffset, metallicField), 0, 1) : 0.0;
    const rawName = readStringField(bh.dataOffset, st.fieldMap.get('id'));
    const nodeTreePtr = readPtr(bh.dataOffset, st.fieldMap.get('nodetree'));
    const linkedTex = findNodeTreeImage(nodeTreePtr);
    const mat = new THREE.MeshStandardMaterial({
      name: rawName.replace(/^MA/, '') || 'BlenderMaterial',
      color: linkedTex
        ? new THREE.Color(0xffffff)
        : new THREE.Color().setRGB(
            Number.isFinite(r) ? THREE.MathUtils.clamp(r, 0, 1) : 0.72,
            Number.isFinite(g) ? THREE.MathUtils.clamp(g, 0, 1) : 0.74,
            Number.isFinite(b) ? THREE.MathUtils.clamp(b, 0, 1) : 0.78
          ),
      map: linkedTex ?? null,
      roughness: Number.isFinite(roughness) ? roughness : 0.45,
      metalness: Number.isFinite(metallic) ? metallic : 0,
    });
    materialMap.set(bh.old, mat);
  }

  // Helper to extract CustomData layers from a CustomData sub-struct inside Mesh
  const extractCustomDataLayers = (
    meshOffset: number,
    cdField: SdnasField | undefined
  ): Array<{ name: string; type: number; dataPtr: bigint }> => {
    if (!cdField) return [];
    const cdStruct = structsByName.get('CustomData');
    const layerStruct = structsByName.get('CustomDataLayer');
    if (!cdStruct || !layerStruct) return [];

    const cdOffset = meshOffset + cdField.offset;
    const totLayer = readInt32(cdOffset, cdStruct.fieldMap.get('totlayer'));
    const layersPtr = readPtr(cdOffset, cdStruct.fieldMap.get('layers'));
    if (!layersPtr || totLayer <= 0) return [];

    const layersBlock = blockByOldPtr.get(layersPtr);
    if (!layersBlock) return [];

    const result: Array<{ name: string; type: number; dataPtr: bigint }> = [];
    const stride = layerStruct.byteSize;
    const count = Math.min(totLayer, Math.floor(layersBlock.size / Math.max(stride, 1)));

    for (let i = 0; i < count; i++) {
      const lOff = layersBlock.dataOffset + i * stride;
      const type = readInt32(lOff, layerStruct.fieldMap.get('type'));
      const name = readStringField(lOff, layerStruct.fieldMap.get('name'));
      const dataPtr = readPtr(lOff, layerStruct.fieldMap.get('data'));
      result.push({ name, type, dataPtr });
    }
    return result;
  };

  // Parse Meshes (ME)
  interface ParsedMeshData {
    name: string;
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    vertexCount: number;
    triangleCount: number;
  }

  const parsedMeshes = new Map<bigint, ParsedMeshData>();
  let totalVertices = 0;
  let totalTriangles = 0;

  for (const bh of bheads) {
    if (bh.code !== 'ME') continue;
    const st = structs[bh.sdnaNr] ?? structsByName.get('Mesh');
    if (!st) continue;

    const base = bh.dataOffset;
    const meshName = readStringField(base, st.fieldMap.get('id')).replace(/^ME/, '') || 'Mesh';

    const totvert = readInt32(base, st.fieldMap.get('totvert')) || readInt32(base, st.fieldMap.get('verts_num'));
    const totpoly =
      readInt32(base, st.fieldMap.get('totpoly')) ||
      readInt32(base, st.fieldMap.get('faces_num')) ||
      readInt32(base, st.fieldMap.get('totface'));
    const totloop =
      readInt32(base, st.fieldMap.get('totloop')) ||
      readInt32(base, st.fieldMap.get('corners_num'));

    if (totvert <= 0) continue;

    // 1) Read vertex positions: try Blender 4.x CustomData vdata ("position") or legacy mvert
    let vertices: Float32Array | null = null;
    const vLayers = extractCustomDataLayers(base, st.fieldMap.get('vdata') ?? st.fieldMap.get('vert_data'));
    const posLayer =
      vLayers.find((l) => l.name === 'position') ??
      vLayers.find((l) => l.type === 50 /* CD_PROP_FLOAT3 */) ??
      vLayers.find((l) => l.type === 0 /* CD_MVERT */);

    const mvertPtr = readPtr(base, st.fieldMap.get('mvert'));

    if (posLayer && posLayer.dataPtr !== 0n) {
      const vb = blockByOldPtr.get(posLayer.dataPtr);
      if (vb) {
        const vbStruct = structs[vb.sdnaNr];
        if (vbStruct && vbStruct.name === 'MVert') {
          const coField = vbStruct.fieldMap.get('co');
          const stride = vbStruct.byteSize;
          vertices = new Float32Array(totvert * 3);
          for (let i = 0; i < totvert; i++) {
            const vOff = vb.dataOffset + i * stride;
            const x = readFloat32(vOff, coField, 0);
            const y = readFloat32(vOff, coField, 1);
            const z = readFloat32(vOff, coField, 2);
            // Convert Blender Z-up to Three.js Y-up: (x, z, -y)
            vertices[i * 3] = x;
            vertices[i * 3 + 1] = z;
            vertices[i * 3 + 2] = -y;
          }
        } else {
          // Raw float32[3] array (vec3f)
          const stride = 12;
          const count = Math.min(totvert, Math.floor(vb.size / stride));
          vertices = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            const p = vb.dataOffset + i * stride;
            const x = view.getFloat32(p, littleEndian);
            const y = view.getFloat32(p + 4, littleEndian);
            const z = view.getFloat32(p + 8, littleEndian);
            vertices[i * 3] = x;
            vertices[i * 3 + 1] = z;
            vertices[i * 3 + 2] = -y;
          }
        }
      }
    } else if (mvertPtr !== 0n) {
      const vb = blockByOldPtr.get(mvertPtr);
      const mvertStruct = structsByName.get('MVert');
      if (vb && mvertStruct) {
        const coField = mvertStruct.fieldMap.get('co');
        const stride = mvertStruct.byteSize;
        const count = Math.min(totvert, Math.floor(vb.size / Math.max(stride, 12)));
        vertices = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const vOff = vb.dataOffset + i * stride;
          const x = readFloat32(vOff, coField, 0);
          const y = readFloat32(vOff, coField, 1);
          const z = readFloat32(vOff, coField, 2);
          vertices[i * 3] = x;
          vertices[i * 3 + 1] = z;
          vertices[i * 3 + 2] = -y;
        }
      }
    }

    if (!vertices || vertices.length === 0) {
      warnings.push(`Mesh "${meshName}" has no readable vertex positions (may require realizing modifiers in Blender).`);
      continue;
    }

    // 2) Read corner vertex indices (mloop or .corner_vert)
    let loopVerts: Int32Array | null = null;
    const lLayers = extractCustomDataLayers(base, st.fieldMap.get('ldata') ?? st.fieldMap.get('loop_data'));
    const cornerLayer =
      lLayers.find((l) => l.name === '.corner_vert') ??
      lLayers.find((l) => l.type === 26 /* CD_MLOOP */) ??
      lLayers.find((l) => l.type === 11 /* CD_PROP_INT32 */);

    const mloopPtr = readPtr(base, st.fieldMap.get('mloop'));

    if (cornerLayer && cornerLayer.dataPtr !== 0n && totloop > 0) {
      const lb = blockByOldPtr.get(cornerLayer.dataPtr);
      if (lb) {
        const lbStruct = structs[lb.sdnaNr];
        if (lbStruct && lbStruct.name === 'MLoop') {
          const vField = lbStruct.fieldMap.get('v');
          const stride = lbStruct.byteSize;
          loopVerts = new Int32Array(totloop);
          for (let i = 0; i < totloop; i++) {
            loopVerts[i] = readInt32(lb.dataOffset + i * stride, vField);
          }
        } else {
          const count = Math.min(totloop, Math.floor(lb.size / 4));
          loopVerts = new Int32Array(count);
          for (let i = 0; i < count; i++) {
            loopVerts[i] = view.getInt32(lb.dataOffset + i * 4, littleEndian);
          }
        }
      }
    } else if (mloopPtr !== 0n && totloop > 0) {
      const lb = blockByOldPtr.get(mloopPtr);
      const mloopStruct = structsByName.get('MLoop');
      if (lb && mloopStruct) {
        const vField = mloopStruct.fieldMap.get('v');
        const stride = mloopStruct.byteSize;
        const count = Math.min(totloop, Math.floor(lb.size / Math.max(stride, 4)));
        loopVerts = new Int32Array(count);
        for (let i = 0; i < count; i++) {
          loopVerts[i] = readInt32(lb.dataOffset + i * stride, vField);
        }
      }
    }

    // 3) Read real loop UV coordinates if present (CD_MLOOPUV = 16, CD_PROP_FLOAT2 = 49)
    let loopUVs: Float32Array | null = null;
    const uvLayer =
      lLayers.find((l) => l.type === 16 /* CD_MLOOPUV */) ??
      lLayers.find((l) => l.type === 49 /* CD_PROP_FLOAT2 */ && l.name.toLowerCase().includes('uv')) ??
      lLayers.find((l) => l.type === 49 /* CD_PROP_FLOAT2 */);
    const mloopuvPtr = readPtr(base, st.fieldMap.get('mloopuv'));

    if (uvLayer && uvLayer.dataPtr !== 0n && totloop > 0) {
      const uvb = blockByOldPtr.get(uvLayer.dataPtr);
      if (uvb) {
        const uvStruct = structs[uvb.sdnaNr];
        if (uvStruct && uvStruct.name === 'MLoopUV') {
          const uvField = uvStruct.fieldMap.get('uv');
          const stride = uvStruct.byteSize;
          const count = Math.min(totloop, Math.floor(uvb.size / Math.max(stride, 8)));
          loopUVs = new Float32Array(count * 2);
          for (let i = 0; i < count; i++) {
            const uOff = uvb.dataOffset + i * stride;
            loopUVs[i * 2] = readFloat32(uOff, uvField, 0);
            loopUVs[i * 2 + 1] = readFloat32(uOff, uvField, 1);
          }
        } else {
          const count = Math.min(totloop, Math.floor(uvb.size / 8));
          loopUVs = new Float32Array(count * 2);
          for (let i = 0; i < count; i++) {
            const p = uvb.dataOffset + i * 8;
            loopUVs[i * 2] = view.getFloat32(p, littleEndian);
            loopUVs[i * 2 + 1] = view.getFloat32(p + 4, littleEndian);
          }
        }
      }
    } else if (mloopuvPtr !== 0n && totloop > 0) {
      const uvb = blockByOldPtr.get(mloopuvPtr);
      const mloopuvStruct = structsByName.get('MLoopUV');
      if (uvb && mloopuvStruct) {
        const uvField = mloopuvStruct.fieldMap.get('uv');
        const stride = mloopuvStruct.byteSize;
        const count = Math.min(totloop, Math.floor(uvb.size / Math.max(stride, 8)));
        loopUVs = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
          const uOff = uvb.dataOffset + i * stride;
          loopUVs[i * 2] = readFloat32(uOff, uvField, 0);
          loopUVs[i * 2 + 1] = readFloat32(uOff, uvField, 1);
        }
      }
    }

    // 4) Read faces/polygons (face_offset_indices or mpoly or mface)
    // Track both vertex index and loop index so per-corner UVs stay seam-accurate
    const indices: number[] = [];
    const loopIndices: number[] = [];
    const faceOffsetsPtr = readPtr(base, st.fieldMap.get('face_offset_indices'));
    const mpolyPtr = readPtr(base, st.fieldMap.get('mpoly'));
    const pLayers = extractCustomDataLayers(base, st.fieldMap.get('pdata') ?? st.fieldMap.get('face_data'));
    const mpolyLayer = pLayers.find((l) => l.type === 25 /* CD_MPOLY */);

    const maxVertIdx = Math.floor(vertices.length / 3) - 1;

    if (faceOffsetsPtr !== 0n && loopVerts && totpoly > 0) {
      const fb = blockByOldPtr.get(faceOffsetsPtr);
      if (fb) {
        const offsetCount = Math.min(totpoly + 1, Math.floor(fb.size / 4));
        for (let i = 0; i < offsetCount - 1; i++) {
          const start = view.getInt32(fb.dataOffset + i * 4, littleEndian);
          const endIdx = view.getInt32(fb.dataOffset + (i + 1) * 4, littleEndian);
          const polyLen = endIdx - start;
          if (polyLen >= 3 && start >= 0 && endIdx <= loopVerts.length) {
            const v0 = loopVerts[start];
            for (let k = 1; k < polyLen - 1; k++) {
              const v1 = loopVerts[start + k];
              const v2 = loopVerts[start + k + 1];
              if (v0 <= maxVertIdx && v1 <= maxVertIdx && v2 <= maxVertIdx) {
                indices.push(v0, v1, v2);
                loopIndices.push(start, start + k, start + k + 1);
              }
            }
          }
        }
      }
    } else if ((mpolyPtr !== 0n || mpolyLayer?.dataPtr) && loopVerts && totpoly > 0) {
      const pb = blockByOldPtr.get(mpolyPtr !== 0n ? mpolyPtr : mpolyLayer!.dataPtr);
      const mpolyStruct = structsByName.get('MPoly');
      if (pb && mpolyStruct) {
        const loopstartField = mpolyStruct.fieldMap.get('loopstart');
        const totloopField = mpolyStruct.fieldMap.get('totloop');
        const stride = mpolyStruct.byteSize;
        const count = Math.min(totpoly, Math.floor(pb.size / Math.max(stride, 8)));
        for (let i = 0; i < count; i++) {
          const pOff = pb.dataOffset + i * stride;
          const start = readInt32(pOff, loopstartField);
          const polyLen = readInt32(pOff, totloopField);
          if (polyLen >= 3 && start >= 0 && start + polyLen <= loopVerts.length) {
            const v0 = loopVerts[start];
            for (let k = 1; k < polyLen - 1; k++) {
              const v1 = loopVerts[start + k];
              const v2 = loopVerts[start + k + 1];
              if (v0 <= maxVertIdx && v1 <= maxVertIdx && v2 <= maxVertIdx) {
                indices.push(v0, v1, v2);
                loopIndices.push(start, start + k, start + k + 1);
              }
            }
          }
        }
      }
    } else {
      // Legacy MFace fallback
      const mfacePtr = readPtr(base, st.fieldMap.get('mface'));
      const mfaceStruct = structsByName.get('MFace');
      if (mfacePtr !== 0n && mfaceStruct) {
        const fb = blockByOldPtr.get(mfacePtr);
        if (fb) {
          const v1F = mfaceStruct.fieldMap.get('v1');
          const v2F = mfaceStruct.fieldMap.get('v2');
          const v3F = mfaceStruct.fieldMap.get('v3');
          const v4F = mfaceStruct.fieldMap.get('v4');
          const stride = mfaceStruct.byteSize;
          const count = Math.floor(fb.size / Math.max(stride, 16));
          for (let i = 0; i < count; i++) {
            const fOff = fb.dataOffset + i * stride;
            const v1 = readInt32(fOff, v1F);
            const v2 = readInt32(fOff, v2F);
            const v3 = readInt32(fOff, v3F);
            const v4 = readInt32(fOff, v4F);
            if (v1 <= maxVertIdx && v2 <= maxVertIdx && v3 <= maxVertIdx) {
              indices.push(v1, v2, v3);
              if (v4 > 0 && v4 <= maxVertIdx) {
                indices.push(v1, v3, v4);
              }
            }
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    const hasLoopUVs = Boolean(loopUVs && loopIndices.length === indices.length && indices.length > 0);
    if (hasLoopUVs && loopUVs) {
      // Expand indexed corners into non-indexed triangles so UV seams never warp
      const expandedPos = new Float32Array(indices.length * 3);
      const expandedUv = new Float32Array(indices.length * 2);
      const maxUvIdx = Math.floor(loopUVs.length / 2) - 1;
      for (let i = 0; i < indices.length; i++) {
        const vi = indices[i];
        expandedPos[i * 3] = vertices[vi * 3];
        expandedPos[i * 3 + 1] = vertices[vi * 3 + 1];
        expandedPos[i * 3 + 2] = vertices[vi * 3 + 2];

        const li = Math.min(loopIndices[i], maxUvIdx);
        expandedUv[i * 2] = loopUVs[li * 2];
        expandedUv[i * 2 + 1] = loopUVs[li * 2 + 1];
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(expandedPos, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(expandedUv, 2));
    } else {
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      if (indices.length > 0) {
        geometry.setIndex(indices);
      }
      // Fallback planar UVs when the Blender mesh was not UV-unwrapped
      const uvCount = Math.floor(vertices.length / 3);
      const uvs = new Float32Array(uvCount * 2);
      for (let i = 0; i < uvCount; i++) {
        uvs[i * 2] = vertices[i * 3] * 0.5 + 0.5;
        uvs[i * 2 + 1] = vertices[i * 3 + 1] * 0.5 + 0.5;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    // Resolve first material if linked
    let mat: THREE.Material | undefined;
    const matPtrArrayPtr = readPtr(base, st.fieldMap.get('mat'));
    const totcol = readInt16(base, st.fieldMap.get('totcol'));
    if (matPtrArrayPtr !== 0n && totcol > 0) {
      const matArrBlock = blockByOldPtr.get(matPtrArrayPtr);
      if (matArrBlock && matArrBlock.size >= pointerSize) {
        const firstMatPtr =
          pointerSize === 8
            ? view.getBigUint64(matArrBlock.dataOffset, littleEndian)
            : BigInt(view.getUint32(matArrBlock.dataOffset, littleEndian));
        mat = materialMap.get(firstMatPtr);
      }
    }
    if (!mat) {
      const fallbackTex = imageTextureMap.size === 1 ? imageTextureMap.values().next().value : null;
      mat = new THREE.MeshStandardMaterial({
        color: fallbackTex ? 0xffffff : 0xc4c8d0,
        map: fallbackTex ?? null,
        roughness: 0.45,
        metalness: 0.08,
      });
    } else if (
      mat instanceof THREE.MeshStandardMaterial &&
      !mat.map &&
      imageTextureMap.size === 1
    ) {
      mat.map = imageTextureMap.values().next().value ?? null;
      mat.color.set(0xffffff);
    }

    const vertTotal = Math.floor(vertices.length / 3);
    const triCount = indices.length > 0 ? Math.floor(indices.length / 3) : Math.floor(vertTotal / 3);
    totalVertices += vertTotal;
    totalTriangles += triCount;

    parsedMeshes.set(bh.old, {
      name: meshName,
      geometry,
      material: mat,
      vertexCount: vertTotal,
      triangleCount: triCount,
    });
  }

  // Link Objects (OB) to parsed Meshes
  const group = new THREE.Group();
  group.name = fileName.replace(/\.blend$/i, '');
  const usedMeshes = new Set<bigint>();

  for (const bh of bheads) {
    if (bh.code !== 'OB') continue;
    const st = structs[bh.sdnaNr] ?? structsByName.get('Object');
    if (!st) continue;

    const base = bh.dataOffset;
    const dataPtr = readPtr(base, st.fieldMap.get('data'));
    const meshData = parsedMeshes.get(dataPtr);
    if (!meshData) continue;

    usedMeshes.add(dataPtr);
    const objName = readStringField(base, st.fieldMap.get('id')).replace(/^OB/, '') || meshData.name;
    const mesh = new THREE.Mesh(meshData.geometry, meshData.material.clone());
    mesh.name = objName;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const locField = st.fieldMap.get('loc');
    const rotField = st.fieldMap.get('rot');
    const scaleField = st.fieldMap.get('scale') ?? st.fieldMap.get('size');

    if (locField) {
      const lx = readFloat32(base, locField, 0);
      const ly = readFloat32(base, locField, 1);
      const lz = readFloat32(base, locField, 2);
      mesh.position.set(lx, lz, -ly);
    }
    if (rotField) {
      const rx = readFloat32(base, rotField, 0);
      const ry = readFloat32(base, rotField, 1);
      const rz = readFloat32(base, rotField, 2);
      mesh.rotation.set(rx, rz, -ry);
    }
    if (scaleField) {
      const sx = readFloat32(base, scaleField, 0) || 1;
      const sy = readFloat32(base, scaleField, 1) || 1;
      const sz = readFloat32(base, scaleField, 2) || 1;
      mesh.scale.set(sx, sz, sy);
    }

    group.add(mesh);
  }

  // Add any orphan meshes not directly linked to an OB
  for (const [ptr, meshData] of parsedMeshes.entries()) {
    if (!usedMeshes.has(ptr)) {
      const mesh = new THREE.Mesh(meshData.geometry, meshData.material.clone());
      mesh.name = meshData.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  if (group.children.length === 0) {
    throw new Error(
      `Parsed Blender v${version} file, but found 0 static mesh geometries. If this .blend scene uses procedural Geometry Nodes or unapplied modifiers, bake/apply modifiers or export as GLB/OBJ from Blender.`
    );
  }

  return {
    group,
    version,
    pointerSize,
    meshCount: group.children.length,
    vertexCount: totalVertices,
    triangleCount: totalTriangles,
    warnings,
  };
}
