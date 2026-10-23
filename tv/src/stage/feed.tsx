import React, { useEffect, useState } from 'react';
import { Dimensions, Image, Platform, View } from '@amazon-devices/react-native-kepler';
import jpeg from 'jpeg-js';
import { TOKENS } from '@snag/shared';
import { Label } from './primitives';
import { base64, feedSlots, isPng } from './memory-images';
import { pixelatedPng } from './pixel-raster';
import { monitorWork } from './work-monitor';
const listeners = new Map<number, (bytes: Uint8Array) => void>();
export function acceptThumbnail(index: number, bytes: Uint8Array): void {
  const next = feedSlots.submit(index, bytes); if (next) listeners.get(index)?.(next);
}
export function FeedImage({ index, width = 274, height = 172, label = 'Hunting…', raw = false }: { index: number; width?: number; height?: number; label?: string; raw?: boolean }): React.ReactElement {
  const [uri, setUri] = useState<string>();
  useEffect(() => {
    const show = (bytes: Uint8Array) => {
      if (isPng(bytes)) { setUri('data:image/png;base64,' + monitorWork('feed-base64', () => base64(bytes))); return; }
      if (Platform.OS === 'web') { setUri('data:image/jpeg;base64,' + base64(bytes)); return; }
      try {
        const decoded = monitorWork('feed-jpeg', () => jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: .066, maxMemoryUsageInMB: 4 }));
        const window = Dimensions.get('window'), scale = Math.min(window.width / 1280, window.height / 720) * window.scale;
        const w = Math.max(1, Math.min(768, Math.round((width - (raw ? 0 : 10)) * scale)));
        const h = Math.max(1, Math.min(512, Math.round((height - (raw ? 0 : 10)) * scale)));
        const png = monitorWork('feed-png', () => pixelatedPng(decoded.data, decoded.width, decoded.height, w, h));
        setUri('data:image/png;base64,' + monitorWork('feed-base64', () => base64(png)));
      } catch {
        // Keep the previous frame, release the decode slot, and try the newest pending frame.
        const next = feedSlots.loaded(index); if (next) show(next);
      }
    }; listeners.set(index, show);
    if (feedSlots.slots[index]?.current) show(feedSlots.slots[index]!.current!);
    return () => { listeners.delete(index); feedSlots.clear(index); };
  }, [index, width, height, raw]);
  return <View style={{ width, height, borderRadius: raw ? 0 : 26, borderWidth: raw ? 0 : 5, borderColor: TOKENS.ink, overflow: 'hidden', backgroundColor: TOKENS.night }}>
    {uri && <Image source={{ uri, cache: 'reload' }} resizeMode="cover" resizeMethod="scale" style={[{ position: 'absolute', width: width - (raw ? 0 : 10), height: height - (raw ? 0 : 10) }, Platform.OS === 'web' ? { imageRendering: 'pixelated' } as never : {}]} onLoad={() => { const next = feedSlots.loaded(index); if (next) listeners.get(index)?.(next); }} onError={() => { const next = feedSlots.loaded(index); if (next) listeners.get(index)?.(next); }} />}
    {!raw && <><View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8, backgroundColor: 'rgba(10,14,74,.7)', padding: 6, borderRadius: 8 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: TOKENS.red, marginTop: 5 }} /><Label size={16} weight={900} color={TOKENS.paper}>CAM {index + 1} · REC</Label></View>
    <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: TOKENS.paper, padding: 6, borderRadius: 10 }}><Label size={16} weight={900} lines={1}>{label}</Label></View></>}
  </View>;
}
