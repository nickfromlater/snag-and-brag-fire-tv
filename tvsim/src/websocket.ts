import WebSocket from 'ws';
import type { RelayToClient } from '@snag/shared';
import type { TvSimulator } from './simulator';

export function connectWebSocket(simulator: TvSimulator, url: string, closed: () => void, error: (code: string) => void): WebSocket {
  const socket = new WebSocket(url);
  socket.on('open', () => simulator.attach({
    send: message => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); },
    close: () => socket.close(),
  }));
  socket.on('message', (data, binary) => {
    const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : Array.isArray(data) ? Buffer.concat(data) : data;
    if (binary) simulator.binary(bytes);
    else {
      try { simulator.receive(JSON.parse(bytes.toString('utf8')) as RelayToClient); }
      catch { error('BAD_RELAY_FRAME'); }
    }
  });
  socket.on('close', closed);
  socket.on('error', (e: NodeJS.ErrnoException) => error(e.code ?? 'WEBSOCKET_ERROR'));
  return socket;
}
