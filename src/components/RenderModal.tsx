import React, { useEffect, useState } from 'react';
import { Camera, Download, X } from 'lucide-react';

interface RenderModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (width: number, height: number, transparentBg: boolean) => string | null;
}

const RESOLUTIONS = [
  { id: 'hd', label: '1280 × 720 (HD)', width: 1280, height: 720 },
  { id: 'fhd', label: '1920 × 1080 (Full HD)', width: 1920, height: 1080 },
  { id: 'qhd', label: '2560 × 1440 (2K QHD)', width: 2560, height: 1440 },
  { id: 'uhd', label: '3840 × 2160 (4K UHD)', width: 3840, height: 2160 },
];

export const RenderModal: React.FC<RenderModalProps> = ({ open, onClose, onCapture }) => {
  const [resId, setResId] = useState('fhd');
  const [transparentBg, setTransparentBg] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const selectedRes = RESOLUTIONS.find((r) => r.id === resId) ?? RESOLUTIONS[1];

  useEffect(() => {
    if (!open) return;
    const dataUrl = onCapture(selectedRes.width, selectedRes.height, transparentBg);
    setPreviewUrl(dataUrl);
  }, [open, selectedRes.width, selectedRes.height, transparentBg, onCapture]);

  if (!open) return null;

  const handleDownload = () => {
    const dataUrl = onCapture(selectedRes.width, selectedRes.height, transparentBg);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `prismforge_render_${selectedRes.width}x${selectedRes.height}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-3xl bg-[#191b20] border border-[#2f333d] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2b2e36]">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#e87d2f]" />
            <h3 className="text-sm font-semibold text-white">Studio Render Output</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* Preview Frame */}
          <div
            className="w-full aspect-video rounded border border-[#2b2e36] overflow-hidden flex items-center justify-center bg-[#111216]"
            style={
              transparentBg
                ? {
                    backgroundImage:
                      'linear-gradient(45deg, #1e2026 25%, transparent 25%), linear-gradient(-45deg, #1e2026 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e2026 75%), linear-gradient(-45deg, transparent 75%, #1e2026 75%)',
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                  }
                : undefined
            }
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Rendered 3D scene preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-xs text-slate-500">Generating preview...</span>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-300">Resolution</label>
              <select
                value={resId}
                onChange={(e) => setResId(e.target.value)}
                className="bg-[#121418] border border-[#30343e] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#e87d2f]"
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer ml-2">
                <input
                  type="checkbox"
                  checked={transparentBg}
                  onChange={(e) => setTransparentBg(e.target.checked)}
                  className="accent-[#e87d2f]"
                />
                <span>Transparent Alpha</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#22252d] border border-[#323642] rounded cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#e87d2f] hover:bg-[#d66f23] rounded cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save PNG</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
