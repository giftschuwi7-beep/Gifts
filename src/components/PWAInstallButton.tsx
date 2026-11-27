import React, { useState } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="Install PrismForge 3D App on Device"
        className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-200 bg-[#22252c] hover:bg-[#2a2e37] border border-[#30343e] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Smartphone className="w-3.5 h-3.5 text-[#e87d2f]" />
        <span className="hidden lg:inline">Install App</span>
        <span className="lg:hidden">App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Install on iPhone / iPad"
          className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-200 bg-[#22252c] hover:bg-[#2a2e37] border border-[#30343e] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#e87d2f]" />
          <span className="hidden sm:inline">iOS App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm bg-[#191b20] border border-[#2f333d] rounded-lg shadow-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Install on iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Install PrismForge 3D directly to your iOS Home Screen for full-screen studio rendering and offline access:
              </p>
              <ol className="text-xs text-slate-300 space-y-2 bg-[#14161b] border border-[#2a2d36] rounded p-3">
                <li className="flex items-center gap-2">
                  <span className="font-mono-num text-[#e87d2f] font-semibold">1.</span>
                  <span>
                    Tap the <strong className="text-white inline-flex items-center gap-1"><Share className="w-3.5 h-3.5 text-sky-400" /> Share</strong> button in Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-mono-num text-[#e87d2f] font-semibold">2.</span>
                  <span>
                    Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 text-xs font-medium text-white bg-[#e87d2f] hover:bg-[#d66f24] rounded transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
