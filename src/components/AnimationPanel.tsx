import React, { useMemo } from 'react';
import * as THREE from 'three';
import {
  Bone,
  Clapperboard,
  Diamond,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { AnimationClipInfo, SceneItem, UserKeyframe } from '../types/studio';
import { getAnimatableNodes } from '../engine/animationBuilder';

interface AnimationPanelProps {
  items: SceneItem[];
  selectedObject: THREE.Object3D | null;
  animations: AnimationClipInfo[];
  userKeyframes: UserKeyframe[];
  isPlaying: boolean;
  animTime: number;
  animSpeed: number;
  animDuration: number;
  animLoop: boolean;
  onSelectObject: (obj: THREE.Object3D) => void;
  onTogglePlay: () => void;
  onResetAnim: () => void;
  onScrub: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onDurationChange: (duration: number) => void;
  onToggleLoop: () => void;
  onInsertKeyframe: () => void;
  onApplyQuickMotion: (preset: 'spin' | 'float' | 'bounce') => void;
  onDeleteKeyframe: (id: string) => void;
  onClearKeyframes: () => void;
  onRemoveClip: (id: string) => void;
  onClose: () => void;
}

export const AnimationPanel: React.FC<AnimationPanelProps> = ({
  items,
  selectedObject,
  animations,
  userKeyframes,
  isPlaying,
  animTime,
  animSpeed,
  animDuration,
  animLoop,
  onSelectObject,
  onTogglePlay,
  onResetAnim,
  onScrub,
  onSpeedChange,
  onDurationChange,
  onToggleLoop,
  onInsertKeyframe,
  onApplyQuickMotion,
  onDeleteKeyframe,
  onClearKeyframes,
  onRemoveClip,
  onClose,
}) => {
  // Find top-level SceneItem owning selectedObject so users can browse all rig joints/sub-parts
  const parentSceneItem = useMemo(() => {
    if (!selectedObject) return items[0] ?? null;
    for (const item of items) {
      let found = false;
      item.object.traverse((child) => {
        if (child === selectedObject) found = true;
      });
      if (found) return item;
    }
    return items[0] ?? null;
  }, [items, selectedObject]);

  const animatableNodes = useMemo(
    () => getAnimatableNodes(parentSceneItem?.object ?? null),
    [parentSceneItem]
  );

  const effectiveDuration = useMemo(() => {
    const clipMax = animations.length > 0 ? Math.max(...animations.map((a) => a.duration)) : 0;
    return Math.max(animDuration, clipMax, 0.5);
  }, [animations, animDuration]);

  const clampedTime = Math.min(Math.max(animTime, 0), effectiveDuration);
  const hasAnyMotion = animations.length > 0 || userKeyframes.length > 0;

  const sortedKeyframes = useMemo(
    () => [...userKeyframes].sort((a, b) => a.time - b.time),
    [userKeyframes]
  );

  return (
    <aside className="absolute left-0 top-0 bottom-0 z-30 w-[264px] max-w-[78vw] shadow-2xl lg:relative lg:z-20 lg:w-[276px] lg:shadow-none shrink-0 h-full flex flex-col bg-[#191b20] border-r border-[#2b2e36] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2b2e36] shrink-0">
        <div className="flex items-center gap-1.5">
          <Clapperboard className="w-3.5 h-3.5 text-[#e87d2f]" />
          <h2 className="text-xs font-semibold text-slate-100">Animation Studio</h2>
        </div>
        <button
          type="button"
          title="Collapse Animation Panel (A)"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#252831] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Playback & Timeline Scrubber */}
        <section className="space-y-2.5 pb-3 border-b border-[#262931]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">Timeline &amp; Transport</span>
            <span className="text-[11px] font-mono-num text-[#e87d2f]">
              {clampedTime.toFixed(2)}s / {effectiveDuration.toFixed(1)}s
            </span>
          </div>

          {/* Scrubber with Keyframe Diamond Markers */}
          <div className="relative pt-2 pb-1">
            {sortedKeyframes.length > 0 && (
              <div className="pointer-events-none absolute top-0 left-1 right-1 h-2.5">
                {sortedKeyframes.map((kf) => {
                  const pct = Math.min(100, Math.max(0, (kf.time / effectiveDuration) * 100));
                  const isCurrentTarget = selectedObject?.uuid === kf.targetUuid;
                  return (
                    <span
                      key={kf.id}
                      style={{ left: `${pct}%` }}
                      className={`absolute top-0 -translate-x-1/2 w-2 h-2 rotate-45 ${
                        isCurrentTarget ? 'bg-[#e87d2f]' : 'bg-sky-400'
                      }`}
                    />
                  );
                })}
              </div>
            )}
            <input
              type="range"
              min={0}
              max={effectiveDuration}
              step={0.01}
              value={clampedTime}
              onChange={(e) => onScrub(parseFloat(e.target.value))}
              className="studio-slider w-full"
            />
          </div>

          {/* Transport Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!hasAnyMotion}
              onClick={onTogglePlay}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                !hasAnyMotion
                  ? 'bg-[#20232b] border-[#2a2d36] text-slate-500 cursor-not-allowed'
                  : isPlaying
                  ? 'bg-[#e87d2f] border-[#e87d2f] text-white cursor-pointer'
                  : 'bg-[#252831] border-[#343844] text-slate-100 hover:bg-[#2d313d] cursor-pointer'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              type="button"
              title="Reset to 0.00s"
              onClick={onResetAnim}
              className="p-1.5 bg-[#22252d] hover:bg-[#2b2f3a] border border-[#30343e] text-slate-300 hover:text-white rounded cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              title="Toggle Loop Playback"
              onClick={onToggleLoop}
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                animLoop
                  ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-[#e87d2f]'
                  : 'bg-[#22252d] border-[#30343e] text-slate-400 hover:text-white'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Speed & Duration */}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[10px] text-slate-400">Playback Speed</span>
              <select
                value={animSpeed}
                onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                className="w-full bg-[#14161b] border border-[#2b2e37] rounded px-2 py-1 text-[11px] font-mono-num text-slate-200 outline-none focus:border-[#e87d2f] cursor-pointer"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.50x</option>
                <option value={1}>1.00x</option>
                <option value={1.5}>1.50x</option>
                <option value={2}>2.00x</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] text-slate-400">Clip Duration</span>
              <select
                value={animDuration}
                onChange={(e) => onDurationChange(parseFloat(e.target.value))}
                className="w-full bg-[#14161b] border border-[#2b2e37] rounded px-2 py-1 text-[11px] font-mono-num text-slate-200 outline-none focus:border-[#e87d2f] cursor-pointer"
              >
                <option value={2}>2.0 sec</option>
                <option value={4}>4.0 sec</option>
                <option value={6}>6.0 sec</option>
                <option value={8}>8.0 sec</option>
                <option value={12}>12.0 sec</option>
              </select>
            </label>
          </div>
        </section>

        {/* Keyframe Recorder & Quick Motions */}
        <section className="space-y-2 pb-3 border-b border-[#262931]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">Keyframe Target</span>
            <span className="text-[11px] text-[#e87d2f] truncate max-w-[140px]">
              {selectedObject?.name || 'None'}
            </span>
          </div>

          <button
            type="button"
            disabled={!selectedObject}
            onClick={onInsertKeyframe}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-[#e87d2f] hover:bg-[#d66f24] disabled:bg-[#23262e] disabled:text-slate-500 text-white text-xs font-medium rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Insert Keyframe at {clampedTime.toFixed(2)}s (I)</span>
          </button>

          <div className="space-y-1 pt-0.5">
            <span className="block text-[10px] text-slate-400">One-Click Motion Presets</span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'spin', label: '360° Spin' },
                  { id: 'float', label: 'Float' },
                  { id: 'bounce', label: 'Bounce' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!selectedObject}
                  onClick={() => onApplyQuickMotion(preset.id)}
                  className="flex items-center justify-center gap-1 py-1.5 px-1.5 bg-[#22252d] hover:bg-[#2c303b] disabled:opacity-40 border border-[#30343e] text-[11px] text-slate-200 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3 h-3 text-[#e87d2f]" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Rig Bones / Child Parts Picker */}
        {animatableNodes.length > 1 && (
          <section className="space-y-1.5 pb-3 border-b border-[#262931]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bone className="w-3.5 h-3.5 text-[#e87d2f]" />
                <span className="text-[11px] font-medium text-slate-300">
                  Rig Bones &amp; Parts ({animatableNodes.length})
                </span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              Select any limb or part below to pose it with Move / Rotate and record keyframes.
            </p>
            <div className="max-h-32 overflow-y-auto space-y-0.5 pr-0.5">
              {animatableNodes.map((node, idx) => {
                const isSelected = selectedObject === node;
                return (
                  <button
                    key={node.uuid}
                    type="button"
                    onClick={() => onSelectObject(node)}
                    className={`w-full flex items-center justify-between px-2 py-1 text-left text-[11px] rounded transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#e87d2f]/20 text-white border border-[#e87d2f]/50'
                        : 'text-slate-300 hover:bg-[#242730] border border-transparent'
                    }`}
                  >
                    <span className="truncate">
                      {idx === 0 ? `[Root] ${node.name || 'Model'}` : node.name}
                    </span>
                    <span className="text-[9px] font-mono-num text-slate-500 ml-1 shrink-0">
                      {idx === 0 ? 'ROOT' : node instanceof THREE.Bone ? 'BONE' : 'PART'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Built-in / Imported Clips */}
        {animations.length > 0 && (
          <section className="space-y-1.5 pb-3 border-b border-[#262931]">
            <span className="block text-[11px] font-medium text-slate-300">
              Rig &amp; Imported Clips ({animations.length})
            </span>
            <div className="space-y-1">
              {animations.map((clip) => (
                <div
                  key={clip.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#15171c] border border-[#2a2d36] rounded text-[11px]"
                >
                  <div className="min-w-0">
                    <p className="text-slate-200 truncate">{clip.name}</p>
                    <p className="text-[10px] font-mono-num text-slate-400">
                      {clip.duration.toFixed(2)}s · {clip.clip.tracks.length} tracks
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Remove Clip"
                    onClick={() => onRemoveClip(clip.id)}
                    className="p-1 text-slate-400 hover:text-red-400 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recorded Keyframes List */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">
              Keyframes ({sortedKeyframes.length})
            </span>
            {sortedKeyframes.length > 0 && (
              <button
                type="button"
                onClick={onClearKeyframes}
                className="text-[10px] text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {sortedKeyframes.length === 0 ? (
            <div className="p-3 bg-[#15171c] border border-[#262931] rounded text-[11px] text-slate-400 leading-relaxed">
              Move timeline to a time (e.g. <span className="text-slate-200 font-mono-num">0.00s</span>), click{' '}
              <span className="text-slate-200">Insert Keyframe</span>, scrub to{' '}
              <span className="text-slate-200 font-mono-num">2.00s</span>, move or rotate the object, and insert a second keyframe.
            </div>
          ) : (
            <div className="space-y-1">
              {sortedKeyframes.map((kf) => (
                <div
                  key={kf.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#15171c] hover:bg-[#1e2129] border border-[#2a2d36] rounded text-[11px] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onScrub(kf.time)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <Diamond className="w-2.5 h-2.5 text-[#e87d2f] shrink-0 fill-[#e87d2f]" />
                    <span className="font-mono-num text-slate-200 shrink-0">
                      {kf.time.toFixed(2)}s
                    </span>
                    <span className="text-slate-400 truncate">{kf.targetName}</span>
                  </button>
                  <button
                    type="button"
                    title="Delete Keyframe"
                    onClick={() => onDeleteKeyframe(kf.id)}
                    className="p-0.5 text-slate-500 hover:text-red-400 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
