import { React, Box, layers } from './stage';
import type { Scene, TvView } from '@snag/shared';
import { LobbyScene } from './scenes/lobby';
import { IntroScene } from './scenes/intro';
import { HuntScene } from './scenes/hunt';
import { JudgeScene } from './scenes/judge';
import { BragScene, BragBackdrop } from './scenes/brag';
import { ShowScene } from './scenes/show';
import { StandScene } from './scenes/stand';
import { ChampScene } from './scenes/champ';
const scenes: Record<Scene, (props: { view: TvView }) => React.ReactElement | null> = { lobby: LobbyScene, intro: IntroScene, hunt: HuntScene, judge: JudgeScene, brag: BragScene, show: ShowScene, stand: StandScene, champ: ChampScene };
export function SceneRegistry({ view }: { view: TvView }): React.ReactElement | null {
  const native = !!(globalThis as {HermesInternal?:unknown}).HermesInternal;
  const [attached, setAttached] = React.useState<Scene|null>(view.scene);
  React.useEffect(() => {
    if (!native || attached === view.scene) { setAttached(view.scene); return; }
    setAttached(null);
    // Let outgoing native animation nodes detach before attaching a new scene.
    const timer = setTimeout(() => setAttached(view.scene), 150);
    return () => clearTimeout(timer);
  }, [view.scene, native]);
  if (native && attached !== view.scene) return null;
  const Scene = scenes[view.scene]; return <>{view.scene === 'brag' && <BragBackdrop view={view}/>}<Box testID="clarity-scene" width={1280} height={720} style={{ zIndex: layers.content }}><Scene key={view.scene} view={view}/></Box></>;
}
