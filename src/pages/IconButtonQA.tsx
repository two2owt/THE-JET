/**
 * Dev-only QA page to visually verify IconButton states across all auth inputs.
 * Mounted at /dev/icon-button only when import.meta.env.DEV is true.
 *
 * Verify by hand:
 *   - Default: muted icon on transparent bg
 *   - Hover: primary/10 bg, primary text
 *   - Focus-visible (Tab key): 2px primary/50 ring with offset
 *   - Pressed (aria-pressed=true via toggle): icon swap + persistent state
 *   - Disabled: 50% opacity, no pointer events
 */
import { useState } from "react";
import { Eye, EyeOff, X, Search } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-6 py-3 border-b border-border last:border-0">
    <span className="text-sm text-muted-foreground w-48 shrink-0">{label}</span>
    <div className="flex items-center gap-3">{children}</div>
  </div>
);

export default function IconButtonQA() {
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(true);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-foreground">IconButton QA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tab through controls to verify focus rings. Hover each button. All states should match design tokens.
          </p>
        </header>

        <Card className="p-6 space-y-1">
          <h2 className="text-lg font-semibold mb-2">Variants</h2>
          <Row label="default (auth password)">
            <IconButton ariaLabel="Default"><Eye /></IconButton>
            <IconButton ariaLabel="Default pressed" ariaPressed><EyeOff /></IconButton>
            <IconButton ariaLabel="Default disabled" disabled><Eye /></IconButton>
          </Row>
          <Row label="ghost">
            <IconButton variant="ghost" ariaLabel="Ghost"><X /></IconButton>
            <IconButton variant="ghost" ariaLabel="Ghost disabled" disabled><X /></IconButton>
          </Row>
          <Row label="muted">
            <IconButton variant="muted" ariaLabel="Muted"><Search /></IconButton>
            <IconButton variant="muted" ariaLabel="Muted disabled" disabled><Search /></IconButton>
          </Row>
        </Card>

        <Card className="p-6 space-y-1">
          <h2 className="text-lg font-semibold mb-2">Sizes</h2>
          <Row label="sm (36px → 44px on touch)">
            <IconButton size="sm" ariaLabel="Small"><Eye /></IconButton>
          </Row>
          <Row label="default (44px)">
            <IconButton size="default" ariaLabel="Default size"><Eye /></IconButton>
          </Row>
          <Row label="lg (48px)">
            <IconButton size="lg" ariaLabel="Large"><Eye /></IconButton>
          </Row>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Auth-style password input integration</h2>
          <p className="text-xs text-muted-foreground">
            Toggle each eye. Confirm the icon swaps, aria-pressed updates, and the input type changes.
            Tab between inputs and toggles to verify focus rings.
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">Password</label>
            <div className="relative">
              <Input
                type={show1 ? "text" : "password"}
                placeholder="Password"
                defaultValue="hunter2hunter2"
                className="bg-card border-border pr-12"
              />
              <IconButton
                onClick={() => setShow1((v) => !v)}
                ariaLabel={show1 ? "Hide password" : "Show password"}
                ariaPressed={show1}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                {show1 ? <EyeOff /> : <Eye />}
              </IconButton>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">Confirm Password (starts shown)</label>
            <div className="relative">
              <Input
                type={show2 ? "text" : "password"}
                placeholder="Confirm Password"
                defaultValue="hunter2hunter2"
                className="bg-card border-border pr-12"
              />
              <IconButton
                onClick={() => setShow2((v) => !v)}
                ariaLabel={show2 ? "Hide password" : "Show password"}
                ariaPressed={show2}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                {show2 ? <EyeOff /> : <Eye />}
              </IconButton>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">Disabled input + toggle</label>
            <div className="relative">
              <Input
                type="password"
                placeholder="Locked"
                defaultValue="locked"
                disabled
                className="bg-card border-border pr-12"
              />
              <IconButton
                ariaLabel="Show password (disabled)"
                disabled
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                <Eye />
              </IconButton>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">Manual checklist</h2>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>Hover: background tints to primary/10, icon shifts to primary color</li>
            <li>Focus-visible (keyboard Tab): 2px primary/50 ring with offset</li>
            <li>Focus-visible does NOT trigger on mouse click</li>
            <li>aria-pressed reflects current state (inspect element)</li>
            <li>Disabled: 50% opacity, cursor unchanged, click does nothing</li>
            <li>Touch target ≥ 44×44px (default/lg) — verify in DevTools</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
