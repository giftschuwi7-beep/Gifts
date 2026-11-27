import React, { useState } from 'react';
import { Box, Download, Play, X } from 'lucide-react';
import { createMinecraftRigAsset } from '../engine/proceduralAssets';
import { exportObject3D } from '../engine/modelExporter';

interface MinecraftRigModalProps {
  open: boolean;
  onClose: () => void;
  onLoadIntoViewport: () => void;
  onDownloaded: (format: string) => void;
}

export const MinecraftRigModal: React.FC<MinecraftRigModalProps> = ({
  open,
  onClose,
  onLoadIntoViewport,
  onDownloaded,
}) => {
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!open) return null;

  const handleFreeDownload = async (format: 'glb' | 'obj' | 'stl') => {
    setDownloading(format);
    try {
      const rig = createMinecraftRigAsset();
      const res = await exportObject3D(rig.group, format, 'Minecraft_Character_Rig_Free', rig.animations);
      onDownloaded(res.fileName);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg bg-[#191b20] border border-[#2f333d] rounded-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2b2e36]">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[#e87d2f]" />
            <h3 className="text-sm font-semibold text-white">
              Free Starter Asset: Minecraft Character Rig
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

        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded border border-[#2b2e36] bg-[#14161b] space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-xs font-semibold text-white">
                Articulated Explorer Rig + Diamond Pickaxe
              </h4>
              <span className="text-[11px] font-mono-num text-emerald-400">Free Starter Rig</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Includes full hierarchical limb pivots (Head, Right Arm, Left Arm, Right Leg, Left
              Leg), pixel-art UV skin textures, a voxel Diamond Pickaxe prop, and a built-in{' '}
              <span className="text-slate-200">Minecraft_Walk_Cycle</span> keyframe animation.
              Compatible with PrismForge 3D, Blender, and Prisma3D.
            </p>
            <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono-num text-slate-400">
              <span>5 Bone Pivots</span>
              <span aria-hidden="true">·</span>
              <span>Pixel Skin Textures</span>
              <span aria-hidden="true">·</span>
              <span>2.0s Walk Animation</span>
            </div>
          </div>

          {/* Primary Action: Load Directly Into Viewport */}
          <button
            type="button"
            onClick={() => {
              onLoadIntoViewport();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#e87d2f] hover:bg-[#d66f23] rounded transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Load Animated Minecraft Rig into Studio</span>
          </button>

          {/* Free Download Buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-slate-400">
              Free Direct Download (For Blender, Prisma3D &amp; 3D Apps)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={downloading !== null}
                onClick={() => handleFreeDownload('glb')}
                className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-2 text-xs font-medium text-slate-100 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-1">
                  <Download className="w-3.5 h-3.5 text-[#e87d2f]" />
                  <span>{downloading === 'glb' ? 'Saving...' : 'GLB Rig'}</span>
                </div>
                <span className="text-[10px] text-slate-400">Rig + Anim</span>
              </button>

              <button
                type="button"
                disabled={downloading !== null}
                onClick={() => handleFreeDownload('obj')}
                className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-2 text-xs font-medium text-slate-100 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-1">
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>{downloading === 'obj' ? 'Saving...' : 'OBJ Mesh'}</span>
                </div>
                <span className="text-[10px] text-slate-400">Prisma3D</span>
              </button>

              <button
                type="button"
                disabled={downloading !== null}
                onClick={() => handleFreeDownload('stl')}
                className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-2 text-xs font-medium text-slate-100 bg-[#22252d] hover:bg-[#2b2f39] border border-[#323642] rounded transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-1">
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{downloading === 'stl' ? 'Saving...' : 'STL Print'}</span>
                </div>
                <span className="text-[10px] text-slate-400">3D Print</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
