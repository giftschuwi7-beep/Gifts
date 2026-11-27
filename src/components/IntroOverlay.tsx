import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { createIntroAudio, type IntroAudioController } from '../engine/introAudio';

interface IntroOverlayProps {
  onComplete: () => void;
}

interface EmberParticle {
  id: number;
  x: number;
  yStart: number;
  yEnd: number;
  size: number;
  delay: number;
  duration: number;
  tint: string;
}

const STUDIO_PARTICLES: EmberParticle[] = [
  { id: 0, x: -165, yStart: 50, yEnd: -85, size: 3, delay: 0.05, duration: 2.3, tint: '#fb923c' },
  { id: 1, x: -110, yStart: 70, yEnd: -60, size: 2, delay: 0.25, duration: 2.1, tint: '#f8fafc' },
  { id: 2, x: -55, yStart: 80, yEnd: -95, size: 3.5, delay: 0.15, duration: 2.6, tint: '#e87d2f' },
  { id: 3, x: 45, yStart: 75, yEnd: -90, size: 2.5, delay: 0.1, duration: 2.4, tint: '#fdba74' },
  { id: 4, x: 115, yStart: 60, yEnd: -70, size: 2, delay: 0.35, duration: 2.0, tint: '#93c5fd' },
  { id: 5, x: 170, yStart: 45, yEnd: -80, size: 3, delay: 0.2, duration: 2.5, tint: '#e87d2f' },
  { id: 6, x: -140, yStart: -15, yEnd: -105, size: 2, delay: 0.4, duration: 2.2, tint: '#fde68a' },
  { id: 7, x: 135, yStart: -20, yEnd: -110, size: 2.5, delay: 0.3, duration: 2.3, tint: '#f8fafc' },
];

