import { useEffect, useState } from 'react';
import { frameClock } from './frame-clock';
const listeners = new Set<(value: boolean) => void>();
export function setReducedMotion(value: boolean): void { frameClock.reducedMotion = value; for (const fn of listeners) fn(value); }
export function useReducedMotion(): boolean { const [value, set] = useState(frameClock.reducedMotion); useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []); return value; }
import { Platform } from '@amazon-devices/react-native-kepler';
import { NATIVE_IDLE_LOOPS_OFF } from './native-effects-policy';
import { diag } from './diag';
/** True when continuous idle loops are cut on native (see native-effects-policy.ts). */
export function idleLoopsOff(): boolean { return NATIVE_IDLE_LOOPS_OFF && Platform.OS !== 'web' && !diag.loopsOn; }
