import React from 'react';
import {
  Clapperboard,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Globe,
  Grid,
  Lightbulb,
  Magnet,
  Maximize2,
  Minimize2,
  MousePointer,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Scale,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  CameraPreset,
  ShadingMode,
  TransformMode,
  TransformSpace,
} from '../types/studio';

interface ViewportOverlayControlsProps {
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  snapEnabled: boolean;
  shadingMode: ShadingMode;
  hasSelection: boolean;
  animPanelOpen: boolean;
  inspectorOpen: boolean;
  showGrid: boolean;
  showLightGuides: boolean;
  zenMode: boolean;
  onTransformModeChange: (mode: TransformMode) => void;
  onToggleSpace: () => void;
  onToggleSnap: () => void;
  onShadingModeChange: (mode: ShadingMode) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onFocusSelection: () => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onToggleGrid: () => void;
  onToggleLightGuides: () => void;
  onToggleAnimPanel: () => void;
  onToggleInspector: () => void;
  onToggleZenMode: () => void;
}

export const ViewportOverlayControls: React.FC<ViewportOverlayControlsProps> = ({
  transformMode,
  transformSpace,
  snapEnabled,
  shadingMode,
  hasSelection,
  animPanelOpen,
  inspectorOpen,
  showGrid,
  showLightGuides,
  zenMode,
  onTransformModeChange,
  onToggleSpace,
  onToggleSnap,
  onShadingModeChange,
  onCameraPreset,
  onFocusSelection,
  onDuplicateSelection,
  onDeleteSelection,
  onToggleGrid,
  onToggleLightGuides,
  onToggleAnimPanel,
  onToggleInspector,
  onToggleZenMode,
}) => {
  const toolBtn = (active: boolean) =>
    `flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
      active
        ? 'bg-[#e87d2f] text-white font-medium'
        : 'text-slate-300 hover:bg-[#2a2e38] hover:text-white'
    }`;

  if (zenMode) {
    return (
      <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
        <button
          type="button"
          title="Show Viewport Controls"
          onClick={onToggleZenMode}
          className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#1b1d23]/90 border border-[#2e313a] text-slate-200 hover:text-white rounded-md shadow-lg cursor-pointer"
        >
          <Minimize2 className="w-3.5 h-3.5 text-[#e87d2f]" />
          <span>Show Controls</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-2 left-2 right-2 z-10 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
      {/* Left: Animation Side Toggle + Transform & Edit Tools */}
      <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          title="Toggle Animation Panel (A)"
          onClick={onToggleAnimPanel}
          className={`flex items-center gap-1 px-2 h-7 sm:h-8 border rounded-md shadow-lg text-xs transition-colors cursor-pointer ${
            animPanelOpen
              ? 'bg-[#e87d2f] border-[#e87d2f] text-white font-medium'
              : 'bg-[#1b1d23]/95 border-[#2e313a] text-slate-200 hover:text-white hover:bg-[#2a2e38]'
          }`}
        >
          {animPanelOpen ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftOpen className="w-3.5 h-3.5 text-[#e87d2f]" />
          )}
          <Clapperboard className="w-3.5 h-3.5 hidden sm:inline" />
          <span className="hidden sm:inline">{animPanelOpen ? 'Hide Anim' : 'Animate'}</span>
        </button>

        <div className="flex items-center gap-0.5 bg-[#1b1d23]/95 border border-[#2e313a] rounded-md p-0.5 sm:p-1 shadow-lg shrink-0">
        <button
          type="button"
          title="Select (Q)"
          onClick={() => onTransformModeChange('select')}
          className={toolBtn(transformMode === 'select')}
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Select</span>
        </button>
        <button
          type="button"
          title="Move / Grab (G)"
          onClick={() => onTransformModeChange('translate')}
          className={toolBtn(transformMode === 'translate')}
        >
          <Move className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Move</span>
        </button>
        <button
          type="button"
          title="Rotate (R)"
          onClick={() => onTransformModeChange('rotate')}
          className={toolBtn(transformMode === 'rotate')}
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Rotate</span>
        </button>
        <button
          type="button"
          title="Scale (S)"
          onClick={() => onTransformModeChange('scale')}
          className={toolBtn(transformMode === 'scale')}
        >
          <Scale className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Scale</span>
        </button>

        <div className="w-px h-4 bg-[#2e313a] mx-0.5" />

        <button
          type="button"
          title="Toggle Transform Space (World / Local)"
          onClick={onToggleSpace}
          className="flex items-center gap-1 px-1.5 sm:px-2 py-1 text-xs text-slate-300 hover:bg-[#2a2e38] hover:text-white rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">{transformSpace === 'world' ? 'Global' : 'Local'}</span>
        </button>

        <button
          type="button"
          title="Snap to Grid"
          onClick={onToggleSnap}
          className={toolBtn(snapEnabled)}
        >
          <Magnet className="w-3.5 h-3.5" />
        </button>

        {hasSelection && (
          <>
            <div className="w-px h-4 bg-[#2e313a] mx-0.5" />
            <button
              type="button"
              title="Focus Selected (F)"
              onClick={onFocusSelection}
              className="p-1 text-slate-300 hover:bg-[#2a2e38] hover:text-white rounded transition-colors cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Duplicate Selected (Shift+D)"
              onClick={onDuplicateSelection}
              className="p-1 text-slate-300 hover:bg-[#2a2e38] hover:text-white rounded transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Delete Selected (X)"
              onClick={onDeleteSelection}
              className="p-1 text-slate-300 hover:bg-red-500/20 hover:text-red-300 rounded transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        </div>
      </div>

      {/* Right: Shading Modes, Camera Presets, Fullscreen Space & Inspector */}
      <div className="pointer-events-auto flex items-center gap-1 shrink-0">
        {/* Camera quick views */}
        <div className="hidden md:flex items-center gap-0.5 bg-[#1b1d23]/95 border border-[#2e313a] rounded-md p-0.5 sm:p-1 shadow-lg">
          {(
            [
              { id: 'perspective', label: 'Persp' },
              { id: 'front', label: 'Front' },
              { id: 'right', label: 'Right' },
              { id: 'top', label: 'Top' },
            ] as Array<{ id: CameraPreset; label: string }>
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onCameraPreset(v.id)}
              className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-[#2a2e38] hover:text-white rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            title="Toggle Floor Grid"
            onClick={onToggleGrid}
            className={`p-1 rounded transition-colors cursor-pointer ${
              showGrid ? 'text-[#e87d2f] bg-[#262932]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Blender-style Viewport Shading Mode Selector */}
        <div className="flex items-center gap-0.5 bg-[#1b1d23]/95 border border-[#2e313a] rounded-md p-0.5 sm:p-1 shadow-lg">
          {(
            [
              { id: 'wireframe', label: 'Wire' },
              { id: 'solid', label: 'Solid' },
              { id: 'material', label: 'Mat' },
              { id: 'rendered', label: 'Render' },
            ] as Array<{ id: ShadingMode; label: string }>
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onShadingModeChange(m.id)}
              className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                shadingMode === m.id
                  ? 'bg-[#e87d2f] text-white'
                  : 'text-slate-300 hover:bg-[#2a2e38] hover:text-white'
              }`}
            >
              {m.id === 'rendered' && <Sparkles className="w-3 h-3" />}
              {m.id === 'solid' && <Maximize2 className="w-3 h-3 hidden sm:inline" />}
              {m.id === 'wireframe' && <EyeOff className="w-3 h-3 hidden sm:inline" />}
              {m.id === 'material' && <Eye className="w-3 h-3 hidden sm:inline" />}
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Light Position Guides Toggle */}
        <button
          type="button"
          title="Toggle 3-Point Light Guides (L)"
          onClick={onToggleLightGuides}
          className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 border rounded-md shadow-lg transition-colors cursor-pointer ${
            showLightGuides
              ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-[#f59e56]'
              : 'bg-[#1b1d23]/95 border-[#2e313a] text-slate-400 hover:text-white hover:bg-[#2a2e38]'
          }`}
        >
          <Lightbulb className="w-3.5 h-3.5" />
        </button>

        {/* Maximize Clean Workspace */}
        <button
          type="button"
          title="Hide Viewport Controls for Clean Workspace"
          onClick={onToggleZenMode}
          className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 bg-[#1b1d23]/95 border border-[#2e313a] text-slate-300 hover:text-white hover:bg-[#2a2e38] rounded-md shadow-lg transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Inspector Toggle */}
        <button
          type="button"
          title="Toggle Options Panel (H)"
          onClick={onToggleInspector}
          className="flex items-center gap-1 px-2 h-7 sm:h-8 bg-[#1b1d23]/95 border border-[#2e313a] text-slate-200 hover:text-white hover:bg-[#2a2e38] rounded-md shadow-lg text-xs transition-colors cursor-pointer"
        >
          {inspectorOpen ? (
            <PanelRightClose className="w-3.5 h-3.5 text-[#e87d2f]" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5 text-[#e87d2f]" />
          )}
          <span className="hidden sm:inline">{inspectorOpen ? 'Hide' : 'Options'}</span>
        </button>
      </div>
    </div>
  );
};
