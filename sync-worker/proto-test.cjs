// Protocol test for the delta sync (run against `wrangler dev`): node proto-test.cjs
const WebSocket = require('ws');
const URL = 'ws://127.0.0.1:8787/ws?room=delta-' + Date.now();
const open = c => new Promise(r => { const w = new WebSocket(URL + '&c=' + c, { headers: { Origin: 'http://localhost' } }); w.log = []; w.on('message', d => w.log.push(JSON.parse(d.toString()))); w.on('open', () => r(w)); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const hello = (w, since, issues) => w.send(JSON.stringify({ t: 'hello', c: 'x', since, issues }));
const iss = (id, v, vc) => ({ id, type: 'glue', color: 'red', v, vc });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const a = await open('aaa'); hello(a, 0, []); await wait(400);
  let fin = a.log.find(m => m.done); ok(fin && fin.seq === 0, 'empty room: seq 0');
  a.send(JSON.stringify({ t: 'up', issues: [iss('i1', 1, 'aaa'), iss('i2', 1, 'aaa'), iss('i3', 1, 'aaa')] })); await wait(400);
  const ack = a.log.find(m => m.t === 'ack'); ok(ack && ack.seq === 3 && ack.a.i1 === 1, 'ack carries seq 3 and versions');
  const b = await open('bbb'); hello(b, 0, []); await wait(500);
  const bi = b.log.filter(m => m.t === 'snap').flatMap(m => m.issues); fin = b.log.find(m => m.done);
  ok(bi.length === 3 && fin.seq === 3 && !('_s' in bi[0]), 'new tablet since=0 gets all 3, seq 3, no _s leaked');
  a.send(JSON.stringify({ t: 'up', issues: [iss('i2', 2, 'aaa'), iss('i4', 1, 'aaa')] })); await wait(400);
  const up = b.log.filter(m => m.t === 'up').flatMap(m => m.issues); ok(up.length === 2, 'live relay of 2 changes to b');
  const c = await open('ccc'); hello(c, 3, []); await wait(500);
  const ci = c.log.filter(m => m.t === 'snap').flatMap(m => m.issues).map(x => x.id).sort().join();
  fin = c.log.find(m => m.done); ok(ci === 'i2,i4' && fin.seq === 5, 'catch-up since=3 returns ONLY i2,i4 (got ' + ci + '), seq 5');
  const d = await open('ddd'); hello(d, 5, [iss('i9', 1, 'ddd')]); await wait(500);
  ok(d.log.filter(m => m.t === 'snap').flatMap(m => m.issues).length === 1 && d.log.find(m => m.done).a.i9 === 1, 'since=latest returns only its own new change; ack for i9');
  ok(a.log.some(m => m.t === 'up' && m.issues.some(x => x.id === 'i9')), 'hello with pending change is relayed to others');
  a.send(JSON.stringify({ t: 'up', issues: [iss('i2', 1, 'zzz')] })); await wait(400);
  ok(a.log.filter(m => m.t === 'up').some(m => m.issues.some(x => x.id === 'i2' && x.v === 2)), 'stale write rejected, newer version sent back');
  // many issues -> chunked catch-up
  const big = Array.from({ length: 400 }, (_, k) => iss('b' + k, 1, 'aaa')); a.send(JSON.stringify({ t: 'up', issues: big })); await wait(1500);
  const e = await open('eee'); hello(e, 0, []); await wait(1500);
  const snaps = e.log.filter(m => m.t === 'snap');
  ok(snaps.flatMap(m => m.issues).length === 405 && snaps.length >= 4 && snaps[snaps.length - 1].done, 'full catch-up of 405 arrives in ' + snaps.length + ' chunks, last one marked done');
  [a, b, c, d, e].forEach(w => w.close()); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
