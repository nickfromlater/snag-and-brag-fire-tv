import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Background, CaptureBackground, Benchmark, Box, CuePlayer, Host, Hud, Label, ParticleField, PerfHud, Remote, Stage, StageProvider, Ticker, useFonts, fonts, useTvView, useSession, cueControls, Bitmap, observeExceptions, releaseGraphicsMemory, FixtureView, EyeProbe, setEyesEnabled, Layout as View } from './stage';
import { TOKENS } from '@snag/shared';
import type { Mood } from '@snag/shared';
import { TvSession } from './runtime/session';
import { config } from './config';
import { SceneRegistry } from './scenes';
import { PhotoProbe } from './stage/photo-probe';
import { MediaTransport } from './stage';
import type { PhotoProbeMode } from './stage/photo-probe';
import { FrameDebugHud } from './stage/frame-debug';
import { foregroundUpdate } from './runtime/foreground';
import { releaseBackdrops } from './stage/backdrop-playback';
import { diag } from './stage/diag';
import { NATIVE_STILL_BACKDROP } from './stage/native-effects-policy';
export function Show({ fixture, probe, perf, onBenchmark, onPerf, onFrames, frames, layer, presentation }: { fixture:boolean; probe: { mode: PhotoProbeMode; count: number } | null; perf: boolean; onBenchmark(): void; onPerf(): void; onFrames(): void; frames: boolean; layer:number; presentation:number }): React.ReactElement {
  const view=useTvView();
  const session=useSession(), previousScene=useRef(view.scene);
  useEffect(() => {
    if (previousScene.current === view.scene) return;
    previousScene.current = view.scene;
    // Commit the scene swap first, then evict its now-unused decoded images.
    // The stick's contiguous graphics pool is much smaller than general RAM.
    const timer = setTimeout(() => { void releaseGraphicsMemory().then(
      () => session.telemetry('graphics-cache', { phase: 'scene-released', scene: view.scene }),
      () => session.telemetry('graphics-cache', { phase: 'scene-error', scene: view.scene }),
    ); }, 32);
    return () => clearTimeout(timer);
  }, [view.scene, session]);
  const transport=<MediaTransport/>;
  const content=<>{transport}{config.showcase&&<CaptureBackground view={view}/>}{layer>=5&&<ParticleField key={'particles:'+presentation}/>}{layer>=0&&(probe?<PhotoProbe {...probe}/>:fixture?<FixtureView/>:<SceneRegistry key={'scene:'+presentation} view={view} />)}{layer>=1&&view.scene!=='champ'&&<Hud/>}{layer>=2&&<Host key={'host:'+presentation}/>}{layer>=3&&<Ticker/>}{layer>=6&&!diag.noVignette&&<Bitmap id="stage/vignette" width={1280} height={720}/>}{layer>=7&&<Remote onDebug={onBenchmark} onPerf={onPerf} onFrames={onFrames} frames={frames}/>} {perf&&<PerfHud/>}</>; return layer>=4?<CuePlayer>{content}</CuePlayer>:content;
}
export function App(): React.ReactElement {
  const session = useRef(new TvSession()).current, [loaded, fontError] = useFonts(fonts);
  const [fixture,setFixture]=useState(false);
  const reportDisplay = useCallback((fields: Record<string, number | boolean>) => session.telemetry('display', fields), [session]);
  const reportBackdrop = useCallback((status: string) => session.telemetry('stage-video', { status }), [session]);
  const [videoState, setVideoState] = useState<'off' | 'play' | 'pause'>('off');
  const [diagEpoch, setDiagEpoch] = useState(0);
  const [bgMode, setBgMode] = useState<'normal' | 'still' | 'none'>('normal');
  const [foreground, setForeground] = useState(true);
  const foregroundState = useRef<boolean>(), [foregroundEpoch, setForegroundEpoch] = useState(0);
  const [presentation, setPresentation] = useState(0);
  const [frames, setFrames] = useState(typeof __DEV__ !== 'undefined' && __DEV__);
  const [probe,setProbe]=useState<{ mode: PhotoProbeMode; count: number } | null>(config.photoProbe?{mode:'photo',count:4}:null); const [layer,setLayer]=useState(()=>(globalThis as {HermesInternal?:unknown}).HermesInternal?0:7);
  const startupLayers=useRef<ReturnType<typeof setTimeout>[]>([]);
  const [eyeProbe,setEyeProbe]=useState<'native'|'sampled'|'still'|null>(null);
  const [eyeProbeCount,setEyeProbeCount]=useState(1);
  const [palette, setPalette] = useState<Mood | undefined>();
  const [mood, setMood] = useState<Mood>('normal'), [ready, setReady] = useState(false), [perf, setPerf] = useState(false), [benchmark, setBenchmark] = useState(false);
  const openBenchmark = () => { session.game?.pause(); setBenchmark(true); };
  const closeBenchmark = () => { setBenchmark(false); session.game?.resume(); };
  useEffect(() => {
    const state = (value: unknown) => {
      const active = foregroundUpdate(value);
      if (active === undefined || active === foregroundState.current) return;
      foregroundState.current = active;
      if (!active) {
        cueControls?.suspend();
        if (releaseBackdrops()) reportBackdrop('release-requested');
        void releaseGraphicsMemory().then(
          () => session.telemetry('graphics-cache', { phase: 'early-released' }),
          () => session.telemetry('graphics-cache', { phase: 'early-error' }),
        );
      } else setForegroundEpoch(value => value + 1);
      setForeground(active); session.foreground(active);
      if (!active) { startupLayers.current.forEach(clearTimeout); if ((globalThis as { HermesInternal?: unknown }).HermesInternal) setLayer(0); }
    };
    state(AppState.currentState);
    const listener = AppState.addEventListener('change', state), modules = AppState.addEventListener('moduleChange', state);
    return () => { listener.remove(); modules.remove(); };
  }, [session, reportBackdrop]);
  useEffect(() => {
    if (!foreground) void releaseGraphicsMemory().then(
      () => session.telemetry('graphics-cache', { phase: 'released' }),
      () => session.telemetry('graphics-cache', { phase: 'error' }),
    );
  }, [foreground, session]);
  useEffect(() => {
    const stopErrors = observeExceptions(name => { session.exceptions++; session.telemetry('exception', { source: name, exceptions: session.exceptions }); });
    const unsubscribe = session.subscribe(() => { setReady(session.ready); setPresentation(session.presentationRevision); if(session.ready) { const view = session.getView(); setMood(view.backgroundMood); setPalette(view.scene === 'judge' ? 'party' : view.scene === 'champ' ? 'gold' : undefined); setVideoState(view.scene === 'lobby' || view.completed ? 'off' : view.paused ? 'pause' : 'play'); } });
    session.onDebug = c => {
      if(c.command==='eyes-probe')setEyeProbe(c.driver==='native'?'native':c.driver==='sampled'?'sampled':c.driver==='still'?'still':null);
      if(c.command==='eyes-probe')setEyeProbeCount(c.count===2?2:1);
      if(c.command==='eyes-enabled')setEyesEnabled(c.on!==false);
      if(c.command==='diagnostic-flags'){Object.assign(diag,c.flags??{});setDiagEpoch(n=>n+1);session.telemetry('diagnostic-flags',{n:Object.keys(diag).length});}
      if(c.command==='diagnostic-bg'){setBgMode(c.mode==='none'||c.mode==='still'?c.mode:'normal');session.telemetry('diagnostic-bg',{mode:String(c.mode)});}
      if(c.command==='diagnostic-layer'){startupLayers.current.forEach(clearTimeout);setLayer(Number(c.level));session.telemetry('diagnostic-layer',{round:Number(c.level)});}
      if(c.command==='photo-probe')setProbe(c.on===false?null:{mode:c.mode as PhotoProbeMode,count:Number(c.count??4)});
      if(c.command==='fixture-view')setFixture(c.on!==false);
      if(c.command==='benchmark')c.on===false?closeBenchmark():openBenchmark();
      if(c.command==='perf')setPerf(c.on!==false);
      if(c.command==='frame-debug')setFrames(c.on!==false);
      if(c.command==='reduced')cueControls?.reduced(c.on!==false);
      if(c.command==='audio-probe')void cueControls?.probe(c.codec==='ogg'?'ogg':'wav');
      if(c.command==='audio-effects')void cueControls?.effects(c.codec==='wav'?'wav':'ogg',Array.isArray(c.files)?c.files.filter((id):id is string=>typeof id==='string'):undefined);
    };
    if(typeof window!=='undefined')(window as unknown as {__snagTv:TvSession}).__snagTv=session;
    session.start();
    return()=>{stopErrors();unsubscribe();session.dispose();};
  },[]);
  useEffect(()=>{session.loaded=loaded;session.telemetry('bootstrap',{ready,loaded,fontError:!!fontError});},[ready,loaded,fontError]);
  useEffect(()=>{session.telemetry('background-render',{mood});},[mood]);
  useEffect(()=>{
    if(config.photoProbe||!foreground||!ready||!loaded||!(globalThis as {HermesInternal?:unknown}).HermesInternal)return;
    // Let each native subtree attach before composing the next one. The checkpoint
    // already exposed these diagnostic layers; complete that startup automatically.
    startupLayers.current=Array.from({length:7},(_,i)=>setTimeout(()=>setLayer(i+1),(i+1)*150));
    return()=>startupLayers.current.forEach(clearTimeout);
  },[ready,loaded,foreground]);
  if (!foreground) return <View style={{ flex: 1, backgroundColor: TOKENS.night }}/>;
  if(benchmark)return <Benchmark onExit={closeBenchmark}/>;
  return <Stage onDisplay={config.debug ? reportDisplay : undefined}>{bgMode==='none'?null:<Background key={(presentation > 0 ? presentation : "live") + ":" + foregroundEpoch + ":" + diagEpoch} mood={session.ready ? session.getView().backgroundMood : mood} palette={bgMode==='still'||NATIVE_STILL_BACKDROP&&!!(globalThis as {HermesInternal?:unknown}).HermesInternal?(palette??(session.ready ? session.getView().backgroundMood : mood)):palette} held={presentation > 0 && session.ready && session.getView().paused} atMs={session.clock.now()} videoActive={!config.showcase && !(NATIVE_STILL_BACKDROP && (globalThis as {HermesInternal?:unknown}).HermesInternal) && bgMode!=="still" && videoState !== "off"} videoPaused={videoState === "pause"} onVideoStatus={reportBackdrop}/>}{!ready||!loaded?<View key="startup" collapsable={false} style={{position:'absolute',width:1280,height:720}}><Box x={250} y={340} width={780}><Label size={28} color={TOKENS.paper} style={{textAlign:'center'}}>{fontError?'Fonts could not load.':!ready?'Getting the studio ready…':'The show is almost ready…'}</Label></Box></View>:<View key={"show:" + foregroundEpoch + ":" + diagEpoch} collapsable={false} style={{position:'absolute',width:1280,height:720}}><Boundary session={session}><StageProvider session={session}><Show presentation={presentation} layer={layer} probe={probe} fixture={fixture} perf={perf} frames={frames} onFrames={()=>setFrames(v=>!v)} onBenchmark={openBenchmark} onPerf={()=>setPerf(v=>!v)}/>{config.debug&&frames&&<FrameDebugHud/>}{eyeProbe&&<EyeProbe driver={eyeProbe} count={eyeProbeCount}/>}</StageProvider></Boundary></View>}</Stage>;
}
class Boundary extends React.Component<{session:TvSession;children:React.ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(e:Error){this.props.session.exceptions++;this.props.session.telemetry('exception',{source:e.name,exceptions:this.props.session.exceptions});}
  render(){return this.state.failed?<Box x={100} y={100} width={1000} height={100}><Label size={40}>The studio hit a problem. Reopen the app.</Label></Box>:this.props.children;}
}
