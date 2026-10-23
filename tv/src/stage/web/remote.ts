import { useEffect, useRef } from 'react';
import { AppState as BrowserAppState, View } from 'react-native';
export { unstable_batchedUpdates } from 'react-dom';
// Vega publishes module visibility separately; browsers publish only change.
export const AppState = {
  get currentState() { return BrowserAppState.currentState; },
  addEventListener(event: Parameters<typeof BrowserAppState.addEventListener>[0] | 'moduleChange', listener: Parameters<typeof BrowserAppState.addEventListener>[1]) {
    return event === 'moduleChange' ? { remove() {} } : BrowserAppState.addEventListener(event, listener);
  },
};
export const TVFocusGuideView = View;
export const FocusManager = { focus() {}, blur() {} };
export function useTVEventHandler(fn: (e: { eventType: string; eventKeyAction: number }) => void): void {
  const current = useRef(fn); current.current = fn;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const type = ({ Enter: 'select', Escape: 'back', ' ': 'playpause', f: 'skip_forward', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', F1: 'menu' } as Record<string, string>)[e.key];
      if (type) { e.preventDefault(); current.current({ eventType: type, eventKeyAction: 0 }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export * from 'react-native';
