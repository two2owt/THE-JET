import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConnections } from "@/hooks/useConnections";
import { Users, UserPlus, Check, X, UserX, Crown, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { ConnectionProfileDialog } from "@/components/ConnectionProfileDialog";
import { UpgradePrompt, useFeatureAccess } from "@/components/UpgradePrompt";
import { ChatDialog } from "@/components/ChatDialog";
import { useUnreadCounts } from "@/hooks/useMessages";
import { Badge } from "@/components/ui/badge";

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function Social() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [chatFriend, setChatFriend] = useState<{ id: string; name: string; avatar?: string | null } | null>(null);
  const unreadCounts = useUnreadCounts(user?.id);
  const { canAccessSocialFeatures } = useFeatureAccess();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
  }, [user]);

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from("discoverable_profiles")
        .select("id, display_name, avatar_url")
        .limit(20);

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error("Error fetching profiles:", error);
    }
  };

  const handleSendRequest = async (friendId: string) => {
    const result = await sendRequest(friendId);
    if (result.success) {
      toast.success("Friend request sent!");
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

  if (!user) {
    return (
      <PageLayout defaultTab="social" notificationCount={0} headerConfig={{ hideSearch: true }}>
        <div style={{ maxWidth: '768px', margin: '0 auto', padding: '24px' }}>
          <EmptyState
            icon={Users}
            title="Sign in to connect"
            description="Create an account to find and connect with friends, share deals, and build your social network"
            actionLabel="Sign In"
            onAction={() => navigate("/auth")}
          />
        </div>
      </PageLayout>
    );
  }

  // Show upgrade prompt for users without JET+ subscription
  if (!canAccessSocialFeatures()) {
    return (
      <PageLayout defaultTab="social" headerConfig={{ hideSearch: true }}>
        <div style={{ maxWidth: '768px', margin: '0 auto', padding: '24px' }}>
          <EmptyState
            icon={Crown}
            title="Unlock Social Features"
            description="Connect with friends, share deals, and discover new spots together. Upgrade to JET+ to access all social features."
            actionLabel="Upgrade to JET+"
            onAction={() => setShowUpgradePrompt(true)}
          />
        </div>
        <UpgradePrompt
          requiredTier="jet_plus"
          featureName="Social features"
          isOpen={showUpgradePrompt}
          onClose={() => setShowUpgradePrompt(false)}
        />
      </PageLayout>
    );
  }

  // Section headings now use the canonical luxe scale (`heading-luxe-section`)
  // so they inherit the small-screen line-height refinements in index.css and
  // stay legible at 320px. The gradient fill is dropped — the luxe scale
  // expresses hierarchy through weight + spacing, not gradient text, which
  // clips descenders at heavy weights on small Android viewports.

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'clamp(10px, 2.5vw, 16px)',
    padding: 'clamp(12px, 2.5vw, 16px) clamp(14px, 3vw, 18px)',
    borderRadius: '14px',
    backgroundColor: 'hsl(var(--card) / 0.9)',
    border: '1px solid hsl(var(--border) / 0.6)',
    backdropFilter: 'blur(8px)',
    minWidth: 0,
  };

  // Use Tailwind sizing so container queries inside <Avatar> resolve correctly
  // (fallback text scales via `cqw` units defined in the primitive).
  // Single avatar size used across all sub-sections so cards align uniformly
  // on every breakpoint (320px → desktop).
  const avatarClass = "w-11 h-11 sm:w-12 sm:h-12 shrink-0";
  const avatarClassLg = avatarClass;

  const nameStyle: React.CSSProperties = {
    fontWeight: 600,
    color: 'hsl(var(--foreground))',
    fontSize: 'clamp(14px, 2.6vw, 15px)',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.01em',
    margin: 0,
  };
  const subtitleStyle: React.CSSProperties = {
    fontSize: 'clamp(11px, 2.2vw, 12px)',
    color: 'hsl(var(--muted-foreground))',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    margin: 0,
  };
  const identityWrap: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(10px, 2.5vw, 12px)',
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
    <PageLayout defaultTab="social" headerConfig={{ hideSearch: true }}>
      <div style={{ width: '100%', maxWidth: 'min(768px, 100%)', margin: '0 auto', padding: 'clamp(14px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 'clamp(20px, 4vw, 32px)' }}>
        {/* Page title — gradient brand wash, consistent across tabs */}
        <h1 className="heading-luxe-gradient">Crew</h1>
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
          <div>
            <h2 className="heading-luxe-section mb-4">
              Friend Requests ({pendingRequests.length})
            </h2>
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
                      <p style={nameStyle}>{request.profile?.display_name || "Friend Request"}</p>
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
          </div>
        )}

        {/* My Friends */}
        <div>
          <h2 className="heading-luxe-section mb-4">
            My Friends ({connections.length})
          </h2>
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
                        <p style={nameStyle}>{connection.profile?.display_name || "Friend"}</p>
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
        </div>

        {/* Discover People */}
        <div>
          <h2 className="heading-luxe-section mb-4">
            Discover People
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {profiles.map((profile) => (
              <div key={profile.id} style={cardStyle}>
                <div style={identityWrap}>
                  <Avatar className={avatarClass}>
                    <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || "User"} />
                    <AvatarFallback className="bg-gradient-to-br from-accent/15 to-primary/15 text-accent">
                      {profile.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '50%', height: '50%' }} />}
                    </AvatarFallback>
                  </Avatar>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <p style={nameStyle}>{profile.display_name || "User"}</p>
                    <p style={subtitleStyle}>Suggested for you</p>
                  </div>
                </div>
                <button onClick={() => handleSendRequest(profile.id)} style={primaryActionStyle}>
                  <UserPlus style={{ width: '14px', height: '14px' }} />
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

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