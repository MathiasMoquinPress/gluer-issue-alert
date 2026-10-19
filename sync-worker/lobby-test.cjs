// Lobby test: two tablets enter, idle (so the hub hibernates), then one joins the other with the right code.
// usage: node lobby-test.cjs [wss://host] [idleSeconds]
const WebSocket = require('ws');
const BASE = process.argv[2] || 'wss://gluer-issue-sync.anthony-mancino2.workers.dev';
const IDLE = Number(process.argv[3] || 25) * 1000;
const open = name => new Promise(r => { const w = new WebSocket(BASE + '/lobby', { headers: { Origin: 'http://localhost' } }); w.log = []; w.on('message', d => { const s = d.toString(); if (s !== 'pong') w.log.push(JSON.parse(s)); }); w.on('open', () => { w.send(JSON.stringify({ t: 'enter', name })); r(w); }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const a = await open('TestA'), b = await open('TestB');
  await wait(1500);
  const you = a.log.find(m => m.t === 'you'), listB = b.log.filter(m => m.t === 'list').pop();
  console.log('A code', you && you.code, '| B sees', listB && listB.list.map(x => x.name).join(','));
  console.log('idling ' + IDLE / 1000 + 's (hub hibernates)...');
  const hb = setInterval(() => { try { a.send('ping'); b.send('ping'); } catch (e) {} }, 20000);
  await wait(IDLE); clearInterval(hb);
  const target = listB.list.find(x => x.name === 'TestA');
  b.send(JSON.stringify({ t: 'join', target: target.id, code: 'x' + you.code.slice(1) === you.code ? '0000' : you.code }));
  await wait(2000);
  console.log('B got:', b.log.filter(m => m.t === 'paired' || m.t === 'err').map(m => m.t + (m.e ? ':' + m.e : '')).join(',') || 'nothing');
  console.log('A got:', a.log.filter(m => m.t === 'paired' || m.t === 'err').map(m => m.t).join(',') || 'nothing');
  a.close(); b.close(); process.exit(0);
})();
