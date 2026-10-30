import { Composition } from "remotion";
import { Promo } from "./Promo";
import { FPS, TOTAL } from "./timeline";

export const Root = () => <Composition id="Promo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />;
