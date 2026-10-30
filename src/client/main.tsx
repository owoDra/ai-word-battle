import { render } from "preact";
import { App } from "./app";
import { sfx, unlockAudio, type UiSound } from "./sound";
import "./style.css";

// リロード後も最初のタップで音を出せるようにする
addEventListener("pointerdown", unlockAudio, { once: true });

// ボタンのホバー/押下音。data-sfx で個別の音 (attack/defense) や無音 (none) を指定できる
const buttonOf = (e: Event) => (e.target as Element | null)?.closest?.("button, summary, .link") as HTMLElement | null;
addEventListener("pointerover", (e) => {
  const b = buttonOf(e);
  if (e.pointerType === "mouse" && b && !b.contains(e.relatedTarget as Node) && !(b as HTMLButtonElement).disabled) sfx.ui("hover");
});
addEventListener("pointerdown", (e) => {
  const b = buttonOf(e);
  if (!b || (b as HTMLButtonElement).disabled) return;
  const kind = b.dataset.sfx;
  if (kind !== "none") sfx.ui((kind as UiSound) || "press");
});

render(<App />, document.getElementById("app")!);
