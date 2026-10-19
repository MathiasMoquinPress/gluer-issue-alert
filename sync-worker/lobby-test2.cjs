// Lobby robustness tests. usage: node lobby-test2.cjs ws://127.0.0.1:8787   (takes about a minute)
const WebSocket = require('ws');
const BASE = process.argv[2] || 'ws://127.0.0.1:8787';
const H = { headers: { Origin: 'http://localhost' } };
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const open = (name, cid) => new Promise(r => { const w = new WebSocket(BASE + '/lobby', H); w.log = []; w.closed = null; w.on('message', d => { const s = d.toString(); if (s !== 'pong') w.log.push(JSON.parse(s)); }); w.on('close', c => { w.closed = c; }); w.on('open', () => { w.send(JSON.stringify({ t: 'enter', name, c: cid })); r(w); }); });
const names = async () => { const p = await open('Probe', 'probe' + Math.random().toString(36).slice(2, 6)); for (let k = 0; k < 40 && !p.log.some(m => m.t === 'you'); k++) await wait(150); const me = p.log.find(m => m.t === 'you').id; await wait(1200); const l = p.log.filter(m => m.t === 'list').pop(); p.close(); return l.list.filter(x => x.id !== me).map(x => x.name); };
(async () => {
  const run = Math.random().toString(36).slice(2, 6);
  // 1. one entry per device: a second window with the same device id replaces the first
  const a1 = await open('Desk' + run, 'dev' + run); await wait(500);
  const a2 = await open('Desk' + run, 'dev' + run); await wait(2500);
  ok(a1.closed === 4001, 'older window of the same device is closed with code 4001');
  ok((await names()).filter(n => n === 'Desk' + run).length === 1, 'list shows that device once');
  // 2. dead window (heartbeats stop) disappears within ~45 s
  a2.send(JSON.stringify({ t: 'hb' }));
  console.log('waiting 48 s for the silent window to drop off...');
  await wait(48000);
  ok(!(await names()).includes('Desk' + run), 'silent window removed from the list');
  // 3. pairing result is remembered for a device that missed it
  const host = await open('Host' + run, 'host' + run); host.send(JSON.stringify({ t: 'hb' }));
  const joiner = await open('Join' + run, 'join' + run); joiner.send(JSON.stringify({ t: 'hb' }));
  await wait(800);
  const code = host.log.find(m => m.t === 'you').code; const hostId = joiner.log.filter(m => m.t === 'list').pop().list.find(x => x.name === 'Host' + run).id;
  host._socket.pause();                               // host window is frozen/asleep: connected, but not listening
  joiner.send(JSON.stringify({ t: 'join', target: hostId, code })); await wait(1200);
  ok(joiner.log.some(m => m.t === 'paired'), 'joiner is paired');
  const host2 = await open('Host' + run, 'host' + run); await wait(1000);   // host comes back
  const p = host2.log.find(m => m.t === 'paired');
  ok(p && joiner.log.find(m => m.t === 'paired').room === p.room, 'returning host is told the same room');
  host2.send(JSON.stringify({ t: 'ok' })); await wait(300); host2.close(); await wait(300);
  const host3 = await open('Host' + run, 'host' + run); await wait(800);
  ok(!host3.log.some(m => m.t === 'paired'), 'after the device confirms, the pairing is not repeated');
  [a2, joiner, host3].forEach(w => { try { w.close(); } catch (e) {} });
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
