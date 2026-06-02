import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface LayerToggleRowProps {
  label: string;
  active: boolean;
  Icon: LucideIcon;
  ariaLabel: string;
  onToggle: () => void;
}

/**
 * Single layer toggle row used inside the map's Layers panel.
 *
 * Tap-to-toggle pill with a glassmorphic Dark Luxe finish — no nested
 * Switch control. Active state uses the JET primary→primary-glow gradient
 * with a soft outer glow; inactive state is a subtle hairline-bordered
 * glass row. A small status dot replaces the previous Switch so the row
 * never reads as two stacked toggles.
 *
 * Framer Motion springs provide tactile pop/scale feedback on activation
 * and smooth glassmorphic transitions between states.
 */
export const LayerToggleRow = ({
  label,
  active,
  Icon,
  ariaLabel,
  onToggle,
}: LayerToggleRowProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      layout
      initial={false}
      animate={{
        scale: active ? 1 : 0.985,
        background: active
          ? "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary-glow) / 0.14))"
          : "hsl(var(--card) / 0.5)",
        borderColor: active
          ? "hsl(var(--primary) / 0.45)"
          : "hsl(var(--border) / 0.5)",
        boxShadow: active
          ? "0 8px 24px -10px hsl(var(--primary) / 0.55), inset 0 0 0 1px hsl(var(--primary-glow) / 0.18)"
          : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
      }}
      whileTap={{ scale: 0.96 }}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 26,
        mass: 0.8,
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "10px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.01em",
        cursor: "pointer",
        userSelect: "none",
        backdropFilter: "blur(12px) saturate(1.4)",
        WebkitBackdropFilter: "blur(12px) saturate(1.4)",
        color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
      }}
    >
      {/* Icon container with pop animation */}
      <motion.div
        layout
        initial={false}
        animate={{
          scale: active ? 1 : 0.92,
          background: active
            ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
            : "hsl(var(--background) / 0.6)",
          color: active
            ? "hsl(var(--primary-foreground))"
            : "hsl(var(--muted-foreground))",
          borderColor: active
            ? "transparent"
            : "hsl(var(--border) / 0.6)",
          boxShadow: active
            ? "0 4px 12px -4px hsl(var(--primary) / 0.6)"
            : "none",
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 20,
          delay: active ? 0.03 : 0,
        }}
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "1px solid",
        }}
      >
        <Icon style={{ width: "14px", height: "14px" }} strokeWidth={2.25} />
      </motion.div>

      {/* Label */}
      <motion.span
        layout
        className="font-display"
        initial={false}
        animate={{
          color: active
            ? "hsl(var(--foreground))"
            : "hsl(var(--foreground) / 0.75)",
        }}
        transition={{ duration: 0.18 }}
        style={{
          flex: 1,
          textAlign: "left",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </motion.span>

      {/* Status dot with scale + glow bloom */}
      <motion.span
        aria-hidden="true"
        layout
        initial={false}
        animate={{
          scale: active ? 1.25 : 1,
          background: active
            ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
            : "hsl(var(--muted-foreground) / 0.25)",
          boxShadow: active
            ? "0 0 10px hsl(var(--primary) / 0.7), 0 0 2px hsl(var(--primary-glow) / 0.6)"
            : "inset 0 0 0 1px hsl(var(--border))",
        }}
        transition={{
          type: "spring",
          stiffness: 550,
          damping: 18,
          delay: active ? 0.05 : 0,
        }}
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "9999px",
          flexShrink: 0,
        }}
      />
    </motion.div>
  );
};
