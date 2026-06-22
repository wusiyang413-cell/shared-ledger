import { loadState, snapshot } from '../../lib/state.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // 推送当前状态
      (async () => {
        try {
          const state = await loadState();
          const data = JSON.stringify(snapshot(state));
          controller.enqueue(enc.encode(`event: hello\ndata: ${data}\n\n`));
        } catch (e) {
          console.error('SSE init error:', e.message);
        }
      })();

      // 每 2 秒轮询检测变化
      let lastSig = '';
      const interval = setInterval(async () => {
        if (!controller) return;
        try {
          const state = await loadState();
          const sig = state.entries.length + ':' + (state.entries[state.entries.length - 1]?.id || 0);
          if (sig !== lastSig) {
            lastSig = sig;
            const data = JSON.stringify(snapshot(state));
            controller.enqueue(enc.encode(`event: update\ndata: ${data}\n\n`));
          }
          // keepalive
          controller.enqueue(enc.encode(`: ka ${Date.now()}\n\n`));
        } catch (_) {}
      }, 2000);

      // 60秒后自动断开(Edge function 限制)
      setTimeout(() => {
        clearInterval(interval);
        try { controller.close(); } catch (_) {}
      }, 58000);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
