import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Camera,
  ChevronDown,
  Download,
  FileUp,
  HelpCircle,
  Layers,
  Plus,
  Sun,
  Video,
} from 'lucide-react';
import type { ExportFormat, WorkspaceTab } from '../types/studio';
import type { CompositeAssetType, PrimitiveType } from '../engine/proceduralAssets';
import type { SceneLightKind } from '../engine/lightVisualizers';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  workspace: WorkspaceTab;
  onWorkspaceChange: (tab: WorkspaceTab) => void;
  onTriggerImport: () => void;
  onAddPrimitive: (type: PrimitiveType) => void;
  onAddComposite: (type: CompositeAssetType) => void;
  onAddCamera: () => void;
  onAddLight: (kind: SceneLightKind) => void;
  onExport: (format: ExportFormat) => void;
  onOpenRender: () => void;
  onOpenMinecraftRig: () => void;
  onOpenFormatGuide: () => void;
}

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'layout', label: 'Layout' },
  { id: 'modeling', label: 'Modeling' },
  { id: 'shading', label: 'Shading' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'render', label: 'Render' },
];

const PRIMITIVE_ITEMS: Array<{ id: PrimitiveType; label: string }> = [
  { id: 'cube', label: 'Cube' },
  { id: 'sphere', label: 'UV Sphere' },
  { id: 'icosphere', label: 'Icosphere' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'cone', label: 'Cone' },
  { id: 'torus', label: 'Torus' },
  { id: 'torusknot', label: 'Torus Knot' },
  { id: 'prism', label: 'Triangular Prism' },
  { id: 'plane', label: 'Plane' },
];

const COMPOSITE_ITEMS: Array<{ id: CompositeAssetType; label: string }> = [
  { id: 'minecraft_rig', label: 'Minecraft Character Rig' },
  { id: 'optical_prism_rig', label: 'Optical Prism Rig' },
  { id: 'studio_bust', label: 'Studio Sculpt Bust' },
  { id: 'gear_assembly', label: 'Mechanical Gear Assembly' },
  { id: 'crystal_cluster', label: 'Quartz Crystal Cluster' },
  { id: 'pavilion', label: 'Architectural Pavilion' },
];

const EXPORT_ITEMS: Array<{ format: ExportFormat; label: string }> = [
  { format: 'glb', label: 'GLB Binary (.glb)' },
  { format: 'gltf', label: 'GLTF JSON (.gltf)' },
  { format: 'obj', label: 'Wavefront OBJ (.obj)' },
  { format: 'stl', label: 'STL Mesh (.stl)' },
  { format: 'ply', label: 'PLY Polygon (.ply)' },
  { format: 'usdz', label: 'Apple USDZ (.usdz)' },
];

