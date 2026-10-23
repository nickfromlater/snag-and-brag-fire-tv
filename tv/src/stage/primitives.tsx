import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Image, Platform, StyleSheet, Text, View } from '@amazon-devices/react-native-kepler';
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from '@amazon-devices/react-native-kepler';
import { DARK_COLORS, OBJI, TOKENS, clamp } from '@snag/shared';
import type { FindView, TeamView } from '@snag/shared';
import qrcode from 'qrcode-generator';
import { Svg, Path, G, Reanimated, useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, withRepeat, withSequence, cancelAnimation, NativeEasing, Defs, Mask, SvgImage } from './platform';
import { bitmap, bitmapInfo } from './assets';
import { glyphCache } from './glyphs';
import { anchors, useSession, useTvView } from './context';
import { stackPose, renderPose, renderPoseSampler, transformMatrix } from './motion';
import { cachedMotionTable, motionTableSteps } from './motion-table';
import { DISABLE_NATIVE_BLUR_SHADOWS } from './native-effects-policy';
import { SampledGooglyEyes, useEyesEnabled } from './googly-eyes';
import type { EyeParentMotion, GooglyEyesProps } from './googly-eyes';
import { useReducedMotion } from './motion-settings';
import { memoryPhotos } from './memory-images';
import { registeredBounds } from './coordinates';
import { monitorWork } from './work-monitor';
import textRasters from './generated/text-rasters.json';
import { qrRaster } from './qr-raster';
import { diag } from './diag';
import { idleLoopsOff } from './motion-settings';

