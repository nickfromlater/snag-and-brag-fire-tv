import React from 'react';
import { Platform } from '@amazon-devices/react-native-kepler';
import { Image as RasterImage } from '@amazon-devices/react-native-svg';
import { svgImageSource } from './svg-image-source';
export { default as Svg, Path, Circle, Ellipse, Rect, G, Defs, ClipPath, Mask, LinearGradient, Stop } from '@amazon-devices/react-native-svg';
export function SvgImage(props: React.ComponentProps<typeof RasterImage>): React.ReactElement {
  return React.createElement(RasterImage, { ...props, href: svgImageSource(props.href, Platform.OS === 'web') });
}
export { useTVEventHandler, FocusManager, TVFocusGuideView } from '@amazon-devices/react-native-kepler';
export { default as Reanimated, useSharedValue, useAnimatedStyle, useAnimatedProps, withSpring, withTiming, withDelay, withRepeat, withSequence, cancelAnimation, Easing as NativeEasing } from '@amazon-devices/react-native-reanimated';
export { useFonts } from '@amazon-devices/expo-font';
export { AudioPlayer, MediaSource } from '@amazon-devices/react-native-w3cmedia';
export type { SourceBuffer } from '@amazon-devices/react-native-w3cmedia';
