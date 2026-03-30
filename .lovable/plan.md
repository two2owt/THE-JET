

## Navigation Skeleton Loading States

### Problem
The `NavigationShell` (Suspense fallback) currently renders an empty `<main>` with no visual content. When lazy-loaded pages are loading, users see a blank screen between the header and bottom nav. Individual tab pages also have no loading skeletons while data fetches.

### What We'll Build

**1. Header Skeleton** — A new `HeaderSkeleton` component matching the Header's layout: logo placeholder, search bar placeholder, and avatar circle. Uses the same CSS variables (`--header-total-height`, safe-area insets) and glassmorphic background.

**2. Bottom Nav Skeleton** — A new `BottomNavSkeleton` with 5 icon+label placeholder pills matching the real BottomNav's fixed positioning and CSS variables (`--bottom-nav-total-height`).

**3. Page Content Skeletons** — Tab-specific skeleton layouts:
- **Map tab**: Already has its own loading spinner (MapPin pulse) — no change needed
- **Favorites/Saved**: Heading skeleton + grid of card skeletons (1 col mobile, 2 tablet, 3 desktop)
- **Social/Crew**: Heading skeleton + section skeletons (friend requests row, friends grid, discover grid)
- **Notifications/Alerts**: Heading skeleton + stacked notification card skeletons
- **Explore/Hot**: Heading skeleton + search bar skeleton + category pills + deal card skeletons
- **Messages**: Heading skeleton + conversation list skeletons
- **Settings**: Heading skeleton + settings card group skeletons
- **Profile**: Avatar circle skeleton + name/bio skeletons + stats row + card sections

**4. NavigationShell Update** — Replace empty `<main>` with a generic page skeleton (heading + card placeholders) using the header/bottom nav skeletons.

### File Changes

| File | Action |
|------|--------|
| `src/components/skeletons/HeaderSkeleton.tsx` | **Create** — glassmorphic header with logo, search bar, avatar skeleton pills |
| `src/components/skeletons/BottomNavSkeleton.tsx` | **Create** — 5 icon+label skeleton placeholders with fixed positioning |
| `src/components/skeletons/PageSkeletons.tsx` | **Create** — exported skeleton components: `FavoritesPageSkeleton`, `SocialPageSkeleton`, `NotificationsTabSkeleton`, `ExploreTabSkeleton`, `MessagesPageSkeleton`, `SettingsPageSkeleton`, `ProfilePageSkeleton` |
| `src/components/NavigationShell.tsx` | **Update** — import and render `HeaderSkeleton` + generic content skeleton + `BottomNavSkeleton` |
| `src/pages/Favorites.tsx` | **Update** — show `FavoritesPageSkeleton` during data loading |
| `src/pages/Social.tsx` | **Update** — show `SocialPageSkeleton` during data loading |
| `src/pages/Messages.tsx` | **Update** — show `MessagesPageSkeleton` during data loading |
| `src/pages/Settings.tsx` | **Update** — show `SettingsPageSkeleton` during initial load |
| `src/pages/Profile.tsx` | **Update** — show `ProfilePageSkeleton` during data loading |
| `src/pages/Index.tsx` | **Update** — show `NotificationsTabSkeleton` / `ExploreTabSkeleton` in their respective Suspense fallbacks |

### Adaptive Spacing Strategy

All skeletons use the same responsive padding as their real counterparts:
- `px-4 sm:px-6 md:px-8 lg:px-10` for page containers
- `max-w-7xl mx-auto` for content width
- Grid skeletons use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` matching the `VirtualGrid` column config
- The Skeleton component's existing `animate-pulse` (from `bg-muted`) provides the shimmer effect
- CSS variables (`--header-total-height`, `--bottom-nav-total-height`, `--main-height`) ensure skeleton dimensions match the real layout exactly

### Skeleton Component Pattern

```text
┌─────────────────────────────┐
│  [▪ logo]  [▬▬▬ search ▬▬] [●] │  ← HeaderSkeleton
├─────────────────────────────┤
│  [▬▬▬▬▬▬▬▬ heading ▬▬▬▬▬▬] │
│  [▬▬▬ subtitle ▬▬]         │
│                             │
│  [┌──────┐ ┌──────┐ ┌────┐]│  ← Card grid (responsive cols)
│  [│      │ │      │ │    │]│
│  [└──────┘ └──────┘ └────┘]│
│  [┌──────┐ ┌──────┐ ┌────┐]│
│  [│      │ │      │ │    │]│
│  [└──────┘ └──────┘ └────┘]│
├─────────────────────────────┤
│  [▪] [▪] [▪] [▪] [▪]      │  ← BottomNavSkeleton
└─────────────────────────────┘
```

