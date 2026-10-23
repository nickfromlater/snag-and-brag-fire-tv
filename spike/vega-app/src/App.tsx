import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTVEventHandler } from '@amazon-devices/react-native-kepler';
import Svg, { Defs, Path, RadialGradient, Rect, Stop, Text as SvgText } from '@amazon-devices/react-native-svg';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from '@amazon-devices/react-native-reanimated';
import { useFonts } from '@amazon-devices/expo-font';
import { AudioPlayer } from '@amazon-devices/react-native-w3cmedia';
import { encode } from 'base-64';
import qrcode from 'qrcode-generator';
import { stickers } from './stickers';
import titlePath from './assets/title-path.json';
import { GLStage } from './GLStage';
type Case = {
  name: string;
  particles: number;
  sprites: number;
  rays: boolean;
  thumbs: boolean;
  gl?: boolean;
};
const cases: Case[] = [{
  name: 'baseline',
  particles: 0,
  sprites: 0,
  rays: false,
  thumbs: false
}, {
  name: 'rays',
  particles: 0,
  sprites: 0,
  rays: true,
  thumbs: false
}, {
  name: 'particles300',
  particles: 300,
  sprites: 0,
  rays: false,
  thumbs: false
}, {
  name: 'sprites20',
  particles: 0,
  sprites: 20,
  rays: false,
  thumbs: false
}, {
  name: 'full20',
  particles: 300,
  sprites: 20,
  rays: true,
  thumbs: true
}, {
  name: 'full40',
  particles: 300,
  sprites: 40,
  rays: true,
  thumbs: true
}, {
  name: 'gl20',
  particles: 300,
  sprites: 20,
  rays: true,
  thumbs: true,
  gl: true
}, {
  name: 'gl40',
  particles: 300,
  sprites: 40,
  rays: true,
  thumbs: true,
  gl: true
}];
const ink = '#0E0B2B',
  paper = '#FFF8EC',
  colors = ['#FF4FA0', '#FFD43B', '#B8F23B', '#3FE0D0'];
