import { useEffect, useState } from 'react';

export type PowerMode = 'auto' | 'performance' | 'eco';

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

export interface BatteryPowerState {
  batteryLevel: number | null; // 0..100
  charging: boolean;
  supported: boolean;
  isCriticalBattery: boolean; // <= 5% and not charging
  isLowBattery: boolean; // <= 15% and not charging
  ecoActive: boolean;
}

export function useBatteryPower(powerMode: PowerMode): BatteryPowerState {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [charging, setCharging] = useState(true);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManagerLike>;
    };
    if (typeof nav.getBattery !== 'function') {
      return;
    }

    let battery: BatteryManagerLike | null = null;
    let active = true;

    const sync = () => {
      if (!active || !battery) return;
      setBatteryLevel(Math.round(battery.level * 100));
      setCharging(Boolean(battery.charging));
    };

    nav
      .getBattery()
      .then((bat) => {
        if (!active) return;
        battery = bat;
        setSupported(true);
        sync();
        bat.addEventListener('levelchange', sync);
        bat.addEventListener('chargingchange', sync);
      })
      .catch(() => {
        // Battery API unavailable/blocked
      });

    return () => {
      active = false;
      if (battery) {
        battery.removeEventListener('levelchange', sync);
        battery.removeEventListener('chargingchange', sync);
      }
    };
  }, []);

  const isCriticalBattery = batteryLevel !== null && !charging && batteryLevel <= 5;
  const isLowBattery = batteryLevel !== null && !charging && batteryLevel <= 15;

  const ecoActive =
    powerMode === 'eco' ? true : powerMode === 'performance' ? false : isLowBattery;

  return {
    batteryLevel,
    charging,
    supported,
    isCriticalBattery,
    isLowBattery,
    ecoActive,
  };
}
