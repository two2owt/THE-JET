import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConnections } from "@/hooks/useConnections";
import { useDebounce } from "@/hooks/useDebounce";
import { Users, UserPlus, Check, X, UserX, MessageCircle, Search, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { ConnectionProfileDialog } from "@/components/ConnectionProfileDialog";
import { ChatDialog } from "@/components/ChatDialog";
import { useUnreadCounts } from "@/hooks/useMessages";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { PageShell } from "@/components/PageShell";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import { SocialPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { SectionTitle } from "@/components/ui/page-title";
import { useAuth } from "@/contexts/AuthContext";
import { TabPageHeader } from "@/components/TabPageHeader";
import { Input } from "@/components/ui/input";

// Tap-to-expand display name with native tooltip on hover-capable devices.
// Truncates to a single line by default (clean ellipsis, zero CLS); on tap
// it expands to wrap and reveal the full string. Hover devices get the full
// name via the `title` attribute as a fallback.
function DisplayName({ name, style }: { name: string; style: React.CSSProperties }) {
  const [expanded, setExpanded] = useState(false);
  const expandedStyle: React.CSSProperties = expanded
    ? {
        ...style,
        WebkitLineClamp: 'unset' as any,
        display: 'block',
        whiteSpace: 'normal',
        overflow: 'visible',
        minHeight: 0,
      }
    : style;
  return (
    <button
      type="button"
      title={name}
      aria-label={expanded ? `Collapse ${name}` : `Show full name: ${name}`}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      style={{
        ...expandedStyle,
        background: 'none',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
        width: '100%',
      }}
    >
      {name}
    </button>
  );
}

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function Social() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [chatFriend, setChatFriend] = useState<{ id: string; name: string; avatar?: string | null } | null>(null);
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(new Set());
  const unreadCounts = useUnreadCounts(user?.id);
  const headerConfig = useMemo(() => ({ hideSearch: true }), []);

  const {
    connections,
    pendingRequests,
    sendRequest,
    acceptRequest,
    removeConnection,
  } = useConnections(user?.id);

  useEffect(() => {
    if (user) {
      fetchProfiles();
    }
  }, [user, connections, pendingRequests]);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Debounced search across discoverable end-user profiles.
  // Uses the `discoverable_profiles` view so RLS + discoverability
  // rules apply — only real signed-up users that opted into discovery
  // are searchable, and the current user is excluded server-side.
  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    if (!user || q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setIsSearching(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("discoverable_profiles")
          .select("id, display_name, avatar_url")
          .ilike("display_name", `%${q}%`)
          .neq("id", user.id)
          .order("display_name", { ascending: true })
          .limit(25)
          .abortSignal(controller.signal);
        if (cancelled) return;
        if (error) throw error;
        setSearchResults(data || []);
      } catch (err) {
        if (cancelled || (err as { name?: string })?.name === "AbortError") return;
        console.error("Error searching users:", err);
        setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearchQuery, user]);

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from("discoverable_profiles")
        .select("id, display_name, avatar_url")
        .neq("id", user?.id ?? "")
        .limit(50);

      if (error) throw error;
      // Exclude the current user, accepted connections, anyone with a
      // pending request in either direction, and profiles the user just
      // sent a request to. Discover should only surface signed-up,
      // discoverable users that the viewer is NOT already connected to.
      const excludedIds = new Set<string>();
      if (user?.id) excludedIds.add(user.id);
      for (const c of connections) {
        excludedIds.add(c.user_id === user?.id ? c.friend_id : c.user_id);
      }
      for (const r of pendingRequests) {
        if (r.profile?.id) excludedIds.add(r.profile.id);
        excludedIds.add(r.user_id);
        excludedIds.add(r.friend_id);
      }
      sentRequestIds.forEach((id) => excludedIds.add(id));
      setProfiles((data || []).filter((p) => !excludedIds.has(p.id)).slice(0, 20));
    } catch (error) {
      console.error("Error fetching profiles:", error);
    }
  };

  const handleSendRequest = async (friendId: string) => {
    const result = await sendRequest(friendId);
    if (result.success) {
      toast.success("Friend request sent!");
      setSentRequestIds((prev) => new Set(prev).add(friendId));
    } else {
      toast.error("Failed to send request");
    }
  };

  const handleAcceptRequest = async (connectionId: string) => {
    const result = await acceptRequest(connectionId);
    if (result.success) {
      toast.success("Friend request accepted!");
    } else {
      toast.error("Failed to accept request");
    }
  };

  const handleRemoveConnection = async (connectionId: string) => {
    const result = await removeConnection(connectionId);
    if (result.success) {
      toast.success("Connection removed");
    } else {
      toast.error("Failed to remove connection");
    }
  };

  if (authLoading) {
    return (
      <PageLayout defaultTab="social" headerConfig={headerConfig}>
        <PageShell>
          <SocialPageSkeleton />
        </PageShell>
      </PageLayout>
    );
  }

  if (!user) {
    return (
      <PageLayout defaultTab="social" notificationCount={0} headerConfig={headerConfig}>
        <PageShell>
          <EmptyState
            icon={Users}
            title="Sign in to connect"
            description="Create an account to find and connect with friends, share deals, and build your social network"
            actionLabel="Sign In"
            onAction={() => { rememberPostAuthRedirect(); navigate("/auth"); }}
          />
        </PageShell>
      </PageLayout>
    );
  }

  // Discoverability of other JET users is available to every authenticated
  // account. JET+ continues to unlock advanced social features (deal sharing,
  // group chats, etc.) — gating happens at those individual action sites.

  // Section headings now use the canonical luxe scale (`heading-luxe-section`)
  // so they inherit the small-screen line-height refinements in index.css and
  // stay legible at 320px. The gradient fill is dropped — the luxe scale
  // expresses hierarchy through weight + spacing, not gradient text, which
  // clips descenders at heavy weights on small Android viewports.

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Tuned for: 320px (iPhone SE), 360–393px (Android), 414px (iPhone Pro Max),
    // 768px (iPad). Padding stays comfortable without crowding the action buttons.
    gap: 'clamp(10px, 3vw, 14px)',
    padding: 'clamp(10px, 2.8vw, 14px) clamp(12px, 3.2vw, 16px)',
    borderRadius: '14px',
    backgroundColor: 'hsl(var(--card) / 0.9)',
    border: '1px solid hsl(var(--border) / 0.6)',
    backdropFilter: 'blur(8px)',
    minWidth: 0,
  };

  // Avatar sizing per breakpoint:
  //   • <360px (iPhone SE / small Android): 40px — keeps space for 2 actions
  //   • 360–639px (most phones):            44px — Apple HIG min touch target
  //   • ≥640px (sm: tablets/desktop):        48px — better optical balance
  //   • ≥1024px (lg: desktop):               52px
  // Single shared class so cards align uniformly across every sub-section.
  const avatarClass = "w-10 h-10 min-[360px]:w-11 min-[360px]:h-11 sm:w-12 sm:h-12 lg:w-[52px] lg:h-[52px] shrink-0";
  const avatarClassLg = avatarClass;

  const nameStyle: React.CSSProperties = {
    fontWeight: 600,
    color: 'hsl(var(--foreground))',
    fontSize: 'clamp(14px, 2.6vw, 15px)',
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
    margin: 0,
    // Reserve a fixed line slot so truncation never causes vertical CLS.
    // `display: -webkit-box` + line-clamp gives clean ellipsis for both
    // short and long names; `wordBreak: break-word` prevents overflow
    // when a single token (e.g. an email-like handle) is wider than the
    // container on 320px screens.
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical' as const,
    WebkitLineClamp: 1,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    minHeight: 'calc(1.3em)',
    maxWidth: '100%',
  };
  const subtitleStyle: React.CSSProperties = {
    fontSize: 'clamp(11px, 2.2vw, 12px)',
    color: 'hsl(var(--muted-foreground))',
    lineHeight: 1.3,
    margin: 0,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical' as const,
    WebkitLineClamp: 1,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    minHeight: 'calc(1.3em)',
    maxWidth: '100%',
  };
  const identityWrap: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    // Slightly tighter on small screens so the identity block + actions fit
    // on one row at 320px; relaxes to 14px on tablets for a more airy feel.
    gap: 'clamp(10px, 2.8vw, 14px)',
    flex: '1 1 0%',
    minWidth: 0,
  };
  const primaryActionStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    height: '40px', padding: '0 clamp(12px, 3vw, 16px)', borderRadius: '10px',
    border: 'none', cursor: 'pointer',
    background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
    color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: '13px',
    flexShrink: 0,
  };
  const secondaryActionStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    height: '40px', minWidth: '40px', padding: '0 clamp(10px, 2.5vw, 14px)', borderRadius: '10px',
    cursor: 'pointer',
    background: 'hsl(var(--secondary) / 0.5)',
    border: '1px solid hsl(var(--border) / 0.5)',
    color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '13px',
    flexShrink: 0,
  };

  return (
    <PageLayout defaultTab="social" headerConfig={headerConfig}>
      <SEO
        title="Your Crew — JET"
        description="Connect with friends, manage requests, and discover new people exploring Charlotte's hottest spots on JET."
        path="/social"
      />
      <PageShell>
        <TabPageHeader
          title="Your Crew"
          subtitle="Friends, requests, and people to discover"
        />
        {/* Search users — only matches signed-up, discoverable end users. */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                color: 'hsl(var(--muted-foreground))',
                pointerEvents: 'none',
              }}
            />
            <Input
              type="search"
              inputMode="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people by name"
              aria-label="Search users by display name"
              style={{ paddingLeft: '36px', paddingRight: searchQuery ? '36px' : '12px' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: '24px',
                  width: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: 'hsl(var(--muted-foreground))',
                  cursor: 'pointer',
                }}
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            )}
          </div>

          {searchQuery.trim().length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isSearching ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '8px', padding: '12px', color: 'hsl(var(--muted-foreground))',
                  fontSize: '13px',
                }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching…
                </div>
              ) : searchResults.length === 0 ? (
                <p style={{
                  padding: '12px',
                  fontSize: '13px',
                  color: 'hsl(var(--muted-foreground))',
                  textAlign: 'center',
                }}>
                  No users found matching "{searchQuery.trim()}"
                </p>
              ) : (
                searchResults.map((profile) => {
                  const isConnected = connections.some(
                    (c) => c.user_id === profile.id || c.friend_id === profile.id,
                  );
                  const isPending = pendingRequests.some(
                    (r) => r.profile?.id === profile.id,
                  );
                  const isSent = sentRequestIds.has(profile.id);
                  return (
                    <div key={profile.id} style={cardStyle}>
                      <button
                        style={{ ...identityWrap, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => setSelectedProfileId(profile.id)}
                      >
                        <Avatar className={avatarClass}>
                          <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || "User"} />
                          <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
                            {profile.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '50%', height: '50%' }} />}
                          </AvatarFallback>
                        </Avatar>
                        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <DisplayName name={profile.display_name || "User"} style={nameStyle} />
                          <p style={subtitleStyle}>
                            {isConnected
                              ? "Connected"
                              : isPending
                                ? "Wants to connect with you"
                                : isSent
                                  ? "Request sent"
                                  : "Tap to view profile"}
                          </p>
                        </div>
                      </button>
                      {!isConnected && !isPending && !isSent && (
                        <button onClick={() => handleSendRequest(profile.id)} style={primaryActionStyle}>
                          <UserPlus style={{ width: '14px', height: '14px' }} />
                          Add
                        </button>
                      )}
                      {isSent && (
                        <span
                          style={{
                            ...primaryActionStyle,
                            background: 'hsl(var(--muted) / 0.6)',
                            color: 'hsl(var(--muted-foreground))',
                            cursor: 'default',
                          }}
                          aria-label="Friend request already sent"
                        >
                          <Check style={{ width: '14px', height: '14px' }} />
                          Sent
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        {/* Messages shortcut */}
        <button
          onClick={() => navigate("/messages")}
          style={{
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            height: '44px',
            /* Tighter horizontal padding on 320px viewports keeps the
               label + badge inside the pill; relax to 16px from sm up. */
            padding: '0 clamp(12px, 3.5vw, 16px)',
            borderRadius: '12px',
            background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
            color: 'hsl(var(--primary-foreground))',
            fontWeight: 600,
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
            <MessageCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Messages</span>
          </span>
          {Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 0 && (
            <Badge className="bg-destructive text-destructive-foreground shrink-0">
              {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
            </Badge>
          )}
        </button>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <section className="mt-8 first:mt-6">
            <SectionTitle meta={`${pendingRequests.length} pending`}>
              Friend Requests
            </SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingRequests.map((request) => (
                <div key={request.id} style={{ ...cardStyle, flexWrap: 'wrap', rowGap: '12px' }}>
                  <div style={{ ...identityWrap, flex: '1 1 200px' }}>
                    <Avatar className={avatarClassLg}>
                      <AvatarImage src={request.profile?.avatar_url || undefined} alt={request.profile?.display_name || "User"} />
                      <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
                        {request.profile?.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '50%', height: '50%' }} />}
                      </AvatarFallback>
                    </Avatar>
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <DisplayName name={request.profile?.display_name || "Friend Request"} style={nameStyle} />
                      <p style={subtitleStyle}>Wants to connect with you</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
                    <button onClick={() => handleAcceptRequest(request.id)} style={primaryActionStyle}>
                      <Check className="w-4 h-4" /> Accept
                    </button>
                    <button onClick={() => handleRemoveConnection(request.id)} style={secondaryActionStyle}>
                      <X className="w-4 h-4" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* My Friends */}
        <section className="mt-10">
          <SectionTitle
            meta={`${connections.length} ${connections.length === 1 ? "friend" : "friends"}`}
          >
            My Friends
          </SectionTitle>
          {connections.length === 0 ? (
            <EmptyState
              icon={UserX}
              title="No friends yet"
              description="Start connecting with friends below to share deals and discover new spots together"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {connections.map((connection) => {
                const friendId = connection.user_id === user?.id ? connection.friend_id : connection.user_id;
                return (
                  <div key={connection.id} style={cardStyle}>
                    <button
                      style={{ ...identityWrap, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onClick={() => setSelectedProfileId(friendId)}
                    >
                      <Avatar className={avatarClass}>
                        <AvatarImage src={connection.profile?.avatar_url || undefined} alt={connection.profile?.display_name || "Friend"} />
                        <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
                          {connection.profile?.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '50%', height: '50%' }} />}
                        </AvatarFallback>
                      </Avatar>
                      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <DisplayName name={connection.profile?.display_name || "Friend"} style={nameStyle} />
                        <p style={subtitleStyle}>Connected</p>
                      </div>
                    </button>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button
                        onClick={() => setChatFriend({
                          id: friendId,
                          name: connection.profile?.display_name || "Friend",
                          avatar: connection.profile?.avatar_url,
                        })}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          height: '40px', width: '40px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                          background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
                          color: 'hsl(var(--primary-foreground))', position: 'relative',
                        }}
                      >
                        <MessageCircle style={{ width: '16px', height: '16px' }} />
                        {unreadCounts[friendId] > 0 && (
                          <Badge style={{
                            position: 'absolute', top: '-4px', right: '-4px',
                            height: '16px', minWidth: '16px', padding: '0 4px',
                            fontSize: '10px', lineHeight: 1,
                          }} className="bg-destructive text-destructive-foreground">
                            {unreadCounts[friendId]}
                          </Badge>
                        )}
                      </button>
                      <button
                        onClick={() => handleRemoveConnection(connection.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          height: '40px', width: '40px', borderRadius: '10px', cursor: 'pointer',
                          background: 'hsl(var(--secondary) / 0.5)',
                          border: '1px solid hsl(var(--border) / 0.5)',
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      >
                        <X style={{ width: '16px', height: '16px' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Discover People */}
        <section className="mt-10">
          <SectionTitle subtitle="Suggested connections from your area">
            Discover People
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {profiles.map((profile) => {
              const isSent = sentRequestIds.has(profile.id);
              return (
                <div key={profile.id} style={cardStyle}>
                  <div style={identityWrap}>
                    <Avatar className={avatarClass}>
                      <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || "User"} />
                      <AvatarFallback className="bg-gradient-to-br from-accent/15 to-primary/15 text-accent">
                        {profile.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '50%', height: '50%' }} />}
                      </AvatarFallback>
                    </Avatar>
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <DisplayName name={profile.display_name || "User"} style={nameStyle} />
                      <p style={subtitleStyle}>{isSent ? "Request sent" : "Suggested for you"}</p>
                    </div>
                  </div>
                  {isSent ? (
                    <button disabled style={{ ...primaryActionStyle, opacity: 0.6, cursor: 'default' }}>
                      <Check style={{ width: '14px', height: '14px' }} />
                      Sent
                    </button>
                  ) : (
                    <button onClick={() => handleSendRequest(profile.id)} style={primaryActionStyle}>
                      <UserPlus style={{ width: '14px', height: '14px' }} />
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </PageShell>

      {/* Connection Profile Dialog */}
      <ConnectionProfileDialog
        connectionId={selectedProfileId}
        isOpen={!!selectedProfileId}
        onClose={() => setSelectedProfileId(null)}
      />

      {/* Chat Dialog */}
      {chatFriend && user && (
        <ChatDialog
          isOpen={!!chatFriend}
          onClose={() => setChatFriend(null)}
          userId={user.id}
          friendId={chatFriend.id}
          friendName={chatFriend.name}
          friendAvatar={chatFriend.avatar}
        />
      )}
    </PageLayout>
  );
}