const binaryProbe = [0, 1, 2, 127, 128, 254, 255];
const signals = ['/pkg/assets/raw/music.mp3', '/pkg/assets/raw/sfx1.mp3', '/pkg/assets/raw/sfx2.mp3', '/pkg/assets/raw/sfx3.mp3'];
function percentile(values: number[], q: number) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
}
const code = qrcode(0, 'M');
code.addData('https://snagbrag.example/spike/K7QF');
code.make();
let qrPath = '';
for (let y = 0; y < code.getModuleCount(); y++) for (let x = 0; x < code.getModuleCount(); x++) if (code.isDark(y, x)) qrPath += `M${x + 4} ${y + 4}h1v1h-1z`;
const qrSize = code.getModuleCount() + 8;
const rays = Array.from({
  length: 18
}, (_, i) => {
  const a = i * Math.PI * 2 / 18,
    b = a + Math.PI / 18;
  return `M640 300L${640 + 1500 * Math.cos(a)} ${300 + 1500 * Math.sin(a)}L${640 + 1500 * Math.cos(b)} ${300 + 1500 * Math.sin(b)}Z`;
});
const grid = Array.from({
  length: 17
}, (_, i) => `M640 496L${-640 + i * 160} 720`).join('') + Array.from({
  length: 8
}, (_, i) => `M0 ${496 + 224 * (i / 7) ** 2}H1280`).join('');
export const App = () => {
  const [fontsLoaded, fontError] = useFonts({
    'Lilita One': require('./assets/fonts/Lilita One.ttf'),
    Rubik: require('./assets/fonts/Rubik.ttf')
  });
  const [testCase, setCase] = useState(cases[4]),
    active = useRef(testCase);
  active.current = testCase;
  const [stats, setStats] = useState({
    fps: 0,
    p95: 0,
    jpegReceived: 0,
    jpegDrawn: 0,
    ws: 'connecting',
    audio: 'idle'
  });
  const [thumbs, setThumbs] = useState<(string | null)[]>([null, null, null, null]);
  const [keys, setKeys] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [spriteLoads, setSpriteLoads] = useState(0),
    [focused, setFocused] = useState(false);
  const socket = useRef<WebSocket | null>(null),
    paths = useRef<any[]>([]),
    mounted = useRef(true);
  const counters = useRef({
    jpegReceived: 0,
    jpegDrawn: 0,
    ws: 'connecting',
    audio: 'idle'
  });
  const players = useRef<AudioPlayer[]>([]),
    clock = useRef(new Animated.Value(0)).current;
  const scale = useSharedValue(1),
    springStyle = useAnimatedStyle(() => ({
      transform: [{
        scale: scale.value
      }]
    }));
  function emit(kind: string, data: Record<string, unknown> = {}) {
    const record = {
      kind,
      t: Math.round(performance.now()),
      ...data
    };
    console.log('[SPIKE]', JSON.stringify(record));
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(record));
  }
  function spring() {
    scale.value = withSpring(scale.value > 1.01 ? 1 : 1.45, {
      stiffness: 320,
      damping: 15
    });
    emit('spring', {
      stiffness: 320,
      damping: 15
    });
  }
  useTVEventHandler((event: any) => {
    if (event.eventKeyAction !== undefined && event.eventKeyAction !== 0) return;
    const type = event.eventType;
    setKeys(previous => [type, ...previous].slice(0, 8));
    emit('key', {
      type
    });
    if (type === 'playpause') setConfirm(x => !x);
    if (type === 'skip_forward') setCase(cases[(cases.indexOf(active.current) + 1) % cases.length]);
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setConfirm(true);
      emit('back-intercepted');
      return true;
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    emit('font', {
      loaded: fontsLoaded,
      error: fontError?.message || null
    });
  }, [fontsLoaded, fontError]);
  async function playAudio() {
    if (players.current.length) {
      players.current.slice(1).forEach(p => {
        p.currentTime = 0;
        p.play();
      });
      emit('audio-retrigger');
      return;
    }
    counters.current.audio = 'initializing';
    try {
      for (let i = 0; i < signals.length; i++) {
        const player = new AudioPlayer();
        players.current.push(player);
        await player.initialize();
        player.addEventListener('error', () => {
          counters.current.audio = 'error';
          emit('audio-error', {
            index: i,
            error: player.error
          });
        });
        player.addEventListener('playing', () => emit('audio-playing', {
          index: i,
          currentTime: player.currentTime
        }));
        player.addEventListener('ended', () => emit('audio-ended', {
          index: i,
          currentTime: player.currentTime
        }));
        const uri = signals[i];
        player.src = uri;
        player.autoplay = false;
        player.loop = i === 0;
        player.load();
        emit('audio-ready', {
          index: i,
          uri: player.src
        });
      }
      setTimeout(() => {
        const start = performance.now();
        players.current.forEach(p => p.play());
        emit('audio-trigger', {
          players: 4,
          apiCallMs: performance.now() - start
        });
        const poll = setInterval(() => {
          const state = players.current.map((p, i) => ({
            index: i,
            paused: p.paused,
            time: p.currentTime,
            duration: p.duration,
            readyState: p.readyState
          }));
          const overlap = state.every(p => !p.paused && p.time > 0 && p.time < 1);
          if (overlap) counters.current.audio = '4 advancing';
          emit('audio-state', {
            state,
            overlap
          });
        }, 100);
        setTimeout(() => {
          clearInterval(poll);
          emit('audio-loop-check', {
            time: players.current[0].currentTime,
            loop: players.current[0].loop,
            paused: players.current[0].paused
          });
        }, 6000);
      }, 2000);
    } catch (error) {
      counters.current.audio = 'error';
      emit('audio-exception', {
        error: String(error)
      });
    }
  }
  useEffect(() => {
    mounted.current = true;
    const animation = Animated.loop(Animated.timing(clock, {
      toValue: 1,
      duration: 30000,
      useNativeDriver: true
    }));
    animation.start();
    let reconnect: ReturnType<typeof setTimeout>;
    function connect() {
      const ws = new WebSocket('ws://127.0.0.1:7071');
      socket.current = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        counters.current.ws = 'connected';
        emit('ws-open');
        ws.send('text-echo-probe');
        ws.send(new Uint8Array(binaryProbe).buffer);
      };
      ws.onmessage = (event: any) => {
        if (typeof event.data === 'string') {
          if (event.data === 'text-echo-probe') {
            emit('ws-text-pass');
            return;
          }
          try {
            const command = JSON.parse(event.data);
            if (command.command === 'case') {
              const next = cases.find(x => x.name === command.name);
              if (next) {
                setCase(next);
                emit('case-start', {
                  name: next.name
                });
              }
            }
            if (command.command === 'audio') void playAudio();
            if (command.command === 'spring') spring();
            if (command.command === 'snapshot') emit('state', {
              ...counters.current,
              case: active.current.name
            });
          } catch (error) {
            emit('command-error', {
              error: String(error)
            });
          }
          return;
        }
        const bytes = new Uint8Array(event.data);
        if (bytes.length === binaryProbe.length) {
          emit('ws-binary-pass', {
            pass: binaryProbe.every((v, i) => v === bytes[i]),
            type: Object.prototype.toString.call(event.data),
            bytes: bytes.length
          });
          return;
        }
        if (bytes.length > 10 && bytes[0] === 83 && bytes[1] === 66 && active.current.thumbs) {
          let value = '';
          for (let i = 8; i < bytes.length; i++) value += String.fromCharCode(bytes[i]);
          counters.current.jpegReceived++;
          const uri = 'data:image/jpeg;base64,' + encode(value),
            tile = bytes[2];
          setThumbs(previous => previous.map((old, i) => i === tile ? uri : old));
        }
      };
      ws.onerror = () => {
        counters.current.ws = 'error';
      };
      ws.onclose = () => {
        counters.current.ws = 'disconnected';
        if (mounted.current) reconnect = setTimeout(connect, 1000);
      };
    }
    connect();
    return () => {
      mounted.current = false;
      clearTimeout(reconnect);
      animation.stop();
      socket.current?.close();
      players.current.forEach(p => {
        p.pause();
        void p.deinitialize();
      });
    };
  }, []);
  useEffect(() => {
    let raf = 0,
      last = performance.now(),
      start = last,
      frames = 0,
      sample = 0;
    let intervals: number[] = [];
    function tick(timestamp?: number) {
      const now = performance.now();
      if (frames === 0 && sample === 0) emit('raf-probe', {
        timestampType: typeof timestamp,
        timestamp
      });
      const dt = now - last;
      last = now;
      frames++;
      intervals.push(dt);
      if (active.current.particles && !active.current.gl) {
        try {
          const groups = ['', '', '', ''];
          for (let i = 0; i < active.current.particles; i++) {
            const x = (i * 73.7 + now * (.012 + i % 7 * .003)) % 1280,
              y = 150 + (i * 37.3 + now * (.018 + i % 5 * .002)) % 560,
              size = 3 + i % 5;
            groups[i % 4] += `M${x.toFixed(1)} ${y.toFixed(1)}h${size}v${size}h-${size}Z`;
          }
          groups.forEach((d, i) => paths.current[i]?.setNativeProps({
            d
          }));
        } catch (error) {
          emit('particle-error', {
            error: String(error)
          });
        }
      }
      if (now - start >= 2000) {
        const report = {
          case: testCase.name,
          clock: 'JS rAF handler-entry performance.now',
          sample: ++sample,
          seconds: (now - start) / 1000,
          frames,
          fps: frames * 1000 / (now - start),
          p50: percentile(intervals, .5),
          p95: percentile(intervals, .95),
          p99: percentile(intervals, .99),
          ...counters.current
        };
        setStats({
          fps: report.fps,
          p95: report.p95,
          ...counters.current
        });
        emit('perf', report);
        frames = 0;
        intervals = [];
        start = now;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    emit('case-start', {
      name: testCase.name
    });
    return () => cancelAnimationFrame(raf);
  }, [testCase]);
  const window = Dimensions.get('window'),
    factor = Math.min(window.width / 1280, window.height / 720);
  return <View style={styles.screen}><View style={[styles.stage, {
      left: (window.width - 1280) / 2,
      top: (window.height - 720) / 2,
      transform: [{
        scale: factor
      }]
    }]}>
    {testCase.gl && <GLStage particles={testCase.particles} />}
    {testCase.rays && !testCase.gl && <Animated.View style={[StyleSheet.absoluteFill, {
        transform: [{
          rotate: clock.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg']
          })
        }]
      }]}><Svg width={1280} height={720} viewBox="0 0 1280 720">{rays.map((d, i) => <Path key={i} d={d} fill={i % 2 ? '#4966FF' : '#3B50FF'} />)}</Svg></Animated.View>}
    {!testCase.gl && <Svg width={1280} height={720} style={StyleSheet.absoluteFill} viewBox="0 0 1280 720"><Defs><RadialGradient id="glow" cx="50%" cy="35%" rx="65%" ry="80%"><Stop offset="0" stopColor="#759AFF" stopOpacity=".4" /><Stop offset="1" stopColor="#2B3BFF" stopOpacity="0" /></RadialGradient></Defs><Rect width={1280} height={720} fill="url(#glow)" /><Path d="M0 496H1280V720H0Z" fill="#1E239B" /><Path d={grid} stroke="#6572FF" strokeWidth={2} fill="none" /><Path d="M210 200L0 720H530Z M1010 200L760 720H1280Z" fill={paper} opacity={.08} />{colors.map((fill, i) => <Path key={fill} ref={ref => {
          paths.current[i] = ref;
        }} d="M0 0" fill={fill} />)}</Svg>}
    {Array.from({
        length: testCase.sprites
      }, (_, i) => <Animated.Image key={i} source={stickers[i % stickers.length]} resizeMode="contain" onLoad={() => setSpriteLoads(n => n + 1)} style={{
        position: 'absolute',
        width: 76,
        height: 76,
        left: 32 + i % 10 * 122,
        top: 176 + Math.floor(i / 10) * 72,
        transform: [{
          rotate: clock.interpolate({
            inputRange: [0, .5, 1],
            outputRange: [`${i % 2 ? -25 : 25}deg`, `${i % 2 ? 25 : -25}deg`, `${i % 2 ? -25 : 25}deg`]
          })
        }]
      }} />)}
    <Svg width={1000} height={145} style={{
        position: 'absolute',
        left: 35,
        top: 12
      }}><Path d={titlePath.d} fill={ink} stroke={ink} strokeWidth={12} strokeLinejoin="round" /><Path d={titlePath.d} fill="#FFD43B" /></Svg>
    <Text style={[styles.subtitle, {
        fontFamily: fontsLoaded ? 'Rubik' : undefined
      }]}>NATIVE VEGA SPIKE · {testCase.name.toUpperCase()} · 1280 × 720 → {window.width} × {window.height}</Text>
    <View style={styles.qr}><Svg width={116} height={116} viewBox={`0 0 ${qrSize} ${qrSize}`}><Rect width={qrSize} height={qrSize} fill="white" /><Path d={qrPath} fill={ink} /></Svg><Text style={styles.qrLabel}>PURE TS QR</Text></View>
    <View style={styles.thumbs}>{thumbs.map((uri, i) => <View key={i} style={[styles.tile, {
          borderColor: colors[i]
        }]}>{uri && <Image source={{
            uri
          }} resizeMode="stretch" onLoad={() => {
            counters.current.jpegDrawn++;
          }} onError={e => emit('jpeg-error', {
            error: e.nativeEvent.error
          })} style={{
            width: 142,
            height: 88
          }} />}<Text style={styles.tileLabel}>CAM {i + 1} · 96 × 64 / 3 Hz</Text></View>)}</View>
    <Reanimated.View style={[styles.spring, springStyle]}><Image source={stickers[0]} style={{
          width: 96,
          height: 96
        }} /><Text style={[styles.springLabel, {
          fontFamily: fontsLoaded ? 'Lilita One' : undefined
        }]}>SPRING 320 / 15</Text></Reanimated.View>
    <View style={styles.status}><Text style={styles.statusTitle}>{stats.fps.toFixed(1)} JS updates/s · p95 {stats.p95.toFixed(1)} ms</Text><Text style={styles.statusText}>{testCase.particles} particles · {testCase.sprites} PNG sprites · {spriteLoads} loads</Text><Text style={styles.statusText}>Fonts: {fontsLoaded ? 'Lilita One + Rubik loaded' : fontError?.message || 'loading'} · WS: {stats.ws}</Text><Text style={styles.statusText}>JPEG: {stats.jpegReceived} received / {stats.jpegDrawn} decoded · Audio: {stats.audio}</Text><Text style={styles.statusText}>Keys: {keys.join(' → ') || 'waiting for inputd events'}</Text></View>
    <Pressable hasTVPreferredFocus onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={spring} style={[styles.button, focused && {
        borderColor: '#FFD43B'
      }]}><Text style={styles.buttonText}>SELECT: SPRING · FF: NEXT CASE · BACK: CONFIRM</Text></Pressable>
    {confirm && <View style={styles.overlay}><Text style={[styles.confirmTitle, {
          fontFamily: fontsLoaded ? 'Lilita One' : undefined
        }]}>BACK WAS INTERCEPTED</Text><Text style={styles.confirmCopy}>The native app is still running. Select Resume to close this confirm.</Text><Pressable hasTVPreferredFocus onPress={() => setConfirm(false)} style={styles.resume}><Text style={styles.buttonText}>RESUME</Text></Pressable></View>}
  </View></View>;
};
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ink
  },
  stage: {
    position: 'absolute',
    width: 1280,
    height: 720,
    backgroundColor: '#2B3BFF',
    overflow: 'hidden'
  },
  subtitle: {
    position: 'absolute',
    left: 46,
    top: 124,
    color: paper,
    fontSize: 18
  },
  qr: {
    position: 'absolute',
    right: 22,
    top: 18,
    padding: 6,
    backgroundColor: paper,
    borderRadius: 10
  },
  qrLabel: {
    fontSize: 14,
    textAlign: 'center',
    color: ink,
    fontWeight: 'bold'
  },
  thumbs: {
    position: 'absolute',
    left: 40,
    top: 485,
    flexDirection: 'row',
    gap: 14
  },
  tile: {
    borderWidth: 4,
    backgroundColor: ink,
    borderRadius: 12,
    overflow: 'hidden',
    width: 150,
    height: 117
  },
  tileLabel: {
    fontSize: 13,
    color: paper,
    textAlign: 'center'
  },
  spring: {
    position: 'absolute',
    right: 47,
    top: 420,
    width: 150,
    alignItems: 'center'
  },
  springLabel: {
    color: '#FFD43B',
    fontSize: 18
  },
  status: {
    position: 'absolute',
    left: 42,
    top: 610,
    width: 1100
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFD43B'
  },
  statusText: {
    fontSize: 15,
    color: paper
  },
  button: {
    position: 'absolute',
    left: 680,
    top: 548,
    width: 540,
    padding: 12,
    borderWidth: 4,
    borderColor: ink,
    backgroundColor: paper,
    borderRadius: 14
  },
  buttonText: {
    color: ink,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  overlay: {
    position: 'absolute',
    left: 240,
    top: 230,
    width: 800,
    padding: 38,
    backgroundColor: paper,
    borderWidth: 8,
    borderColor: ink,
    borderRadius: 28
  },
  confirmTitle: {
    color: ink,
    fontSize: 44,
    textAlign: 'center'
  },
  confirmCopy: {
    color: ink,
    fontSize: 20,
    marginTop: 16,
    textAlign: 'center'
  },
  resume: {
    padding: 20,
    backgroundColor: '#FFD43B',
    borderWidth: 4,
    borderColor: ink,
    borderRadius: 16,
    marginTop: 24
  }
});
