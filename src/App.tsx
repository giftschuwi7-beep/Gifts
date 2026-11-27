import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { AlertCircle, CheckCircle2, LogOut, Video, X } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { ViewportCanvas, type ViewportHandle } from './components/ViewportCanvas';
import { ViewportOverlayControls } from './components/ViewportOverlayControls';
import { AnimationPanel } from './components/AnimationPanel';
import { OutlinerInspector } from './components/OutlinerInspector';
import { TimelineBar } from './components/TimelineBar';
import { RenderModal } from './components/RenderModal';
import { FormatGuideModal } from './components/FormatGuideModal';
import { IntroOverlay } from './components/IntroOverlay';
import { MinecraftRigModal } from './components/MinecraftRigModal';
import { LongPressMenu, type LongPressTarget } from './components/LongPressMenu';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useBatteryPower, type PowerMode } from './hooks/useBatteryPower';
import {
  ACCEPTED_MODEL_EXTENSIONS,
  countGeometryStats,
  importModelFiles,
  normalizeAndGroundObject,
} from './engine/modelImporter';
import { exportObject3D } from './engine/modelExporter';
import {
  buildClipFromKeyframes,
  createQuickMotionKeyframes,
} from './engine/animationBuilder';
import {
  createCompositeAsset,
  createMinecraftRigAsset,
  createPrimitiveMesh,
  createSceneCameraAsset,
  type CompositeAssetType,
  type PrimitiveType,
} from './engine/proceduralAssets';
import {
  createSceneLightObject,
  disposeSceneLightObject,
  syncSceneLightVisuals,
  type SceneLightKind,
} from './engine/lightVisualizers';
import type {
  AnimationClipInfo,
  CameraPreset,
  CameraSettings,
  ExportFormat,
  InspectorTab,
  LightingPresetId,
  LightingSettings,
  MaterialProps,
  SceneItem,
  ShadingMode,
  TransformMode,
  TransformSpace,
  UserKeyframe,
  WorkspaceTab,
} from './types/studio';

const LIGHTING_PRESETS: Record<LightingPresetId, LightingSettings> = {
  studio_three_point: {
    preset: 'studio_three_point',
    keyIntensity: 2.6,
    keyColor: '#fff5ea',
    keyAzimuth: 38,
    keyElevation: 52,
    fillIntensity: 0.75,
    fillColor: '#c7dbff',
    rimIntensity: 1.6,
    rimColor: '#dce8ff',
    envIntensity: 1.0,
    exposure: 1.1,
    shadowsEnabled: true,
    backgroundColor: '#16181d',
    showGrid: true,
    showFloor: true,
    showLightGuides: true,
  },
  sunset_rim: {
    preset: 'sunset_rim',
    keyIntensity: 3.1,
    keyColor: '#ffae63',
    keyAzimuth: -55,
    keyElevation: 24,
    fillIntensity: 0.55,
    fillColor: '#7a94c9',
    rimIntensity: 2.4,
    rimColor: '#ff7e47',
    envIntensity: 0.85,
    exposure: 1.15,
    shadowsEnabled: true,
    backgroundColor: '#17151a',
    showGrid: true,
    showFloor: true,
    showLightGuides: true,
  },
  archviz_daylight: {
    preset: 'archviz_daylight',
    keyIntensity: 3.2,
    keyColor: '#fffbe8',
    keyAzimuth: 45,
    keyElevation: 62,
    fillIntensity: 1.1,
    fillColor: '#cbe4ff',
    rimIntensity: 0.9,
    rimColor: '#ffffff',
    envIntensity: 1.25,
    exposure: 1.08,
    shadowsEnabled: true,
    backgroundColor: '#222832',
    showGrid: true,
    showFloor: true,
    showLightGuides: true,
  },
  darkroom_product: {
    preset: 'darkroom_product',
    keyIntensity: 2.8,
    keyColor: '#ffffff',
    keyAzimuth: 28,
    keyElevation: 48,
    fillIntensity: 0.28,
    fillColor: '#9fb3d9',
    rimIntensity: 2.6,
    rimColor: '#ffd4a6',
    envIntensity: 0.65,
    exposure: 1.05,
    shadowsEnabled: true,
    backgroundColor: '#0e1013',
    showGrid: false,
    showFloor: true,
    showLightGuides: true,
  },
  softbox_showroom: {
    preset: 'softbox_showroom',
    keyIntensity: 2.2,
    keyColor: '#f8fafc',
    keyAzimuth: 18,
    keyElevation: 66,
    fillIntensity: 1.2,
    fillColor: '#e2e8f0',
    rimIntensity: 1.2,
    rimColor: '#f1f5f9',
    envIntensity: 1.35,
    exposure: 1.12,
    shadowsEnabled: true,
    backgroundColor: '#1e2128',
    showGrid: true,
    showFloor: true,
    showLightGuides: true,
  },
};

function computeKeyLightPosition(azDeg: number, elDeg: number, radius = 4.6): [number, number, number] {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return [
    Math.cos(el) * Math.sin(az) * radius,
    Math.sin(el) * radius,
    Math.cos(el) * Math.cos(az) * radius,
  ];
}

function disposeObjectResources(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child.userData?.isSceneLight && child instanceof THREE.Group) {
      disposeSceneLightObject(child);
      return;
    }
    if (child.userData?.isLightVisual) return;
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m) m.dispose();
      }
    }
  });
}

function readMaterialProps(obj: THREE.Object3D | null): MaterialProps | null {
  if (!obj || obj.userData?.isSceneLight || obj.userData?.isSceneCamera) return null;
  let firstMat: THREE.Material | null = null;
  obj.traverse((c) => {
    if (c.userData?.isLightVisual) return;
    if (!firstMat && c instanceof THREE.Mesh && c.material) {
      firstMat = Array.isArray(c.material) ? c.material[0] : c.material;
    }
  });
  if (!firstMat) return null;

  const mat = firstMat as THREE.MeshPhysicalMaterial;
  const colorHex = mat.color ? `#${mat.color.getHexString()}` : '#b8bec8';
  const emissiveHex = mat.emissive ? `#${mat.emissive.getHexString()}` : '#000000';

  return {
    color: colorHex,
    roughness: typeof mat.roughness === 'number' ? mat.roughness : 0.45,
    metalness: typeof mat.metalness === 'number' ? mat.metalness : 0.08,
    transmission: typeof mat.transmission === 'number' ? mat.transmission : 0,
    ior: typeof mat.ior === 'number' ? mat.ior : 1.5,
    clearcoat: typeof mat.clearcoat === 'number' ? mat.clearcoat : 0,
    clearcoatRoughness: typeof mat.clearcoatRoughness === 'number' ? mat.clearcoatRoughness : 0.1,
    emissive: emissiveHex,
    emissiveIntensity: typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 0,
    opacity: typeof mat.opacity === 'number' ? mat.opacity : 1,
    wireframe: Boolean(mat.wireframe),
    doubleSided: mat.side === THREE.DoubleSide,
    flatShading: Boolean(mat.flatShading),
  };
}