export const TopBar: React.FC<TopBarProps> = ({
  workspace,
  onWorkspaceChange,
  onTriggerImport,
  onAddPrimitive,
  onAddComposite,
  onAddCamera,
  onAddLight,
  onExport,
  onOpenRender,
  onOpenMinecraftRig,
  onOpenFormatGuide,
}) => {
  const [openMenu, setOpenMenu] = useState<'add' | 'export' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <header
      ref={menuRef}
      className="safe-top safe-x min-h-10 sm:min-h-11 shrink-0 flex items-center justify-between gap-2 sm:gap-4 px-2 sm:px-3 bg-[#191b20] border-b border-[#2b2e36] select-none z-30"
    >
      {/* Zone 1: Brand + Workspace Tabs */}
      <div className="flex items-center gap-3 lg:gap-5 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Box className="w-4 h-4 text-[#e87d2f]" />
          <span className="text-xs sm:text-sm font-semibold tracking-tight text-white whitespace-nowrap">
            PrismForge<span className="hidden sm:inline"> 3D</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-0.5 bg-[#121317] p-0.5 rounded-md border border-[#262932]">
          {WORKSPACE_TABS.map((tab) => {
            const active = workspace === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onWorkspaceChange(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#282b34] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Zone 2: Studio File & Add Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Add Mesh / Composite Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'add' ? null : 'add')}
            className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-200 bg-[#22252c] hover:bg-[#2a2e37] border border-[#30343e] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#e87d2f]" />
            <span>Add</span>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:inline" />
          </button>

          {openMenu === 'add' && (
            <div className="fixed sm:absolute right-2 sm:right-0 top-11 sm:top-auto sm:mt-1.5 w-[min(94vw,356px)] max-h-[calc(100dvh-52px)] overflow-y-auto bg-[#1d1f25] border border-[#30343f] rounded-md shadow-2xl py-2 z-50">
              <div className="px-3 pb-1 text-[11px] font-medium text-slate-400">
                Mesh Primitives
              </div>
              <div className="grid grid-cols-3 gap-1 px-2 pb-1.5">
                {PRIMITIVE_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onAddPrimitive(item.id);
                      setOpenMenu(null);
                    }}
                    className="text-left px-2 py-1.5 text-[11px] text-slate-200 bg-[#23262f]/60 hover:bg-[#2a2e38] hover:text-white rounded transition-colors truncate cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="my-1.5 border-t border-[#2b2e37]" />
              <div className="px-3 pb-1 text-[11px] font-medium text-slate-400">
                Cameras &amp; Lights
              </div>
              <div className="grid grid-cols-2 gap-1 px-2 pb-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onAddCamera();
                    setOpenMenu(null);
                  }}
                  className="flex items-center gap-1.5 text-left px-2 py-1.5 text-[11px] text-slate-200 bg-[#23262f]/60 hover:bg-[#2a2e38] hover:text-white rounded transition-colors cursor-pointer"
                >
                  <Video className="w-3.5 h-3.5 text-[#e87d2f] shrink-0" />
                  <span className="truncate">Scene Camera</span>
                </button>
                {(
                  [
                    { kind: 'point', label: 'Point Light' },
                    { kind: 'spot', label: 'Spot Light' },
                    { kind: 'directional', label: 'Sun Light' },
                  ] as Array<{ kind: SceneLightKind; label: string }>
                ).map((l) => (
                  <button
                    key={l.kind}
                    type="button"
                    onClick={() => {
                      onAddLight(l.kind);
                      setOpenMenu(null);
                    }}
                    className="flex items-center gap-1.5 text-left px-2 py-1.5 text-[11px] text-slate-200 bg-[#23262f]/60 hover:bg-[#2a2e38] hover:text-white rounded transition-colors cursor-pointer"
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{l.label}</span>
                  </button>
                ))}
              </div>
              <div className="my-1.5 border-t border-[#2b2e37]" />
              <div className="px-3 pb-1 text-[11px] font-medium text-slate-400">
                Studio Models
              </div>
              <div className="grid grid-cols-2 gap-1 px-2">
                {COMPOSITE_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onAddComposite(item.id);
                      setOpenMenu(null);
                    }}
                    className="flex items-center gap-1.5 text-left px-2 py-1.5 text-[11px] text-slate-200 bg-[#23262f]/60 hover:bg-[#2a2e38] hover:text-white rounded transition-colors cursor-pointer min-w-0"
                  >
                    <Layers className="w-3.5 h-3.5 text-[#e87d2f] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Free Minecraft Rig Button */}
        <button
          type="button"
          onClick={onOpenMinecraftRig}
          title="Free Minecraft Character Rig"
          className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-medium text-emerald-300 bg-[#1c2621] hover:bg-[#23322a] border border-emerald-500/35 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">Free Minecraft Rig</span>
          <span className="lg:hidden">Rig</span>
        </button>

        {/* Import Model Button */}
        <button
          type="button"
          onClick={onTriggerImport}
          className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-white bg-[#e87d2f] hover:bg-[#d66f23] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FileUp className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Import Model</span>
          <span className="sm:hidden">Import</span>
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            type="button"
            title="Export Model"
            onClick={() => setOpenMenu(openMenu === 'export' ? null : 'export')}
            className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-200 bg-[#22252c] hover:bg-[#2a2e37] border border-[#30343e] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden md:inline">Export</span>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:inline" />
          </button>

          {openMenu === 'export' && (
            <div className="fixed sm:absolute right-2 sm:right-0 top-11 sm:top-auto sm:mt-1.5 w-[min(88vw,240px)] max-h-[calc(100dvh-52px)] overflow-y-auto bg-[#1d1f25] border border-[#30343f] rounded-md shadow-2xl py-1.5 z-50">
              <div className="px-3 py-1 text-[11px] font-medium text-slate-400">
                Export Scene / Selection
              </div>
              {EXPORT_ITEMS.map((item) => (
                <button
                  key={item.format}
                  type="button"
                  onClick={() => {
                    onExport(item.format);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-[#2a2e38] hover:text-white transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Render PNG */}
        <button
          type="button"
          title="Render Image"
          onClick={onOpenRender}
          className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-200 bg-[#22252c] hover:bg-[#2a2e37] border border-[#30343e] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5 text-slate-300" />
          <span className="hidden md:inline">Render Image</span>
        </button>

        {/* Install App on iOS / Android */}
        <PWAInstallButton />

        {/* Supported Formats Guide */}
        <button
          type="button"
          onClick={onOpenFormatGuide}
          title="Supported 3D Formats & Shortcuts"
          className="flex items-center justify-center w-7 h-7 text-slate-400 hover:text-white hover:bg-[#252830] rounded transition-colors shrink-0 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