const ParentMotion=createContext<EyeParentMotion|null>(null);
export interface BoxProps {
  x?: number; y?: number; width?: number; height?: number; rotate?: number; opacity?: number;
  style?: StyleProp<ViewStyle>; children?: React.ReactNode; target?: string; testID?: string;
  anchor?: { x: number; y: number };
  /** Bound a title's entrance scale to the available stage width. */
  maxScale?: number;
}
export interface MotionProps extends BoxProps {
  target: string;
  /** Newly mounted celebration art starts its entrance after native attachment. */
  playOnAttach?: boolean;
  /** Containing block for percentage width/left/top; base bounds stay stable. */
  layoutWidth?: number; layoutHeight?: number;
  /** Absolute stage origin for an element inside another Motion/Box. */
  anchor?: { x: number; y: number };
}
export function Box({ x, y, width, height, rotate, opacity, style, children, target, anchor, testID }: BoxProps): React.ReactElement {
  useEffect(() => { if (target) { anchors.set(target, registeredBounds(x, y, width, height, anchor)); return () => { anchors.delete(target); }; } }, [target, x, y, width, height, anchor?.x, anchor?.y]);
  const flat = StyleSheet.flatten([{ position: 'absolute', left: x ?? 0, top: y ?? 0, width, height, opacity, transform: rotate === undefined ? undefined : [{ rotate: rotate + 'deg' }] }, style]);
  const clean = Object.fromEntries(Object.entries(flat).filter(([, value]) => value !== undefined)) as ViewStyle;
  return <View testID={testID} style={clean}>{children}</View>;
}
export function Stage({ children, onDisplay }: { children: React.ReactNode; onDisplay?(fields: Record<string, number | boolean>): void }): React.ReactElement {
  const [window, setWindow] = React.useState(Dimensions.get('window'));
  useEffect(() => { const s = Dimensions.addEventListener('change', e => setWindow(e.window)); return () => s.remove(); }, []);
  const scale = Math.min(window.width / 1280, window.height / 720);
  const pixelRatio = Math.max(1, window.scale);
  const width = 1280 * scale, height = 720 * scale;
  const letterboxed = Math.abs(1280 * scale - window.width) > .5 || Math.abs(720 * scale - window.height) > .5;
  useEffect(() => { onDisplay?.({ width: window.width, height: window.height, scale: pixelRatio, pixelWidth: Math.round(window.width * pixelRatio), pixelHeight: Math.round(window.height * pixelRatio), renderWidth: Math.round(width * pixelRatio), renderHeight: Math.round(height * pixelRatio) }); }, [window.width, window.height, pixelRatio, width, height, onDisplay]);
  return <View style={{ flex: 1, backgroundColor: letterboxed || Platform.OS === 'web' ? TOKENS.night : undefined, overflow: 'hidden' }}>
    <View collapsable={false} style={{ position: 'absolute', width: 1280, height: 720, left: (window.width - 1280) / 2, top: (window.height - 720) / 2, transform: [{ scale }] }}>{children}</View>
  </View>;
}
export function Label({ children, size = 20, color = TOKENS.ink, weight = 800, style, lines }: { children: React.ReactNode; size?: number; color?: string; weight?: 500 | 700 | 800 | 900; style?: StyleProp<TextStyle>; lines?: number }): React.ReactElement {
  const family = weight === 900 ? 'Rubik Black' : weight === 700 ? 'Rubik Bold' : weight === 500 ? 'Rubik Medium' : 'Rubik';
  return <Text numberOfLines={lines} style={[{ fontFamily: family, fontSize: Math.max(16, size), color, lineHeight: Math.max(16, size) * 1.22 }, style]}>{children}</Text>;
}
export function StrokedText({ text, size = 88, color = TOKENS.yolk, stroke = 10, shadow = 8, spacing = 1, width, align = 'left', contain = false, style }: { text: string; size?: number; color?: string; stroke?: number; shadow?: number; spacing?: number; width?: number; align?: 'left' | 'center' | 'right'; contain?: boolean; style?: StyleProp<ViewStyle> }): React.ReactElement {
  const shape = glyphCache.get(text, size, spacing), pad = stroke / 2 + 2, w = width ?? shape.width + pad * 2;
  const dx = align === 'center' ? (w - shape.width) / 2 : align === 'right' ? w - shape.width - pad : pad;
  // Font metrics match CSS Lilita line-height .9: glyphs start above the nominal box.
  const dy = size * .9 - shape.baseline;
  const outerWidth = contain ? w + pad : w, outerHeight = contain ? Math.max(size * .9, dy + shape.height + shadow + stroke) : size * .9;
  const raster = Platform.OS === 'web' ? undefined : (textRasters as Record<string, { id: string; width: number; height: number }>)[JSON.stringify([text, size, color, stroke, shadow, spacing])];
  if (raster) return <View testID={'clarity-type:' + size} accessibilityLabel={text} style={StyleSheet.flatten([{ width: outerWidth, height: outerHeight, overflow: 'visible' }, style])}><Image source={bitmap(raster.id)} resizeMode="stretch" style={{ position: 'absolute', left: dx - pad, top: dy, width: raster.width, height: raster.height }}/></View>;
  return <View testID={'clarity-type:' + size} accessibilityLabel={text} style={StyleSheet.flatten([{ width: outerWidth, height: outerHeight, overflow: 'visible' }, style])}><Svg width={w + pad} height={shape.height + shadow + stroke} style={{ position: 'absolute', top: dy }} viewBox={'0 0 ' + (w + pad) + ' ' + (shape.height + shadow + stroke)}>
    <G x={dx}><Path d={shape.d} fill={TOKENS.ink} stroke={TOKENS.ink} strokeWidth={stroke} strokeLinejoin="round" translateY={shadow} />
    <Path d={shape.d} fill={TOKENS.ink} stroke={TOKENS.ink} strokeWidth={stroke} strokeLinejoin="round" />
    <Path d={shape.d} fill={color} /></G>
  </Svg></View>;
}
export function Card({ children, fill = TOKENS.paper, border = 5, radius = 28, shadow = 10, shadowColor = TOKENS.ink, style, ...box }: BoxProps & { fill?: string; border?: number; radius?: number; shadow?: number; shadowColor?: string }): React.ReactElement {
  return <Box {...box} style={style}><View style={[StyleSheet.absoluteFill, { top: shadow, bottom: -shadow, borderRadius: radius, backgroundColor: shadowColor }]} /><View style={{ flex: 1, backgroundColor: fill, borderWidth: border, borderColor: TOKENS.ink, borderRadius: radius }}>{children}</View></Box>;
}
export function Pill({ text, fill = TOKENS.bubble, color = TOKENS.paper, size = 20, spacing = 3, width, height = 49, shadowColor, children, ...box }: BoxProps & { text?: string; fill?: string; color?: string; size?: number; spacing?: number; shadowColor?: string }): React.ReactElement {
  const w = width ?? (text?.length ?? 0) * size * .69 + 44;
  return <Card {...box} width={w} height={height} fill={fill} border={4} radius={999} shadow={6} shadowColor={shadowColor}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', paddingHorizontal: 12 }}>
    {text && <Label weight={900} size={size} color={color} style={{ letterSpacing: spacing }}>{text.toUpperCase()}</Label>}{children}
  </View></Card>;
}
export function Badge({ team, size = 44, border = size >= 40 ? 4 : 3, textSize, fontSize = Math.max(16, textSize ?? size * .4) }: { team: Pick<TeamView, 'color' | 'mono'>; size?: number; border?: number; fontSize?: number; textSize?: number }): React.ReactElement {
  return <View accessibilityLabel={'Team badge ' + team.mono} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: border, borderColor: TOKENS.ink, backgroundColor: team.color, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, top: -4, borderBottomWidth: 4, borderColor: 'rgba(0,0,0,.18)' }} />
    <View style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 2, borderColor: 'rgba(14,11,43,.35)', borderRadius: size / 2 }} />
    <Text style={{ fontFamily: 'Lilita One', fontSize, letterSpacing: .5, color: DARK_COLORS.has(team.color) ? TOKENS.paper : TOKENS.ink }}>{team.mono}</Text>
  </View>;
}
export function Bitmap({ id, x = 0, y = 0, scale = 1, width, height, style }: { id: string; x?: number; y?: number; scale?: number; width?: number; height?: number; style?: StyleProp<ImageStyle> }): React.ReactElement {
  const info = bitmapInfo[id], b = info?.logicalBounds ?? { x: 0, y: 0, width: width ?? 1280, height: height ?? 720 };
  return <Image accessibilityLabel={id.startsWith('props/crown-') ? 'Winner crown' : undefined} source={bitmap(id)} resizeMode="stretch" style={StyleSheet.flatten([{ position: 'absolute', left: x + b.x * scale, top: y + b.y * scale, width: width ?? b.width * scale, height: height ?? b.height * scale }, style])} />;
}
function LegacyMotion({ target, children, x = 0, y = 0, width = 120, height = 120, rotate = 0, opacity = 1, style, layoutWidth = width, layoutHeight = height, anchor, maxScale }: MotionProps): React.ReactElement {
  const reduced=useReducedMotion();
  const view = useTvView(), session = useSession(), states = view.motion[target] ?? [], progress = useRef(new Animated.Value(0)).current;
  const stateRef=useRef({states,at:session.clock.now(),paused:view.paused});stateRef.current={states,at:session.clock.now(),paused:view.paused};
  const parent=useMemo(()=>(offset=0)=>{const d=stateRef.current,p=stackPose(d.states,d.paused?0:session.clock.now()-d.at+offset*1000*((session.clock as {speed?:number}).speed??1),width,height);return {x:x+width/2+p.x,y:y+height/2+p.y,width:Math.max(20,width*Math.abs(p.sx))};},[x,y,width,height,session]);
  const last = states.filter(s => s.active).at(-1) ?? states.at(-1), key = states.map(s => s.startedAt + ':' + JSON.stringify(s.animation)).join('|') + ':' + view.paused + ':' + reduced;
  const table = useMemo(() => {
    const duration = Math.max(1, last?.durationMs ?? 1), first = last?.elapsedMs ?? 0;
    const base = states.map(s => ({ ...s, elapsedMs: s.elapsedMs - first }));
    const sample = renderPoseSampler(base, width, height, { width: layoutWidth, height: layoutHeight }, reduced, rotate);
    const values = Array.from({ length: 121 }, (_, i) => {
      const p = sample(duration * i / 120);
      if (maxScale) { const factor = Math.min(1, maxScale / Math.max(Math.abs(p.sx), Math.abs(p.sy), .001)); p.sx *= factor; p.sy *= factor; }
      if (Platform.OS !== 'web') p.sx *= Math.cos(p.rotationY * Math.PI / 180);
      return p;
    });
    return { values, duration, first, base };
  }, [key, width, height, layoutWidth, layoutHeight, maxScale]);
  useEffect(() => {
    if (!last) return;
    const elapsed = view.paused ? last.elapsedMs : session.clock.now() - last.startedAt;
    const total = table.duration, infinite = last.animation.iterations === 'infinite', repeats = infinite ? -1 : Math.max(0, last.animation.iterations as number - 1 - Math.floor(Math.max(0, elapsed) / total));
    const from = elapsed < 0 ? 0 : clamp(last.active ? elapsed % total / total : 1, 0, 1);
    progress.setValue(from);
    if (view.paused || !last.active) return;
    const timing = (duration: number) => Animated.timing(progress, { toValue: 1, duration: duration / ((session.clock as { speed?: number }).speed ?? 1), easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' });
    let animation: Animated.CompositeAnimation | undefined;
    const timer = setTimeout(() => {
      animation = timing(total * (1 - from));
      animation.start(({ finished }) => { if (finished && (infinite || repeats > 0)) { progress.setValue(0); animation = Animated.loop(timing(total), { iterations: repeats }); animation.start(); } });
    }, Math.max(0, -elapsed) / ((session.clock as { speed?: number }).speed ?? 1));
    return () => { clearTimeout(timer); animation?.stop(); progress.stopAnimation(); };
  }, [key]);
  const range = table.values.map((_, i) => i / 120), field = (k: 'x' | 'y' | 'sx' | 'sy' | 'rotation' | 'rotationY' | 'opacity') => progress.interpolate({ inputRange: range, outputRange: (table.values.map(p => k === 'rotation' || k === 'rotationY' ? p[k] + 'deg' : p[k]) as string[] | number[]), extrapolate: 'clamp' });
  const transforms = last ? [{ translateX: field('x') }, { translateY: field('y') }, { scaleX: field('sx') }, { scaleY: field('sy') }, { rotate: field('rotation') }, ...(Platform.OS === 'web' ? [{ rotateY: field('rotationY') }] : [])] : [{ rotate: rotate + 'deg' }];
  useEffect(() => {
    anchors.set(target, { x: anchor?.x ?? x, y: anchor?.y ?? y, width, height });
    return () => { anchors.delete(target); };
  }, [target, x, y, width, height, anchor?.x, anchor?.y]);
  return <Animated.View testID={target} style={[{ position: 'absolute', left: x, top: y, width, height, opacity: last ? field('opacity') : opacity, transform: transforms, overflow: 'visible' }, style]}><ParentMotion.Provider value={parent}>{children}</ParentMotion.Provider></Animated.View>;
}
/** Blurred shadows are dropped on native (native-effects-policy.ts); web keeps them. */
export const NATIVE_BLUR_SHADOWS_OFF = DISABLE_NATIVE_BLUR_SHADOWS && Platform.OS !== 'web';
export function Motion(props: MotionProps): React.ReactElement {
  const session = useSession(), view = useTvView();
  if (session.capture && view.paused && Platform.OS !== 'web') return <HeldMotion {...props}/>;
  return Platform.OS==='web'||diag.motionLegacy?<LegacyMotion {...props}/>:<NativeMotion {...props}/>;
}
/** An explicit director hold evaluates the same stack once, with no native
 * animation registration. Live games keep the existing motion drivers. */
function HeldMotion({ target, children, x = 0, y = 0, width = 120, height = 120, rotate = 0, opacity = 1, style, layoutWidth = width, layoutHeight = height, anchor, maxScale }: MotionProps): React.ReactElement {
  const view = useTvView(), reduced = useReducedMotion(), states = view.motion[target] ?? [];
  const p = renderPose(states, 0, width, height, { width: layoutWidth, height: layoutHeight }, reduced, rotate);
  if (maxScale) { const factor = Math.min(1, maxScale / Math.max(Math.abs(p.sx), Math.abs(p.sy), .001)); p.sx *= factor; p.sy *= factor; }
  p.sx *= Math.cos(p.rotationY * Math.PI / 180);
  useEffect(() => { anchors.set(target, { x: anchor?.x ?? x, y: anchor?.y ?? y, width, height }); return () => { anchors.delete(target); }; }, [target, x, y, width, height, anchor?.x, anchor?.y]);
  const parent = () => ({ x: x + width / 2 + p.x, y: y + height / 2 + p.y, width: Math.max(20, width * Math.abs(p.sx)) });
  return <View collapsable={false} style={[StyleSheet.flatten([{ position: 'absolute', left: x, top: y, width, height, overflow: 'visible' }, style]), { opacity: states.length ? p.opacity : opacity, transform: [{ matrix: transformMatrix(p.x, p.y, p.sx, p.sy, p.rotation) }] }]}><ParentMotion.Provider value={parent}>{children}</ParentMotion.Provider></View>;
}
function NativeMotion({target,children,x=0,y=0,width=120,height=120,rotate=0,opacity=1,style,layoutWidth=width,layoutHeight=height,anchor,maxScale,playOnAttach=false}: MotionProps): React.ReactElement {
  const reduced=useReducedMotion();
  const [laidOut,setLaidOut]=React.useState(false);
  const view=useTvView(), session=useSession(), states=view.motion[target]??[];
  const progress=useSharedValue(playOnAttach?0:1), attached=useRef<number>();
  const stateRef=useRef({states,at:session.clock.now(),paused:view.paused});stateRef.current={states,at:session.clock.now(),paused:view.paused};
  const parent=useMemo(()=>(offset=0)=>{const d=stateRef.current,p=stackPose(d.states,d.paused?0:session.clock.now()-d.at+offset*1000*((session.clock as {speed?:number}).speed??1),width,height);return {x:x+width/2+p.x,y:y+height/2+p.y,width:Math.max(20,width*Math.abs(p.sx))};},[x,y,width,height,session]);
  const last=states.filter(s=>s.active).at(-1)??states.at(-1);
  const key=states.map(s=>s.startedAt+':'+JSON.stringify(s.animation)).join('|')+':'+view.paused+':'+reduced;
  const table=useMemo(()=>{
    const duration=Math.max(1,last?.durationMs??1), first=last?.elapsedMs??0;
    const base=states.map(s=>({...s,elapsedMs:s.elapsedMs-first,active:playOnAttach?true:s.active}));
    // Tables depend only on relative timing, so repeated beats (every round, every team) reuse them.
    const cacheKey=JSON.stringify(base.map(s=>[s.animation,s.elapsedMs,s.durationMs,s.active]))+':'+[width,height,layoutWidth,layoutHeight,reduced,rotate,maxScale].join(',');
    return cachedMotionTable(cacheKey,()=>{
    const sample=renderPoseSampler(base,width,height,{width:layoutWidth,height:layoutHeight},reduced,rotate), steps=motionTableSteps(duration);
    return monitorWork('motion-table', () => Array.from({length:steps+1},(_,i)=>{
      const p=sample(duration*i/steps);
      if (maxScale) { const factor = Math.min(1, maxScale / Math.max(Math.abs(p.sx), Math.abs(p.sy), .001)); p.sx *= factor; p.sy *= factor; }
      p.sx*=Math.cos(p.rotationY*Math.PI/180);
      return p;
    }), target);
    });
  },[key,width,height,layoutWidth,layoutHeight,maxScale]);
  useEffect(()=>{
    if(!last||!laidOut)return;
    if(playOnAttach&&attached.current===undefined)attached.current=session.clock.now();
    const elapsed=view.paused?last.elapsedMs:session.clock.now()-(playOnAttach?attached.current!:last.startedAt), d=Math.max(1,last.durationMs), infinite=last.animation.iterations==='infinite';
    const ended=last.animation.iterations!=='infinite'&&elapsed>=d*(last.animation.iterations as number);
    const active=last.active||playOnAttach;
    const from=elapsed<0?0:active&&!ended?Math.min(1,elapsed%d/d):1, speed=(session.clock as {speed?:number}).speed??1;
    cancelAnimation(progress);progress.value=from;
    if(view.paused||!active||ended||(infinite&&idleLoopsOff()))return;
    const remaining=withTiming(1,{duration:(d*(1-from))/speed,easing:NativeEasing.linear});
    const repeats=infinite?-1:Math.max(0,(last.animation.iterations as number)-1-Math.floor(Math.max(0,elapsed)/d));
    const full=withRepeat(withSequence(withTiming(0,{duration:0}),withTiming(1,{duration:d/speed,easing:NativeEasing.linear})),repeats,false);
    progress.value=withDelay(Math.max(0,-elapsed)/speed,infinite||repeats>0?withSequence(remaining,full):remaining);
    return()=>cancelAnimation(progress);
  },[key,laidOut]);
  const hasStates=!!last;
  const animated=useAnimatedStyle(()=>{
    const n=table.length-1, t=Math.max(0,Math.min(1,progress.value))*n, i=Math.min(n-1,Math.floor(t)), f=t-i, a=table[i]!,b=table[i+1]!;
    const px=a.x+(b.x-a.x)*f,py=a.y+(b.y-a.y)*f,sx=a.sx+(b.sx-a.sx)*f,sy=a.sy+(b.sy-a.sy)*f;
    return {opacity:hasStates?a.opacity+(b.opacity-a.opacity)*f:opacity,transform:[{matrix:transformMatrix(px,py,sx,sy,hasStates?a.rotation+(b.rotation-a.rotation)*f:rotate)}]};
  });
  useEffect(()=>{anchors.set(target,{x:anchor?.x??x,y:anchor?.y??y,width,height});return()=>{anchors.delete(target);};},[target,x,y,width,height,anchor?.x,anchor?.y]);
  return <Reanimated.View collapsable={false} onLayout={()=>setLaidOut(true)} style={[StyleSheet.flatten([{position:'absolute',left:x,top:y,width,height,overflow:'visible'},style]),animated]}><ParentMotion.Provider value={parent}>{children}</ParentMotion.Provider></Reanimated.View>;
}
export function Spring({ children, name = 'pop', trigger, fromY = 0, fromRotate = 0, rotate = 0 }: { children: React.ReactNode; name?: 'pop' | 'soft' | 'wobble' | 'drop' | 'snap'; trigger: unknown; fromY?: number; fromRotate?: number; rotate?: number }): React.ReactElement {
  const value = useSharedValue(.3), presets = { pop: [320, 15], soft: [150, 18], wobble: [260, 8], drop: [200, 12], snap: [600, 28] }, p = presets[name]!;
  useEffect(() => { value.value = withSpring(1, { stiffness: p[0], damping: p[1] }); }, [trigger]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: fromY * (1 - (value.value - .3) / .7) }, { rotate: (fromRotate + (rotate - fromRotate) * (value.value - .3) / .7) + 'deg' }, { scale: value.value }] }));
  return <Reanimated.View style={style}>{children}</Reanimated.View>;
}
export function GooglyEyes(props: GooglyEyesProps): React.ReactElement {
  const inherited=useContext(ParentMotion);
  const enabled=useEyesEnabled();
  if(!enabled)return <></>;
  return <SampledGooglyEyes {...props} inherited={inherited}/>;
}
export function Sticker({ obj, size = 120, eyes, target, parentMotion }: { obj: string; size?: number; eyes?: FindView['eyes'] | false; target?: string; parentMotion?: (now: number) => { x: number; y: number } }): React.ReactElement {
  const pair = eyes === false ? undefined : eyes ?? OBJI[obj]?.eyes;
  return <View collapsable={false} style={{ width: size, height: size, overflow: 'visible' }}><Bitmap id={'stickers/' + obj + '-384'} scale={size / 120} />{pair && <GooglyEyes eyes={pair} size={size} target={target} parentMotion={parentMotion} />}</View>;
}
export function PhotoSticker({ photoId, size = 120, eyes, target, overlay, probePlain = false }: { photoId: string; size?: number; eyes?: FindView['eyes']; target?: string; overlay?: React.ReactNode; probePlain?: boolean }): React.ReactElement {
  const session = useSession(), url = session.photoUrl(photoId), masked = Platform.OS !== 'web' && !probePlain;
  const [uri, setUri] = React.useState<string | undefined>(() => url ? memoryPhotos.peek(url, masked) : undefined);
  const source = useMemo(() => uri ? { uri } : undefined, [uri]);
  const maskId=useRef('photo-mask-'+(++photoMaskSerial)).current;
  const maskSource = bitmap('photos/mask-384'), maskHref = Platform.OS === 'web' ? (maskSource as { uri: string }).uri : maskSource;
  useEffect(() => { let alive = true; setUri(url ? memoryPhotos.peek(url, masked) : undefined); if (url) void (masked ? memoryPhotos.loadMasked(url) : memoryPhotos.load(url)).then(value => { if (alive) { setUri(value); session.telemetry('photo-ready',{ready:true,bytes:value.length}); } }).catch(() => { if(alive)session.telemetry('photo-error',{pass:false}); }); return () => { alive = false; }; }, [url, masked]);
  return <View collapsable={false} style={{ width: size, height: size }}><Bitmap id="photos/shadow-384" scale={size / 120} />
    {uri && (probePlain ? <Image source={{uri}} resizeMode="cover" style={{position:'absolute',left:size/12,top:size/12,width:size*100/120,height:size*100/120}}/> : Platform.OS === 'web' ? <Svg width={size*200/120} height={size*225/120} viewBox="-40 -45 200 225" style={{position:'absolute',left:-size/3,top:-size*45/120}}><Defs><Mask id={maskId} x={-40} y={-45} width={200} height={225} maskUnits="userSpaceOnUse"><SvgImage href={maskHref} x={-40} y={-45} width={200} height={225}/></Mask></Defs><SvgImage href={uri} x={10} y={10} width={100} height={100} preserveAspectRatio="xMidYMid slice" mask={'url(#'+maskId+')'}/></Svg> : <Image source={source!} resizeMode="stretch" style={{position:'absolute',left:size/12,top:size/12,width:size*100/120,height:size*100/120}} onLoad={()=>session.telemetry('photo-decoded',{round:session.getView().round,ready:true})} onError={()=>session.telemetry('photo-error',{pass:false})}/>)}
    {uri && overlay}<Bitmap id="photos/overlay-384" scale={size / 120} />{eyes && <GooglyEyes eyes={eyes} size={size} target={target} />}
  </View>;
}
export function FindSticker({ find, size = 120, target, eyes = true, photoOverlay }: { find: FindView; size?: number; target?: string; eyes?: boolean; photoOverlay?: React.ReactNode }): React.ReactElement {
  return find.photoId ? <PhotoSticker photoId={find.photoId} size={size} eyes={eyes ? find.eyes : undefined} target={target} overlay={photoOverlay} /> : find.obj ? <Sticker obj={find.obj} size={size} eyes={eyes ? find.eyes : false} target={target} /> : <Label size={48}>?</Label>;
}
let photoMaskSerial=0;
const qrCache = new Map<string, { d: string; count: number }>();
export function qrMatrix(url: string): { d: string; count: number } {
  const old = qrCache.get(url); if (old) return old;
  const code = qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
  let d = ''; for (let y = 0; y < code.getModuleCount(); y++) for (let x = 0; x < code.getModuleCount(); x++) if (code.isDark(y, x)) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
  const result = { d, count: code.getModuleCount() + 8 }; qrCache.set(url, result);
  if (qrCache.size > 8) qrCache.delete(qrCache.keys().next().value!);
  return result;
}
export function QR({ url, size = 170, quietZone = 8 }: { url: string; size?: number; quietZone?: number }): React.ReactElement {
  if (Platform.OS !== 'web') return <View style={{ width: size, height: size, borderWidth: 4, borderRadius: 14, borderColor: TOKENS.ink, padding: quietZone, backgroundColor: '#FFFFFF' }}><Image source={{ uri: monitorWork('qr-raster', () => qrRaster(url)) }} resizeMode="stretch" style={{ width: size - 8 - quietZone * 2, height: size - 8 - quietZone * 2 }}/></View>;
  const code = qrMatrix(url);
  return <View style={{ width: size, height: size, borderWidth: 4, borderRadius: 14, borderColor: TOKENS.ink, padding: quietZone, backgroundColor: '#FFFFFF' }}><Svg width={size - 8 - quietZone * 2} height={size - 8 - quietZone * 2} viewBox={'0 0 ' + code.count + ' ' + code.count}><Path d={code.d} fill={TOKENS.ink} /></Svg></View>;
}
export function LogoBug(): React.ReactElement {
  return <Box x={30} y={18} width={183} height={54} rotate={-3}><Card width={183} height={54} border={4} radius={16} shadow={6} fill={TOKENS.yolk}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 9 }}><Text style={{ fontFamily: 'Lilita One', fontSize: 26, color: TOKENS.ink }}>SNAG<Text style={{ color: TOKENS.bubble }}>&amp;</Text>BRAG</Text></View>
  </Card><Card x={127} y={48} width={83} height={30} border={4} radius={9} shadow={4} fill={TOKENS.red} rotate={5}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TOKENS.paper }} /><Label size={16} weight={900} color={TOKENS.paper}>LIVE</Label></View></Card></Box>;
}
