const WebSocket = require('ws');
const socket = new WebSocket('ws://127.0.0.1:7071');
socket.on('open', () => {
  socket.send(JSON.stringify({
    command: process.argv[2],
    name: process.argv[3]
  }));
  setTimeout(() => socket.close(), 200);
});
