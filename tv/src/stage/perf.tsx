import React, { useEffect, useState } from 'react';
import { View } from '@amazon-devices/react-native-kepler';
import { TOKENS } from '@snag/shared';
import { Label } from './primitives';
import { frameClock } from './frame-clock';
import { particleEngine } from './particles';
import { feedSlots } from './memory-images';
export function heapBytes(): number | undefined {
  try {
    const browser=(performance as unknown as {memory?:{usedJSHeapSize?:number}}).memory?.usedJSHeapSize;
    if(browser)return browser;
    const h=(globalThis as unknown as {HermesInternal?:{getInstrumentedStats?():Record<string,number>}}).HermesInternal?.getInstrumentedStats?.();
    return h?.js_allocatedBytes??h?.hermes_allocatedBytes??h?.js_heapSize;
  } catch { return; }
}
export function PerfHud(): React.ReactElement {
  const [fps, setFps] = useState(0),[memory,setMemory]=useState<number>();
  useEffect(() => { const timer = setInterval(() => {setFps(frameClock.fps);setMemory(heapBytes());}, 1000); return () => clearInterval(timer); }, []);
  return <View style={{ position: 'absolute', left: 16, top: 96, width: 360, padding: 12, borderWidth: 3, borderColor: TOKENS.yolk, borderRadius: 12, backgroundColor: TOKENS.ink }}><Label size={16} color={TOKENS.yolk}>JS render callbacks: {fps.toFixed(1)}/s</Label><Label size={16} color={TOKENS.paper}>Particles: {particleEngine.particles.length}/300</Label><Label size={16} color={TOKENS.paper}>Feed bytes: {feedSlots.bytes}</Label><Label size={16} color={TOKENS.paper}>Heap: {memory ? (memory / 1048576).toFixed(1) + ' MiB' : 'native RSS via control tool'}</Label></View>;
}
