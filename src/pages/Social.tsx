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
import { SocialPageSkeleton } from "@/components/skeletons/PageSkeletons";

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
        <div style={{ maxWidth: '768px', margin: '0 auto', padding: 'clamp(16px, 3vw, 24px)' }}>
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
        <div style={{ maxWidth: '768px', margin: '0 auto', padding: 'clamp(16px, 3vw, 24px)' }}>
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

  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)',
    fontWeight: 800,
    marginBottom: '16px',
    backgroundImage: 'linear-gradient(to right, hsl(var(--foreground)), hsl(var(--primary)))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '12px',
    backgroundColor: 'hsl(var(--card) / 0.9)',
    border: '1px solid hsl(var(--border) / 0.6)',
    backdropFilter: 'blur(8px)',
  };

  const avatarStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: '50%',
  };

  return (
    <PageLayout defaultTab="social" headerConfig={{ hideSearch: true }}>
      <div style={{ maxWidth: '768px', margin: '0 auto', padding: 'clamp(16px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'clamp(24px, 4vw, 32px)' }}>
        {/* Messages shortcut */}
        <button
          onClick={() => navigate("/messages")}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '44px',
            padding: '0 16px',
            borderRadius: '12px',
            background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
            color: 'hsl(var(--primary-foreground))',
            fontWeight: 600,
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageCircle style={{ width: '16px', height: '16px' }} />
            Messages
          </span>
          {Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 0 && (
            <Badge className="bg-destructive text-destructive-foreground">
              {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
            </Badge>
          )}
        </button>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div>
            <h2 style={sectionHeadingStyle}>
              Friend Requests ({pendingRequests.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingRequests.map((request) => (
                <div key={request.id} style={{ ...cardStyle, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Avatar style={{ ...avatarStyle, width: '48px', height: '48px' }}>
                      <AvatarImage src={request.profile?.avatar_url || undefined} alt={request.profile?.display_name || "User"} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                      <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
                        {request.profile?.display_name?.charAt(0)?.toUpperCase() || <Users className="w-6 h-6" />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        {request.profile?.display_name || "Friend Request"}
                      </p>
                      <p style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
                        Wants to connect with you
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleAcceptRequest(request.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        height: '36px', padding: '0 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
                        color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: '13px',
                      }}
                    >
                      <Check className="w-4 h-4" /> Accept
                    </button>
                    <button
                      onClick={() => handleRemoveConnection(request.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        height: '36px', padding: '0 14px', borderRadius: '8px', cursor: 'pointer',
                        background: 'hsl(var(--secondary) / 0.5)',
                        border: '1px solid hsl(var(--border) / 0.5)',
                        color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '13px',
                      }}
                    >
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
          <h2 style={sectionHeadingStyle}>
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
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', flex: '1 1 0%', minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onClick={() => setSelectedProfileId(friendId)}
                    >
                      <Avatar style={avatarStyle}>
                        <AvatarImage src={connection.profile?.avatar_url || undefined} alt={connection.profile?.display_name || "Friend"} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                        <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary text-sm">
                          {connection.profile?.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '20px', height: '20px' }} />}
                        </AvatarFallback>
                      </Avatar>
                      <p style={{ fontWeight: 500, color: 'hsl(var(--foreground))', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {connection.profile?.display_name || "Friend"}
                      </p>
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
                          height: '36px', width: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
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
                          height: '36px', width: '36px', borderRadius: '8px', cursor: 'pointer',
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
          <h2 style={sectionHeadingStyle}>
            Discover People
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {profiles.map((profile) => (
              <div key={profile.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 0%', minWidth: 0 }}>
                  <Avatar style={avatarStyle}>
                    <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || "User"} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                    <AvatarFallback className="bg-gradient-to-br from-accent/15 to-primary/15 text-accent text-sm">
                      {profile.display_name?.charAt(0)?.toUpperCase() || <Users style={{ width: '20px', height: '20px' }} />}
                    </AvatarFallback>
                  </Avatar>
                  <p style={{ fontWeight: 500, color: 'hsl(var(--foreground))', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile.display_name || "User"}
                  </p>
                </div>
                <button
                  onClick={() => handleSendRequest(profile.id)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    height: '36px', padding: '0 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
                    color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: '13px',
                  }}
                >
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