/* Gluer Issue Alert – realtime sync hub.
   One Durable Object per "room" keeps the shared list of issues and relays every change
   to every connected tablet over a WebSocket. It stores data only; it never deletes anything.
   Free-tier friendly: hibernating WebSockets + automatic ping/pong that does not wake the object. */
import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = ['https://anthonymancino222.github.io', 'http://localhost', 'http://127.0.0.1'];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/ws' && url.pathname !== '/lobby') return new Response('Gluer Issue Alert sync is running.', { status: 200 });
    const origin = req.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + ':'))) return new Response('forbidden', { status: 403 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (url.pathname === '/lobby') return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch(req);
    const room = (url.searchParams.get('room') || '').toLowerCase();
    if (!/^[a-z0-9_-]{3,40}$/.test(room)) return new Response('bad room code', { status: 400 });
    return env.HUB.get(env.HUB.idFromName(room)).fetch(req);
  }
};

const newer = (a, b) => (a.v || 0) > (b.v || 0) || ((a.v || 0) === (b.v || 0) && String(a.vc || '') > String(b.vc || ''));

const pad = n => String(n).padStart(10, '0');
const pub = r => { const { _s, ...x } = r; return x; };          // the server's change counter never leaves the server
const CHUNK = 150;

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* Every accepted change gets the next number (_s) and an index entry "q:<number>", so a tablet that
     reconnects can ask "what changed since number N?" and the hub reads only those few rows. */
  async merge(list) {
    const accepted = [], back = [], acks = {};
    let seq = (await this.ctx.storage.get('seq')) || 0;
    for (const r of list) {
      if (!r || typeof r.id !== 'string' || r.id.length > 40) continue;
      acks[r.id] = r.v || 0;
      const key = 'i:' + r.id;
      const cur = await this.ctx.storage.get(key);
      if (!cur || newer(r, cur)) {
        seq++;
        const rec = { ...pub(r), _s: seq };
        if (cur && cur._s) await this.ctx.storage.delete('q:' + pad(cur._s));
        await this.ctx.storage.put({ [key]: rec, ['q:' + pad(seq)]: r.id });
        accepted.push(pub(rec));
      } else if (newer(cur, r)) back.push(pub(cur));
    }
    if (accepted.length) await this.ctx.storage.put('seq', seq);
    return { accepted, back, acks, seq };
  }

  async changedSince(since) {
    if (!since) return [...(await this.ctx.storage.list({ prefix: 'i:' })).values()].map(pub);
    const idx = await this.ctx.storage.list({ prefix: 'q:', start: 'q:' + pad(since + 1) });
    const keys = [...idx.values()].map(id => 'i:' + id);
    const out = [];
    for (let k = 0; k < keys.length; k += 100) for (const v of (await this.ctx.storage.get(keys.slice(k, k + 100))).values()) out.push(pub(v));
    return out;
  }

  others(except) { return this.ctx.getWebSockets().filter(w => w !== except); }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  presence(except) {
    const n = this.others(except).length;
    for (const w of this.others(except)) this.send(w, { t: 'n', n });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 2000000) return;
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    const list = Array.isArray(m.issues) ? m.issues : [];
    if (m.t === 'hello') {
      const { accepted, acks, seq } = await this.merge(list);
      const all = await this.changedSince(Number(m.since) || 0);
      const n = this.ctx.getWebSockets().length;
      for (let k = 0; k < all.length; k += CHUNK) this.send(ws, { t: 'snap', issues: all.slice(k, k + CHUNK) });
      this.send(ws, { t: 'snap', issues: [], done: 1, seq: (await this.ctx.storage.get('seq')) || seq, a: acks, n, now: Date.now() });
      if (accepted.length) for (const w of this.others(ws)) this.send(w, { t: 'up', issues: accepted, seq, n });
      else for (const w of this.others(ws)) this.send(w, { t: 'n', n });
    } else if (m.t === 'up') {
      const { accepted, back, acks, seq } = await this.merge(list);
      if (accepted.length) for (const w of this.others(ws)) this.send(w, { t: 'up', issues: accepted, seq });
      if (back.length) this.send(ws, { t: 'up', issues: back });
      this.send(ws, { t: 'ack', a: acks, seq });
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch (e) {}
    this.presence(ws);
  }
  async webSocketError(ws) { this.presence(ws); }
}

/* ---------- the lobby: tablets that want to be paired wait here ----------
   Each waiting tablet gets a random 4-digit code (only that tablet and its owner see it).
   Another tablet picks it from the list and types the code. If it matches, the hub invents a
   private room name and hands it to both; they then sync through the normal Hub above.
   Nothing is stored: the lobby lives only while tablets are connected. */
const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const code4 = () => String(rnd(10000)).padStart(4, '0');
const rid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
const clean = s => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20) || 'Tablet';

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) {} }
  who() { return this.ctx.getWebSockets().map(w => ({ w, a: w.deserializeAttachment() })).filter(x => x.a && x.a.id); }
  list() { return this.who().map(x => ({ id: x.a.id, name: x.a.name })); }
  broadcast() { const list = this.list(); for (const x of this.who()) this.send(x.w, { t: 'list', list }); }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 2000) return;
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    let a = ws.deserializeAttachment();
    if (m.t === 'enter') {
      a = { id: rid().slice(0, 10), name: clean(m.name), code: code4(), fails: 0, tries: 0 };
      ws.serializeAttachment(a);
      this.send(ws, { t: 'you', id: a.id, code: a.code });
      this.broadcast();
    } else if (!a) {
      return;
    } else if (m.t === 'name') {
      a.name = clean(m.name); ws.serializeAttachment(a); this.broadcast();
    } else if (m.t === 'join') {
      if (++a.tries > 10) { this.send(ws, { t: 'err', e: 'locked' }); ws.serializeAttachment(a); return; }
      ws.serializeAttachment(a);
      const tgt = this.who().find(x => x.a.id === m.target && x.w !== ws);
      if (!tgt) return this.send(ws, { t: 'err', e: 'gone' });
      if (String(m.code) !== tgt.a.code) {
        tgt.a.fails++;
        if (tgt.a.fails >= 5) { tgt.a.fails = 0; tgt.a.code = code4(); this.send(tgt.w, { t: 'you', id: tgt.a.id, code: tgt.a.code }); }
        tgt.w.serializeAttachment(tgt.a);
        return this.send(ws, { t: 'err', e: 'code' });
      }
      const room = rid();
      this.send(tgt.w, { t: 'paired', room, peer: a.name });
      this.send(ws, { t: 'paired', room, peer: tgt.a.name });
    }
  }
  async webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch (e) {} this.broadcast(); }
  async webSocketError() { this.broadcast(); }
}
