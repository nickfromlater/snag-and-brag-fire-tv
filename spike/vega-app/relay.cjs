// Local-only fixture relay: four unique JPEGs at 3 Hz, binary echo and commands.
const fs = require('node:fs'),
  path = require('node:path');
const {
  WebSocketServer
} = require('ws');
const output = path.resolve(__dirname, '../../docs/spike/evidence/runtime.jsonl');
const server = new WebSocketServer({
  host: '127.0.0.1',
  port: 7071
});
let sequence = 0;
const fixtures = Array.from({
  length: 4
}, (_, i) => fs.readFileSync(path.join(__dirname, `src/assets/thumb-${i}.jpg`)));
server.on('connection', socket => {
  console.log('client connected');
  socket.on('message', (data, binary) => {
    if (binary) {
      socket.send(data, {
        binary: true
      });
      return;
    }
    try {
      const record = JSON.parse(data.toString());
      if (record.command) {
        for (const client of server.clients) if (client !== socket && client.readyState === 1) client.send(JSON.stringify(record));
      } else {
        fs.appendFileSync(output, JSON.stringify({
          ...record,
          hostTime: new Date().toISOString()
        }) + '\n');
        if (record.kind !== 'perf' || record.sample % 5 === 0) console.log(record.kind, record.case || record.type || '');
      }
    } catch {
      socket.send(data.toString());
    }
  });
});
setInterval(() => {
  sequence++;
  fixtures.forEach((jpeg, tile) => {
    // A legal, unique COM segment ensures every frame needs a fresh decode.
    const comment = Buffer.from(`fixture-frame-${sequence}`),
      mark = Buffer.alloc(4);
    mark[0] = 255;
    mark[1] = 254;
    mark.writeUInt16BE(comment.length + 2, 2);
    const header = Buffer.alloc(8);
    header[0] = 83;
    header[1] = 66;
    header[2] = tile;
    header.writeUInt32BE(sequence, 4);
    const payload = Buffer.concat([header, jpeg.subarray(0, 2), mark, comment, jpeg.subarray(2)]);
    for (const client of server.clients) if (client.readyState === 1) client.send(payload, {
      binary: true
    });
  });
}, 1000 / 3);
console.log('Fixture relay listening on 127.0.0.1:7071');
