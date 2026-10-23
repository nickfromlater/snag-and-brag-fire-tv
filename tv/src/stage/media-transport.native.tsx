import { useEffect } from 'react';
import { useComponentInstance } from '@amazon-devices/react-native-kepler';
import { MediaControlComponentAsync, MediaControlServerComponentAsync } from '@amazon-devices/kepler-media-controls';
import { useSession } from './context';
import { GameMediaControlHandler } from './game-media-controls';

export function MediaTransport(): null {
  const session = useSession(), component = useComponentInstance();
  useEffect(() => {
    const server = MediaControlServerComponentAsync.getOrMakeServer();
    const handler = new GameMediaControlHandler(session, states => server.updateMediaSessionStates(states));
    server.setHandlerForComponent(handler, component);
    const stop = session.subscribe(() => handler.publish()); handler.publish();
    session.telemetry('media-registered', { route: 'vega-server', ready: true });
    session.mediaControl = async (action, route) => {
      if (route === 'handler') {
        const method = ('handle' + action[0]!.toUpperCase() + action.slice(1)) as 'handlePlay';
        await handler[method](); return;
      }
      // SDK client -> platform service -> handler, also on an unsigned VVD.
      session.telemetry('media-injection-api', { source: 'factory:' + typeof MediaControlComponentAsync?.makeMediaControlEndpointLocator });
      const locator = MediaControlComponentAsync.makeMediaControlEndpointLocator();
      session.telemetry('media-injection-api', { source: 'locator:' + typeof locator.getMediaControlEndpoints });
      const endpoints = await locator.getMediaControlEndpoints();
      session.telemetry('media-injection-api', { source: 'endpoints:' + endpoints.map(e => typeof e.getEndpointPackageId + '/' + typeof e.getSessionState + '/' + typeof e.destroy).join(',') });
      try {
        const endpoint = endpoints.find(e => e.getEndpointPackageId().id === 'com.snagbrag.tv');
        if (!endpoint) throw new Error('Game media endpoint unavailable');
        const states = await endpoint.getSessionState({ id: 1 });
        const status = states[0]?.playbackState.playbackStatus ?? 'NOT_PLAYING';
        session.telemetry('media-endpoint', { action, focused: endpoint === endpoints[0], active: status !== 'NOT_PLAYING', status, route: 'sdk' });
        await endpoint[action]({ id: 1 });
        session.telemetry('media-injected', { action, route: 'sdk', pass: true });
      } finally { endpoints.forEach(e => e.destroy()); }
    };
    return () => { stop(); session.mediaControl = undefined; handler.dispose(); };
  }, [session, component.id]);
  return null;
}
