// Stand-in for the relay board: connects like the ESP32 will and prints what it is told to do.
// usage: node sim-board.cjs <lightcode> [wss://host | ws://127.0.0.1:8787] [seconds]
const WebSocket = require('ws');
const code = process.argv[2], base = process.argv[3] || 'ws://127.0.0.1:8787', secs = Number(process.argv[4] || 30);
const w = new WebSocket(base + '/light?code=' + code.toLowerCase() + '&d=1');
const t0 = Date.now(), stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';
w.on('open', () => { console.log(stamp(), 'board connected'); setInterval(() => w.send(JSON.stringify({ t: 'hb' })), 15000); });
w.on('message', d => console.log(stamp(), '<-', d.toString()));
w.on('close', () => console.log(stamp(), 'closed'));
setTimeout(() => process.exit(0), secs * 1000);