export default function App() {
  const sceneRootRef = useRef<THREE.Group>(new THREE.Group());
  const viewportRef = useRef<ViewportHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedRef = useRef(false);

  const [items, setItems] = useState<SceneItem[]>([]);
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceTab>('layout');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('object');
  const [animPanelOpen, setAnimPanelOpen] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.innerWidth >= 1280 && window.innerHeight >= 560
      : false
  );
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.innerWidth >= 1024 && window.innerHeight >= 560
      : true
  );
  const [zenMode, setZenMode] = useState(false);
  const [shadingMode, setShadingMode] = useState<ShadingMode>('rendered');
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [transformSpace, setTransformSpace] = useState<TransformSpace>('world');
  const [snapEnabled, setSnapEnabled] = useState(false);

  const [lighting, setLighting] = useState<LightingSettings>(LIGHTING_PRESETS.studio_three_point);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    fov: 42,
    orthographic: false,
    turntable: false,
    turntableSpeed: 0.7,
  });

  const [animations, setAnimations] = useState<AnimationClipInfo[]>([]);
  const [userKeyframes, setUserKeyframes] = useState<UserKeyframe[]>([]);
  const [isPlayingAnim, setIsPlayingAnim] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1);
  const [animTime, setAnimTime] = useState(0);
  const [animDuration, setAnimDuration] = useState(4);
  const [animLoop, setAnimLoop] = useState(true);
  const [powerMode, setPowerMode] = useState<PowerMode>('auto');
  const battery = useBatteryPower(powerMode);
  const criticalToastShownRef = useRef(false);

  const [transformTick, setTransformTick] = useState(0);
  const [materialTick, setMaterialTick] = useState(0);
  const [activeSceneCamera, setActiveSceneCamera] = useState<THREE.Object3D | null>(null);
  const [longPressTarget, setLongPressTarget] = useState<LongPressTarget | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [minecraftRigOpen, setMinecraftRigOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [renderModalOpen, setRenderModalOpen] = useState(false);
  const [formatGuideOpen, setFormatGuideOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; title: string; detail?: string } | null>(
    null
  );

  const showToast = useCallback((kind: 'success' | 'error', title: string, detail?: string) => {
    setToast({ kind, title, detail });
  }, []);

  // Protect low-battery devices (<= 5%): disable continuous turntable drain and notify user
  useEffect(() => {
    if (battery.isCriticalBattery && powerMode === 'auto') {
      setCameraSettings((c) => (c.turntable ? { ...c, turntable: false } : c));
      if (!criticalToastShownRef.current) {
        criticalToastShownRef.current = true;
        showToast(
          'success',
          `Low-Battery Saver Active (${battery.batteryLevel ?? 5}%)`,
          'Switched to lightweight GPU mode so PrismForge 3D stays smooth without crashing or draining your phone.'
        );
      }
    } else if (!battery.isCriticalBattery) {
      criticalToastShownRef.current = false;
    }
  }, [battery.isCriticalBattery, battery.batteryLevel, powerMode, showToast]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 7500 : 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Auto-collapse side panels when rotating a phone sideways into compact landscape
  useEffect(() => {
    const onOrientationOrResize = () => {
      if (window.innerHeight < 500 || window.innerWidth < 768) {
        setInspectorOpen(false);
        setAnimPanelOpen(false);
      }
    };
    window.addEventListener('orientationchange', onOrientationOrResize);
    return () => window.removeEventListener('orientationchange', onOrientationOrResize);
  }, []);

  const registerSceneObject = useCallback(
    (
      obj: THREE.Object3D,
      type: SceneItem['type'],
      format?: string,
      replaceExisting = false
    ) => {
      const root = sceneRootRef.current;
      if (replaceExisting) {
        while (root.children.length > 0) {
          const old = root.children[0];
          root.remove(old);
          disposeObjectResources(old);
        }
        setAnimations([]);
        setUserKeyframes([]);
        setIsPlayingAnim(false);
        setAnimTime(0);
      }

      root.add(obj);
      const stats = countGeometryStats(obj);
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const item: SceneItem = {
        id,
        name: obj.name || 'Untitled Object',
        type,
        format,
        visible: obj.visible,
        locked: false,
        vertexCount: stats.vertexCount,
        triangleCount: stats.triangleCount,
        meshCount: stats.meshCount,
        object: obj,
      };

      setItems((prev) => (replaceExisting ? [item] : [...prev, item]));
      setSelectedObject(obj);
      viewportRef.current?.requestRender();
      return item;
    },
    []
  );

  const handleEngineReady = useCallback(
    (caps: { isSoftwareGl: boolean; maxAnisotropy: number }) => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      const root = sceneRootRef.current;
      while (root.children.length > 0) {
        const old = root.children[0];
        root.remove(old);
        disposeObjectResources(old);
      }

      const isMobile =
        typeof navigator !== 'undefined' &&
        (/iphone|ipad|ipod|android/i.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

      const hero = createCompositeAsset('optical_prism_rig', caps.isSoftwareGl, caps.maxAnisotropy);
      const keyLight = createSceneLightObject({
        name: 'Key Light',
        kind: 'directional',
        role: 'key',
        color: lighting.keyColor,
        intensity: lighting.keyIntensity,
        position: computeKeyLightPosition(lighting.keyAzimuth, lighting.keyElevation),
        castShadow: lighting.shadowsEnabled,
        isMobileDevice: isMobile,
      });
      const fillLight = createSceneLightObject({
        name: 'Fill Light',
        kind: 'directional',
        role: 'fill',
        color: lighting.fillColor,
        intensity: lighting.fillIntensity,
        position: [-3.4, 2.6, 2.9],
        castShadow: false,
        isMobileDevice: isMobile,
      });
      const rimLight = createSceneLightObject({
        name: 'Rim Light',
        kind: 'directional',
        role: 'rim',
        color: lighting.rimColor,
        intensity: lighting.rimIntensity,
        position: [-3.6, 3.2, -3.8],
        castShadow: false,
        isMobileDevice: isMobile,
      });

      const initialObjects: Array<{
        obj: THREE.Object3D;
        type: SceneItem['type'];
        format: string;
      }> = [
        { obj: hero, type: 'group', format: 'Studio Rig' },
        { obj: keyLight, type: 'light', format: 'Directional' },
        { obj: fillLight, type: 'light', format: 'Directional' },
        { obj: rimLight, type: 'light', format: 'Directional' },
      ];

      const stamp = Date.now();
      const builtItems: SceneItem[] = initialObjects.map(({ obj, type, format }, idx) => {
        root.add(obj);
        if (obj.userData?.isSceneLight && obj instanceof THREE.Group) {
          syncSceneLightVisuals(obj, lighting.showLightGuides, lighting.shadowsEnabled, battery.ecoActive);
        }
        const stats = countGeometryStats(obj);
        return {
          id: `${stamp}_${idx}`,
          name: obj.name || 'Untitled Object',
          type,
          format,
          visible: obj.visible,
          locked: false,
          vertexCount: stats.vertexCount,
          triangleCount: stats.triangleCount,
          meshCount: stats.meshCount,
          object: obj,
        };
      });

      setAnimations([]);
      setUserKeyframes([]);
      setIsPlayingAnim(false);
      setAnimTime(0);
      setItems(builtItems);
      setSelectedObject(hero);
      viewportRef.current?.requestRender();
    },
    [lighting, battery.ecoActive]
  );

  // Import Handler (Files from button or Drag-and-Drop)
  const handleImportFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const filesArr = Array.from(fileList);
      if (filesArr.length === 0) return;

      // If user drops/picks only image textures while an object is selected, apply as texture directly
      const imageExts = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']);
      const allImages = filesArr.every((f) =>
        imageExts.has(f.name.split('.').pop()?.toLowerCase() ?? '')
      );
      if (allImages && selectedObject) {
        const imgFile = filesArr[0];
        const url = URL.createObjectURL(imgFile);
        const loader = new THREE.TextureLoader();
        loader.load(url, (tex) => {
          const caps = viewportRef.current?.getCapabilities() ?? { maxAnisotropy: 4 };
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = caps.maxAnisotropy;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.needsUpdate = true;

          selectedObject.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              if (m instanceof THREE.MeshStandardMaterial) {
                m.map = tex;
                m.color.set('#ffffff');
                m.needsUpdate = true;
              }
            }
          });
          setMaterialTick((t) => t + 1);
          viewportRef.current?.requestRender();
          URL.revokeObjectURL(url);
          showToast('success', 'Applied Albedo Texture', imgFile.name);
        });
        return;
      }

      setIsImporting(true);
      try {
        const imported = await importModelFiles(filesArr);
        if (imported.length === 0) return;

        let lastObj: THREE.Object3D | null = null;
        const newClips: AnimationClipInfo[] = [];

        for (const asset of imported) {
          registerSceneObject(asset.object, 'imported', asset.report.format, false);
          lastObj = asset.object;
          asset.animations.forEach((clip, idx) => {
            newClips.push({
              id: `${Date.now()}_${idx}`,
              name: clip.name || `Clip ${idx + 1}`,
              duration: clip.duration,
              clip,
              rootObject: asset.object,
            });
          });
        }

        if (newClips.length > 0) {
          setAnimations((prev) => [...prev, ...newClips]);
          setIsPlayingAnim(true);
        }

        if (lastObj) {
          setSelectedObject(lastObj);
          viewportRef.current?.focusObject(lastObj);
        }

        const firstReport = imported[0].report;
        const totalTris = imported.reduce((acc, a) => acc + a.report.triangleCount, 0);
        const totalTex = imported.reduce((acc, a) => acc + (a.report.textureCount ?? 0), 0);
        showToast(
          'success',
          `Imported ${imported.length > 1 ? `${imported.length} models` : firstReport.fileName}`,
          `${firstReport.format} · ${totalTris.toLocaleString()} tris${
            totalTex > 0 ? ` · ${totalTex} ${totalTex === 1 ? 'texture' : 'textures'}` : ''
          }${firstReport.notes ? ` · ${firstReport.notes}` : ''}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to parse the selected 3D file.';
        showToast('error', 'Import Failed', msg);
      } finally {
        setIsImporting(false);
      }
    },
    [registerSceneObject, selectedObject, showToast]
  );

  // Add Primitives & Composite Studio Assets
  const handleAddPrimitive = useCallback(
    (type: PrimitiveType) => {
      const mesh = createPrimitiveMesh(type);
      // Slight offset if scene already has items so it doesn't overlap identically
      if (items.length > 0) {
        const offset = (items.length % 4) * 0.45;
        mesh.position.x = offset;
      }
      registerSceneObject(mesh, 'mesh', 'Primitive');
      viewportRef.current?.focusObject(mesh);
    },
    [items.length, registerSceneObject]
  );

  const handleLoadMinecraftRig = useCallback(() => {
    const rig = createMinecraftRigAsset();
    if (items.length > 0) {
      rig.group.position.x = 1.6;
    }
    registerSceneObject(rig.group, 'group', 'Starter Rig');
    if (rig.animations.length > 0) {
      setAnimations((prev) => [
        ...prev,
        ...rig.animations.map((clip, idx) => ({
          id: `mc_${Date.now()}_${idx}`,
          name: clip.name,
          duration: clip.duration,
          clip,
          rootObject: rig.group,
        })),
      ]);
      setIsPlayingAnim(true);
    }
    viewportRef.current?.focusObject(rig.group);
    showToast(
      'success',
      'Loaded Free Minecraft Character Rig',
      'Use the Animation panel on the left to play, scrub, or keyframe limbs.'
    );
  }, [items.length, registerSceneObject, showToast]);

  const handleAddComposite = useCallback(
    (type: CompositeAssetType) => {
      if (type === 'minecraft_rig') {
        handleLoadMinecraftRig();
        return;
      }
      const caps = viewportRef.current?.getCapabilities() ?? {
        isSoftwareGl: false,
        maxAnisotropy: 4,
      };
      const group = createCompositeAsset(type, caps.isSoftwareGl, caps.maxAnisotropy);
      registerSceneObject(group, 'group', 'Studio Model');
      viewportRef.current?.focusObject(group);
    },
    [handleLoadMinecraftRig, registerSceneObject]
  );

  const handleAddCamera = useCallback(
    (fromEditorPose = false) => {
      const camCount = items.filter((it) => it.type === 'camera').length;
      const cam = createSceneCameraAsset(camCount + 1, 45);
      if (fromEditorPose) {
        const pose = viewportRef.current?.getEditorViewPose();
        if (pose) {
          cam.position.copy(pose.position);
          cam.quaternion.copy(pose.quaternion);
        }
      } else if (camCount > 0) {
        cam.position.x += (camCount % 3) * 0.9;
      }
      registerSceneObject(cam, 'camera', 'Camera');
      if (!fromEditorPose) {
        viewportRef.current?.focusObject(cam);
      }
      showToast(
        'success',
        `Added ${cam.name}`,
        'Long-press for 1s or use the Inspector to Jump In / Jump Out.'
      );
      return cam;
    },
    [items, registerSceneObject, showToast]
  );

  const handleAddLight = useCallback(
    (kind: SceneLightKind) => {
      const lightCount = items.filter((it) => it.type === 'light').length;
      const isMobile =
        typeof navigator !== 'undefined' &&
        (/iphone|ipad|ipod|android/i.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

      const angle = (lightCount % 6) * (Math.PI / 3) + 0.5;
      const radius = 2.8;
      const labelBase =
        kind === 'directional' ? 'Sun Light' : kind === 'spot' ? 'Spot Light' : 'Point Light';
      const defaultColor =
        kind === 'directional' ? '#fff7e6' : kind === 'spot' ? '#ffe5c4' : '#d6eaff';
      const lightObj = createSceneLightObject({
        name: `${labelBase} ${lightCount + 1}`,
        kind,
        role: 'custom',
        color: defaultColor,
        intensity: kind === 'directional' ? 2.0 : 2.6,
        position: [Math.sin(angle) * radius, 2.7 + (lightCount % 2) * 0.6, Math.cos(angle) * radius],
        castShadow: kind !== 'point' && lighting.shadowsEnabled,
        isMobileDevice: isMobile,
      });

      const formatLabel =
        kind === 'directional' ? 'Directional' : kind === 'spot' ? 'Spot' : 'Point';
      setLighting((l) => (l.showLightGuides ? l : { ...l, showLightGuides: true }));
      registerSceneObject(lightObj, 'light', formatLabel);
      showToast(
        'success',
        `Added ${lightObj.name}`,
        'Drag the Move / Rotate gizmo to aim in any direction, or delete anytime.'
      );
      return lightObj;
    },
    [items, lighting.shadowsEnabled, registerSceneObject, showToast]
  );

  const syncStudioLightsFromSettings = useCallback(
    (nextLighting: LightingSettings, repositionRig: boolean) => {
      sceneRootRef.current.traverse((child) => {
        if (!child.userData?.isSceneLight || !(child instanceof THREE.Group)) return;
        const role = child.userData.lightRole;
        if (role === 'key') {
          child.userData.lightColor = nextLighting.keyColor;
          child.userData.lightIntensity = nextLighting.keyIntensity;
          child.userData.castShadow = nextLighting.shadowsEnabled;
          if (repositionRig) {
            const [kx, ky, kz] = computeKeyLightPosition(
              nextLighting.keyAzimuth,
              nextLighting.keyElevation
            );
            child.position.set(kx, ky, kz);
            child.userData.autoTrackCenter = true;
            child.lookAt(0, 0.65, 0);
          }
        } else if (role === 'fill') {
          child.userData.lightColor = nextLighting.fillColor;
          child.userData.lightIntensity = nextLighting.fillIntensity;
          if (repositionRig) {
            child.position.set(-3.4, 2.6, 2.9);
            child.userData.autoTrackCenter = true;
            child.lookAt(0, 0.65, 0);
          }
        } else if (role === 'rim') {
          child.userData.lightColor = nextLighting.rimColor;
          child.userData.lightIntensity = nextLighting.rimIntensity;
          if (repositionRig) {
            child.position.set(-3.6, 3.2, -3.8);
            child.userData.autoTrackCenter = true;
            child.lookAt(0, 0.65, 0);
          }
        }
        syncSceneLightVisuals(
          child,
          nextLighting.showLightGuides,
          nextLighting.shadowsEnabled,
          battery.ecoActive
        );
      });
      setTransformTick((t) => t + 1);
      viewportRef.current?.requestRender();
    },
    [battery.ecoActive]
  );

  const handleUpdateLighting = useCallback(
    (patch: Partial<LightingSettings>) => {
      setLighting((prev) => {
        const next = { ...prev, ...patch };
        const moveKey = patch.keyAzimuth !== undefined || patch.keyElevation !== undefined;
        syncStudioLightsFromSettings(next, moveKey);
        return next;
      });
    },
    [syncStudioLightsFromSettings]
  );

  const handleApplyLightingPreset = useCallback(
    (preset: LightingPresetId) => {
      const next = { ...LIGHTING_PRESETS[preset], showLightGuides: lighting.showLightGuides };
      setLighting(next);
      syncStudioLightsFromSettings(next, true);
    },
    [lighting.showLightGuides, syncStudioLightsFromSettings]
  );

  const handleUpdateSceneLight = useCallback(
    (
      lightObj: THREE.Object3D,
      patch: { color?: string; intensity?: number; castShadow?: boolean }
    ) => {
      if (!lightObj.userData?.isSceneLight || !(lightObj instanceof THREE.Group)) return;
      if (patch.color !== undefined) lightObj.userData.lightColor = patch.color;
      if (patch.intensity !== undefined) lightObj.userData.lightIntensity = patch.intensity;
      if (patch.castShadow !== undefined) lightObj.userData.castShadow = patch.castShadow;

      syncSceneLightVisuals(
        lightObj,
        lighting.showLightGuides,
        lighting.shadowsEnabled,
        battery.ecoActive
      );

      const role = lightObj.userData.lightRole;
      if (role === 'key' || role === 'fill' || role === 'rim') {
        setLighting((prev) => {
          const next = { ...prev };
          if (role === 'key') {
            if (patch.color !== undefined) next.keyColor = patch.color;
            if (patch.intensity !== undefined) next.keyIntensity = patch.intensity;
          } else if (role === 'fill') {
            if (patch.color !== undefined) next.fillColor = patch.color;
            if (patch.intensity !== undefined) next.fillIntensity = patch.intensity;
          } else if (role === 'rim') {
            if (patch.color !== undefined) next.rimColor = patch.color;
            if (patch.intensity !== undefined) next.rimIntensity = patch.intensity;
          }
          return next;
        });
      }

      setTransformTick((t) => t + 1);
      viewportRef.current?.requestRender();
    },
    [lighting.showLightGuides, lighting.shadowsEnabled, battery.ecoActive]
  );

  const handleResetLightAim = useCallback(
    (lightObj: THREE.Object3D) => {
      if (!lightObj.userData?.isSceneLight || !(lightObj instanceof THREE.Group)) return;
      lightObj.userData.autoTrackCenter = true;
      lightObj.lookAt(0, 0.65, 0);
      syncSceneLightVisuals(
        lightObj,
        lighting.showLightGuides,
        lighting.shadowsEnabled,
        battery.ecoActive
      );
      setTransformTick((t) => t + 1);
      viewportRef.current?.requestRender();
    },
    [lighting.showLightGuides, lighting.shadowsEnabled, battery.ecoActive]
  );

  const handleRestoreDefaultLights = useCallback(() => {
    const existingRoles = new Set<string>();
    sceneRootRef.current.traverse((child) => {
      if (child.userData?.isSceneLight && child.userData.lightRole) {
        existingRoles.add(String(child.userData.lightRole));
      }
    });

    const isMobile =
      typeof navigator !== 'undefined' &&
      (/iphone|ipad|ipod|android/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    const toCreate: Array<{ name: string; role: 'key' | 'fill' | 'rim'; color: string; intensity: number; position: [number, number, number]; castShadow: boolean }> = [];
    if (!existingRoles.has('key')) {
      toCreate.push({
        name: 'Key Light',
        role: 'key',
        color: lighting.keyColor,
        intensity: lighting.keyIntensity,
        position: computeKeyLightPosition(lighting.keyAzimuth, lighting.keyElevation),
        castShadow: lighting.shadowsEnabled,
      });
    }
    if (!existingRoles.has('fill')) {
      toCreate.push({
        name: 'Fill Light',
        role: 'fill',
        color: lighting.fillColor,
        intensity: lighting.fillIntensity,
        position: [-3.4, 2.6, 2.9],
        castShadow: false,
      });
    }
    if (!existingRoles.has('rim')) {
      toCreate.push({
        name: 'Rim Light',
        role: 'rim',
        color: lighting.rimColor,
        intensity: lighting.rimIntensity,
        position: [-3.6, 3.2, -3.8],
        castShadow: false,
      });
    }

    if (toCreate.length === 0) {
      syncStudioLightsFromSettings(lighting, true);
      showToast('success', 'Reset 3-Point Rig Positions', 'Restored Key, Fill, and Rim studio aim.');
      return;
    }

    for (const cfg of toCreate) {
      const obj = createSceneLightObject({
        name: cfg.name,
        kind: 'directional',
        role: cfg.role,
        color: cfg.color,
        intensity: cfg.intensity,
        position: cfg.position,
        castShadow: cfg.castShadow,
        isMobileDevice: isMobile,
      });
      registerSceneObject(obj, 'light', 'Directional');
    }
    setLighting((l) => (l.showLightGuides ? l : { ...l, showLightGuides: true }));
    showToast('success', `Restored ${toCreate.length} Studio Light${toCreate.length > 1 ? 's' : ''}`);
  }, [lighting, registerSceneObject, showToast, syncStudioLightsFromSettings]);

  // Workspace tab switches align shading + inspector context
  const handleWorkspaceChange = useCallback((tab: WorkspaceTab) => {
    setWorkspace(tab);
    switch (tab) {
      case 'layout':
        setShadingMode('rendered');
        setInspectorTab('object');
        break;
      case 'modeling':
        setShadingMode('solid');
        setInspectorTab('object');
        break;
      case 'shading':
        setShadingMode('material');
        setInspectorTab('material');
        break;
      case 'lighting':
        setShadingMode('rendered');
        setInspectorTab('lighting');
        break;
      case 'render':
        setShadingMode('rendered');
        setInspectorTab('render');
        break;
    }
  }, []);

  // Outliner Actions
  const handleToggleVisibility = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const nextVis = !item.visible;
          item.object.visible = nextVis;
          if (!nextVis && activeSceneCamera === item.object) {
            setActiveSceneCamera(null);
          }
          return { ...item, visible: nextVis };
        })
      );
      setTransformTick((t) => t + 1);
      viewportRef.current?.requestRender();
    },
    [activeSceneCamera]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const target = prev.find((i) => i.id === id);
        if (target) {
          const removedUuids = new Set<string>();
          let selectionInsideRemoved = false;
          let activeCamInsideRemoved = false;
          target.object.traverse((child) => {
            removedUuids.add(child.uuid);
            if (child === selectedObject) selectionInsideRemoved = true;
            if (child === activeSceneCamera) activeCamInsideRemoved = true;
          });

          sceneRootRef.current.remove(target.object);
          disposeObjectResources(target.object);
          if (selectionInsideRemoved) {
            setSelectedObject(null);
          }
          if (activeCamInsideRemoved) {
            setActiveSceneCamera(null);
          }
          setAnimations((a) => a.filter((clip) => clip.rootObject !== target.object));
          setUserKeyframes((kfs) => kfs.filter((kf) => !removedUuids.has(kf.targetUuid)));
        }
        return prev.filter((i) => i.id !== id);
      });
      viewportRef.current?.requestRender();
    },
    [selectedObject, activeSceneCamera]
  );

  const handleDeleteTarget = useCallback(
    (targetObj: THREE.Object3D) => {
      const topItem = items.find((i) => i.object === targetObj);
      if (topItem) {
        handleDeleteItem(topItem.id);
        return;
      }

      // Sub-part deletion inside a composite model
      const removedUuids = new Set<string>();
      let selectionInsideRemoved = false;
      targetObj.traverse((c) => {
        removedUuids.add(c.uuid);
        if (c === selectedObject) selectionInsideRemoved = true;
      });
      if (targetObj === activeSceneCamera) {
        setActiveSceneCamera(null);
      }

      const parent = targetObj.parent;
      if (parent) {
        parent.remove(targetObj);
      }
      disposeObjectResources(targetObj);
      if (selectionInsideRemoved) {
        setSelectedObject(null);
      }
      setUserKeyframes((kfs) => kfs.filter((kf) => !removedUuids.has(kf.targetUuid)));

      // Recalculate geometry counts on remaining items
      setItems((prev) =>
        prev.map((item) => {
          const stats = countGeometryStats(item.object);
          return {
            ...item,
            vertexCount: stats.vertexCount,
            triangleCount: stats.triangleCount,
            meshCount: stats.meshCount,
          };
        })
      );
      viewportRef.current?.requestRender();
    },
    [items, selectedObject, activeSceneCamera, handleDeleteItem]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedObject) return;
    handleDeleteTarget(selectedObject);
  }, [selectedObject, handleDeleteTarget]);

  const handleDuplicateTarget = useCallback(
    (targetObj: THREE.Object3D) => {
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      targetObj.updateMatrixWorld(true);
      targetObj.getWorldPosition(worldPos);
      targetObj.getWorldQuaternion(worldQuat);
      targetObj.getWorldScale(worldScale);

      if (targetObj.userData?.isSceneLight) {
        const kind = (targetObj.userData.lightKind as SceneLightKind) ?? 'point';
        const dupLight = createSceneLightObject({
          name: `${targetObj.name || 'Light'} Copy`,
          kind,
          role: 'custom',
          color: String(targetObj.userData.lightColor ?? '#fff5ea'),
          intensity: Number(targetObj.userData.lightIntensity ?? 2),
          position: [worldPos.x + 0.9, worldPos.y, worldPos.z],
          castShadow: Boolean(targetObj.userData.castShadow),
        });
        dupLight.quaternion.copy(worldQuat);
        dupLight.userData.autoTrackCenter = Boolean(targetObj.userData.autoTrackCenter);
        syncSceneLightVisuals(
          dupLight,
          lighting.showLightGuides,
          lighting.shadowsEnabled,
          battery.ecoActive
        );
        const fmt = kind === 'directional' ? 'Directional' : kind === 'spot' ? 'Spot' : 'Point';
        registerSceneObject(dupLight, 'light', fmt);
        return;
      }

      const clone = targetObj.clone(true);
      clone.name = `${targetObj.name || 'Object'} Copy`;
      clone.position.copy(worldPos);
      clone.position.x += 0.9;
      clone.quaternion.copy(worldQuat);
      clone.scale.copy(worldScale);
      const itemType: SceneItem['type'] = clone.userData?.isSceneCamera
        ? 'camera'
        : clone instanceof THREE.Group
          ? 'group'
          : 'mesh';
      registerSceneObject(clone, itemType, itemType === 'camera' ? 'Camera' : 'Duplicate');
    },
    [registerSceneObject, lighting.showLightGuides, lighting.shadowsEnabled, battery.ecoActive]
  );

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedObject) return;
    handleDuplicateTarget(selectedObject);
  }, [selectedObject, handleDuplicateTarget]);

  const handleToggleJumpCamera = useCallback(
    (preferredCam?: THREE.Object3D | null) => {
      if (activeSceneCamera) {
        if (!preferredCam || preferredCam === activeSceneCamera || !preferredCam.userData?.isSceneCamera) {
          setActiveSceneCamera(null);
          return;
        }
        setActiveSceneCamera(preferredCam);
        return;
      }

      let camToEnter: THREE.Object3D | null = null;
      if (preferredCam?.userData?.isSceneCamera) {
        camToEnter = preferredCam;
      } else if (selectedObject?.userData?.isSceneCamera) {
        camToEnter = selectedObject;
      } else {
        camToEnter = items.find((it) => it.type === 'camera' || it.object.userData?.isSceneCamera)?.object ?? null;
      }

      if (!camToEnter) {
        camToEnter = handleAddCamera(true);
      }

      if (camToEnter) {
        if (!camToEnter.visible) {
          camToEnter.visible = true;
          setItems((prev) =>
            prev.map((it) => (it.object === camToEnter ? { ...it, visible: true } : it))
          );
        }
        setActiveSceneCamera(camToEnter);
      }
    },
    [activeSceneCamera, selectedObject, items, handleAddCamera]
  );

  const handleUpdateSceneCameraFov = useCallback((camObj: THREE.Object3D, fov: number) => {
    camObj.userData.cameraFov = fov;
    setTransformTick((t) => t + 1);
    viewportRef.current?.requestRender();
  }, []);

  const handleToggleHideTarget = useCallback(
    (targetObj: THREE.Object3D) => {
      const topItem = items.find((it) => it.object === targetObj);
      if (topItem) {
        handleToggleVisibility(topItem.id);
        return;
      }
      targetObj.visible = !targetObj.visible;
      if (!targetObj.visible && activeSceneCamera === targetObj) {
        setActiveSceneCamera(null);
      }
      setTransformTick((t) => t + 1);
      viewportRef.current?.requestRender();
    },
    [items, activeSceneCamera, handleToggleVisibility]
  );

  const handleGroupTarget = useCallback(
    (target: LongPressTarget, combineWithOther: boolean) => {
      const { part, topObject, previousTopObject } = target;
      const root = sceneRootRef.current;

      if (combineWithOther && previousTopObject && previousTopObject !== topObject) {
        const itemA = items.find((i) => i.object === topObject);
        const itemB = items.find((i) => i.object === previousTopObject);
        const group = new THREE.Group();
        group.name = `Group (${topObject.name || 'Objects'})`;
        const posA = new THREE.Vector3();
        const posB = new THREE.Vector3();
        topObject.getWorldPosition(posA);
        previousTopObject.getWorldPosition(posB);
        group.position.copy(posA).add(posB).multiplyScalar(0.5);
        root.add(group);
        group.updateMatrixWorld(true);
        group.attach(topObject);
        group.attach(previousTopObject);

        const stats = countGeometryStats(group);
        const newItem: SceneItem = {
          id: `${Date.now()}_grp`,
          name: group.name,
          type: 'group',
          format: 'Group',
          visible: true,
          locked: false,
          vertexCount: stats.vertexCount,
          triangleCount: stats.triangleCount,
          meshCount: stats.meshCount,
          object: group,
        };

        setItems((prev) => [
          ...prev.filter((i) => i.id !== itemA?.id && i.id !== itemB?.id),
          newItem,
        ]);
        setSelectedObject(group);
        setLongPressTarget(null);
        viewportRef.current?.requestRender();
        showToast('success', `Grouped ${group.name}`, 'Combined selected objects into a group.');
        return;
      }

      if (part !== topObject) {
        // Extract pressed sub-part into its own Group while keeping exact world transform
        const group = new THREE.Group();
        group.name = `${part.name || 'Part'} Group`;
        part.updateMatrixWorld(true);
        part.getWorldPosition(group.position);
        root.add(group);
        group.updateMatrixWorld(true);
        group.attach(part);

        const groupStats = countGeometryStats(group);
        const newItem: SceneItem = {
          id: `${Date.now()}_grp`,
          name: group.name,
          type: 'group',
          format: 'Group',
          visible: true,
          locked: false,
          vertexCount: groupStats.vertexCount,
          triangleCount: groupStats.triangleCount,
          meshCount: groupStats.meshCount,
          object: group,
        };

        setItems((prev) => [
          ...prev.map((it) => {
            if (it.object !== topObject) return it;
            const s = countGeometryStats(it.object);
            return {
              ...it,
              vertexCount: s.vertexCount,
              triangleCount: s.triangleCount,
              meshCount: s.meshCount,
            };
          }),
          newItem,
        ]);
        setSelectedObject(group);
        setLongPressTarget(null);
        viewportRef.current?.requestRender();
        showToast('success', `Created ${group.name}`, 'Part isolated into its own selectable group.');
        return;
      }

      // Wrap top-level object inside a new Group container
      const existing = items.find((i) => i.object === topObject);
      const wrapper = new THREE.Group();
      wrapper.name = `${topObject.name || 'Object'} Group`;
      topObject.updateMatrixWorld(true);
      topObject.getWorldPosition(wrapper.position);
      root.add(wrapper);
      wrapper.updateMatrixWorld(true);
      wrapper.attach(topObject);

      const stats = countGeometryStats(wrapper);
      const wrappedItem: SceneItem = {
        id: `${Date.now()}_grp`,
        name: wrapper.name,
        type: 'group',
        format: 'Group',
        visible: wrapper.visible,
        locked: false,
        vertexCount: stats.vertexCount,
        triangleCount: stats.triangleCount,
        meshCount: stats.meshCount,
        object: wrapper,
      };
      setItems((prev) => [
        ...prev.filter((i) => i.id !== existing?.id),
        wrappedItem,
      ]);
      setSelectedObject(wrapper);
      setLongPressTarget(null);
      viewportRef.current?.requestRender();
      showToast('success', `Grouped ${wrapper.name}`, 'Object placed inside a group container.');
    },
    [items, selectedObject, showToast]
  );

  const handleUngroupTarget = useCallback(
    (targetObj: THREE.Object3D) => {
      if (
        !(targetObj instanceof THREE.Group) ||
        targetObj.userData?.isSceneCamera ||
        targetObj.userData?.isSceneLight
      ) {
        return;
      }
      const root = sceneRootRef.current;
      const existingItem = items.find((i) => i.object === targetObj);
      const children = [...targetObj.children];
      if (children.length === 0) return;

      const promotedItems: SceneItem[] = children.map((child, idx) => {
        root.attach(child);
        const stats = countGeometryStats(child);
        const type: SceneItem['type'] = child.userData?.isSceneCamera
          ? 'camera'
          : child.userData?.isSceneLight
            ? 'light'
            : child instanceof THREE.Group
              ? 'group'
              : 'mesh';
        return {
          id: `${Date.now()}_ug_${idx}`,
          name: child.name || `Part ${idx + 1}`,
          type,
          format:
            type === 'camera'
              ? 'Camera'
              : type === 'light'
                ? 'Light'
                : type === 'group'
                  ? 'Group'
                  : 'Mesh',
          visible: child.visible,
          locked: false,
          vertexCount: stats.vertexCount,
          triangleCount: stats.triangleCount,
          meshCount: stats.meshCount,
          object: child,
        };
      });

      root.remove(targetObj);
      setItems((prev) => [
        ...prev.filter((i) => i.id !== existingItem?.id),
        ...promotedItems,
      ]);
      setSelectedObject(children[0] ?? null);
      setLongPressTarget(null);
      viewportRef.current?.requestRender();
      showToast('success', `Ungrouped ${children.length} items`);
    },
    [items, showToast]
  );

  // Object Transform Actions
  const handleRenameObject = useCallback((obj: THREE.Object3D, name: string) => {
    obj.name = name;
    setItems((prev) => prev.map((it) => (it.object === obj ? { ...it, name } : it)));
  }, []);

  const handleUpdateTransform = useCallback(
    (
      obj: THREE.Object3D,
      kind: 'position' | 'rotation' | 'scale',
      axis: 'x' | 'y' | 'z',
      value: number
    ) => {
      if (kind === 'rotation') {
        obj.rotation[axis] = THREE.MathUtils.degToRad(value);
        if (obj.userData?.isSceneLight) {
          obj.userData.autoTrackCenter = false;
        }
      } else {
        obj[kind][axis] = value;
      }
      if (obj.userData?.isSceneLight && obj instanceof THREE.Group) {
        syncSceneLightVisuals(
          obj,
          lighting.showLightGuides,
          lighting.shadowsEnabled,
          battery.ecoActive
        );
      }
      setTransformTick((t) => t + 1);
      viewportRef.current?.requestRender();
    },
    [lighting.showLightGuides, lighting.shadowsEnabled, battery.ecoActive]
  );

  const handleGroundObject = useCallback((obj: THREE.Object3D) => {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) {
      obj.position.y -= box.min.y;
      setTransformTick((t) => t + 1);
      viewportRef.current?.requestRender();
    }
  }, []);

  const handleCenterObject = useCallback((obj: THREE.Object3D) => {
    normalizeAndGroundObject(obj, 2.4);
    setTransformTick((t) => t + 1);
    viewportRef.current?.focusObject(obj);
    viewportRef.current?.requestRender();
  }, []);

  // Material Editing (auto-upgrades legacy materials to MeshPhysicalMaterial so full PBR works on any model!)
  const ensurePhysicalMaterials = useCallback((obj: THREE.Object3D, cb: (m: THREE.MeshPhysicalMaterial) => void) => {
    obj.traverse((child) => {
      if (child.userData?.isLightVisual) return;
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const upgraded = mats.map((m) => {
        if (m instanceof THREE.MeshPhysicalMaterial) {
          cb(m);
          m.needsUpdate = true;
          return m;
        }
        const std = m as THREE.MeshStandardMaterial;
        const phys = new THREE.MeshPhysicalMaterial({
          name: std?.name || 'StudioPhysical',
          color: std?.color ? std.color.clone() : new THREE.Color(0xc2c7d0),
          roughness: typeof std?.roughness === 'number' ? std.roughness : 0.45,
          metalness: typeof std?.metalness === 'number' ? std.metalness : 0.08,
          map: std?.map ?? null,
          normalMap: std?.normalMap ?? null,
          normalScale: std?.normalScale ? std.normalScale.clone() : new THREE.Vector2(1, 1),
          bumpMap: std?.bumpMap ?? null,
          bumpScale: typeof std?.bumpScale === 'number' ? std.bumpScale : 1,
          roughnessMap: std?.roughnessMap ?? null,
          metalnessMap: std?.metalnessMap ?? null,
          emissive: std?.emissive ? std.emissive.clone() : new THREE.Color(0x000000),
          emissiveMap: std?.emissiveMap ?? null,
          emissiveIntensity: typeof std?.emissiveIntensity === 'number' ? std.emissiveIntensity : 0,
          aoMap: std?.aoMap ?? null,
          alphaMap: std?.alphaMap ?? null,
          vertexColors: Boolean(std?.vertexColors),
          flatShading: Boolean(std?.flatShading),
          side: std?.side ?? THREE.FrontSide,
          transparent: Boolean(std?.transparent),
          opacity: typeof std?.opacity === 'number' ? std.opacity : 1,
        });
        cb(phys);
        phys.needsUpdate = true;
        return phys;
      });
      child.material = Array.isArray(child.material) ? upgraded : upgraded[0];
    });
    setMaterialTick((t) => t + 1);
    viewportRef.current?.requestRender();
  }, []);

  const handleUpdateMaterial = useCallback(
    (patch: Partial<MaterialProps>) => {
      if (!selectedObject) return;
      const caps = viewportRef.current?.getCapabilities() ?? { isSoftwareGl: false };
      ensurePhysicalMaterials(selectedObject, (mat) => {
        if (patch.color !== undefined) mat.color.set(patch.color);
        if (patch.roughness !== undefined) mat.roughness = patch.roughness;
        if (patch.metalness !== undefined) mat.metalness = patch.metalness;
        if (patch.transmission !== undefined) {
          mat.transmission = caps.isSoftwareGl ? 0 : patch.transmission;
          mat.transparent = patch.transmission > 0 || mat.opacity < 1;
          if (caps.isSoftwareGl && patch.transmission > 0.1) {
            mat.opacity = Math.min(mat.opacity, 0.45);
          }
        }
        if (patch.ior !== undefined) mat.ior = patch.ior;
        if (patch.clearcoat !== undefined) mat.clearcoat = patch.clearcoat;
        if (patch.clearcoatRoughness !== undefined) mat.clearcoatRoughness = patch.clearcoatRoughness;
        if (patch.emissive !== undefined) mat.emissive.set(patch.emissive);
        if (patch.emissiveIntensity !== undefined) mat.emissiveIntensity = patch.emissiveIntensity;
        if (patch.opacity !== undefined) {
          mat.opacity = patch.opacity;
          mat.transparent = patch.opacity < 1 || mat.transmission > 0;
        }
        if (patch.wireframe !== undefined) mat.wireframe = patch.wireframe;
        if (patch.doubleSided !== undefined) {
          mat.side = patch.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
        }
        if (patch.flatShading !== undefined) mat.flatShading = patch.flatShading;
      });
    },
    [selectedObject, ensurePhysicalMaterials]
  );

  const handleApplyMaterialPreset = useCallback(
    (presetName: string) => {
      const presets: Record<string, Partial<MaterialProps>> = {
        clay: { color: '#b8bec8', roughness: 0.65, metalness: 0.02, transmission: 0, clearcoat: 0, emissiveIntensity: 0, opacity: 1 },
        aluminum: { color: '#9ea7b5', roughness: 0.24, metalness: 0.92, transmission: 0, clearcoat: 0.15, emissiveIntensity: 0, opacity: 1 },
        gold: { color: '#d9a441', roughness: 0.2, metalness: 0.96, transmission: 0, clearcoat: 0.35, emissiveIntensity: 0, opacity: 1 },
        glass: { color: '#dff2ff', roughness: 0.05, metalness: 0, transmission: 0.92, ior: 1.54, clearcoat: 1, emissiveIntensity: 0, opacity: 1 },
        carpaint: { color: '#c9382b', roughness: 0.32, metalness: 0.72, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.06, emissiveIntensity: 0, opacity: 1 },
        ceramic: { color: '#f0eee6', roughness: 0.18, metalness: 0.02, transmission: 0, clearcoat: 0.85, emissiveIntensity: 0, opacity: 1 },
        obsidian: { color: '#22252d', roughness: 0.38, metalness: 0.45, transmission: 0, clearcoat: 0.3, emissiveIntensity: 0, opacity: 1 },
        amber_glow: { color: '#e87d2f', roughness: 0.25, metalness: 0.3, transmission: 0, emissive: '#e87d2f', emissiveIntensity: 1.4, opacity: 1 },
      };
      const patch = presets[presetName];
      if (patch) handleUpdateMaterial(patch);
    },
    [handleUpdateMaterial]
  );

  const handleApplyTextureFile = useCallback(
    (file: File, mapType: 'map' | 'normalMap') => {
      if (!selectedObject) return;
      const url = URL.createObjectURL(file);
      const loader = new THREE.TextureLoader();
      loader.load(url, (tex) => {
        const caps = viewportRef.current?.getCapabilities() ?? { maxAnisotropy: 4 };
        tex.colorSpace = mapType === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.anisotropy = caps.maxAnisotropy;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;

        ensurePhysicalMaterials(selectedObject, (mat) => {
          mat[mapType] = tex;
          if (mapType === 'map') {
            mat.color.set('#ffffff');
          }
        });
        URL.revokeObjectURL(url);
        showToast('success', `Applied ${mapType === 'map' ? 'Albedo' : 'Normal'} Texture`, file.name);
      });
    },
    [selectedObject, ensurePhysicalMaterials, showToast]
  );

  const customAnimClip = useMemo(
    () => buildClipFromKeyframes(userKeyframes, animDuration, 'Studio_Keyframe_Animation'),
    [userKeyframes, animDuration]
  );

  const activeClips = useMemo(
    () => [...animations.map((a) => a.clip), ...(customAnimClip ? [customAnimClip] : [])],
    [animations, customAnimClip]
  );

  const handleInsertKeyframe = useCallback(() => {
    if (!selectedObject) return;
    const snappedTime = Number(Math.min(Math.max(animTime, 0), animDuration).toFixed(2));
    const kf: UserKeyframe = {
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: snappedTime,
      targetUuid: selectedObject.uuid,
      targetName: selectedObject.name || 'Object',
      position: [selectedObject.position.x, selectedObject.position.y, selectedObject.position.z],
      rotation: [selectedObject.rotation.x, selectedObject.rotation.y, selectedObject.rotation.z],
      scale: [selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z],
    };

    setIsPlayingAnim(false);
    setUserKeyframes((prev) => {
      const filtered = prev.filter(
        (existing) =>
          !(existing.targetUuid === kf.targetUuid && Math.abs(existing.time - kf.time) < 0.02)
      );
      return [...filtered, kf];
    });
    showToast(
      'success',
      `Keyframe inserted at ${snappedTime.toFixed(2)}s`,
      `${kf.targetName} transform recorded.`
    );
  }, [selectedObject, animTime, animDuration, showToast]);

  const handleApplyQuickMotion = useCallback(
    (preset: 'spin' | 'float' | 'bounce') => {
      if (!selectedObject) return;
      const generated = createQuickMotionKeyframes(selectedObject, preset, animDuration);
      setUserKeyframes((prev) => [
        ...prev.filter((kf) => kf.targetUuid !== selectedObject.uuid),
        ...generated,
      ]);
      setAnimTime(0);
      setIsPlayingAnim(true);
      showToast(
        'success',
        `Applied ${preset} animation`,
        `${selectedObject.name || 'Object'} (${animDuration}s)`
      );
    },
    [selectedObject, animDuration, showToast]
  );

  // Export Handler
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const target = selectedObject ?? sceneRootRef.current;
      const baseName = selectedObject?.name || 'prismforge_scene';
      const relevantClips = [
        ...animations
          .filter((a) => !selectedObject || a.rootObject === selectedObject)
          .map((a) => a.clip),
        ...(customAnimClip ? [customAnimClip] : []),
      ];
      try {
        const res = await exportObject3D(target, format, baseName, relevantClips);
        showToast(
          'success',
          `Exported ${format.toUpperCase()}`,
          `${res.fileName}${res.textureCount > 0 ? ` · ${res.textureCount} textures included` : ''}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Export failed.';
        showToast('error', 'Export Failed', msg);
      }
    },
    [selectedObject, animations, customAnimClip, showToast]
  );

  // Global Blender-style keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        if (activeClips.length > 0 && tag !== 'BUTTON') {
          e.preventDefault();
          setIsPlayingAnim((p) => !p);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (longPressTarget) {
          setLongPressTarget(null);
          return;
        }
        if (activeSceneCamera) {
          setActiveSceneCamera(null);
          return;
        }
      }

      const key = e.key.toLowerCase();
      if (key === 'q') setTransformMode('select');
      else if (key === 'g') setTransformMode('translate');
      else if (key === 'r') setTransformMode('rotate');
      else if (key === 's' && !e.ctrlKey && !e.metaKey) setTransformMode('scale');
      else if (key === 'f') viewportRef.current?.focusObject(selectedObject);
      else if (key === 'a' && !e.ctrlKey && !e.metaKey) setAnimPanelOpen((o) => !o);
      else if (key === 'l' && !e.ctrlKey && !e.metaKey)
        setLighting((l) => ({ ...l, showLightGuides: !l.showLightGuides }));
      else if (key === 'i') handleInsertKeyframe();
      else if (key === 'h') setInspectorOpen((o) => !o);
      else if (key === 'd' && e.shiftKey) {
        e.preventDefault();
        handleDuplicateSelected();
      } else if (key === 'x' || e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedObject,
    activeSceneCamera,
    longPressTarget,
    activeClips.length,
    handleDuplicateSelected,
    handleDeleteSelected,
    handleInsertKeyframe,
  ]);

  const materialProps = useMemo(
    () => readMaterialProps(selectedObject),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedObject, materialTick]
  );

  const sceneTotals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.vertices += item.vertexCount;
        acc.triangles += item.triangleCount;
        return acc;
      },
      { vertices: 0, triangles: 0 }
    );
  }, [items]);

  const isMobileFilePicker =
    typeof navigator !== 'undefined' && /iphone|ipad|ipod|android/i.test(navigator.userAgent);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#141518] text-[#e6e8ec] overflow-hidden">
      {/* Hidden Multi-Format File Picker (unrestricted on iOS/Android so custom 3D extensions are never grayed out) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={isMobileFilePicker ? undefined : ACCEPTED_MODEL_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleImportFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Top Studio Header */}
      <TopBar
        workspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        onTriggerImport={() => fileInputRef.current?.click()}
        onAddPrimitive={handleAddPrimitive}
        onAddComposite={handleAddComposite}
        onAddCamera={() => handleAddCamera(false)}
        onAddLight={handleAddLight}
        onExport={handleExport}
        onOpenRender={() => setRenderModalOpen(true)}
        onOpenMinecraftRig={() => setMinecraftRigOpen(true)}
        onOpenFormatGuide={() => setFormatGuideOpen(true)}
      />

      {/* Main Workstation Area */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        {/* Dedicated Left-Side Animation Studio */}
        {animPanelOpen && (
          <AnimationPanel
            items={items}
            selectedObject={selectedObject}
            animations={animations}
            userKeyframes={userKeyframes}
            isPlaying={isPlayingAnim}
            animTime={animTime}
            animSpeed={animSpeed}
            animDuration={animDuration}
            animLoop={animLoop}
            onSelectObject={setSelectedObject}
            onTogglePlay={() => setIsPlayingAnim((p) => !p)}
            onResetAnim={() => {
              setIsPlayingAnim(false);
              setAnimTime(0);
            }}
            onScrub={(t) => {
              setIsPlayingAnim(false);
              setAnimTime(t);
            }}
            onSpeedChange={setAnimSpeed}
            onDurationChange={setAnimDuration}
            onToggleLoop={() => setAnimLoop((l) => !l)}
            onInsertKeyframe={handleInsertKeyframe}
            onApplyQuickMotion={handleApplyQuickMotion}
            onDeleteKeyframe={(id) =>
              setUserKeyframes((prev) => prev.filter((kf) => kf.id !== id))
            }
            onClearKeyframes={() => {
              setIsPlayingAnim(false);
              setUserKeyframes([]);
              setAnimTime(0);
            }}
            onRemoveClip={(id) => {
              setIsPlayingAnim(false);
              setAnimations((prev) => prev.filter((c) => c.id !== id));
            }}
            onClose={() => setAnimPanelOpen(false)}
          />
        )}

        {/* 3D Viewport */}
        <main className="relative flex-1 min-w-0 h-full">
          <ViewportOverlayControls
            transformMode={transformMode}
            transformSpace={transformSpace}
            snapEnabled={snapEnabled}
            shadingMode={shadingMode}
            hasSelection={Boolean(selectedObject)}
            animPanelOpen={animPanelOpen}
            inspectorOpen={inspectorOpen}
            showGrid={lighting.showGrid}
            showLightGuides={lighting.showLightGuides}
            zenMode={zenMode}
            onTransformModeChange={setTransformMode}
            onToggleSpace={() => setTransformSpace((s) => (s === 'world' ? 'local' : 'world'))}
            onToggleSnap={() => setSnapEnabled((s) => !s)}
            onShadingModeChange={setShadingMode}
            onCameraPreset={(preset: CameraPreset) => viewportRef.current?.setCameraPreset(preset)}
            onFocusSelection={() => viewportRef.current?.focusObject(selectedObject)}
            onDuplicateSelection={handleDuplicateSelected}
            onDeleteSelection={handleDeleteSelected}
            onToggleGrid={() => setLighting((l) => ({ ...l, showGrid: !l.showGrid }))}
            onToggleLightGuides={() =>
              setLighting((l) => ({ ...l, showLightGuides: !l.showLightGuides }))
            }
            onToggleAnimPanel={() => setAnimPanelOpen((o) => !o)}
            onToggleInspector={() => setInspectorOpen((o) => !o)}
            onToggleZenMode={() => setZenMode((z) => !z)}
          />

          <ViewportCanvas
            ref={viewportRef}
            sceneRoot={sceneRootRef.current}
            selectedObject={selectedObject}
            shadingMode={shadingMode}
            transformMode={transformMode}
            transformSpace={transformSpace}
            snapEnabled={snapEnabled}
            lighting={lighting}
            cameraSettings={cameraSettings}
            activeAnimations={activeClips}
            isPlayingAnim={isPlayingAnim}
            animSpeed={animSpeed}
            animTime={animTime}
            animDuration={animDuration}
            animLoop={animLoop}
            ecoMode={battery.ecoActive}
            activeSceneCamera={activeSceneCamera}
            onSelectObject={setSelectedObject}
            onTransformChange={() => setTransformTick((t) => t + 1)}
            onAnimTimeUpdate={setAnimTime}
            onAnimFinished={() => setIsPlayingAnim(false)}
            onFilesDropped={handleImportFiles}
            onLongPressHit={(hit) => {
              let prevTop: THREE.Object3D | null = selectedObject;
              while (prevTop && prevTop.parent && prevTop.parent !== sceneRootRef.current) {
                prevTop = prevTop.parent;
              }
              setSelectedObject(hit.part);
              setLongPressTarget({ ...hit, previousTopObject: prevTop });
            }}
            onEngineReady={handleEngineReady}
          />

          {/* Active Camera POV Indicator & Quick Jump Out Bar */}
          {activeSceneCamera && (
            <div className="pointer-events-auto absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#1a1c22] border border-[#e87d2f]/60 shadow-xl text-xs">
              <Video className="w-3.5 h-3.5 text-[#e87d2f] shrink-0" />
              <span className="font-medium text-white whitespace-nowrap">
                {activeSceneCamera.name || 'Camera'} POV
              </span>
              <button
                type="button"
                onClick={() => handleToggleJumpCamera(activeSceneCamera)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#e87d2f] hover:bg-[#d66f23] text-white font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3 h-3" />
                <span>Jump Out Camera</span>
              </button>
            </div>
          )}

          {/* Subtle Bottom-Left Hint (desktop only so compact screens stay clear) */}
          {!zenMode && (
            <div className="pointer-events-none hidden md:block absolute bottom-3 left-3 z-10 text-[11px] text-slate-400 bg-[#181a20]/90 border border-[#2a2d36] rounded px-2.5 py-1">
              Hold 1s on any part for options · Drag &amp; drop .blend, .prisma, .glb, .fbx, .obj
            </div>
          )}

          {/* Importing Indicator */}
          {isImporting && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55">
              <div className="px-5 py-3 rounded-md bg-[#1b1d23] border border-[#323642] text-xs font-medium text-white shadow-xl">
                Parsing 3D model geometry & materials...
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {toast && (
            <div className="absolute bottom-12 left-3 z-30 max-w-md bg-[#1b1d23] border border-[#323642] rounded-md shadow-xl p-3 flex items-start gap-2.5">
              {toast.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">{toast.title}</p>
                {toast.detail && (
                  <p className="mt-0.5 text-[11px] text-slate-300 leading-relaxed">{toast.detail}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </main>

        {/* Collapsible Outliner & Properties Inspector */}
        {inspectorOpen && (
          <OutlinerInspector
            items={items}
            selectedObject={selectedObject}
            inspectorTab={inspectorTab}
            materialProps={materialProps}
            lighting={lighting}
            cameraSettings={cameraSettings}
            activeSceneCamera={activeSceneCamera}
            transformTick={transformTick}
            onInspectorTabChange={setInspectorTab}
            onSelectObject={setSelectedObject}
            onToggleVisibility={handleToggleVisibility}
            onDeleteItem={handleDeleteItem}
            onRenameObject={handleRenameObject}
            onToggleJumpCamera={handleToggleJumpCamera}
            onUpdateSceneCameraFov={handleUpdateSceneCameraFov}
            onUpdateSceneLight={handleUpdateSceneLight}
            onResetLightAim={handleResetLightAim}
            onAddLight={handleAddLight}
            onRestoreDefaultLights={handleRestoreDefaultLights}
            onUpdateTransform={handleUpdateTransform}
            onGroundObject={handleGroundObject}
            onCenterObject={handleCenterObject}
            onUpdateMaterial={handleUpdateMaterial}
            onApplyMaterialPreset={handleApplyMaterialPreset}
            onApplyTextureFile={handleApplyTextureFile}
            onUpdateLighting={handleUpdateLighting}
            onApplyLightingPreset={handleApplyLightingPreset}
            onUpdateCamera={(patch) => setCameraSettings((c) => ({ ...c, ...patch }))}
            onOpenRenderModal={() => setRenderModalOpen(true)}
            onExport={handleExport}
            onClose={() => setInspectorOpen(false)}
          />
        )}
      </div>

      {/* Bottom Status & Quick Bar */}
      <TimelineBar
        totalObjects={items.length}
        totalVertices={sceneTotals.vertices}
        totalTriangles={sceneTotals.triangles}
        selectedName={selectedObject?.name ?? null}
        hasAnimations={activeClips.length > 0}
        isPlaying={isPlayingAnim}
        animTime={animTime}
        animPanelOpen={animPanelOpen}
        turntable={cameraSettings.turntable}
        powerMode={powerMode}
        ecoActive={battery.ecoActive}
        batteryLevel={battery.batteryLevel}
        onTogglePlay={() => setIsPlayingAnim((p) => !p)}
        onToggleAnimPanel={() => setAnimPanelOpen((o) => !o)}
        onToggleTurntable={() => setCameraSettings((c) => ({ ...c, turntable: !c.turntable }))}
        onCyclePowerMode={() =>
          setPowerMode((m) =>
            m === 'auto' ? 'eco' : m === 'eco' ? 'performance' : 'auto'
          )
        }
      />

      {/* Modals */}
      <RenderModal
        open={renderModalOpen}
        onClose={() => setRenderModalOpen(false)}
        onCapture={(w, h, transparent) =>
          viewportRef.current?.captureSnapshot(w, h, transparent) ?? null
        }
      />

      <FormatGuideModal
        open={formatGuideOpen}
        onClose={() => setFormatGuideOpen(false)}
        onReplayIntro={() => {
          setFormatGuideOpen(false);
          setShowIntro(true);
        }}
      />

      <MinecraftRigModal
        open={minecraftRigOpen}
        onClose={() => setMinecraftRigOpen(false)}
        onLoadIntoViewport={handleLoadMinecraftRig}
        onDownloaded={(fmt) =>
          showToast(
            'success',
            `Downloaded Free Minecraft Rig (${fmt})`,
            'Ready to open in Blender, Prisma3D, or PrismForge 3D.'
          )
        }
      />

      <LongPressMenu
        target={longPressTarget}
        activeSceneCamera={activeSceneCamera}
        hasAnySceneCamera={items.some((it) => it.type === 'camera' || it.object.userData?.isSceneCamera)}
        canGroupWithOther={Boolean(
          longPressTarget?.previousTopObject &&
            longPressTarget.previousTopObject !== longPressTarget.topObject
        )}
        otherObjectName={longPressTarget?.previousTopObject?.name}
        onClose={() => setLongPressTarget(null)}
        onJumpCameraToggle={() => {
          if (!longPressTarget) return;
          handleToggleJumpCamera(longPressTarget.part);
        }}
        onToggleHide={() => {
          if (!longPressTarget) return;
          handleToggleHideTarget(longPressTarget.part);
        }}
        onGroup={(combineWithOther) => {
          if (!longPressTarget) return;
          handleGroupTarget(longPressTarget, combineWithOther);
        }}
        onUngroup={() => {
          if (!longPressTarget) return;
          handleUngroupTarget(longPressTarget.part);
        }}
        onFocus={() => {
          if (!longPressTarget) return;
          if (activeSceneCamera) setActiveSceneCamera(null);
          viewportRef.current?.focusObject(longPressTarget.part);
          setLongPressTarget(null);
        }}
        onDuplicate={() => {
          if (!longPressTarget) return;
          handleDuplicateTarget(longPressTarget.part);
          setLongPressTarget(null);
        }}
        onEditInspector={() => {
          if (!longPressTarget) return;
          setSelectedObject(longPressTarget.part);
          setInspectorOpen(true);
          setInspectorTab('object');
          setLongPressTarget(null);
        }}
        onSelectParent={() => {
          if (!longPressTarget) return;
          setSelectedObject(longPressTarget.topObject);
          setLongPressTarget(null);
        }}
        onDelete={() => {
          if (!longPressTarget) return;
          handleDeleteTarget(longPressTarget.part);
          setLongPressTarget(null);
        }}
      />

      {showIntro && <IntroOverlay onComplete={() => setShowIntro(false)} />}
      <OfflineIndicator />
    </div>
  );
}
