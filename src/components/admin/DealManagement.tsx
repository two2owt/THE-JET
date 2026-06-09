import { useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Edit, Trash2, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { DealForm } from "./DealForm";
import { OnboardingStatusBadge } from "./OnboardingStatusBadge";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database['public']['Tables']['deals']['Row'];

/* ------------ URL <-> filter helpers ------------ */
const FILTER_KEYS = ["q", "types", "status", "from", "to", "priority", "merchants", "neighborhoods", "days"] as const;

type Priority = "high" | "medium" | "low";

interface Filters {
  q: string;
  types: string[];
  status: "all" | "active" | "inactive" | "expired" | "upcoming";
  from: string; // YYYY-MM-DD
  to: string;
  priority: Priority[];
  merchants: string[];      // merchant_id values; "__none__" = unassigned
  neighborhoods: string[];  // neighborhood_id values; "__none__" = unassigned
  days: number[];           // 0=Sun .. 6=Sat
}

const PRIORITY_OPTIONS: Priority[] = ["high", "medium", "low"];
const NONE_KEY = "__none__";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Derive a "priority" bucket from expiry urgency (no schema field exists). */
function dealPriority(deal: Deal, now = new Date()): Priority | null {
  if (!deal.expires_at) return "low";
  const expires = new Date(deal.expires_at);
  const diffDays = (expires.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < 0) return null; // expired — exclude from priority counts
  if (diffDays <= 7) return "high";
  if (diffDays <= 30) return "medium";
  return "low";
}

function readFilters(params: URLSearchParams): Filters {
  const status = (params.get("status") as Filters["status"]) || "all";
  const priority = (params.get("priority") || "")
    .split(",")
    .filter((p): p is Priority => (PRIORITY_OPTIONS as string[]).includes(p));
  const days = (params.get("days") || "")
    .split(",")
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return {
    q: params.get("q") || "",
    types: (params.get("types") || "").split(",").filter(Boolean),
    status: ["all", "active", "inactive", "expired", "upcoming"].includes(status) ? status : "all",
    from: params.get("from") || "",
    to: params.get("to") || "",
    priority,
    merchants: (params.get("merchants") || "").split(",").filter(Boolean),
    neighborhoods: (params.get("neighborhoods") || "").split(",").filter(Boolean),
    days,
  };
}

function matchesFilters(deal: Deal, f: Filters, now = new Date()): boolean {
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = `${deal.title} ${deal.venue_name} ${deal.description}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.types.length && !f.types.includes(deal.deal_type)) return false;
  const starts = deal.starts_at ? new Date(deal.starts_at) : null;
  const expires = deal.expires_at ? new Date(deal.expires_at) : null;
  if (f.status !== "all") {
    const isExpired = expires && expires < now;
    const isUpcoming = starts && starts > now;
    if (f.status === "active" && !deal.active) return false;
    if (f.status === "inactive" && deal.active) return false;
    if (f.status === "expired" && !isExpired) return false;
    if (f.status === "upcoming" && !isUpcoming) return false;
  }
  if (f.from && expires && expires < new Date(f.from)) return false;
  if (f.to && starts && starts > new Date(f.to + "T23:59:59")) return false;
  if (f.priority.length) {
    const p = dealPriority(deal, now);
    if (!p || !f.priority.includes(p)) return false;
  }
  if (f.merchants.length) {
    const key = deal.merchant_id ?? NONE_KEY;
    if (!f.merchants.includes(key)) return false;
  }
  if (f.neighborhoods.length) {
    const key = deal.neighborhood_id ?? NONE_KEY;
    if (!f.neighborhoods.includes(key)) return false;
  }
  if (f.days.length) {
    const days = deal.active_days ?? [];
    if (!f.days.some((d) => days.includes(d))) return false;
  }
  return true;
}

const STATUS_OPTIONS: { id: Filters["status"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "upcoming", label: "Upcoming" },
  { id: "expired", label: "Expired" },
];

export const DealManagement = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (next: Partial<Filters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams(searchParams);
      // Preserve unrelated params (e.g. ?section=deals)
      FILTER_KEYS.forEach((k) => params.delete(k));
      if (merged.q) params.set("q", merged.q);
      if (merged.types.length) params.set("types", merged.types.join(","));
      if (merged.status !== "all") params.set("status", merged.status);
      if (merged.from) params.set("from", merged.from);
      if (merged.to) params.set("to", merged.to);
      if (merged.priority.length) params.set("priority", merged.priority.join(","));
      if (merged.merchants.length) params.set("merchants", merged.merchants.join(","));
      if (merged.neighborhoods.length) params.set("neighborhoods", merged.neighborhoods.join(","));
      if (merged.days.length) params.set("days", merged.days.join(","));
      setSearchParams(params, { replace: true });
    },
    [filters, searchParams, setSearchParams],
  );

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    FILTER_KEYS.forEach((k) => params.delete(k));
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: deals, isLoading } = useQuery({
    queryKey: ['admin-deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Resolve neighborhood ids → names for facet labels.
  const { data: neighborhoods } = useQuery({
    queryKey: ['admin-neighborhoods-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('neighborhoods').select('id,name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const neighborhoodNameById = useMemo(() => {
    const m = new Map<string, string>();
    (neighborhoods ?? []).forEach((n) => m.set(n.id, n.name));
    return m;
  }, [neighborhoods]);

  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', dealId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-deals'] });
      toast.success('Deal deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete deal');
      console.error('Delete error:', error);
    },
  });

  /* ------------ Faceted aggregates (over full unfiltered set for stable counts) ------------ */
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    (deals ?? []).forEach((d) => map.set(d.deal_type, (map.get(d.deal_type) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [deals]);

  const statusCounts = useMemo(() => {
    const now = new Date();
    const counts: Record<Filters["status"], number> = {
      all: deals?.length ?? 0, active: 0, inactive: 0, upcoming: 0, expired: 0,
    };
    (deals ?? []).forEach((d) => {
      const expires = d.expires_at ? new Date(d.expires_at) : null;
      const starts = d.starts_at ? new Date(d.starts_at) : null;
      if (d.active) counts.active += 1; else counts.inactive += 1;
      if (expires && expires < now) counts.expired += 1;
      if (starts && starts > now) counts.upcoming += 1;
    });
    return counts;
  }, [deals]);

  const priorityCounts = useMemo(() => {
    const counts: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
    (deals ?? []).forEach((d) => {
      const p = dealPriority(d);
      if (p) counts[p] += 1;
    });
    return counts;
  }, [deals]);

  const merchantCounts = useMemo(() => {
    const map = new Map<string, number>();
    (deals ?? []).forEach((d) => {
      const key = d.merchant_id ?? NONE_KEY;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [deals]);

  const neighborhoodCounts = useMemo(() => {
    const map = new Map<string, number>();
    (deals ?? []).forEach((d) => {
      const key = d.neighborhood_id ?? NONE_KEY;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [deals]);

  const dayCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    (deals ?? []).forEach((d) => {
      (d.active_days ?? []).forEach((n) => {
        if (Number.isInteger(n) && n >= 0 && n <= 6) counts[n] += 1;
      });
    });
    return counts;
  }, [deals]);

  const filtered = useMemo(
    () => (deals ?? []).filter((d) => matchesFilters(d, filters)),
    [deals, filters],
  );

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (filters.q)
      chips.push({ key: "q", label: `“${filters.q}”`, onClear: () => updateFilters({ q: "" }) });
    filters.types.forEach((t) =>
      chips.push({
        key: `t:${t}`,
        label: t,
        onClear: () => updateFilters({ types: filters.types.filter((x) => x !== t) }),
      }),
    );
    if (filters.status !== "all")
      chips.push({ key: "status", label: `Status: ${filters.status}`, onClear: () => updateFilters({ status: "all" }) });
    if (filters.from)
      chips.push({ key: "from", label: `From ${filters.from}`, onClear: () => updateFilters({ from: "" }) });
    if (filters.to)
      chips.push({ key: "to", label: `To ${filters.to}`, onClear: () => updateFilters({ to: "" }) });
    filters.priority.forEach((p) =>
      chips.push({
        key: `p:${p}`,
        label: `Priority: ${p}`,
        onClear: () => updateFilters({ priority: filters.priority.filter((x) => x !== p) }),
      }),
    );
    filters.merchants.forEach((id) =>
      chips.push({
        key: `m:${id}`,
        label: `Merchant: ${id === NONE_KEY ? "Unassigned" : id.slice(0, 6)}`,
        onClear: () => updateFilters({ merchants: filters.merchants.filter((x) => x !== id) }),
      }),
    );
    filters.neighborhoods.forEach((id) =>
      chips.push({
        key: `n:${id}`,
        label: `Area: ${id === NONE_KEY ? "Unassigned" : neighborhoodNameById.get(id) ?? id.slice(0, 6)}`,
        onClear: () => updateFilters({ neighborhoods: filters.neighborhoods.filter((x) => x !== id) }),
      }),
    );
    filters.days.forEach((d) =>
      chips.push({
        key: `d:${d}`,
        label: DAY_LABELS[d],
        onClear: () => updateFilters({ days: filters.days.filter((x) => x !== d) }),
      }),
    );
    return chips;
  }, [filters, updateFilters, neighborhoodNameById]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isCreating || editingDeal) {
    return (
      <DealForm
        deal={editingDeal}
        onClose={() => {
          setIsCreating(false);
          setEditingDeal(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-deals'] });
          setIsCreating(false);
          setEditingDeal(null);
        }}
      />
    );
  }

  const Facets = (
    <FacetSidebar
      filters={filters}
      typeCounts={typeCounts}
      statusCounts={statusCounts}
      priorityCounts={priorityCounts}
      merchantCounts={merchantCounts}
      neighborhoodCounts={neighborhoodCounts}
      neighborhoodNameById={neighborhoodNameById}
      dayCounts={dayCounts}
      onChange={updateFilters}
      onClearAll={clearAll}
      hasActive={activeChips.length > 0}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Deals</h2>
          <p className="text-muted-foreground">Manage platform deals</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Deal
        </Button>
      </div>

      {/* Search + mobile filter trigger */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={filters.q}
            onChange={(e) => updateFilters({ q: e.target.value })}
            placeholder="Search deals by title, venue, description…"
            aria-label="Search deals"
            style={{ paddingLeft: 36 }}
          />
        </div>
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="lg:hidden" aria-label="Open filters">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="ml-2">Filters{activeChips.length ? ` (${activeChips.length})` : ""}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[320px] sm:w-[360px] overflow-y-auto">
            <SheetTitle className="mb-4">Filters</SheetTitle>
            {Facets}
          </SheetContent>
        </Sheet>
      </div>

      {/* Two-column layout: facet sidebar + results */}
      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="hidden lg:block">{Facets}</aside>

        <div className="space-y-4 min-w-0">
          {/* Results count + active chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length}</span>
              {" of "}
              {deals?.length ?? 0} deals
            </span>
            {activeChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onClear}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-muted/70 transition-colors"
              >
                {c.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            {activeChips.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-1 text-xs font-medium text-primary hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="grid gap-4">
            {filtered.map((deal) => (
              <Card key={deal.id}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{deal.title}</CardTitle>
                      <CardDescription className="truncate">{deal.venue_name}</CardDescription>
                      <div className="mt-2">
                        <OnboardingStatusBadge
                          startedAt={deal.onboarding_started_at}
                          completedAt={deal.onboarding_completed_at}
                          merchantId={deal.merchant_id}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => setEditingDeal(deal)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMutation.mutate(deal.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">{deal.description}</p>
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Type:</span> {deal.deal_type}
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-medium">Status:</span>{' '}
                    <span className={deal.active ? 'text-green-600' : 'text-red-600'}>
                      {deal.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filtered.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {deals?.length === 0
                    ? "No deals yet. Create your first deal!"
                    : "No deals match your filters."}
                  {activeChips.length > 0 && (
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={clearAll}>
                        Clear filters
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============== Facet sidebar ============== */
interface FacetSidebarProps {
  filters: Filters;
  typeCounts: [string, number][];
  statusCounts: Record<Filters["status"], number>;
  priorityCounts: Record<Priority, number>;
  merchantCounts: [string, number][];
  neighborhoodCounts: [string, number][];
  neighborhoodNameById: Map<string, string>;
  dayCounts: number[];
  onChange: (next: Partial<Filters>) => void;
  onClearAll: () => void;
  hasActive: boolean;
}

function FacetSidebar({
  filters,
  typeCounts,
  statusCounts,
  priorityCounts,
  merchantCounts,
  neighborhoodCounts,
  neighborhoodNameById,
  dayCounts,
  onChange,
  onClearAll,
  hasActive,
}: FacetSidebarProps) {
  const toggleType = (t: string) => {
    const set = new Set(filters.types);
    if (set.has(t)) set.delete(t); else set.add(t);
    onChange({ types: Array.from(set) });
  };
  const togglePriority = (p: Priority) => {
    const set = new Set(filters.priority);
    if (set.has(p)) set.delete(p); else set.add(p);
    onChange({ priority: Array.from(set) });
  };
  const toggleMerchant = (id: string) => {
    const set = new Set(filters.merchants);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ merchants: Array.from(set) });
  };
  const toggleNeighborhood = (id: string) => {
    const set = new Set(filters.neighborhoods);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ neighborhoods: Array.from(set) });
  };
  const toggleDay = (d: number) => {
    const set = new Set(filters.days);
    if (set.has(d)) set.delete(d); else set.add(d);
    onChange({ days: Array.from(set).sort((a, b) => a - b) });
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Filters</h3>
        {hasActive && (
          <button type="button" onClick={onClearAll} className="text-xs font-medium text-primary hover:underline">
            Clear all
          </button>
        )}
      </div>

      {/* Status (radio-style) */}
      <FacetGroup title="Status">
        <div className="flex flex-col gap-1.5">
          {STATUS_OPTIONS.map((s) => {
            const checked = filters.status === s.id;
            const count = statusCounts[s.id];
            return (
              <label
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors ${
                  checked ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="status"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={checked}
                    onChange={() => onChange({ status: s.id })}
                  />
                  {s.label}
                </span>
                <span className="text-xs tabular-nums opacity-70">{count}</span>
              </label>
            );
          })}
        </div>
      </FacetGroup>

      {/* Category (multi) */}
      <FacetGroup title="Category">
        {typeCounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No categories yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
            {typeCounts.map(([t, count]) => {
              const checked = filters.types.includes(t);
              return (
                <label
                  key={t}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Checkbox checked={checked} onCheckedChange={() => toggleType(t)} />
                    <span className="truncate">{t}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                </label>
              );
            })}
          </div>
        )}
      </FacetGroup>

      {/* Priority (derived from expiry urgency; multi) */}
      <FacetGroup title="Priority" hint="Derived from expiry">
        <div className="flex flex-col gap-1.5">
          {PRIORITY_OPTIONS.map((p) => {
            const checked = filters.priority.includes(p);
            return (
              <label
                key={p}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/50"
              >
                <span className="flex items-center gap-2 capitalize">
                  <Checkbox checked={checked} onCheckedChange={() => togglePriority(p)} />
                  {p}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{priorityCounts[p]}</span>
              </label>
            );
          })}
        </div>
      </FacetGroup>

      {/* Merchant (multi) */}
      <FacetGroup title="Merchant">
        {merchantCounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No merchants yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
            {merchantCounts.map(([id, count]) => {
              const checked = filters.merchants.includes(id);
              const label = id === NONE_KEY ? "Unassigned" : id.slice(0, 8);
              return (
                <label
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/50"
                  title={id === NONE_KEY ? undefined : id}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Checkbox checked={checked} onCheckedChange={() => toggleMerchant(id)} />
                    <span className="truncate font-mono text-xs">{label}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                </label>
              );
            })}
          </div>
        )}
      </FacetGroup>

      {/* Neighborhood (multi) */}
      <FacetGroup title="Neighborhood">
        {neighborhoodCounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No areas yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
            {neighborhoodCounts.map(([id, count]) => {
              const checked = filters.neighborhoods.includes(id);
              const label =
                id === NONE_KEY ? "Unassigned" : neighborhoodNameById.get(id) ?? id.slice(0, 8);
              return (
                <label
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Checkbox checked={checked} onCheckedChange={() => toggleNeighborhood(id)} />
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                </label>
              );
            })}
          </div>
        )}
      </FacetGroup>

      {/* Days active (tag-style multi) */}
      <FacetGroup title="Days active">
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((label, d) => {
            const checked = filters.days.includes(d);
            const count = dayCounts[d];
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={checked}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  checked
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {label}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </FacetGroup>

      {/* Date range */}
      <FacetGroup title="Date range">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => onChange({ from: e.target.value })}
              style={{ height: 36 }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => onChange({ to: e.target.value })}
              style={{ height: 36 }}
            />
          </label>
        </div>
      </FacetGroup>
    </div>
  );
}

function FacetGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
