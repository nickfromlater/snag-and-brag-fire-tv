import { useEffect } from 'react';
import { useSession } from './context';
import { GameMediaControlHandler } from './game-media-controls';

/** Web iteration exercises the same handler without claiming a Vega service. */
export function MediaTransport(): null {
  const session = useSession();
  useEffect(() => {
    const handler = new GameMediaControlHandler(session, () => {});
    const stop = session.subscribe(() => handler.publish()); handler.publish();
    session.mediaControl = async (action, route) => {
      if (route === 'sdk') throw new Error('Vega Media Controls requires the native target');
      const method = ('handle' + action[0]!.toUpperCase() + action.slice(1)) as 'handlePlay';
      await handler[method]();
    };
    return () => { stop(); session.mediaControl = undefined; handler.dispose(); };
  }, [session]);
  return null;
}
