import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { useBottomNavigation } from "@/hooks/useBottomNavigation";

/**
 * Persistent navigation shell rendered as Suspense fallback.
 * Ensures Header and BottomNav are always visible during lazy page loads,
 * preventing layout shifts and visual flicker on route transitions.
 */
export function NavigationShell() {
  const { activeTab, handleTabChange } = useBottomNavigation({ defaultTab: "map" });

  return (
    <div
      className="relative w-full h-full"
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        overflow: 'hidden',
        paddingTop: 'var(--header-total-height)',
      }}
    >
      <Header
        venues={[]}
        deals={[]}
        onVenueSelect={() => {}}
      />

      <main
        role="main"
        style={{
          flex: '1 1 auto',
          height: 'var(--main-height)',
          minHeight: 'var(--main-height)',
          maxHeight: 'var(--main-height)',
          contain: 'strict',
          transform: 'translateZ(0)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      />

      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        notificationCount={0}
      />
    </div>
  );
}
