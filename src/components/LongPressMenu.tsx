import React from 'react';
import * as THREE from 'three';
import {
  ArrowUpLeft,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  FolderPlus,
  Layers,
  LogOut,
  Sliders,
  Sun,
  Trash2,
  Ungroup,
  Video,
  X,
} from 'lucide-react';

export interface LongPressTarget {
  part: THREE.Object3D;
  topObject: THREE.Object3D;
  clientX: number;
  clientY: number;
  previousTopObject?: THREE.Object3D | null;
}

interface LongPressMenuProps {
  target: LongPressTarget | null;
  activeSceneCamera: THREE.Object3D | null;
  hasAnySceneCamera: boolean;
  canGroupWithOther: boolean;
  otherObjectName?: string;
  onClose: () => void;
  onJumpCameraToggle: () => void;
  onToggleHide: () => void;
  onGroup: (combineWithOther: boolean) => void;
  onUngroup: () => void;
  onFocus: () => void;
  onDuplicate: () => void;
  onEditInspector: () => void;
  onSelectParent: () => void;
  onDelete: () => void;
}

export const LongPressMenu: React.FC<LongPressMenuProps> = ({
  target,
  activeSceneCamera,
  hasAnySceneCamera,
  canGroupWithOther,
  otherObjectName,
  onClose,
  onJumpCameraToggle,
  onToggleHide,
  onGroup,
  onUngroup,
  onFocus,
  onDuplicate,
  onEditInspector,
  onSelectParent,
  onDelete,
}) => {
  if (!target) return null;

  const { part, topObject, clientX, clientY } = target;
  const isSubPart = part !== topObject;
  const isCamera = Boolean(part.userData.isSceneCamera);
  const isLight = Boolean(part.userData.isSceneLight);
  const isHidden = !part.visible;
  const canUngroup =
    !isCamera &&
    !isLight &&
    !isSubPart &&
    part instanceof THREE.Group &&
    part.children.length > 0;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const menuWidth = Math.min(288, vw - 24);
  const menuApproxHeight = canGroupWithOther || isSubPart ? 340 : 300;
  const maxAllowedTop = Math.max(10, vh - Math.min(menuApproxHeight, vh - 20) - 10);

  const left = Math.max(12, Math.min(clientX - menuWidth / 2, vw - menuWidth - 12));
  const top = Math.max(10, Math.min(clientY - 24, maxAllowedTop));

  const isInsideCamera = Boolean(activeSceneCamera);

  return (
    <div
      className="fixed inset-0 z-40"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fixed bg-[#1a1c22] border border-[#343946] rounded-lg shadow-2xl overflow-y-auto max-h-[calc(100dvh-20px)] select-none"
        style={{ width: `${menuWidth}px`, left: `${left}px`, top: `${top}px` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header: Pressed Part Info */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#14161b] border-b border-[#2b2e37]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isCamera ? (
                <Video className="w-3.5 h-3.5 text-[#e87d2f] shrink-0" />
              ) : isLight ? (
                <Sun className="w-3.5 h-3.5 text-[#e87d2f] shrink-0" />
              ) : (
                <Layers className="w-3.5 h-3.5 text-[#e87d2f] shrink-0" />
              )}
              <span className="text-xs font-semibold text-white truncate">
                {part.name || 'Model Part'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">
              {isCamera
                ? 'Scene Camera'
                : isLight
                  ? 'Studio Light'
                  : isSubPart
                    ? `Part of ${topObject.name || 'Model'}`
                    : 'Scene Object'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close context menu"
            className="p-1 text-slate-400 hover:text-white rounded cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body Actions */}
        <div className="p-2 space-y-1.5">
          {/* Primary Prisma3D Jump In / Jump Out Camera Toggle on Same Open Menu */}
          <button
            type="button"
            onClick={onJumpCameraToggle}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded border text-xs font-semibold transition-colors cursor-pointer ${
              isInsideCamera
                ? 'bg-[#e87d2f] border-[#e87d2f] text-white hover:bg-[#d66f23]'
                : 'bg-[#232732] border-[#383e4d] text-slate-100 hover:bg-[#2c3140] hover:border-[#e87d2f]/60'
            }`}
          >
            <span className="flex items-center gap-2">
              {isInsideCamera ? (
                <LogOut className="w-3.5 h-3.5" />
              ) : (
                <Video className="w-3.5 h-3.5 text-[#e87d2f]" />
              )}
              <span>
                {isInsideCamera
                  ? 'Jump Out Camera'
                  : hasAnySceneCamera || isCamera
                    ? 'Jump In Camera'
                    : 'Add & Jump In Camera'}
              </span>
            </span>
            <span className="text-[10px] font-normal opacity-80">
              {isInsideCamera ? 'Active' : 'POV'}
            </span>
          </button>

          {/* Main 2-column action grid */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onToggleHide}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors cursor-pointer ${
                isHidden
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25'
                  : 'bg-[#20232b] border-[#2e323d] text-slate-200 hover:bg-[#292d38] hover:text-white'
              }`}
            >
              {isHidden ? (
                <Eye className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              )}
              <span>{isHidden ? 'Show' : 'Hide'}</span>
            </button>

            <button
              type="button"
              onClick={() => onGroup(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#2e323d] bg-[#20232b] hover:bg-[#292d38] text-xs text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#e87d2f] shrink-0" />
              <span>{isSubPart ? 'Group Part' : 'Group'}</span>
            </button>

            {canGroupWithOther && (
              <button
                type="button"
                onClick={() => onGroup(true)}
                className="col-span-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#2e323d] bg-[#20232b] hover:bg-[#292d38] text-xs text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">
                  Group with {otherObjectName || 'Selected'}
                </span>
              </button>
            )}

            {canUngroup && (
              <button
                type="button"
                onClick={onUngroup}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#2e323d] bg-[#20232b] hover:bg-[#292d38] text-xs text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <Ungroup className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Ungroup</span>
              </button>
            )}

            <button
              type="button"
              onClick={onDuplicate}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#2e323d] bg-[#20232b] hover:bg-[#292d38] text-xs text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span>Duplicate</span>
            </button>

            <button
              type="button"
              onClick={onFocus}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#2e323d] bg-[#20232b] hover:bg-[#292d38] text-xs text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span>Focus</span>
            </button>

            <button
              type="button"
              onClick={onEditInspector}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#2e323d] bg-[#20232b] hover:bg-[#292d38] text-xs text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span>Inspect</span>
            </button>

            {isSubPart && (
              <button
                type="button"
                onClick={onSelectParent}
                className="col-span-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#2e323d] bg-[#20232b] hover:bg-[#292d38] text-xs text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowUpLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <span className="truncate">Select Parent ({topObject.name})</span>
              </button>
            )}
          </div>

          {/* Delete Action */}
          <button
            type="button"
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded border border-red-500/35 bg-red-500/12 hover:bg-red-500/22 text-xs font-medium text-red-300 hover:text-red-200 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isSubPart ? 'Delete Part' : 'Delete'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
