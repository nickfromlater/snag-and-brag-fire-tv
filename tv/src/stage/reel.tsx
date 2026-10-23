import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from '@amazon-devices/react-native-kepler';
import { TOKENS } from '@snag/shared';
import type { PromptView } from '@snag/shared';
import { Card, Label, StrokedText } from './primitives';
import { useSession, useTvView } from './context';
import { reelOffset } from './display-math';
export function Reel({ cards, landed, beatAt, spacious = false }: { cards: PromptView[]; landed: boolean; beatAt: number; spacious?: boolean }): React.ReactElement {
  const session = useSession(), view = useTvView(), progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const duration = 2400, elapsed = Math.max(0, session.clock.now() - beatAt);
    progress.setValue(landed ? 1 : Math.min(1, elapsed / duration));
    if (landed || view.paused) return;
    const a = Animated.timing(progress, { toValue: 1, duration: Math.max(0, duration - elapsed) / ((session.clock as { speed?: number }).speed ?? 1), easing: Easing.linear, useNativeDriver: true });
    a.start(); return () => { a.stop(); progress.stopAnimation(); };
  }, [cards.length, landed, beatAt, view.paused]);
  const y = progress.interpolate({ inputRange: Array.from({ length: 121 }, (_, i) => i / 120), outputRange: Array.from({ length: 121 }, (_, i) => reelOffset(cards.length, i * 20)), extrapolate: 'clamp' });
  return <Card width={980} height={330}><View style={{ flex: 1, overflow: 'hidden', borderRadius: 23 }}>
    <Animated.View style={{ transform: [{ translateY: y }] }}>{cards.map((p, i) => <View key={i} style={{ height: 320, justifyContent: 'center', alignItems: 'center', gap: spacious ? 16 : 4 }}>
      <Label size={spacious ? 43 : 30} weight={900} color="#4B4470" style={{ letterSpacing: 3, lineHeight: spacious ? 50 : 36 }}>{p.a.toUpperCase()}</Label>
      <View style={{ width: 940, height: spacious ? 160 : 124 }}><StrokedText contain={spacious} text={p.b} size={124} color={p.col} stroke={10} shadow={8} spacing={0} width={940} align="center" /></View>
      <Label size={spacious ? 24 : 30} weight={900} color="#4B4470" style={{ letterSpacing: 3, lineHeight: spacious ? 30 : 36 }}>{p.c.toUpperCase()}</Label>
    </View>)}</Animated.View>
    {[0, 1].map(edge => <View key={edge} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: edge ? undefined : 0, bottom: edge ? 0 : undefined, height: 70 }}>
      {Array.from({ length: 14 }, (_, i) => <View key={i} style={{ position: 'absolute', top: i * 5, left: 0, right: 0, height: 5, backgroundColor: TOKENS.paper, opacity: edge ? (i + .5) / 14 : 1 - (i + .5) / 14 }} />)}
    </View>)}
  </View></Card>;
}
