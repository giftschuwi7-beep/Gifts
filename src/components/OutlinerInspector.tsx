import React, { useRef } from 'react';
import * as THREE from 'three';
import {
  Box,
  Camera,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Image as ImageIcon,
  LogOut,
  Palette,
  Plus,
  RotateCcw,
  Sliders,
  Sun,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type { SceneLightKind } from '../engine/lightVisualizers';
import type {
  CameraSettings,
  ExportFormat,
  InspectorTab,
  LightingPresetId,
  LightingSettings,
  MaterialProps,
  SceneItem,
} from '../types/studio';

interface OutlinerInspectorProps {
  items: SceneItem[];
  selectedObject: THREE.Object3D | null;
  inspectorTab: InspectorTab;
  materialProps: MaterialProps | null;
  lighting: LightingSettings;
  cameraSettings: CameraSettings;
  activeSceneCamera: THREE.Object3D | null;
  transformTick: number;
  onInspectorTabChange: (tab: InspectorTab) => void;
  onSelectObject: (obj: THREE.Object3D) => void;
  onToggleVisibility: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onRenameObject: (obj: THREE.Object3D, name: string) => void;
  onToggleJumpCamera: (camObj?: THREE.Object3D | null) => void;
  onUpdateSceneCameraFov: (camObj: THREE.Object3D, fov: number) => void;
  onUpdateSceneLight: (
    lightObj: THREE.Object3D,
    patch: { color?: string; intensity?: number; castShadow?: boolean }
  ) => void;
  onResetLightAim: (lightObj: THREE.Object3D) => void;
  onAddLight: (kind: SceneLightKind) => void;
  onRestoreDefaultLights: () => void;
  onUpdateTransform: (
    obj: THREE.Object3D,
    kind: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number
  ) => void;
  onGroundObject: (obj: THREE.Object3D) => void;
  onCenterObject: (obj: THREE.Object3D) => void;
  onUpdateMaterial: (patch: Partial<MaterialProps>) => void;
  onApplyMaterialPreset: (presetName: string) => void;
  onApplyTextureFile: (file: File, mapType: 'map' | 'normalMap') => void;
  onUpdateLighting: (patch: Partial<LightingSettings>) => void;
  onApplyLightingPreset: (preset: LightingPresetId) => void;
  onUpdateCamera: (patch: Partial<CameraSettings>) => void;
  onOpenRenderModal: () => void;
  onExport: (format: ExportFormat) => void;
  onClose?: () => void;
}

const MATERIAL_PRESETS: Array<{ id: string; label: string; swatch: string }> = [
  { id: 'clay', label: 'Matte Clay', swatch: '#b8bec8' },
  { id: 'aluminum', label: 'Anodized', swatch: '#8f98a8' },
  { id: 'gold', label: 'Brushed Gold', swatch: '#d9a441' },
  { id: 'glass', label: 'Optical Glass', swatch: '#a7dcff' },
  { id: 'carpaint', label: 'Car Lacquer', swatch: '#c9382b' },
  { id: 'ceramic', label: 'Ceramic', swatch: '#ebeae4' },
  { id: 'obsidian', label: 'Carbon Slate', swatch: '#23262e' },
  { id: 'amber_glow', label: 'Emissive Amber', swatch: '#e87d2f' },
];

const LIGHTING_PRESETS: Array<{ id: LightingPresetId; label: string }> = [
  { id: 'studio_three_point', label: 'Three-Point Studio' },
  { id: 'sunset_rim', label: 'Warm Sunset Rim' },
  { id: 'archviz_daylight', label: 'ArchViz Daylight' },
  { id: 'darkroom_product', label: 'Product Darkroom' },
  { id: 'softbox_showroom', label: 'Softbox Showroom' },
];

export const OutlinerInspector: React.FC<OutlinerInspectorProps> = ({
  items,
  selectedObject,
  inspectorTab,
  materialProps,
  lighting,
  cameraSettings,
  activeSceneCamera,
  transformTick: _transformTick,
  onInspectorTabChange,
  onSelectObject,
  onToggleVisibility,
  onDeleteItem,
  onRenameObject,
  onToggleJumpCamera,
  onUpdateSceneCameraFov,
  onUpdateSceneLight,
  onResetLightAim,
  onAddLight,
  onRestoreDefaultLights,
  onUpdateTransform,
  onGroundObject,
  onCenterObject,
  onUpdateMaterial,
  onApplyMaterialPreset,
  onApplyTextureFile,
  onUpdateLighting,
  onApplyLightingPreset,
  onUpdateCamera,
  onOpenRenderModal,
  onExport,
  onClose,
}) => {
  const albedoInputRef = useRef<HTMLInputElement | null>(null);
  const normalInputRef = useRef<HTMLInputElement | null>(null);

  const renderSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (val: number) => void,
    suffix = ''
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono-num text-slate-200">
          {value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="studio-slider w-full"
      />
    </div>
  );

  const renderVec3Input = (
    label: string,
    kind: 'position' | 'rotation' | 'scale',
    values: [number, number, number],
    step = 0.05
  ) => {
    if (!selectedObject) return null;
    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    const axisColors = ['text-red-400', 'text-emerald-400', 'text-sky-400'];

    return (
      <div className="space-y-1">
        <span className="text-[11px] text-slate-400">{label}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {axes.map((axis, idx) => (
            <label
              key={axis}
              className="flex items-center gap-1 bg-[#14161b] border border-[#2b2e37] rounded px-1.5 py-1 focus-within:border-[#e87d2f]"
            >
              <span className={`text-[10px] font-semibold uppercase ${axisColors[idx]}`}>
                {axis}
              </span>
              <input
                type="number"
                step={step}
                value={Number(values[idx].toFixed(2))}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val)) {
                    onUpdateTransform(selectedObject, kind, axis, val);
                  }
                }}
                className="w-full bg-transparent text-[11px] font-mono-num text-slate-100 outline-none min-w-0"
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <aside className="absolute right-0 top-0 bottom-0 z-30 w-[264px] max-w-[76vw] shadow-2xl lg:relative lg:z-20 lg:w-[288px] lg:shadow-none shrink-0 h-full flex flex-col bg-[#191b20] border-l border-[#2b2e36] select-none">
      {/* Top Section: Scene Outliner */}
      <div className="flex flex-col border-b border-[#2b2e36] max-h-[30%] min-h-[105px]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#262931]">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 text-[#e87d2f]" />
            <h2 className="text-xs font-semibold text-slate-100">Scene Outliner</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono-num text-slate-400">
              {items.length} {items.length === 1 ? 'obj' : 'objs'}
            </span>
            {onClose && (
              <button
                type="button"
                title="Close Panel"
                onClick={onClose}
                className="lg:hidden p-0.5 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              Scene is empty. Import a model or add a mesh from the top bar.
            </div>
          ) : (
            items.map((item) => {
              const isSelected = selectedObject === item.object;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectObject(item.object)}
                  className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#e87d2f]/20 text-white border border-[#e87d2f]/40'
                      : 'text-slate-300 hover:bg-[#22252d] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.type === 'camera' ? (
                      <Video
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeSceneCamera === item.object || isSelected
                            ? 'text-[#e87d2f]'
                            : 'text-sky-400'
                        }`}
                      />
                    ) : item.type === 'light' ? (
                      <Sun
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-[#e87d2f]' : 'text-amber-400'
                        }`}
                      />
                    ) : (
                      <Box
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-[#e87d2f]' : 'text-slate-400'
                        }`}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="text-[10px] font-mono-num text-slate-500 truncate">
                        {item.type === 'camera'
                          ? activeSceneCamera === item.object
                            ? 'Viewing POV'
                            : 'Scene Camera'
                          : item.type === 'light'
                            ? `${item.format ?? 'Studio'} Light`
                            : `${item.format ?? 'Mesh'} · ${item.triangleCount.toLocaleString()} tris`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title={item.visible ? 'Hide Object' : 'Show Object'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(item.id);
                      }}
                      className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                    >
                      {item.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      title="Delete Object"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem(item.id);
                      }}
                      className="p-1 text-slate-400 hover:text-red-400 rounded opacity-75 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Section: Properties Inspector */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Inspector Tabs */}
        <div className="grid grid-cols-4 border-b border-[#2b2e36] bg-[#15171b]">
          {(
            [
              { id: 'object', label: 'Object', icon: Sliders },
              { id: 'material', label: 'Material', icon: Palette },
              { id: 'lighting', label: 'Lighting', icon: Sun },
              { id: 'render', label: 'Render', icon: Camera },
            ] as Array<{ id: InspectorTab; label: string; icon: React.ComponentType<{ className?: string }> }>
          ).map((t) => {
            const Icon = t.icon;
            const active = inspectorTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onInspectorTabChange(t.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#e87d2f] text-white bg-[#191b20]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {inspectorTab === 'object' && (
            <>
              {!selectedObject ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Select an object in the 3D viewport or Scene Outliner to inspect transforms.
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-400">Object Name</span>
                    <input
                      type="text"
                      value={selectedObject.name}
                      onChange={(e) => onRenameObject(selectedObject, e.target.value)}
                      className="w-full bg-[#14161b] border border-[#2b2e37] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#e87d2f]"
                    />
                  </div>

                  {renderVec3Input(
                    'Location (m)',
                    'position',
                    [
                      selectedObject.position.x,
                      selectedObject.position.y,
                      selectedObject.position.z,
                    ],
                    0.05
                  )}

                  {renderVec3Input(
                    'Rotation (deg)',
                    'rotation',
                    [
                      THREE.MathUtils.radToDeg(selectedObject.rotation.x),
                      THREE.MathUtils.radToDeg(selectedObject.rotation.y),
                      THREE.MathUtils.radToDeg(selectedObject.rotation.z),
                    ],
                    1
                  )}

                  {renderVec3Input(
                    'Scale',
                    'scale',
                    [selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z],
                    0.05
                  )}

                  {selectedObject.userData?.isSceneCamera && (
                    <div className="p-2.5 rounded border border-[#2b2e37] bg-[#14161b] space-y-2.5">
                      <button
                        type="button"
                        onClick={() => onToggleJumpCamera(selectedObject)}
                        className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border transition-colors cursor-pointer ${
                          activeSceneCamera === selectedObject
                            ? 'bg-[#e87d2f] border-[#e87d2f] text-white'
                            : 'bg-[#22252d] hover:bg-[#2b2f39] border-[#323642] text-white'
                        }`}
                      >
                        {activeSceneCamera === selectedObject ? (
                          <>
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Jump Out Camera</span>
                          </>
                        ) : (
                          <>
                            <Video className="w-3.5 h-3.5 text-[#e87d2f]" />
                            <span>Jump In Camera</span>
                          </>
                        )}
                      </button>

                      {renderSlider(
                        'Camera Lens FOV',
                        Number(selectedObject.userData.cameraFov ?? 45),
                        18,
                        95,
                        1,
                        (v) => onUpdateSceneCameraFov(selectedObject, v),
                        '°'
                      )}
                    </div>
                  )}

                  {selectedObject.userData?.isSceneLight && (
                    <div className="p-2.5 rounded border border-[#2b2e37] bg-[#14161b] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-300">Light Color</span>
                        <input
                          type="color"
                          value={String(selectedObject.userData.lightColor ?? '#fff5ea')}
                          onChange={(e) =>
                            onUpdateSceneLight(selectedObject, { color: e.target.value })
                          }
                          className="w-7 h-6 bg-transparent border border-[#323642] rounded cursor-pointer"
                        />
                      </div>

                      {renderSlider(
                        'Light Intensity',
                        Number(selectedObject.userData.lightIntensity ?? 2),
                        0,
                        8,
                        0.1,
                        (v) => onUpdateSceneLight(selectedObject, { intensity: v })
                      )}

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSceneLight(selectedObject, {
                              castShadow: !selectedObject.userData.castShadow,
                            })
                          }
                          className={`px-2 py-1.5 text-[11px] rounded border cursor-pointer ${
                            selectedObject.userData.castShadow
                              ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                              : 'bg-[#191b20] border-[#2b2e37] text-slate-400'
                          }`}
                        >
                          {selectedObject.userData.castShadow ? 'Shadows On' : 'Shadows Off'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onResetLightAim(selectedObject)}
                          className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-slate-200 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded cursor-pointer"
                        >
                          <Crosshair className="w-3 h-3 text-[#e87d2f]" />
                          <span>Aim Center</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const match = items.find((it) => it.object === selectedObject);
                          if (match) onDeleteItem(match.id);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded border border-red-500/35 bg-red-500/12 hover:bg-red-500/22 text-xs font-medium text-red-300 hover:text-red-200 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Light</span>
                      </button>
                    </div>
                  )}

                  {!selectedObject.userData?.isSceneLight && !selectedObject.userData?.isSceneCamera && (
                    <div className="pt-2 border-t border-[#262932] grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onGroundObject(selectedObject)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded transition-colors cursor-pointer"
                      >
                        Snap to Floor
                      </button>
                      <button
                        type="button"
                        onClick={() => onCenterObject(selectedObject)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded transition-colors cursor-pointer"
                      >
                        Center Origin
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {inspectorTab === 'material' && (
            <>
              {!selectedObject || !materialProps ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Select a 3D mesh or imported model to edit its Principled BSDF surface properties.
                </div>
              ) : (
                <>
                  {/* Material Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-slate-300">
                      Studio Surface Presets
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {MATERIAL_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onApplyMaterialPreset(p.id)}
                          title={p.label}
                          className="flex flex-col items-center gap-1 p-1.5 bg-[#14161b] hover:bg-[#22252d] border border-[#2b2e37] rounded transition-colors cursor-pointer"
                        >
                          <span
                            className="w-5 h-5 rounded-sm border border-white/15"
                            style={{ backgroundColor: p.swatch }}
                          />
                          <span className="text-[10px] text-slate-300 truncate w-full text-center">
                            {p.label.split(' ')[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Base Color */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#262932]">
                    <span className="text-[11px] text-slate-300">Base Color</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono-num text-slate-400">
                        {materialProps.color.toUpperCase()}
                      </span>
                      <input
                        type="color"
                        value={materialProps.color}
                        onChange={(e) => onUpdateMaterial({ color: e.target.value })}
                        className="w-7 h-6 bg-transparent border border-[#323642] rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  {renderSlider('Metallic', materialProps.metalness, 0, 1, 0.01, (v) =>
                    onUpdateMaterial({ metalness: v })
                  )}
                  {renderSlider('Roughness', materialProps.roughness, 0.02, 1, 0.01, (v) =>
                    onUpdateMaterial({ roughness: v })
                  )}
                  {renderSlider('Transmission (Glass)', materialProps.transmission, 0, 1, 0.01, (v) =>
                    onUpdateMaterial({ transmission: v })
                  )}
                  {renderSlider('IOR', materialProps.ior, 1.0, 2.4, 0.01, (v) =>
                    onUpdateMaterial({ ior: v })
                  )}
                  {renderSlider('Clearcoat', materialProps.clearcoat, 0, 1, 0.01, (v) =>
                    onUpdateMaterial({ clearcoat: v })
                  )}
                  {renderSlider('Opacity', materialProps.opacity, 0.05, 1, 0.01, (v) =>
                    onUpdateMaterial({ opacity: v })
                  )}

                  {/* Emission */}
                  <div className="pt-2 border-t border-[#262932] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Emission Color</span>
                      <input
                        type="color"
                        value={materialProps.emissive}
                        onChange={(e) => onUpdateMaterial({ emissive: e.target.value })}
                        className="w-7 h-6 bg-transparent border border-[#323642] rounded cursor-pointer"
                      />
                    </div>
                    {renderSlider(
                      'Emission Strength',
                      materialProps.emissiveIntensity,
                      0,
                      5,
                      0.05,
                      (v) => onUpdateMaterial({ emissiveIntensity: v })
                    )}
                  </div>

                  {/* Surface Flags */}
                  <div className="pt-2 border-t border-[#262932] grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateMaterial({ flatShading: !materialProps.flatShading })}
                      className={`px-2 py-1.5 text-[11px] rounded border transition-colors cursor-pointer ${
                        materialProps.flatShading
                          ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                          : 'bg-[#14161b] border-[#2b2e37] text-slate-300'
                      }`}
                    >
                      Flat
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateMaterial({ doubleSided: !materialProps.doubleSided })}
                      className={`px-2 py-1.5 text-[11px] rounded border transition-colors cursor-pointer ${
                        materialProps.doubleSided
                          ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                          : 'bg-[#14161b] border-[#2b2e37] text-slate-300'
                      }`}
                    >
                      2-Sided
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateMaterial({ wireframe: !materialProps.wireframe })}
                      className={`px-2 py-1.5 text-[11px] rounded border transition-colors cursor-pointer ${
                        materialProps.wireframe
                          ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                          : 'bg-[#14161b] border-[#2b2e37] text-slate-300'
                      }`}
                    >
                      Wire
                    </button>
                  </div>

                  {/* Custom Texture Maps */}
                  <div className="pt-2 border-t border-[#262932] space-y-1.5">
                    <span className="text-[11px] font-medium text-slate-300">Texture Maps</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => albedoInputRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] text-slate-200 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded cursor-pointer"
                      >
                        <ImageIcon className="w-3 h-3 text-[#e87d2f]" />
                        <span>Albedo Map</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => normalInputRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] text-slate-200 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded cursor-pointer"
                      >
                        <ImageIcon className="w-3 h-3 text-sky-400" />
                        <span>Normal Map</span>
                      </button>
                    </div>
                    <input
                      ref={albedoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onApplyTextureFile(f, 'map');
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={normalInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onApplyTextureFile(f, 'normalMap');
                        e.target.value = '';
                      }}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {inspectorTab === 'lighting' && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">Add / Manage Lights</span>
                  <button
                    type="button"
                    onClick={onRestoreDefaultLights}
                    className="flex items-center gap-1 text-[10px] text-[#e87d2f] hover:text-amber-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore 3-Point</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { kind: 'point', label: 'Point' },
                      { kind: 'spot', label: 'Spot' },
                      { kind: 'directional', label: 'Sun' },
                    ] as Array<{ kind: SceneLightKind; label: string }>
                  ).map((l) => (
                    <button
                      key={l.kind}
                      type="button"
                      onClick={() => onAddLight(l.kind)}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-slate-200 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-amber-400" />
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#262932] space-y-1.5">
                <span className="text-[11px] font-medium text-slate-300">Studio Lighting Rigs</span>
                <div className="space-y-1">
                  {LIGHTING_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onApplyLightingPreset(p.id)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
                        lighting.preset === p.id
                          ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white font-medium'
                          : 'bg-[#14161b] border-[#2b2e37] text-slate-300 hover:bg-[#20232b]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#262932] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300">Key Light Color</span>
                  <input
                    type="color"
                    value={lighting.keyColor}
                    onChange={(e) => onUpdateLighting({ keyColor: e.target.value })}
                    className="w-7 h-6 bg-transparent border border-[#323642] rounded cursor-pointer"
                  />
                </div>
                {renderSlider('Key Intensity', lighting.keyIntensity, 0, 6, 0.1, (v) =>
                  onUpdateLighting({ keyIntensity: v })
                )}
                {renderSlider('Key Azimuth', lighting.keyAzimuth, -180, 180, 1, (v) =>
                  onUpdateLighting({ keyAzimuth: v }), '°'
                )}
                {renderSlider('Key Elevation', lighting.keyElevation, 5, 88, 1, (v) =>
                  onUpdateLighting({ keyElevation: v }), '°'
                )}
              </div>

              <div className="pt-2 border-t border-[#262932] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300">Fill Light Color</span>
                  <input
                    type="color"
                    value={lighting.fillColor}
                    onChange={(e) => onUpdateLighting({ fillColor: e.target.value })}
                    className="w-7 h-6 bg-transparent border border-[#323642] rounded cursor-pointer"
                  />
                </div>
                {renderSlider('Fill Hemisphere', lighting.fillIntensity, 0, 3, 0.05, (v) =>
                  onUpdateLighting({ fillIntensity: v })
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300">Rim Light Color</span>
                  <input
                    type="color"
                    value={lighting.rimColor}
                    onChange={(e) => onUpdateLighting({ rimColor: e.target.value })}
                    className="w-7 h-6 bg-transparent border border-[#323642] rounded cursor-pointer"
                  />
                </div>
                {renderSlider('Rim Backlight', lighting.rimIntensity, 0, 5, 0.1, (v) =>
                  onUpdateLighting({ rimIntensity: v })
                )}
                {renderSlider('Studio IBL Reflection', lighting.envIntensity, 0, 2.5, 0.05, (v) =>
                  onUpdateLighting({ envIntensity: v })
                )}
                {renderSlider('Exposure (ACES)', lighting.exposure, 0.3, 2.2, 0.05, (v) =>
                  onUpdateLighting({ exposure: v })
                )}
              </div>

              <div className="pt-2 border-t border-[#262932] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300">Backdrop Color</span>
                  <input
                    type="color"
                    value={lighting.backgroundColor}
                    onChange={(e) => onUpdateLighting({ backgroundColor: e.target.value })}
                    className="w-7 h-6 bg-transparent border border-[#323642] rounded cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateLighting({ showLightGuides: !lighting.showLightGuides })}
                    className={`px-2 py-1.5 text-[11px] rounded border cursor-pointer ${
                      lighting.showLightGuides
                        ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                        : 'bg-[#14161b] border-[#2b2e37] text-slate-400'
                    }`}
                  >
                    Light Guides
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateLighting({ shadowsEnabled: !lighting.shadowsEnabled })}
                    className={`px-2 py-1.5 text-[11px] rounded border cursor-pointer ${
                      lighting.shadowsEnabled
                        ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                        : 'bg-[#14161b] border-[#2b2e37] text-slate-400'
                    }`}
                  >
                    Shadows
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateLighting({ showFloor: !lighting.showFloor })}
                    className={`px-2 py-1.5 text-[11px] rounded border cursor-pointer ${
                      lighting.showFloor
                        ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                        : 'bg-[#14161b] border-[#2b2e37] text-slate-400'
                    }`}
                  >
                    Floor
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateLighting({ showGrid: !lighting.showGrid })}
                    className={`px-2 py-1.5 text-[11px] rounded border cursor-pointer ${
                      lighting.showGrid
                        ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                        : 'bg-[#14161b] border-[#2b2e37] text-slate-400'
                    }`}
                  >
                    Grid
                  </button>
                </div>
              </div>
            </>
          )}

          {inspectorTab === 'render' && (
            <>
              <div className="space-y-2.5">
                <span className="text-[11px] font-medium text-slate-300">Camera & Optics</span>
                {renderSlider('Field of View', cameraSettings.fov, 18, 95, 1, (v) =>
                  onUpdateCamera({ fov: v }), '°'
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateCamera({ orthographic: false })}
                    className={`px-2 py-1.5 text-xs rounded border cursor-pointer ${
                      !cameraSettings.orthographic
                        ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                        : 'bg-[#14161b] border-[#2b2e37] text-slate-400'
                    }`}
                  >
                    Perspective
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateCamera({ orthographic: true })}
                    className={`px-2 py-1.5 text-xs rounded border cursor-pointer ${
                      cameraSettings.orthographic
                        ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
                        : 'bg-[#14161b] border-[#2b2e37] text-slate-400'
                    }`}
                  >
                    Orthographic
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-[#262932] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">Turntable Orbit</span>
                  <button
                    type="button"
                    onClick={() => onUpdateCamera({ turntable: !cameraSettings.turntable })}
                    className={`px-2.5 py-1 text-[11px] rounded border cursor-pointer ${
                      cameraSettings.turntable
                        ? 'bg-[#e87d2f] border-[#e87d2f] text-white'
                        : 'bg-[#14161b] border-[#2b2e37] text-slate-300'
                    }`}
                  >
                    {cameraSettings.turntable ? 'Spinning' : 'Off'}
                  </button>
                </div>
                {cameraSettings.turntable &&
                  renderSlider('Orbit Speed', cameraSettings.turntableSpeed, 0.2, 3, 0.1, (v) =>
                    onUpdateCamera({ turntableSpeed: v }), 'x'
                  )}
              </div>

              <div className="pt-2 border-t border-[#262932] space-y-2">
                <span className="text-[11px] font-medium text-slate-300">Render Still Frame</span>
                <button
                  type="button"
                  onClick={onOpenRenderModal}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-[#e87d2f] hover:bg-[#d66f23] rounded transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Open High-Res Render Studio</span>
                </button>
              </div>

              <div className="pt-2 border-t border-[#262932] space-y-2">
                <span className="text-[11px] font-medium text-slate-300">
                  Convert & Export Model
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['glb', 'gltf', 'obj', 'stl', 'ply', 'usdz'] as ExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => onExport(fmt)}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-200 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded uppercase cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-slate-400" />
                      <span>{fmt}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
