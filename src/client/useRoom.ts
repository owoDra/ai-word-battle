import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, PublicState, ServerMsg } from "../shared/protocol";

// タブごとに別プレイヤーとして扱う (同じ端末の2タブでテストできるように sessionStorage)
function playerId(): string {
  try {
    let id = sessionStorage.getItem("awb:pid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("awb:pid", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function useRoom(code: string, name: string, spectate: boolean) {
  const [state, setState] = useState<PublicState | null>(null);
  const [you, setYou] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const q = new URLSearchParams({ pid: playerId(), name, spectate: spectate ? "1" : "0" });
      const ws = new WebSocket(`${proto}://${location.host}/api/room/${code}/ws?${q}`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setOnline(true);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg.t === "hello") setYou(msg.you);
        else if (msg.t === "state") setState(msg.state);
        else if (msg.t === "error") setError(msg.message);
      };
      ws.onclose = () => {
        setOnline(false);
        if (wsRef.current === ws) wsRef.current = null;
        if (!closed) timer = setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
      };
    };

    // スマホのスリープ復帰時はすぐ繋ぎ直す
    const onVisible = () => {
      if (document.visibilityState === "visible" && !wsRef.current) {
        clearTimeout(timer);
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      wsRef.current?.close();
    };
  }, [code, name, spectate]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError("通信が切れている…! 再接続中");
  }, []);

  return { state, you, error, setError, online, send };
}
