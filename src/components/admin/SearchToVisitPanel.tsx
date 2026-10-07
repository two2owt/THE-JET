import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, RefreshCw, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Admin: search → venue visit funnel, plus popularity by area.
 * Searches = search events. Venue visits = venue/deal opens and directions taps.
 * Foot traffic = distinct people whose real location placed them in an area.
 * Legacy Title Case names are included so historical data still counts.
 */
const SEARCH_EVENTS = ["search_performed", "Search Performed"];
const OPEN_EVENTS = ["view_deal", "Deal Viewed", "Deal Clicked", "category_filtered_venue_opened", "deep_link_opened", "Deep Link Opened"];
const DIRECTION_EVENTS = ["get_directions"];
const ALL = [...SEARCH_EVENTS, ...OPEN_EVENTS, ...DIRECTION_EVENTS];

const WINDOWS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

type Row = { event_name: string; event_data: Record<string, unknown> | null; user_id: string | null; session_id: string | null };
type AreaStat = { area: string; searches: number; opens: number; directions: number; footTraffic: number };

const who = (r: Row) => r.user_id ?? r.session_id ?? "anon";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function SearchToVisitPanel() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ searchers: 0, searches: 0, visitors: 0, opens: 0, directions: 0, converted: 0 });
  const [areas, setAreas] = useState<AreaStat[]>([]);
  const [topTerms, setTopTerms] = useState<Array<[string, number]>>([]);
  const [topVenues, setTopVenues] = useState<Array<[string, number]>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    try {
      const [ev, loc, hoods] = await Promise.all([
        supabase.from("analytics_events").select("event_name, event_data, user_id, session_id").in("event_name", ALL).gte("created_at", since).limit(10000),
        supabase.from("user_locations").select("user_id, current_neighborhood_id").gte("created_at", since).not("current_neighborhood_id", "is", null).limit(10000),
        supabase.from("neighborhoods").select("id, name"),
      ]);
      if (ev.error) throw new Error(ev.error.message);
      const rows = (ev.data ?? []) as Row[];
      const hoodName = new Map((hoods.data ?? []).map((h) => [h.id, h.name]));

      const searchers = new Set<string>();
      const visitors = new Set<string>();
      let searches = 0, opens = 0, directions = 0;
      const areaMap = new Map<string, AreaStat>();
      const area = (name: string) => {
        let a = areaMap.get(name);
        if (!a) { a = { area: name, searches: 0, opens: 0, directions: 0, footTraffic: 0 }; areaMap.set(name, a); }
        return a;
      };
      const terms = new Map<string, number>();
      const venues = new Map<string, number>();

      for (const r of rows) {
        const d = r.event_data ?? {};
        const hood = str(d.neighborhood) ?? str(d.venue_neighborhood) ?? str(d.city);
        if (SEARCH_EVENTS.includes(r.event_name)) {
          searches++; searchers.add(who(r));
          const q = str(d.query) ?? str(d.search_query) ?? str(d.search_term);
          if (q) terms.set(q.toLowerCase(), (terms.get(q.toLowerCase()) ?? 0) + 1);
          if (hood) area(hood).searches++;
        } else {
          if (r.event_name === "deep_link_opened" || r.event_name === "Deep Link Opened") {
            if (d.kind && d.kind !== "venue" && d.type !== "venue") continue;
          }
          visitors.add(who(r));
          const isDir = DIRECTION_EVENTS.includes(r.event_name);
          if (isDir) directions++; else opens++;
          const v = str(d.venue_name) ?? str(d.deal_name);
          if (v) venues.set(v, (venues.get(v) ?? 0) + 1);
          if (hood) { const a = area(hood); if (isDir) a.directions++; else a.opens++; }
        }
      }

      const foot = new Map<string, Set<string>>();
      for (const l of loc.data ?? []) {
        const name = hoodName.get(l.current_neighborhood_id as string);
        if (!name || !l.user_id) continue;
        if (!foot.has(name)) foot.set(name, new Set());
        foot.get(name)!.add(l.user_id);
      }
      for (const [name, set] of foot) area(name).footTraffic = set.size;

      let converted = 0;
      for (const s of searchers) if (visitors.has(s)) converted++;

      setTotals({ searchers: searchers.size, searches, visitors: visitors.size, opens, directions, converted });
      setAreas([...areaMap.values()].sort((a, b) => (b.opens + b.directions + b.footTraffic + b.searches) - (a.opens + a.directions + a.footTraffic + a.searches)).slice(0, 12));
      setTopTerms([...terms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
      setTopVenues([...venues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const rate = totals.searchers ? Math.round((totals.converted / totals.searchers) * 100) : 0;
  const stat = (label: string, value: string | number, sub?: string) => (
    <div className="rounded-xl border border-border/50 bg-popover/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );

  return (
    <Card className="bg-card/90 border-primary/10 rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="w-4 h-4 text-primary" /> Searches → venue visits
        </CardTitle>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <Button key={w.days} size="sm" variant={days === w.days ? "default" : "ghost"} onClick={() => setDays(w.days)}>{w.label}</Button>
          ))}
          <Button size="icon" variant="ghost" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading ? <Skeleton className="h-40 w-full" /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {stat("People searching", totals.searchers, `${totals.searches} searches`)}
              {stat("People visiting a venue", totals.visitors, `${totals.opens} opens`)}
              {stat("Directions taps", totals.directions, "intent to go")}
              {stat("Search → visit", `${rate}%`, `${totals.converted} of ${totals.searchers} searchers`)}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-primary" /> Popular areas</h3>
              {areas.length === 0 ? <p className="text-xs text-muted-foreground">No area activity in this window yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground"><tr className="text-left">
                      <th className="py-1 pr-2">Area</th><th className="py-1 px-2 text-right">Searches</th><th className="py-1 px-2 text-right">Venue opens</th><th className="py-1 px-2 text-right">Directions</th><th className="py-1 pl-2 text-right">People there</th>
                    </tr></thead>
                    <tbody>
                      {areas.map((a) => (
                        <tr key={a.area} className="border-t border-border/40">
                          <td className="py-1.5 pr-2 font-medium text-foreground">{a.area}</td>
                          <td className="py-1.5 px-2 text-right">{a.searches}</td>
                          <td className="py-1.5 px-2 text-right">{a.opens}</td>
                          <td className="py-1.5 px-2 text-right">{a.directions}</td>
                          <td className="py-1.5 pl-2 text-right">{a.footTraffic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Search className="w-3.5 h-3.5 text-primary" /> Top searches</h3>
                {topTerms.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : topTerms.map(([t, n]) => (
                  <div key={t} className="flex justify-between text-xs py-0.5"><span className="truncate">{t}</span><span className="text-muted-foreground">{n}</span></div>
                ))}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5 text-primary" /> Most visited venues</h3>
                {topVenues.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : topVenues.map(([v, n]) => (
                  <div key={v} className="flex justify-between text-xs py-0.5"><span className="truncate">{v}</span><span className="text-muted-foreground">{n}</span></div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
