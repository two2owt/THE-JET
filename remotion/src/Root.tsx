import React from "react";
import { Composition } from "remotion";
import { MainVideo, FPS, WIDTH, HEIGHT, TOTAL_FRAMES } from "./MainVideo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
