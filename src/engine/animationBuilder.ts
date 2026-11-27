import * as THREE from 'three';
import type { UserKeyframe } from '../types/studio';

export function buildClipFromKeyframes(
  keyframes: UserKeyframe[],
  duration: number,
  clipName = 'Custom_Animation'
): THREE.AnimationClip | null {
  if (keyframes.length === 0) return null;

  // Group keyframes by targetUuid
  const byTarget = new Map<string, UserKeyframe[]>();
  for (const kf of keyframes) {
    const list = byTarget.get(kf.targetUuid) ?? [];
    list.push(kf);
    byTarget.set(kf.targetUuid, list);
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();

  for (const [uuid, rawList] of byTarget.entries()) {
    const sorted = [...rawList].sort((a, b) => a.time - b.time);
    // Deduplicate identical timestamps (keep last)
    const deduped: UserKeyframe[] = [];
    for (const item of sorted) {
      const prev = deduped[deduped.length - 1];
      if (prev && Math.abs(prev.time - item.time) < 0.001) {
        deduped[deduped.length - 1] = item;
      } else {
        deduped.push(item);
      }
    }

    // Ensure at least 2 points for smooth playback if only 1 keyframe exists
    if (deduped.length === 1) {
      deduped.push({ ...deduped[0], time: Math.max(duration, deduped[0].time + 0.1) });
    }

    const times: number[] = [];
    const posVals: number[] = [];
    const quatVals: number[] = [];
    const scaleVals: number[] = [];

    for (const kf of deduped) {
      times.push(kf.time);
      posVals.push(kf.position[0], kf.position[1], kf.position[2]);
      euler.set(kf.rotation[0], kf.rotation[1], kf.rotation[2], 'XYZ');
      q.setFromEuler(euler);
      quatVals.push(q.x, q.y, q.z, q.w);
      scaleVals.push(kf.scale[0], kf.scale[1], kf.scale[2]);
    }

    tracks.push(new THREE.VectorKeyframeTrack(`${uuid}.position`, times, posVals));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${uuid}.quaternion`, times, quatVals));
    tracks.push(new THREE.VectorKeyframeTrack(`${uuid}.scale`, times, scaleVals));
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip(clipName, duration, tracks);
}

export function getAnimatableNodes(root: THREE.Object3D | null): THREE.Object3D[] {
  if (!root) return [];
  const nodes: THREE.Object3D[] = [root];
  root.traverse((child) => {
    if (child !== root && (child instanceof THREE.Group || child instanceof THREE.Bone || child instanceof THREE.Mesh)) {
      if (child.name) {
        nodes.push(child);
      }
    }
  });
  return nodes;
}

export function createQuickMotionKeyframes(
  target: THREE.Object3D,
  preset: 'spin' | 'float' | 'bounce',
  duration: number
): UserKeyframe[] {
  const basePos: [number, number, number] = [target.position.x, target.position.y, target.position.z];
  const baseRot: [number, number, number] = [target.rotation.x, target.rotation.y, target.rotation.z];
  const baseScale: [number, number, number] = [target.scale.x, target.scale.y, target.scale.z];

  const makeKf = (
    tRatio: number,
    posOffset: [number, number, number],
    rotOffset: [number, number, number],
    scaleMult: [number, number, number] = [1, 1, 1]
  ): UserKeyframe => ({
    id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${tRatio}`,
    time: Number((tRatio * duration).toFixed(2)),
    targetUuid: target.uuid,
    targetName: target.name || 'Object',
    position: [
      basePos[0] + posOffset[0],
      basePos[1] + posOffset[1],
      basePos[2] + posOffset[2],
    ],
    rotation: [
      baseRot[0] + rotOffset[0],
      baseRot[1] + rotOffset[1],
      baseRot[2] + rotOffset[2],
    ],
    scale: [
      baseScale[0] * scaleMult[0],
      baseScale[1] * scaleMult[1],
      baseScale[2] * scaleMult[2],
    ],
  });

  if (preset === 'spin') {
    return [
      makeKf(0, [0, 0, 0], [0, 0, 0]),
      makeKf(0.25, [0, 0, 0], [0, Math.PI * 0.5, 0]),
      makeKf(0.5, [0, 0, 0], [0, Math.PI, 0]),
      makeKf(0.75, [0, 0, 0], [0, Math.PI * 1.5, 0]),
      makeKf(1, [0, 0, 0], [0, Math.PI * 2, 0]),
    ];
  }

  if (preset === 'float') {
    return [
      makeKf(0, [0, 0, 0], [0, 0, 0]),
      makeKf(0.25, [0, 0.35, 0], [0.06, 0.2, 0]),
      makeKf(0.5, [0, 0.5, 0], [0, 0.4, 0]),
      makeKf(0.75, [0, 0.25, 0], [-0.06, 0.2, 0]),
      makeKf(1, [0, 0, 0], [0, 0, 0]),
    ];
  }

  // bounce
  return [
    makeKf(0, [0, 0, 0], [0, 0, 0], [1, 1, 1]),
    makeKf(0.15, [0, 0, 0], [0, 0, 0], [1.12, 0.85, 1.12]),
    makeKf(0.45, [0, 0.9, 0], [0, 0, 0], [0.95, 1.08, 0.95]),
    makeKf(0.75, [0, 0, 0], [0, 0, 0], [1.14, 0.84, 1.14]),
    makeKf(1, [0, 0, 0], [0, 0, 0], [1, 1, 1]),
  ];
}
