'use strict';
// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket.
class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = new Map(); this.closed = false; }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(this.url));
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('CDP websocket error'));
      ws.onclose = () => {
        this.closed = true;
        for (const p of this.pending.values()) p.rej(new Error('CDP closed'));
        this.pending.clear();
        (this.handlers.get('close') || []).forEach((f) => f());
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.id && this.pending.has(m.id)) {
          const p = this.pending.get(m.id); this.pending.delete(m.id);
          m.error ? p.rej(new Error(m.error.message || JSON.stringify(m.error))) : p.res(m.result);
        } else if (m.method) {
          (this.handlers.get(m.method) || []).forEach((f) => { try { f(m.params); } catch {} });
        }
      };
    });
  }
  on(event, fn) { if (!this.handlers.has(event)) this.handlers.set(event, []); this.handlers.get(event).push(fn); }
  call(method, params = {}) {
    return new Promise((res, rej) => {
      if (this.closed) return rej(new Error('CDP closed'));
      const id = ++this.id; this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}
module.exports = { CDP };