export const IntroOverlay: React.FC<IntroOverlayProps> = ({ onComplete }) => {
  const [scene, setScene] = useState<1 | 2>(1);
  const [exiting, setExiting] = useState(false);
  const [transitionFlash, setTransitionFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const audioRef = useRef<IntroAudioController | null>(null);
  const sceneRef = useRef<1 | 2>(1);
  const playedScene1Ref = useRef(false);
  const playedScene2Ref = useRef(false);

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const totalDurationSec = prefersReduced ? 2.2 : 4.65;

  useEffect(() => {
    const audio = createIntroAudio();
    audioRef.current = audio;

    // Attempt immediate autoplay (succeeds on desktop / unlocked contexts or replay click)
    void audio.playScene1().then((played) => {
      if (played) {
        playedScene1Ref.current = true;
        setAudioBlocked(false);
      } else if (audio.isSuspended()) {
        setAudioBlocked(true);
      }
    });

    const handleUserGesture = () => {
      if (!audioRef.current || audioRef.current.isMuted()) return;
      void audioRef.current.unlock().then((unlocked) => {
        if (!unlocked) return;
        setAudioBlocked(false);
        if (sceneRef.current === 1 && !playedScene1Ref.current) {
          playedScene1Ref.current = true;
          void audioRef.current?.playScene1();
        } else if (sceneRef.current === 2 && !playedScene2Ref.current) {
          playedScene2Ref.current = true;
          void audioRef.current?.playScene2();
        }
      });
    };

    window.addEventListener('pointerdown', handleUserGesture, { passive: true });
    window.addEventListener('keydown', handleUserGesture);

    return () => {
      window.removeEventListener('pointerdown', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const whooshLeadDelay = prefersReduced ? 820 : 1920;
    const scene2Delay = prefersReduced ? 950 : 2100;
    const finishDelay = prefersReduced ? 2250 : 4650;

    const tWhoosh = window.setTimeout(() => {
      setTransitionFlash(true);
      void audioRef.current?.playTransitionWhoosh();
    }, whooshLeadDelay);

    const tFlashEnd = window.setTimeout(() => {
      setTransitionFlash(false);
    }, whooshLeadDelay + 420);

    const t1 = window.setTimeout(() => {
      sceneRef.current = 2;
      setScene(2);
      void audioRef.current?.playScene2().then((played) => {
        if (played) playedScene2Ref.current = true;
      });
    }, scene2Delay);

    const t2 = window.setTimeout(() => {
      void audioRef.current?.playFinish();
      setExiting(true);
    }, finishDelay);

    const t3 = window.setTimeout(() => {
      onComplete();
    }, finishDelay + 550);

    return () => {
      window.clearTimeout(tWhoosh);
      window.clearTimeout(tFlashEnd);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onComplete, prefersReduced]);

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (audioBlocked && !muted) {
      // First tap unlocks suspended mobile audio without muting
      void audio.unlock().then((ok) => {
        if (ok) {
          setAudioBlocked(false);
          if (sceneRef.current === 1 && !playedScene1Ref.current) {
            playedScene1Ref.current = true;
            void audio.playScene1();
          } else if (sceneRef.current === 2 && !playedScene2Ref.current) {
            playedScene2Ref.current = true;
            void audio.playScene2();
          }
        }
      });
      return;
    }

    const nextMuted = !muted;
    setMuted(nextMuted);
    audio.setMuted(nextMuted);
    if (!nextMuted) {
      void audio.unlock().then((ok) => {
        if (ok) {
          setAudioBlocked(false);
          if (sceneRef.current === 1 && !playedScene1Ref.current) {
            playedScene1Ref.current = true;
            void audio.playScene1();
          } else if (sceneRef.current === 2 && !playedScene2Ref.current) {
            playedScene2Ref.current = true;
            void audio.playScene2();
          }
        }
      });
    }
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExiting(true);
    audioRef.current?.dispose();
    window.setTimeout(onComplete, 260);
  };

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f1014] text-white select-none overflow-hidden"
    >
      {/* Dynamic radial studio spotlight shifting warmth between Scene 1 and Scene 2 */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={{
          opacity: scene === 1 ? 0.9 : 1,
          scale: scene === 1 ? 1 : 1.08,
        }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background:
            scene === 1
              ? 'radial-gradient(circle at 50% 46%, rgba(232, 125, 47, 0.16) 0%, rgba(56, 189, 248, 0.06) 28%, rgba(20, 22, 27, 0.45) 52%, rgba(12, 13, 17, 1) 82%)'
              : 'radial-gradient(circle at 50% 48%, rgba(232, 125, 47, 0.24) 0%, rgba(251, 191, 36, 0.08) 32%, rgba(20, 22, 27, 0.4) 55%, rgba(11, 12, 16, 1) 84%)',
        }}
      />

      {/* Volumetric spotlight beam in Scene 2 behind creator name */}
      {!prefersReduced && scene === 2 && (
        <motion.div
          initial={{ opacity: 0, scaleY: 0.7 }}
          animate={{ opacity: [0, 0.55, 0.35], scaleY: [0.7, 1.05, 1] }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[540px] max-w-[92vw] h-[72vh] origin-top"
          style={{
            background:
              'conic-gradient(from 180deg at 50% 0%, transparent 152deg, rgba(232,125,47,0.16) 176deg, rgba(255,237,213,0.14) 180deg, rgba(232,125,47,0.16) 184deg, transparent 208deg)',
          }}
        />
      )}

      {/* Transition Whoosh Horizon Burst */}
      <AnimatePresence>
        {transitionFlash && !prefersReduced && (
          <motion.div
            key="transition-whoosh-burst"
            initial={{ opacity: 0, scaleX: 0.15, scaleY: 0.6 }}
            animate={{ opacity: [0, 0.9, 0], scaleX: [0.15, 1.4, 1.8], scaleY: [0.6, 1.1, 0.4] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-24 z-10"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255,214,170,0.42) 0%, rgba(232,125,47,0.18) 38%, transparent 72%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Perspective grid horizon accent */}
      <motion.div
        animate={{ opacity: scene === 1 ? 0.22 : 0.14 }}
        transition={{ duration: 0.8 }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          transform: 'perspective(500px) rotateX(62deg)',
          transformOrigin: 'bottom center',
        }}
      />

      {/* Ambient Floating Studio Light Particles */}
      {!prefersReduced && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          {STUDIO_PARTICLES.map((p) => (
            <motion.span
              key={`${scene}-${p.id}`}
              initial={{ opacity: 0, x: p.x, y: p.yStart, scale: 0.6 }}
              animate={{
                opacity: [0, 0.85, 0],
                x: p.x + (p.id % 2 === 0 ? 12 : -12),
                y: p.yEnd,
                scale: [0.6, 1.15, 0.4],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: 'easeOut',
              }}
              className="absolute rounded-full"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.tint,
                boxShadow: `0 0 10px ${p.tint}`,
              }}
            />
          ))}
        </div>
      )}

      {/* Top Controls: Sound Toggle (Left) + Skip Intro (Right) */}
      <div className="absolute top-0 inset-x-0 safe-top safe-x px-4 pt-4 z-20 flex items-center justify-between pointer-events-none">
        <button
          type="button"
          onClick={handleToggleSound}
          aria-label={muted ? 'Unmute intro sound' : 'Mute intro sound'}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#1a1c22] hover:bg-[#23262f] border border-[#2d313b] rounded transition-colors cursor-pointer"
        >
          {muted ? (
            <VolumeX className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-[#e87d2f]" />
          )}
          <span>
            {muted ? 'Muted' : audioBlocked ? 'Tap for Sound' : 'Sound On'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleSkip}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#1a1c22] hover:bg-[#23262f] border border-[#2d313b] rounded transition-colors cursor-pointer"
        >
          <span>Skip Intro</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Animated Center Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center min-h-[270px]">
        <AnimatePresence mode="wait">
          {scene === 1 ? (
            <motion.div
              key="intro-scene-1"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.06, y: -14 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex flex-col items-center"
            >
              {/* Expanding Concentric Shockwave Rings + Precision Orbitals */}
              <div className="relative flex items-center justify-center mb-5 w-28 h-28">
                {!prefersReduced && (
                  <>
                    <motion.div
                      initial={{ scale: 0.45, opacity: 0.7 }}
                      animate={{ scale: 1.95, opacity: 0 }}
                      transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1] }}
                      className="pointer-events-none absolute inset-3 rounded-full border border-[#e87d2f]/60"
                    />
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0.45 }}
                      animate={{ scale: 2.35, opacity: 0 }}
                      transition={{ duration: 1.65, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                      className="pointer-events-none absolute inset-3 rounded-full border border-sky-300/35"
                    />
                    {/* Counter-rotating precision studio reticle */}
                    <motion.svg
                      viewBox="0 0 112 112"
                      className="pointer-events-none absolute inset-0 w-full h-full"
                      initial={{ rotate: -40, opacity: 0, scale: 0.85 }}
                      animate={{ rotate: 50, opacity: 0.55, scale: 1 }}
                      transition={{ duration: 2.1, ease: 'easeOut' }}
                    >
                      <circle
                        cx="56"
                        cy="56"
                        r="50"
                        fill="none"
                        stroke="#e87d2f"
                        strokeOpacity="0.4"
                        strokeWidth="1"
                        strokeDasharray="6 10"
                      />
                    </motion.svg>
                  </>
                )}

                {/* Animated 3D Prism Emblem with pathLength stroke-draw reveal */}
                <motion.svg
                  width="88"
                  height="88"
                  viewBox="0 0 84 84"
                  fill="none"
                  className="relative z-10"
                  initial={{ rotate: prefersReduced ? 0 : -14, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.polygon
                    points="42,8 74,62 10,62"
                    stroke="#e87d2f"
                    strokeWidth="2.4"
                    fill="rgba(232,125,47,0.13)"
                    initial={{ pathLength: prefersReduced ? 1 : 0, opacity: 0.5 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <motion.polygon
                    points="42,8 74,62 42,74"
                    stroke="#f8fafc"
                    strokeOpacity="0.72"
                    strokeWidth="1.6"
                    fill="rgba(255,255,255,0.05)"
                    initial={{ pathLength: prefersReduced ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.85, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <motion.line
                    x1="42"
                    y1="8"
                    x2="42"
                    y2="74"
                    stroke="#e87d2f"
                    strokeWidth="1.9"
                    initial={{ pathLength: prefersReduced ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.65, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <motion.line
                    x1="10"
                    y1="62"
                    x2="42"
                    y2="74"
                    stroke="#f8fafc"
                    strokeOpacity="0.5"
                    strokeWidth="1.5"
                    initial={{ pathLength: prefersReduced ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.65, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  />
                </motion.svg>

                {/* Prismatic refracted light beam sweeping diagonally */}
                {!prefersReduced && (
                  <motion.div
                    initial={{ opacity: 0, x: -65, rotate: -24 }}
                    animate={{ opacity: [0, 0.85, 0], x: [-65, 70] }}
                    transition={{ duration: 1.05, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-12 h-24 rounded-full"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), rgba(232,125,47,0.38), rgba(56,189,248,0.24), transparent)',
                    }}
                  />
                )}
              </div>

              <motion.h1
                initial={{ opacity: 0, y: 10, letterSpacing: '0.08em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '-0.02em' }}
                transition={{ delay: 0.22, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                className="text-3xl sm:text-5xl font-bold text-white"
              >
                PrismForge 3D
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.5 }}
                className="mt-2.5 text-sm sm:text-base text-slate-400 tracking-wide"
              >
                Universal 3D Rendering & Model Workstation
              </motion.p>
            </motion.div>
          ) : (
            <motion.div
              key="intro-scene-2"
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex flex-col items-center"
            >
              {/* Expanding energy ring behind creator reveal */}
              {!prefersReduced && (
                <motion.div
                  initial={{ scale: 0.35, opacity: 0.65 }}
                  animate={{ scale: 2.1, opacity: 0 }}
                  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full border border-[#e87d2f]/50"
                />
              )}

              <motion.span
                initial={{ opacity: 0, letterSpacing: '0.35em' }}
                animate={{ opacity: 1, letterSpacing: '0.22em' }}
                transition={{ delay: 0.08, duration: 0.5 }}
                className="text-xs sm:text-sm font-medium text-[#f6a15d] uppercase"
              >
                Created By
              </motion.span>

              <div className="relative overflow-hidden mt-2.5 px-2">
                <motion.h2
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.18, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="text-4xl sm:text-6xl font-bold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(232,125,47,0.3)]"
                >
                  Gift&apos;s Chuwi
                </motion.h2>

                {/* Light sheen sweep across creator signature */}
                {!prefersReduced && (
                  <motion.div
                    initial={{ x: '-120%', opacity: 0 }}
                    animate={{ x: '220%', opacity: [0, 0.65, 0] }}
                    transition={{ delay: 0.45, duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-none absolute inset-y-0 w-1/2 skew-x-[-20deg]"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
                    }}
                  />
                )}
              </div>

              {/* Expanding accent bar with glowing spark flare */}
              <div className="relative mt-4 h-[2px] w-48 sm:w-56 overflow-hidden flex items-center justify-center">
                <motion.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: 0.36, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full w-full bg-gradient-to-r from-transparent via-[#e87d2f] to-transparent origin-center"
                />
                {!prefersReduced && (
                  <motion.div
                    initial={{ x: -96, opacity: 0 }}
                    animate={{ x: 96, opacity: [0, 1, 0] }}
                    transition={{ delay: 0.48, duration: 0.85, ease: 'easeInOut' }}
                    className="pointer-events-none absolute w-8 h-1 rounded-full bg-white shadow-[0_0_12px_#fb923c]"
                  />
                )}
              </div>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.56, duration: 0.45 }}
                className="mt-3.5 text-xs sm:text-sm text-slate-400"
              >
                Blender · Prisma3D · GLB · FBX · OBJ · Free Starter Rigs
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Scene Progress Indicator & Timeline Track */}
      <div className="absolute bottom-0 inset-x-0 safe-bottom safe-x pb-6 z-10 flex flex-col items-center gap-2.5">
        <div className="w-40 h-[2px] bg-[#232630] rounded-full overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: totalDurationSec, ease: 'linear' }}
            className="h-full w-full bg-[#e87d2f] origin-left"
          />
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono-num text-slate-500">
          <span className={scene === 1 ? 'text-[#e87d2f] font-medium' : 'text-slate-500'}>
            01 Studio
          </span>
          <span aria-hidden="true">/</span>
          <span className={scene === 2 ? 'text-[#e87d2f] font-medium' : 'text-slate-500'}>
            02 Gift&apos;s Chuwi
          </span>
        </div>
      </div>
    </motion.div>
  );
};
