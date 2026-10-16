import { useCallback, useEffect, useRef, useState } from "react";
import type { WSEvent } from "./types";

const PING = 10_000; // heartbeat interval
const SILENCE = 20_000; // no reply for this long means the socket is a zombie
const CONNECTING = 15_000; // a handshake that never completes is a dead end
const MAX_BACKOFF = 15_000;
const WAKE_HIDDEN = 5_000; // ignore quick tab switches

// usePresence owns the presence socket and keeps it up. The server sends a full
// snapshot on every connect, so a reconnect doubles as a resync. `onOpen` fires
// after each (re)connect so the caller can replay state the server forgot.
export function usePresence(onEvent: (ev: WSEvent) => void, onOpen: () => void) {
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const event = useRef(onEvent);
  const opened = useRef(onOpen);
  event.current = onEvent;
  opened.current = onOpen;

  useEffect(() => {
    let reconnecting = 0;
    let retry = 0;
    let pong = 0;
    let connecting = 0;
    let hidden = Date.now();
    let closed = false;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/api/ws`;

    // Jitter keeps every client from retrying in lockstep after a restart.
    const schedule = () => {
      const wait = Math.min(1000 * 2 ** retry++, MAX_BACKOFF) * (0.5 + Math.random());
      reconnecting = window.setTimeout(open, wait);
    };

    const open = () => {
      if (closed) return;
      const ws = new WebSocket(url);
      socket.current = ws;
      pong = connecting = Date.now();
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        opened.current();
      };
      ws.onmessage = (e) => {
        const ev = JSON.parse(e.data as string) as WSEvent;
        if (ev.type === "pong") pong = Date.now();
        else event.current(ev);
      };
      // onerror always precedes onclose, so close alone is worth reacting to.
      ws.onclose = () => {
        if (socket.current !== ws) return; // already dropped or replaced
        socket.current = null;
        setConnected(false);
        if (!closed) schedule();
      };
    };

    // drop abandons a socket instead of closing it. close() runs a closing
    // handshake, and a half-open peer never answers one, so the browser sits on
    // the dead socket; detaching it loses nothing and reconnects immediately.
    const drop = () => {
      const ws = socket.current;
      if (!ws) return;
      socket.current = null;
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      setConnected(false);
      ws.close();
      if (!closed) schedule();
    };

    // A sleeping laptop keeps the socket OPEN while nothing flows, so trust
    // heartbeats rather than readyState: silence means reconnect.
    const beat = window.setInterval(() => {
      const ws = socket.current;
      if (!ws) return;
      if (ws.readyState === WebSocket.CONNECTING) {
        if (Date.now() - connecting > CONNECTING) drop();
      } else if (ws.readyState === WebSocket.OPEN) {
        if (Date.now() - pong > SILENCE) drop();
        else ws.send('{"type":"ping"}');
      }
    }, PING);

    // wake runs when the tab becomes visible again or the network returns. A
    // healthy socket only gets a liveness probe; tearing it down would force a
    // reconnect (and a roster resync) for no reason. A socket that is not OPEN
    // is dropped, and an OPEN one is dropped by the heartbeat if the probe goes
    // unanswered.
    const wake = () => {
      if (closed) return;
      window.clearTimeout(reconnecting);
      retry = 0;
      const ws = socket.current;
      if (!ws) return open();
      if (ws.readyState === WebSocket.OPEN) return ws.send('{"type":"ping"}');
      drop();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") hidden = Date.now();
      else if (Date.now() - hidden > WAKE_HIDDEN) wake();
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", wake);
    return () => {
      closed = true;
      window.clearTimeout(reconnecting);
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", wake);
      socket.current?.close();
      socket.current = null;
    };
  }, []);

  const send = useCallback((data: string) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(data);
  }, []);

  return { connected, send };
}
