import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";

const syne = loadSyne("normal", { weights: ["700", "800"], subsets: ["latin"] });
const jakarta = loadJakarta("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

const SCENE = 150; // 5s per scene
const SCENES = 5;
export const TOTAL_FRAMES = SCENE * SCENES; // 25s

type ShotProps = {
  src: string;
  title: string;
  subtitle: string;
  accent: string;
  bg: string;
};

const shots: ShotProps[] = [
  { src: "shots/01-map-heatmap.png", title: "See the city\nlight up.", subtitle: "Live heatmap of what's popping in Charlotte.", accent: "#E11D48", bg: "radial-gradient(120% 80% at 20% 10%, #1a0a12 0%, #08060a 60%, #000 100%)" },
  { src: "shots/02-jetcard.png", title: "Real deals.\nRight now.", subtitle: "Open-now venues with live offers on tap.", accent: "#C9A961", bg: "radial-gradient(120% 80% at 80% 20%, #1a1408 0%, #0a0805 60%, #000 100%)" },
  { src: "shots/03-favorites.png", title: "Save your\nfavorites.", subtitle: "Every spot you love, one tap away.", accent: "#EC4899", bg: "radial-gradient(120% 80% at 30% 80%, #1a0a1a 0%, #0a0710 60%, #000 100%)" },
  { src: "shots/04-messages.png", title: "Roll with\nyour crew.", subtitle: "Message, plan, and meet up in real time.", accent: "#8B5CF6", bg: "radial-gradient(120% 80% at 70% 70%, #120a1a 0%, #08060f 60%, #000 100%)" },
  { src: "shots/05-layers-sheet.png", title: "Your city,\nyour way.", subtitle: "Toggle layers. Time-lapse the night.", accent: "#9CA3AF", bg: "radial-gradient(120% 80% at 50% 50%, #0f1218 0%, #06080b 60%, #000 100%)" },
];

const Scene: React.FC<ShotProps & { index: number }> = ({ src, title, subtitle, accent, bg, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inSpring = spring({ frame, fps, config: { damping: 22, stiffness: 120, mass: 1 } });
  const parallax = interpolate(frame, [0, SCENE], [40, -40]);
  const zoom = interpolate(frame, [0, SCENE], [1.02, 1.08]);
  const opacity = interpolate(frame, [0, 12, SCENE - 15, SCENE], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  const titleY = interpolate(inSpring, [0, 1], [40, 0]);
  const titleO = interpolate(frame, [6, 22, SCENE - 12, SCENE], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  const subY = interpolate(spring({ frame: frame - 8, fps, config: { damping: 22 } }), [0, 1], [24, 0]);
  const subO = interpolate(frame, [14, 30, SCENE - 12, SCENE], [0, 1, 1, 0], { extrapolateRight: "clamp" });

  const shotY = interpolate(spring({ frame: frame - 4, fps, config: { damping: 24, stiffness: 90 } }), [0, 1], [80, 0]);
  const shotO = interpolate(frame, [4, 24], [0, 1], { extrapolateRight: "clamp" });

  const align = index % 2 === 0 ? "flex-start" : "flex-end";
  const textAlign = index % 2 === 0 ? "left" : "right";

  return (
    <AbsoluteFill style={{ background: bg, opacity, fontFamily: jakarta.fontFamily }}>
      {/* Accent orb (kept away from title/subtitle area) */}
      <div style={{
        position: "absolute",
        width: 1100, height: 1100, borderRadius: "50%",
        left: index % 2 === 0 ? -500 : WIDTH - 600,
        top: parallax + 900,
        background: `radial-gradient(circle, ${accent}44 0%, ${accent}00 60%)`,
        filter: "blur(60px)",
        zIndex: 0,
      }} />

      {/* Title */}
      <div style={{
        position: "absolute",
        top: 140,
        left: 60, right: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: align,
        zIndex: 2,
      }}>
        <div style={{
          fontFamily: syne.fontFamily,
          fontWeight: 800,
          fontSize: 96,
          lineHeight: 1.02,
          color: "#fff",
          letterSpacing: "-0.03em",
          whiteSpace: "pre-line",
          textAlign: textAlign as any,
          transform: `translateY(${titleY}px)`,
          opacity: titleO,
          textShadow: `0 8px 40px ${accent}66`,
        }}>{title}</div>
        <div style={{
          marginTop: 24,
          fontSize: 34,
          fontWeight: 400,
          color: "#e5e7eb",
          maxWidth: 780,
          textAlign: textAlign as any,
          transform: `translateY(${subY}px)`,
          opacity: subO,
        }}>{subtitle}</div>
        <div style={{
          marginTop: 20,
          width: interpolate(frame, [20, 50], [0, 180], { extrapolateRight: "clamp" }),
          height: 4,
          borderRadius: 2,
          background: accent,
          boxShadow: `0 0 20px ${accent}`,
        }} />
      </div>

      {/* Screenshot */}
      <div style={{
        position: "absolute",
        bottom: -60,
        left: "50%",
        transform: `translateX(-50%) translateY(${shotY}px) scale(${zoom})`,
        opacity: shotO,
        filter: `drop-shadow(0 40px 80px ${accent}55) drop-shadow(0 20px 40px #000c)`,
      }}>
        <Img src={staticFile(src)} style={{ width: 780, height: "auto", display: "block" }} />
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18 } });
  const scale = interpolate(s, [0, 1], [0.85, 1]);
  const op = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{
      background: "radial-gradient(circle at 50% 50%, #1a0a14 0%, #000 70%)",
      alignItems: "center",
      justifyContent: "center",
      opacity: op,
    }}>
      <div style={{
        fontFamily: syne.fontFamily,
        fontWeight: 800,
        fontSize: 200,
        color: "#fff",
        letterSpacing: "-0.06em",
        transform: `scale(${scale})`,
        textShadow: "0 0 60px #E11D4899",
      }}>JET</div>
      <div style={{
        marginTop: 20,
        fontFamily: jakarta.fontFamily,
        fontSize: 40,
        color: "#C9A961",
        letterSpacing: "0.3em",
      }}>CHARLOTTE</div>
      <div style={{
        marginTop: 60,
        fontFamily: jakarta.fontFamily,
        fontSize: 32,
        color: "#e5e7eb",
        opacity: interpolate(frame, [15, 40], [0, 1], { extrapolateRight: "clamp" }),
      }}>Download now</div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {shots.slice(0, 4).map((s, i) => (
        <Sequence key={i} from={i * SCENE} durationInFrames={SCENE}>
          <Scene {...s} index={i} />
        </Sequence>
      ))}
      <Sequence from={4 * SCENE} durationInFrames={SCENE}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};