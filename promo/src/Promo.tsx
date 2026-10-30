import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import { C } from "./fx";
import { SCENE_VIEWS, titleSlam } from "./scenes";
import { FPS, TIMELINE, TOTAL } from "./timeline";

// BGM はタイトルが叩きつけられた瞬間から。ナレーション中は絞る
const BGM_FROM = TIMELINE[0].from + Math.round(titleSlam(TIMELINE[0]) * FPS);
const VOICE_SPANS = TIMELINE.flatMap((sc) => sc.lines.map((l) => [sc.from + l.at * FPS, sc.from + (l.at + l.sec) * FPS] as const));

function bgmVolume(f: number): number {
  const g = f + BGM_FROM;
  const talking = VOICE_SPANS.some(([a, b]) => g >= a - 3 && g <= b + 3);
  const fade = interpolate(g, [TOTAL - 20, TOTAL], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (talking ? 0.2 : 0.42) * fade;
}

export function Promo() {
  return (
    <AbsoluteFill style={{ background: C.ink, fontWeight: 900 }}>
      <Sequence from={BGM_FROM} layout="none">
        <Audio src={staticFile("sfx/bgm.wav")} volume={bgmVolume} />
      </Sequence>
      {TIMELINE.map((sc) => {
        const View = SCENE_VIEWS[sc.id];
        return (
          <Sequence key={sc.id} from={sc.from} durationInFrames={sc.dur} name={sc.id}>
            <View sc={sc} />
            {sc.lines.map((l) => (
              <Sequence key={l.id} from={Math.round(l.at * FPS)} layout="none" name={`voice:${l.id}`}>
                <Audio src={staticFile(`voice/${l.id}.wav`)} volume={1.6} />
              </Sequence>
            ))}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
