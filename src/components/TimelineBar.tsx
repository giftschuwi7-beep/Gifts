import React from 'react';
import { BatteryCharging, BatteryLow, Clapperboard, Pause, Play, RotateCw, Zap } from 'lucide-react';
import type { PowerMode } from '../hooks/useBatteryPower';

interface TimelineBarProps {
  totalObjects: number;
  totalVertices: number;
  totalTriangles: number;
  selectedName: string | null;
  hasAnimations: boolean;
  isPlaying: boolean;
  animTime: number;
  animPanelOpen: boolean;
  turntable: boolean;
  powerMode: PowerMode;
  ecoActive: boolean;
  batteryLevel: number | null;
  onTogglePlay: () => void;
  onToggleAnimPanel: () => void;
  onToggleTurntable: () => void;
  onCyclePowerMode: () => void;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  totalObjects,
  totalVertices,
  totalTriangles,
  selectedName,
  hasAnimations,
  isPlaying,
  animTime,
  animPanelOpen,
  turntable,
  powerMode,
  ecoActive,
  batteryLevel,
  onTogglePlay,
  onToggleAnimPanel,
  onToggleTurntable,
  onCyclePowerMode,
}) => {
  const powerLabel =
    powerMode === 'eco'
      ? 'Eco'
      : powerMode === 'performance'
      ? 'High'
      : ecoActive
      ? `Eco${batteryLevel !== null ? ` ${batteryLevel}%` : ''}`
      : 'Auto';

  return (
    <footer className="safe-bottom safe-x min-h-9 shrink-0 flex items-center justify-between gap-3 px-3 py-1 bg-[#17191e] border-t border-[#2b2e36] text-[11px] text-slate-400 select-none z-20">
      {/* Left: Geometry Readout (unboxed tabular numerals) */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-slate-200 font-medium truncate max-w-[160px]">
          {selectedName ?? 'Scene'}
        </span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span className="font-mono-num whitespace-nowrap">
          {totalObjects} {totalObjects === 1 ? 'obj' : 'objs'}
        </span>
        <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
        <span className="font-mono-num whitespace-nowrap hidden sm:inline">
          {totalVertices.toLocaleString()} verts
        </span>
        <span aria-hidden="true" className="text-slate-600 hidden md:inline">·</span>
        <span className="font-mono-num whitespace-nowrap hidden md:inline">
          {totalTriangles.toLocaleString()} tris
        </span>
      </div>

      {/* Right: Quick Animation Side Toggle, Play/Pause, Power Saver, Turntable */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span className="hidden xl:inline text-slate-500 mr-1">
          G Move · R Rotate · S Scale · I Keyframe · A Animation · H Options
        </span>

        {hasAnimations && (
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex items-center gap-1 px-2 py-0.5 text-slate-200 bg-[#23262e] hover:bg-[#2d313c] border border-[#323642] rounded cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-3 h-3 text-[#e87d2f]" />
            ) : (
              <Play className="w-3 h-3 text-[#e87d2f]" />
            )}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
            <span className="font-mono-num text-slate-400 ml-0.5">{animTime.toFixed(1)}s</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleAnimPanel}
          className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors cursor-pointer ${
            animPanelOpen
              ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
              : 'bg-[#22252d] border-[#30343e] text-slate-300 hover:text-white'
          }`}
        >
          <Clapperboard className="w-3 h-3 text-[#e87d2f]" />
          <span className="hidden sm:inline">Animation</span>
        </button>

        <button
          type="button"
          onClick={onCyclePowerMode}
          title="Power Mode: Auto (saves battery at <=15% & 5%), Eco (Low-Power), or High Performance"
          className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors cursor-pointer ${
            ecoActive
              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
              : 'bg-[#22252d] border-[#30343e] text-slate-300 hover:text-white'
          }`}
        >
          {ecoActive ? (
            <BatteryLow className="w-3 h-3 text-emerald-400" />
          ) : powerMode === 'performance' ? (
            <Zap className="w-3 h-3 text-[#e87d2f]" />
          ) : (
            <BatteryCharging className="w-3 h-3 text-slate-400" />
          )}
          <span className="hidden sm:inline font-mono-num">{powerLabel}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTurntable}
          className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors cursor-pointer ${
            turntable
              ? 'bg-[#e87d2f]/20 border-[#e87d2f] text-white'
              : 'bg-[#22252d] border-[#30343e] text-slate-300 hover:text-white'
          }`}
        >
          <RotateCw className="w-3 h-3" />
          <span className="hidden sm:inline">Turntable</span>
        </button>
      </div>
    </footer>
  );
};
