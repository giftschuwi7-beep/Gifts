import React from 'react';
import { FileBox, Keyboard, Play, X } from 'lucide-react';

interface FormatGuideModalProps {
  open: boolean;
  onClose: () => void;
  onReplayIntro?: () => void;
}

const FORMAT_GROUPS = [
  {
    title: 'Blender Ecosystem',
    formats: '.blend, .glb, .gltf, .obj + .mtl, .fbx, .dae, .ply, .stl',
    detail:
      'Imports native Blender (.blend) SDNA meshes (uncompressed, GZIP, or Zstandard compressed) directly, plus full PBR scenes exported as GLB/GLTF, FBX with skeletal animations, Collada, and Wavefront OBJ bundles.',
  },
  {
    title: 'Prisma3D & Mobile 3D Packages',
    formats: '.prisma, .p3d, .proj, .zip',
    detail:
      'Automatically unpacks .prisma and .zip project packages, resolves embedded textures and .mtl materials, and loads embedded OBJ, GLB, FBX, or JSON mesh hierarchies. For proprietary binary .proj workspaces, export OBJ/GLB/FBX from Prisma3D.',
  },
  {
    title: 'CAD, Sculpting, Voxel & Vector',
    formats: '.3ds, .3mf, .amf, .usdz, .usd, .vox, .wrl, .lwo, .kmz, .pcd, .xyz, .svg',
    detail:
      'Supports 3D printing meshes (STL, 3MF, AMF), Apple USDZ/USD, MagicaVoxel (.vox), point clouds (PCD, XYZ), and auto-extruded 3D SVG logos.',
  },
];

const SHORTCUTS = [
  { key: 'Q', action: 'Select Tool' },
  { key: 'G', action: 'Move / Grab Gizmo' },
  { key: 'R', action: 'Rotate Gizmo' },
  { key: 'S', action: 'Scale Gizmo' },
  { key: 'F', action: 'Focus Camera on Selected' },
  { key: 'L', action: 'Toggle Light Position Guides' },
  { key: 'Shift + D', action: 'Duplicate Selected Object' },
  { key: 'X / Delete', action: 'Delete Selected Object' },
  { key: 'H', action: 'Collapse / Expand Side Panel' },
];

export const FormatGuideModal: React.FC<FormatGuideModalProps> = ({
  open,
  onClose,
  onReplayIntro,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-2xl bg-[#191b20] border border-[#2f333d] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2b2e36]">
          <div className="flex items-center gap-2">
            <FileBox className="w-4 h-4 text-[#e87d2f]" />
            <h3 className="text-sm font-semibold text-white">
              Supported 3D Formats & Studio Shortcuts
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="space-y-3">
            {FORMAT_GROUPS.map((g) => (
              <div
                key={g.title}
                className="p-3.5 rounded border border-[#2b2e36] bg-[#14161b] space-y-1"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-xs font-semibold text-white">{g.title}</h4>
                  <span className="text-[11px] font-mono-num text-[#e87d2f]">{g.formats}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{g.detail}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Keyboard className="w-3.5 h-3.5 text-[#e87d2f]" />
              <span>Viewport Shortcuts</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between px-3 py-1.5 rounded bg-[#14161b] border border-[#262932] text-xs"
                >
                  <span className="text-slate-300">{s.action}</span>
                  <span className="font-mono-num text-slate-200 font-medium">{s.key}</span>
                </div>
              ))}
            </div>
          </div>

          {onReplayIntro && (
            <div className="pt-2 border-t border-[#2b2e36] flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                Watch the PrismForge 3D &amp; Gift&apos;s Chuwi launch animation with sound
              </span>
              <button
                type="button"
                onClick={onReplayIntro}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#23262f] hover:bg-[#2c303c] border border-[#323642] text-xs font-medium text-white transition-colors cursor-pointer shrink-0"
              >
                <Play className="w-3.5 h-3.5 text-[#e87d2f]" />
                <span>Replay Intro</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
