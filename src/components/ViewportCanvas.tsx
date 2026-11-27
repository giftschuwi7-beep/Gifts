import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { syncSceneLightVisuals } from '../engine/lightVisualizers';
import type {
  CameraPreset,
  CameraSettings,
  LightingSettings,
  ShadingMode,
  TransformMode,
  TransformSpace,
} from '../types/studio';

export interface ViewportHandle {
  focusObject: (obj: THREE.Object3D | null) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  captureSnapshot: (width: number, height: number, transparentBg: boolean) => string | null;
  requestRender: () => void;
  getEditorViewPose: () => { position: THREE.Vector3; quaternion: THREE.Quaternion } | null;
  getCapabilities: () => { isSoftwareGl: boolean; maxAnisotropy: number };
}

interface ViewportCanvasProps {
  sceneRoot: THREE.Group;
  selectedObject: THREE.Object3D | null;
  shadingMode: ShadingMode;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  snapEnabled: boolean;
  lighting: LightingSettings;
  cameraSettings: CameraSettings;
  activeAnimations: THREE.AnimationClip[];
  isPlayingAnim: boolean;
  animSpeed: number;
  animTime: number;
  animDuration: number;
  animLoop: boolean;
  ecoMode: boolean;
  activeSceneCamera: THREE.Object3D | null;
  onSelectObject: (obj: THREE.Object3D | null) => void;
  onTransformChange: () => void;
  onAnimTimeUpdate: (time: number) => void;
  onAnimFinished?: () => void;
  onFilesDropped: (files: FileList) => void;
  onLongPressHit: (hit: {
    part: THREE.Object3D;
    topObject: THREE.Object3D;
    clientX: number;
    clientY: number;
  }) => void;
  onEngineReady: (caps: { isSoftwareGl: boolean; maxAnisotropy: number }) => void;
}

