/* Gluer Issue Alert – realtime sync hub.
   One Durable Object per "room" keeps the shared list of issues and relays every change
   to every connected tablet over a WebSocket. It stores data only; it never deletes anything.
   Free-tier friendly: hibernating WebSockets + automatic ping/pong that does not wake the object. */
import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = ['https://anthonymancino222.github.io', 'http://localhost', 'http://127.0.0.1'];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/ws') return new Response('Gluer Issue Alert sync is running.', { status: 200 });
    const origin = req.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + ':'))) return new Response('forbidden', { status: 403 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const room = (url.searchParams.get('room') || '').toLowerCase();
    if (!/^[a-z0-9_-]{3,40}$/.test(room)) return new Response('bad room code', { status: 400 });
    return env.HUB.get(env.HUB.idFromName(room)).fetch(req);
  }
};

const newer = (a, b) => (a.v || 0) > (b.v || 0) || ((a.v || 0) === (b.v || 0) && String(a.vc || '') > String(b.vc || ''));

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

  async merge(list) {
    const accepted = [], back = [];
    for (const r of list) {
      if (!r || typeof r.id !== 'string' || r.id.length > 40) continue;
      const key = 'i:' + r.id;
      const cur = await this.ctx.storage.get(key);
      if (!cur || newer(r, cur)) { await this.ctx.storage.put(key, r); accepted.push(r); }
      else if (newer(cur, r)) back.push(cur);
    }
    return { accepted, back };
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
      const { accepted } = await this.merge(list);
      const all = [...(await this.ctx.storage.list({ prefix: 'i:' })).values()];
      const n = this.ctx.getWebSockets().length;
      this.send(ws, { t: 'snap', issues: all, n, now: Date.now() });
      for (const w of this.others(ws)) this.send(w, { t: 'up', issues: accepted, n });
    } else if (m.t === 'up') {
      const { accepted, back } = await this.merge(list);
      if (accepted.length) for (const w of this.others(ws)) this.send(w, { t: 'up', issues: accepted });
      if (back.length) this.send(ws, { t: 'up', issues: back });
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch (e) {}
    this.presence(ws);
  }
  async webSocketError(ws) { this.presence(ws); }
}
