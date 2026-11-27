import * as THREE from 'three';

export type ShadingMode = 'wireframe' | 'solid' | 'material' | 'rendered';
export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';
export type WorkspaceTab = 'layout' | 'modeling' | 'shading' | 'lighting' | 'render';
export type InspectorTab = 'object' | 'material' | 'lighting' | 'render';
export type CameraPreset = 'perspective' | 'front' | 'right' | 'top' | 'iso';

export interface SceneItem {
  id: string;
  name: string;
  type: 'mesh' | 'group' | 'imported' | 'camera' | 'light';
  format?: string;
  visible: boolean;
  locked: boolean;
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
  object: THREE.Object3D;
}

export interface MaterialProps {
  color: string;
  roughness: number;
  metalness: number;
  transmission: number;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  wireframe: boolean;
  doubleSided: boolean;
  flatShading: boolean;
}

export type LightingPresetId =
  | 'studio_three_point'
  | 'sunset_rim'
  | 'archviz_daylight'
  | 'darkroom_product'
  | 'softbox_showroom';

export interface LightingSettings {
  preset: LightingPresetId;
  keyIntensity: number;
  keyColor: string;
  keyAzimuth: number;
  keyElevation: number;
  fillIntensity: number;
  fillColor: string;
  rimIntensity: number;
  rimColor: string;
  envIntensity: number;
  exposure: number;
  shadowsEnabled: boolean;
  backgroundColor: string;
  showGrid: boolean;
  showFloor: boolean;
  showLightGuides: boolean;
}

export interface CameraSettings {
  fov: number;
  orthographic: boolean;
  turntable: boolean;
  turntableSpeed: number;
}

export interface AnimationClipInfo {
  id: string;
  name: string;
  duration: number;
  clip: THREE.AnimationClip;
  rootObject: THREE.Object3D;
  isCustom?: boolean;
}

export interface UserKeyframe {
  id: string;
  time: number;
  targetUuid: string;
  targetName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ImportReport {
  fileName: string;
  format: string;
  objectCount: number;
  vertexCount: number;
  triangleCount: number;
  animationCount: number;
  textureCount?: number;
  warnings: string[];
  notes?: string;
}

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'ply' | 'usdz';
