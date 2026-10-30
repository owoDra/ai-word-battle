import { useEffect, useState } from "preact/hooks";
import { Demo } from "./demo";
import { Room } from "./room";
import { bgm, unlockAudio } from "./sound";

interface Route {
  code: string | null;
  watch: boolean;
  demo: boolean;
}

function parseRoute(): Route {
  const m = location.pathname.match(/^\/r\/(\d{4})$/);
  return { code: m?.[1] ?? null, watch: new URLSearchParams(location.search).get("watch") === "1", demo: location.pathname === "/demo" };
}

export function loadName(): string {
  try {
    return localStorage.getItem("awb:name") ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem("awb:name", name);
  } catch {
    // 保存できなくてもゲームは続行できる
  }
}

export function App() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = (path: string) => {
    history.pushState(null, "", path);
    setRoute(parseRoute());
  };

  if (route.demo) return <Demo onLeave={() => go("/")} />;
  if (route.code) return <Room code={route.code} spectate={route.watch} onLeave={() => go("/")} />;
  return <Lobby onEnter={(code, watch) => go(`/r/${code}${watch ? "?watch=1" : ""}`)} onDemo={() => go("/demo")} />;
}

function Lobby({ onEnter, onDemo }: { onEnter: (code: string, watch: boolean) => void; onDemo: () => void }) {
  useEffect(() => bgm.play("lobby"), []);
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const needName = () => {
    unlockAudio();
    if (!name.trim()) {
      setErr("まずは名を名乗れ!!");
      return true;
    }
    saveName(name.trim());
    return false;
  };
  const create = () => {
    if (needName()) return;
    onEnter(String(Math.floor(1000 + Math.random() * 9000)), false);
  };
  const join = (e: Event) => {
    e.preventDefault();
    if (needName()) return;
    if (!/^\d{4}$/.test(code)) return setErr("部屋番号は4桁の数字だ!");
    onEnter(code, false);
  };
  const watch = () => {
    unlockAudio();
    if (!/^\d{4}$/.test(code)) return setErr("観戦する部屋番号を4桁で入れてくれ!");
    onEnter(code, true);
  };

  return (
    <main class="lobby">
      <header class="title">
        <p class="title-sub">言葉が、技になる。</p>
        <h1>
          <span>AI</span>ワード<br />バトル
        </h1>
        <div class="title-fx" aria-hidden="true" />
      </header>

      <div class="lobby-form">
        <label class="field">
          <span>名前</span>
          <input id="name" value={name} maxLength={12} placeholder="例: 炎太郎" onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <button type="button" class="btn-ink big" onClick={create}>
          部屋を作る!!
        </button>
        <div class="or">または</div>
        <form class="join" onSubmit={join}>
          <input
            id="code"
            value={code}
            inputMode="numeric"
            maxLength={4}
            placeholder="部屋番号4桁"
            aria-label="部屋番号"
            onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ""))}
          />
          <button type="submit" class="btn-red">
            入る
          </button>
        </form>
        <button type="button" class="link" onClick={watch}>
          この部屋番号を観戦する →
        </button>
        <button
          type="button"
          class="link"
          onClick={() => {
            unlockAudio();
            onDemo();
          }}
        >
          CPUと演出デモ (AIなし) →
        </button>
        {err && <p class="lobby-err">{err}</p>}
      </div>

      <details class="rules">
        <summary>ルール</summary>
        <ul>
          <li>毎ターン、<b>攻撃</b>か<b>防御</b>を選んで技名を自由に書く。両者そろったら同時に公開。</li>
          <li>AIが技名の「意味」から属性・強さ・独創性を読み取ってダメージを決める。</li>
          <li>相性: 水→炎→社畜→雷→水 / 光⇄闇。</li>
          <li>攻撃に噛み合った防御技を出すとカウンター! 「炎の竜巻」に「消防車を召喚」のように。</li>
          <li>同じような技の連発、相手のパクリ、「最強」「究極」の盛りすぎは威力ダウン。</li>
          <li>両者防御なら気合がたまり、次の攻撃が強くなる。HP100を先に削り切った方の勝ち。</li>
        </ul>
      </details>
    </main>
  );
}