// Pre-allocated math helpers (zero GC in render loop)
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _turntableOffset = new THREE.Vector3();
const _mouse = new THREE.Vector2();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const ViewportCanvas = forwardRef<ViewportHandle, ViewportCanvasProps>(function ViewportCanvas(
  {
    sceneRoot,
    selectedObject,
    shadingMode,
    transformMode,
    transformSpace,
    snapEnabled,
    lighting,
    cameraSettings,
    activeAnimations,
    isPlayingAnim,
    animSpeed,
    animTime,
    animDuration,
    animLoop,
    ecoMode,
    activeSceneCamera,
    onSelectObject,
    onTransformChange,
    onAnimTimeUpdate,
    onAnimFinished,
    onFilesDropped,
    onLongPressHit,
    onEngineReady,
  },
  ref
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const holdRingRef = useRef<HTMLDivElement | null>(null);
  const holdCircleRef = useRef<SVGCircleElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  // Mutable refs so React updates never tear down the WebGL context
  const onSelectRef = useRef(onSelectObject);
  const onTransformRef = useRef(onTransformChange);
  const onAnimTimeRef = useRef(onAnimTimeUpdate);
  const onAnimFinishedRef = useRef(onAnimFinished);
  const onLongPressRef = useRef(onLongPressHit);
  onSelectRef.current = onSelectObject;
  onTransformRef.current = onTransformChange;
  onAnimTimeRef.current = onAnimTimeUpdate;
  onAnimFinishedRef.current = onAnimFinished;
  onLongPressRef.current = onLongPressHit;

  const isPlayingRef = useRef(isPlayingAnim);
  const animSpeedRef = useRef(animSpeed);
  const animTimeRef = useRef(animTime);
  const animDurationRef = useRef(animDuration);
  const animLoopRef = useRef(animLoop);
  const ecoModeRef = useRef(ecoMode);
  const lightingRef = useRef(lighting);
  const activeSceneCameraRef = useRef(activeSceneCamera);
  const turntableRef = useRef(cameraSettings.turntable);
  const turntableSpeedRef = useRef(cameraSettings.turntableSpeed);
  isPlayingRef.current = isPlayingAnim;
  animSpeedRef.current = animSpeed;
  animTimeRef.current = animTime;
  animDurationRef.current = animDuration;
  animLoopRef.current = animLoop;
  ecoModeRef.current = ecoMode;
  lightingRef.current = lighting;
  activeSceneCameraRef.current = activeSceneCamera;
  turntableRef.current = cameraSettings.turntable;
  turntableSpeedRef.current = cameraSettings.turntableSpeed;

  const savedOrbitRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    prevCam: THREE.Object3D | null;
  }>({
    pos: new THREE.Vector3(4.2, 2.8, 4.8),
    target: new THREE.Vector3(0, 0.85, 0),
    prevCam: null,
  });

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    perspCamera: THREE.PerspectiveCamera;
    orthoCamera: THREE.OrthographicCamera;
    sceneViewCamera: THREE.PerspectiveCamera;
    activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    orbit: OrbitControls;
    transform: TransformControls;
    ambientBounceLight: THREE.HemisphereLight;
    softboxLight: THREE.RectAreaLight | null;
    grid: THREE.GridHelper;
    floorMesh: THREE.Mesh;
    envTexture: THREE.Texture;
    clayMaterial: THREE.MeshStandardMaterial;
    originalMaterials: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>;
    selectionBoxHelper: THREE.BoxHelper | null;
    mixer: THREE.AnimationMixer | null;
    actions: THREE.AnimationAction[];
    isSoftwareGl: boolean;
    isMobileDevice: boolean;
    maxAnisotropy: number;
    cameraTransitionActive: boolean;
    syncSceneCameraPose: () => void;
    requestRender: () => void;
    ensureContinuousLoop: () => void;
  } | null>(null);

  // Initialize Three.js WebGL engine once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const isMobileDevice =
      typeof navigator !== 'undefined' &&
      (/iphone|ipad|ipod|android/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl && !ecoModeRef.current,
      powerPreference: ecoModeRef.current ? 'low-power' : 'high-performance',
      alpha: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lighting.exposure;
    const targetDpr =
      isSoftwareGl || ecoModeRef.current
        ? 1
        : Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.5 : 2);
    renderer.setPixelRatio(targetDpr);
    renderer.shadowMap.enabled = !isSoftwareGl && !ecoModeRef.current && lighting.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
    renderer.domElement.style.touchAction = 'none';

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(lighting.backgroundColor);
    scene.fog = new THREE.FogExp2(lighting.backgroundColor, 0.012);

    // Mandatory studio RoomEnvironment PMREM
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = lighting.envIntensity;
    pmrem.dispose();

    const width = container.clientWidth || 1280;
    const height = container.clientHeight || 720;
    const aspect = width / height;

    const perspCamera = new THREE.PerspectiveCamera(42, aspect, 0.05, 500);
    perspCamera.position.set(4.2, 2.8, 4.8);

    const sceneViewCamera = new THREE.PerspectiveCamera(45, aspect, 0.05, 500);

    const frustum = 5;
    const orthoCamera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.05,
      500
    );
    orthoCamera.position.copy(perspCamera.position);

    const activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspCamera;

    const orbit = new OrbitControls(activeCamera, renderer.domElement);
    orbit.enableDamping = !isSoftwareGl;
    orbit.dampingFactor = 0.08;
    orbit.target.set(0, 0.85, 0);
    orbit.maxDistance = 120;
    orbit.minDistance = 0.4;
    orbit.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    orbit.update();

    const transform = new TransformControls(activeCamera, renderer.domElement);
    transform.setSize(0.85);
    const transformHelper = transform.getHelper();
    scene.add(transformHelper);

    // Subtle base ambient bounce (individual Key, Fill, Rim, and custom lights live in sceneRoot)
    const ambientBounceLight = new THREE.HemisphereLight('#b8cce6', '#1c1f26', 0.28);
    scene.add(ambientBounceLight);

    let softboxLight: THREE.RectAreaLight | null = null;
    if (!isSoftwareGl && !isMobileDevice) {
      RectAreaLightUniformsLib.init();
      softboxLight = new THREE.RectAreaLight('#fff8f0', ecoModeRef.current ? 0 : 1.4, 4.5, 2.2);
      softboxLight.position.set(-3.2, 4.0, 2.5);
      softboxLight.lookAt(0, 0.8, 0);
      scene.add(softboxLight);
    }

    // Studio Grid & Floor Plane
    const grid = new THREE.GridHelper(24, 24, 0x454a56, 0x282b33);
    grid.position.y = 0.001;
    scene.add(grid);

    const floorGeo = new THREE.CircleGeometry(18, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c21,
      roughness: 0.88,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    floorMesh.position.y = -0.002;
    scene.add(floorMesh);

    // Mount user sceneRoot
    scene.add(sceneRoot);

    const clayMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8bec8,
      roughness: 0.52,
      metalness: 0.04,
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, activeCamera);
    }

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let continuousRunning = false;
    const clock = new THREE.Clock();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    let lastAnimUiSync = 0;
    let lastTransformUiSync = 0;

    const advanceFrame = (dt: number) => {
      const eng = engineRef.current;
      if (!eng) return;

      // Smooth camera transition damping
      if (eng.cameraTransitionActive) {
        const k = 9;
        const alpha = 1 - Math.exp(-k * dt);
        eng.activeCamera.position.lerp(_desiredCamPos, alpha);
        eng.orbit.target.lerp(_desiredTarget, alpha);
        if (
          eng.activeCamera.position.distanceToSquared(_desiredCamPos) < 0.0004 &&
          eng.orbit.target.distanceToSquared(_desiredTarget) < 0.0004
        ) {
          eng.activeCamera.position.copy(_desiredCamPos);
          eng.orbit.target.copy(_desiredTarget);
          eng.cameraTransitionActive = false;
        }
      }

      // Turntable auto-orbit (zero Vector3 allocation)
      if (turntableRef.current && !eng.cameraTransitionActive) {
        const angle = dt * turntableSpeedRef.current * 0.65;
        _turntableOffset.copy(eng.activeCamera.position).sub(eng.orbit.target);
        _turntableOffset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
        eng.activeCamera.position.copy(eng.orbit.target).add(_turntableOffset);
      }

      // Animation mixer (throttle React UI readout to ~16Hz to avoid 60fps UI re-render lag)
      if (isPlayingRef.current && eng.mixer && eng.actions.length > 0) {
        eng.mixer.update(dt * animSpeedRef.current);
        const maxClipDur = Math.max(
          animDurationRef.current,
          ...eng.actions.map((a) => a.getClip().duration),
          0.1
        );
        const current = eng.actions[0].time;
        const now = performance.now();
        const finished = !animLoopRef.current && current >= maxClipDur - 0.001;
        if (finished || now - lastAnimUiSync >= 60) {
          lastAnimUiSync = now;
          onAnimTimeRef.current(current);
        }
        if (finished) {
          onAnimFinishedRef.current?.();
        }
        if (eng.selectionBoxHelper) {
          eng.selectionBoxHelper.update();
        }
      }

      if (activeSceneCameraRef.current) {
        eng.syncSceneCameraPose();
      } else {
        eng.orbit.update();
      }
    };

    const syncSceneCameraPose = () => {
      const eng = engineRef.current;
      const camObj = activeSceneCameraRef.current;
      if (!eng || !camObj) return;
      camObj.updateMatrixWorld(true);
      camObj.getWorldPosition(eng.sceneViewCamera.position);
      camObj.getWorldQuaternion(eng.sceneViewCamera.quaternion);
      const nextFov = Number(camObj.userData.cameraFov ?? 45);
      if (Math.abs(eng.sceneViewCamera.fov - nextFov) > 0.05) {
        eng.sceneViewCamera.fov = nextFov;
        eng.sceneViewCamera.updateProjectionMatrix();
      }
    };

    const needsContinuousLoop = () => {
      const eng = engineRef.current;
      if (!eng) return false;
      return Boolean(
        eng.cameraTransitionActive ||
          turntableRef.current ||
          (isPlayingRef.current && eng.actions.length > 0)
      );
    };

    const loopTick = () => {
      const dt = Math.min(clock.getDelta(), 0.1);
      advanceFrame(dt);
      const eng = engineRef.current;
      if (!eng) return;
      renderer.render(scene, eng.activeCamera);

      if (needsContinuousLoop()) {
        if (isSoftwareGl) {
          afterDraw(loopTick);
        } else if (ecoModeRef.current) {
          // Cap continuous playback/turntable around ~24fps in low-battery Eco mode so phone stays responsive
          frameId = window.setTimeout(loopTick, 42);
        } else {
          frameId = requestAnimationFrame(loopTick);
        }
      } else {
        continuousRunning = false;
      }
    };

    const ensureContinuousLoop = () => {
      if (continuousRunning) return;
      if (!needsContinuousLoop()) return;
      continuousRunning = true;
      clock.getDelta(); // reset delta spike
      if (isSoftwareGl) {
        frameId = window.setTimeout(loopTick, 16);
      } else if (ecoModeRef.current) {
        frameId = window.setTimeout(loopTick, 42);
      } else {
        frameId = requestAnimationFrame(loopTick);
      }
    };

    const requestRender = () => {
      if (continuousRunning) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const dt = Math.min(clock.getDelta(), 0.05);
        advanceFrame(dt);
        const eng = engineRef.current;
        if (eng) {
          renderer.render(scene, eng.activeCamera);
        }
        const done = () => {
          renderBusy = false;
          if (renderDirty || (eng && eng.orbit.enableDamping && eng.cameraTransitionActive)) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    engineRef.current = {
      renderer,
      scene,
      perspCamera,
      orthoCamera,
      sceneViewCamera,
      activeCamera,
      orbit,
      transform,
      ambientBounceLight,
      softboxLight,
      grid,
      floorMesh,
      envTexture,
      clayMaterial,
      originalMaterials: new WeakMap(),
      selectionBoxHelper: null,
      mixer: null,
      actions: [],
      isSoftwareGl,
      isMobileDevice,
      maxAnisotropy,
      cameraTransitionActive: false,
      syncSceneCameraPose,
      requestRender,
      ensureContinuousLoop,
    };

    // OrbitControls events
    orbit.addEventListener('start', () => {
      if (engineRef.current) engineRef.current.cameraTransitionActive = false;
    });
    orbit.addEventListener('change', () => {
      requestRender();
    });

    // TransformControls events (throttle React transform readout during drag; flush exact on release)
    transform.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value;
      if (!e.value) {
        if (engineRef.current?.selectionBoxHelper) {
          engineRef.current.selectionBoxHelper.update();
        }
        onTransformRef.current();
      }
    });
    transform.addEventListener('change', () => {
      const attached = transform.object;
      if (attached?.userData?.isSceneLight) {
        const mode = transform.getMode();
        if (mode === 'rotate') {
          attached.userData.autoTrackCenter = false;
        } else if (mode === 'translate' && attached.userData.autoTrackCenter !== false) {
          attached.lookAt(0, 0.65, 0);
        }
        syncSceneLightVisuals(
          attached as THREE.Group,
          lightingRef.current.showLightGuides,
          lightingRef.current.shadowsEnabled,
          ecoModeRef.current
        );
      }
      if (engineRef.current?.selectionBoxHelper) {
        engineRef.current.selectionBoxHelper.update();
      }
      const now = performance.now();
      if (now - lastTransformUiSync >= 60) {
        lastTransformUiSync = now;
        onTransformRef.current();
      }
      requestRender();
    });

    // Click-to-select & 1-second stationary Long-Press raycasting
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.08;
    let pointerDownPos = { x: 0, y: 0 };
    const activePointers = new Map<number, { x: number; y: number }>();
    let holdTimerId = 0;
    let holdRafId = 0;
    let holdPointerId: number | null = null;
    let holdStartMs = 0;
    let longPressTriggered = false;
    const LONG_PRESS_MS = 1000;
    const RING_SHOW_DELAY_MS = 160;
    const RING_CIRCUMFERENCE = 2 * Math.PI * 22;

    const hideHoldRing = () => {
      if (holdRingRef.current) {
        holdRingRef.current.style.display = 'none';
      }
      if (holdCircleRef.current) {
        holdCircleRef.current.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      }
    };

    const cancelLongPress = () => {
      if (holdTimerId) {
        window.clearTimeout(holdTimerId);
        holdTimerId = 0;
      }
      if (holdRafId) {
        cancelAnimationFrame(holdRafId);
        holdRafId = 0;
      }
      holdPointerId = null;
      hideHoldRing();
    };

    const updateHoldProgressRing = () => {
      if (holdPointerId === null) return;
      const elapsed = performance.now() - holdStartMs;
      if (elapsed >= RING_SHOW_DELAY_MS && holdRingRef.current && holdCircleRef.current) {
        holdRingRef.current.style.display = 'flex';
        holdRingRef.current.style.left = `${pointerDownPos.x}px`;
        holdRingRef.current.style.top = `${pointerDownPos.y}px`;
        const progress = Math.min(
          1,
          (elapsed - RING_SHOW_DELAY_MS) / (LONG_PRESS_MS - RING_SHOW_DELAY_MS)
        );
        holdCircleRef.current.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
      }
      if (elapsed < LONG_PRESS_MS && holdPointerId !== null) {
        holdRafId = requestAnimationFrame(updateHoldProgressRing);
      }
    };

    const isAncestryVisible = (obj: THREE.Object3D): boolean => {
      let c: THREE.Object3D | null = obj;
      while (c) {
        if (!c.visible) return false;
        if (c === sceneRoot) break;
        c = c.parent;
      }
      return true;
    };

    const performLongPressRaycast = (clientX: number, clientY: number) => {
      const eng = engineRef.current;
      if (!eng) return;

      const rect = renderer.domElement.getBoundingClientRect();
      _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(_mouse, eng.activeCamera);
      const hits = raycaster.intersectObjects(sceneRoot.children, true);
      const visibleHit = hits.find((h) => isAncestryVisible(h.object));

      if (visibleHit) {
        const hitMesh = visibleHit.object;
        let topObj: THREE.Object3D = hitMesh;
        let cameraRoot: THREE.Object3D | null = null;
        let lightRoot: THREE.Object3D | null = null;
        let curr: THREE.Object3D | null = hitMesh;
        while (curr && curr !== sceneRoot) {
          if (curr.userData?.isSceneCamera) cameraRoot = curr;
          if (curr.userData?.isSceneLight) lightRoot = curr;
          if (curr.parent === sceneRoot) topObj = curr;
          curr = curr.parent;
        }
        const pressedPart = cameraRoot ?? lightRoot ?? hitMesh;
        onLongPressRef.current({
          part: pressedPart,
          topObject: topObj,
          clientX,
          clientY,
        });
      } else if (activeSceneCameraRef.current) {
        onLongPressRef.current({
          part: activeSceneCameraRef.current,
          topObject: activeSceneCameraRef.current,
          clientX,
          clientY,
        });
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Cancel long press on secondary mouse buttons or multi-finger pinch
      if (activePointers.size > 1 || (e.pointerType === 'mouse' && e.button !== 0)) {
        cancelLongPress();
        return;
      }

      pointerDownPos = { x: e.clientX, y: e.clientY };
      longPressTriggered = false;
      cancelLongPress();

      if (transform.dragging) return;

      holdPointerId = e.pointerId;
      holdStartMs = performance.now();
      holdRafId = requestAnimationFrame(updateHoldProgressRing);
      holdTimerId = window.setTimeout(() => {
        if (holdPointerId === null || transform.dragging) return;
        longPressTriggered = true;
        cancelLongPress();
        // Temporarily pause orbit on release so finger lift won't flick viewport
        orbit.enabled = false;
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(18);
          }
        } catch {
          /* ignore */
        }
        performLongPressRaycast(pointerDownPos.x, pointerDownPos.y);
      }, LONG_PRESS_MS);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (holdPointerId !== e.pointerId) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 10 || transform.dragging) {
        cancelLongPress();
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (holdPointerId === e.pointerId) {
        cancelLongPress();
      }

      // Restore OrbitControls unless currently locked inside a Scene Camera POV
      orbit.enabled = !activeSceneCameraRef.current;

      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }

      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 5) return; // was an orbit/gizmo drag
      if (transform.dragging) return;
      if (activeSceneCameraRef.current) return; // locked inside Scene Camera POV

      const eng = engineRef.current;
      if (!eng) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(_mouse, eng.activeCamera);
      const hits = raycaster.intersectObjects(sceneRoot.children, true);
      const visibleHit = hits.find((h) => isAncestryVisible(h.object));
      if (visibleHit) {
        // Walk up to top-level child of sceneRoot so composite models & lights move together cleanly
        let hitObj: THREE.Object3D | null = visibleHit.object;
        while (hitObj && hitObj.parent && hitObj.parent !== sceneRoot) {
          hitObj = hitObj.parent;
        }
        onSelectRef.current(hitObj);
      } else {
        onSelectRef.current(null);
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (holdPointerId === e.pointerId) {
        cancelLongPress();
      }
      orbit.enabled = !activeSceneCameraRef.current;
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel);

    // WebGL context loss safety
    const onLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onRestored = () => {
      setContextLost(false);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);

    // Resize & Orientation Change handler for portrait/landscape phone rotation
    const handleViewportResize = () => {
      const eng = engineRef.current;
      if (!eng || !container) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      const asp = w / h;

      eng.perspCamera.aspect = asp;
      eng.perspCamera.updateProjectionMatrix();
      eng.sceneViewCamera.aspect = asp;
      eng.sceneViewCamera.updateProjectionMatrix();

      const f = 5;
      eng.orthoCamera.left = (-f * asp) / 2;
      eng.orthoCamera.right = (f * asp) / 2;
      eng.orthoCamera.top = f / 2;
      eng.orthoCamera.bottom = -f / 2;
      eng.orthoCamera.updateProjectionMatrix();

      eng.renderer.setSize(w, h);
      eng.requestRender();
    };

    let orientationTimer = 0;
    const handleOrientation = () => {
      handleViewportResize();
      window.clearTimeout(orientationTimer);
      orientationTimer = window.setTimeout(handleViewportResize, 150);
    };

    const resizeObserver = new ResizeObserver(handleViewportResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleOrientation);

    onEngineReady({ isSoftwareGl, maxAnisotropy });
    requestRender();

    return () => {
      cancelLongPress();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.clearTimeout(orientationTimer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleOrientation);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      orbit.dispose();
      transform.dispose();
      envTexture.dispose();
      clayMaterial.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync Shading Mode
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    sceneRoot.traverse((child) => {
      if (child.userData?.isLightVisual) return;
      if (child instanceof THREE.Mesh) {
        if (!eng.originalMaterials.has(child)) {
          eng.originalMaterials.set(child, child.material);
        }
        const orig = eng.originalMaterials.get(child)!;

        if (shadingMode === 'solid') {
          child.material = eng.clayMaterial;
        } else {
          child.material = orig;
          const mats = Array.isArray(orig) ? orig : [orig];
          for (const m of mats) {
            if (m && 'wireframe' in m) {
              if (shadingMode === 'wireframe') {
                if (m.userData.__origWireframe === undefined) {
                  m.userData.__origWireframe = (m as THREE.MeshStandardMaterial).wireframe;
                }
                (m as THREE.MeshStandardMaterial).wireframe = true;
              } else if (m.userData.__origWireframe !== undefined) {
                (m as THREE.MeshStandardMaterial).wireframe = Boolean(m.userData.__origWireframe);
              }
            }
          }
        }
      }
    });

    const isRendered = shadingMode === 'rendered';
    eng.renderer.shadowMap.enabled =
      !eng.isSoftwareGl &&
      !ecoMode &&
      lighting.shadowsEnabled &&
      (isRendered || shadingMode === 'material');
    eng.floorMesh.visible = lighting.showFloor && shadingMode !== 'wireframe';
    eng.requestRender();
  }, [shadingMode, sceneRoot, lighting.shadowsEnabled, lighting.showFloor, ecoMode]);

  // Sync Eco Low-Battery Mode & Scene Lights / Environment
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    const targetDpr =
      eng.isSoftwareGl || ecoMode
        ? 1
        : Math.min(window.devicePixelRatio || 1, eng.isMobileDevice ? 1.5 : 2);
    if (eng.renderer.getPixelRatio() !== targetDpr) {
      eng.renderer.setPixelRatio(targetDpr);
      const container = mountRef.current;
      if (container) {
        eng.renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
      }
    }

    if (eng.softboxLight) {
      eng.softboxLight.intensity = ecoMode ? 0 : 1.4;
    }

    eng.scene.background = new THREE.Color(lighting.backgroundColor);
    if (eng.scene.fog instanceof THREE.FogExp2) {
      eng.scene.fog.color.set(lighting.backgroundColor);
    }

    eng.ambientBounceLight.color.set(lighting.fillColor);
    eng.ambientBounceLight.intensity = 0.24 + lighting.fillIntensity * 0.25;

    eng.scene.environmentIntensity = lighting.envIntensity;
    eng.renderer.toneMappingExposure = lighting.exposure;
    eng.renderer.shadowMap.enabled = !eng.isSoftwareGl && !ecoMode && lighting.shadowsEnabled;

    eng.grid.visible = lighting.showGrid;
    eng.floorMesh.visible = lighting.showFloor && shadingMode !== 'wireframe';

    sceneRoot.traverse((child) => {
      if (child.userData?.isSceneLight && child instanceof THREE.Group) {
        syncSceneLightVisuals(child, lighting.showLightGuides, lighting.shadowsEnabled, ecoMode);
      }
    });

    eng.requestRender();
  }, [lighting, shadingMode, ecoMode, sceneRoot]);

  // Sync Camera Settings & Turntable
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    eng.perspCamera.fov = cameraSettings.fov;
    eng.perspCamera.updateProjectionMatrix();

    if (!activeSceneCamera) {
      const nextCam = cameraSettings.orthographic ? eng.orthoCamera : eng.perspCamera;
      if (eng.activeCamera !== nextCam) {
        nextCam.position.copy(eng.activeCamera.position);
        nextCam.quaternion.copy(eng.activeCamera.quaternion);
        eng.activeCamera = nextCam;
        eng.orbit.object = nextCam;
        eng.transform.camera = nextCam;
        eng.orbit.update();
      }
    }

    if (cameraSettings.turntable) {
      eng.ensureContinuousLoop();
    }
    eng.requestRender();
  }, [cameraSettings, activeSceneCamera]);

  // Sync Scene Camera POV (Jump In Camera / Jump Out Camera)
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    const prevCam = savedOrbitRef.current.prevCam;
    if (prevCam && prevCam !== activeSceneCamera) {
      const prevVis = prevCam.userData?.visualRoot as THREE.Object3D | undefined;
      if (prevVis) prevVis.visible = true;
    }

    if (activeSceneCamera) {
      if (!prevCam) {
        savedOrbitRef.current.pos.copy(eng.perspCamera.position);
        savedOrbitRef.current.target.copy(eng.orbit.target);
      }
      savedOrbitRef.current.prevCam = activeSceneCamera;

      const vis = activeSceneCamera.userData?.visualRoot as THREE.Object3D | undefined;
      if (vis) vis.visible = false;

      eng.cameraTransitionActive = false;
      eng.activeCamera = eng.sceneViewCamera;
      eng.transform.camera = eng.sceneViewCamera;
      eng.orbit.enabled = false;
      eng.syncSceneCameraPose();
      if (selectedObject === activeSceneCamera) {
        eng.transform.detach();
      }
    } else {
      if (prevCam) {
        savedOrbitRef.current.prevCam = null;
        eng.perspCamera.position.copy(savedOrbitRef.current.pos);
        eng.orthoCamera.position.copy(savedOrbitRef.current.pos);
        eng.orbit.target.copy(savedOrbitRef.current.target);
      }
      const nextCam = cameraSettings.orthographic ? eng.orthoCamera : eng.perspCamera;
      eng.activeCamera = nextCam;
      eng.orbit.object = nextCam;
      eng.transform.camera = nextCam;
      eng.orbit.enabled = true;
      eng.orbit.update();
    }

    eng.requestRender();
  }, [activeSceneCamera, cameraSettings.orthographic, selectedObject]);

  // Sync Selected Object & TransformControls
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    if (eng.selectionBoxHelper) {
      eng.scene.remove(eng.selectionBoxHelper);
      eng.selectionBoxHelper.dispose();
      eng.selectionBoxHelper = null;
    }

    const canAttachGizmo =
      Boolean(selectedObject) &&
      transformMode !== 'select' &&
      selectedObject !== activeSceneCamera;

    if (canAttachGizmo && selectedObject) {
      eng.transform.attach(selectedObject);
      eng.transform.setMode(transformMode);
      eng.transform.setSpace(transformSpace);
      eng.transform.setTranslationSnap(snapEnabled ? 0.25 : null);
      eng.transform.setRotationSnap(snapEnabled ? THREE.MathUtils.degToRad(15) : null);
      eng.transform.setScaleSnap(snapEnabled ? 0.1 : null);
    } else {
      eng.transform.detach();
    }

    if (selectedObject && selectedObject !== activeSceneCamera) {
      const boxTarget =
        (selectedObject.userData?.isSceneLight
          ? (selectedObject.userData.lightVisualRefs?.bulbMesh as THREE.Object3D | undefined)
          : undefined) ?? selectedObject;
      const helper = new THREE.BoxHelper(boxTarget, 0xe87d2f);
      eng.scene.add(helper);
      eng.selectionBoxHelper = helper;
    }

    eng.requestRender();
  }, [selectedObject, transformMode, transformSpace, snapEnabled, activeSceneCamera]);

  // Sync Animation Clips & Playback
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    if (eng.mixer) {
      eng.mixer.stopAllAction();
      eng.mixer = null;
      eng.actions = [];
    }

    if (activeAnimations.length > 0 && sceneRoot.children.length > 0) {
      const mixer = new THREE.AnimationMixer(sceneRoot);
      const actions = activeAnimations.map((clip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(animLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !animLoop;
        action.play();
        return action;
      });
      eng.mixer = mixer;
      eng.actions = actions;

      // Preserve current playhead position without snapping back to 0 when adding keyframes
      if (animTimeRef.current > 0) {
        mixer.setTime(animTimeRef.current);
        sceneRoot.updateMatrixWorld(true);
        eng.selectionBoxHelper?.update();
      }
    }
    eng.requestRender();
  }, [activeAnimations, sceneRoot, animLoop]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (isPlayingAnim) {
      if (eng.mixer && eng.actions.length > 0) {
        for (const a of eng.actions) {
          a.paused = false;
          if (!animLoop && a.time >= a.getClip().duration - 0.01) {
            a.reset();
          }
        }
      }
      eng.ensureContinuousLoop();
    } else if (eng.mixer && eng.actions.length > 0) {
      eng.mixer.setTime(animTime);
      sceneRoot.updateMatrixWorld(true);
      eng.selectionBoxHelper?.update();
      onTransformRef.current();
      eng.requestRender();
    }
  }, [isPlayingAnim, animTime, animLoop, sceneRoot]);

  useImperativeHandle(ref, () => ({
    focusObject: (obj: THREE.Object3D | null) => {
      const eng = engineRef.current;
      if (!eng) return;
      const rawTarget = obj ?? sceneRoot;
      const targetObj =
        (rawTarget.userData?.isSceneLight
          ? (rawTarget.userData.lightVisualRefs?.bulbMesh as THREE.Object3D | undefined)
          : undefined) ?? rawTarget;
      _box.setFromObject(targetObj);
      if (_box.isEmpty()) {
        _desiredTarget.set(0, 0.7, 0);
        _desiredCamPos.set(4.2, 2.8, 4.8);
      } else {
        _box.getCenter(_center);
        _box.getSize(_size);
        const radius = Math.max(_size.length() * 0.5, 0.8);
        const dir = eng.activeCamera.position.clone().sub(eng.orbit.target).normalize();
        if (dir.lengthSq() < 0.001) dir.set(1, 0.6, 1).normalize();
        _desiredTarget.copy(_center);
        _desiredCamPos.copy(_center).addScaledVector(dir, radius * 2.4);
      }
      eng.cameraTransitionActive = true;
      eng.ensureContinuousLoop();
    },

    setCameraPreset: (preset: CameraPreset) => {
      const eng = engineRef.current;
      if (!eng) return;
      const target = eng.orbit.target.clone();
      const dist = Math.max(eng.activeCamera.position.distanceTo(target), 3.8);
      _desiredTarget.copy(target);

      switch (preset) {
        case 'front':
          _desiredCamPos.set(target.x, target.y, target.z + dist);
          break;
        case 'right':
          _desiredCamPos.set(target.x + dist, target.y, target.z);
          break;
        case 'top':
          _desiredCamPos.set(target.x, target.y + dist, target.z + 0.01);
          break;
        case 'iso':
          _desiredCamPos.set(target.x + dist * 0.68, target.y + dist * 0.5, target.z + dist * 0.68);
          break;
        case 'perspective':
          _desiredCamPos.set(4.2, 2.8, 4.8);
          _desiredTarget.set(0, 0.85, 0);
          break;
      }
      eng.cameraTransitionActive = true;
      eng.ensureContinuousLoop();
    },

    captureSnapshot: (width: number, height: number, transparentBg: boolean) => {
      const eng = engineRef.current;
      if (!eng) return null;

      const prevWidth = mountRef.current?.clientWidth || 1280;
      const prevHeight = mountRef.current?.clientHeight || 720;
      const prevBg = eng.scene.background;
      const prevFog = eng.scene.fog;
      const prevGrid = eng.grid.visible;
      const prevFloor = eng.floorMesh.visible;
      const prevBox = eng.selectionBoxHelper?.visible ?? false;
      const prevTransformVis = eng.transform.getHelper().visible;
      const hiddenVisuals: Array<{ obj: THREE.Object3D; prev: boolean }> = [];

      sceneRoot.traverse((child) => {
        if (child.userData?.isLightVisual) {
          hiddenVisuals.push({ obj: child, prev: child.visible });
          child.visible = false;
        }
      });

      try {
        eng.transform.getHelper().visible = false;
        if (eng.selectionBoxHelper) eng.selectionBoxHelper.visible = false;
        eng.grid.visible = false;

        if (transparentBg) {
          eng.scene.background = null;
          eng.scene.fog = null;
          eng.floorMesh.visible = false;
          eng.renderer.setClearColor(0x000000, 0);
        }

        eng.renderer.setSize(width, height, false);
        if (eng.activeCamera instanceof THREE.PerspectiveCamera) {
          eng.activeCamera.aspect = width / height;
          eng.activeCamera.updateProjectionMatrix();
        }
        eng.renderer.render(eng.scene, eng.activeCamera);
        return eng.renderer.domElement.toDataURL('image/png');
      } finally {
        eng.scene.background = prevBg;
        eng.scene.fog = prevFog;
        eng.grid.visible = prevGrid;
        eng.floorMesh.visible = prevFloor;
        eng.transform.getHelper().visible = prevTransformVis;
        if (eng.selectionBoxHelper) eng.selectionBoxHelper.visible = prevBox;
        for (const item of hiddenVisuals) {
          item.obj.visible = item.prev;
        }
        eng.renderer.setClearColor(0x000000, 1);
        eng.renderer.setSize(prevWidth, prevHeight, false);
        if (eng.activeCamera instanceof THREE.PerspectiveCamera) {
          eng.activeCamera.aspect = prevWidth / prevHeight;
          eng.activeCamera.updateProjectionMatrix();
        }
        eng.renderer.render(eng.scene, eng.activeCamera);
      }
    },

    requestRender: () => {
      engineRef.current?.requestRender();
    },

    getEditorViewPose: () => {
      const eng = engineRef.current;
      if (!eng) return null;
      return {
        position: eng.perspCamera.position.clone(),
        quaternion: eng.perspCamera.quaternion.clone(),
      };
    },

    getCapabilities: () => ({
      isSoftwareGl: engineRef.current?.isSoftwareGl ?? false,
      maxAnisotropy: engineRef.current?.maxAnisotropy ?? 4,
    }),
  }));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDraggingFiles) setIsDraggingFiles(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFiles(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesDropped(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#141518] touch-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={mountRef} className="w-full h-full touch-none" />

      {/* 1-Second Long-Press Circular Hold Progress Indicator */}
      <div
        ref={holdRingRef}
        style={{ display: 'none' }}
        className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      >
        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
          <circle
            cx="28"
            cy="28"
            r="22"
            fill="rgba(18, 20, 26, 0.55)"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="3"
          />
          <circle
            ref={holdCircleRef}
            cx="28"
            cy="28"
            r="22"
            fill="none"
            stroke="#e87d2f"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 22}
            strokeDashoffset={2 * Math.PI * 22}
          />
        </svg>
      </div>

      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#141518]/95 text-center p-6">
          <div className="max-w-sm border border-[#2c2f36] bg-[#1b1d22] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white">WebGL Context Interrupted</h3>
            <p className="mt-1.5 text-xs text-slate-400">
              The graphics context was temporarily suspended. Attempting to restore the 3D viewport automatically.
            </p>
          </div>
        </div>
      )}

      {isDraggingFiles && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-[#e87d2f] bg-[#141518]/85">
          <div className="text-center px-6 py-4">
            <p className="text-base font-semibold text-white">Drop 3D Model to Import</p>
            <p className="mt-1 text-xs text-slate-300">
              Blender (.blend), Prisma3D (.prisma, .p3d), GLB, GLTF, FBX, OBJ + MTL, STL, PLY, DAE, 3DS, USDZ, ZIP
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
