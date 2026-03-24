import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConnections } from "@/hooks/useConnections";
import { Users, UserPlus, Check, X, UserX, Crown, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { ConnectionProfileDialog } from "@/components/ConnectionProfileDialog";
import { UpgradePrompt, useFeatureAccess } from "@/components/UpgradePrompt";
import { VirtualGrid } from "@/components/ui/virtual-list";
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
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

  return (
    <PageLayout defaultTab="social" headerConfig={{ hideSearch: true }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg space-y-fluid-xl">
        {/* Messages shortcut */}
        <Button
          variant="outline"
          onClick={() => navigate("/messages")}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Messages
          </span>
          {Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 0 && (
            <Badge className="bg-destructive text-destructive-foreground">
              {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
            </Badge>
          )}
        </Button>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div>
            <h2 className="text-fluid-xl sm:text-fluid-2xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent mb-fluid-md">
              Friend Requests ({pendingRequests.length})
            </h2>
            <div className="space-y-fluid-sm">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-card/90 backdrop-blur-sm border border-border/60 rounded-xl p-4 flex items-center justify-between shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={request.profile?.avatar_url || undefined} alt={request.profile?.display_name || "User"} />
                       <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
                        {request.profile?.display_name?.charAt(0)?.toUpperCase() || <Users className="w-6 h-6" />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground">
                        {request.profile?.display_name || "Friend Request"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Wants to connect with you
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleAcceptRequest(request.id)}
                      className="bg-primary min-h-[44px] px-3"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Accept</span>
                      <span className="sm:hidden">OK</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemoveConnection(request.id)}
                      className="min-h-[44px] px-3"
                    >
                      <X className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Decline</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Friends */}
        <div>
            <h2 className="text-fluid-xl sm:text-fluid-2xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent mb-fluid-md">
            My Friends ({connections.length})
          </h2>
          {connections.length === 0 ? (
            <EmptyState
              icon={UserX}
              title="No friends yet"
              description="Start connecting with friends below to share deals and discover new spots together"
            />
          ) : (
            <VirtualGrid
              items={connections}
              estimateSize={80}
              className="min-h-[30vh]"
              columns={{ mobile: 1, tablet: 2, desktop: 3 }}
              getItemKey={(connection) => connection.id}
              renderItem={(connection) => {
                const friendId = connection.user_id === user?.id ? connection.friend_id : connection.user_id;
                return (
                   <div className="bg-card/90 backdrop-blur-sm border border-border/60 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 h-full shadow-card">
                    <button
                      className="flex items-center gap-2 sm:gap-3 text-left flex-1 min-w-0"
                      onClick={() => setSelectedProfileId(friendId)}
                    >
                      <Avatar className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0">
                        <AvatarImage src={connection.profile?.avatar_url || undefined} alt={connection.profile?.display_name || "Friend"} />
                        <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary text-sm">
                          {connection.profile?.display_name?.charAt(0)?.toUpperCase() || <Users className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-foreground text-sm sm:text-base truncate">
                        {connection.profile?.display_name || "Friend"}
                      </p>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setChatFriend({
                        id: friendId,
                        name: connection.profile?.display_name || "Friend",
                        avatar: connection.profile?.avatar_url,
                      })}
                      className="flex-shrink-0 min-h-[44px] min-w-[44px] h-9 w-9 p-0 relative"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {unreadCounts[friendId] > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] bg-destructive text-destructive-foreground">
                          {unreadCounts[friendId]}
                        </Badge>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveConnection(connection.id)}
                      className="flex-shrink-0 min-h-[44px] min-w-[44px] h-9 w-9 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              }}
            />
          )}
        </div>

        {/* Discover People */}
        <div>
          <h2 className="text-fluid-xl sm:text-fluid-2xl font-extrabold bg-gradient-to-r from-foreground to-accent bg-clip-text text-transparent mb-fluid-md">
            Discover People
          </h2>
          <VirtualGrid
            items={profiles}
            estimateSize={80}
            className="min-h-[30vh]"
            columns={{ mobile: 1, tablet: 2, desktop: 3 }}
            getItemKey={(profile) => profile.id}
            renderItem={(profile) => (
              <div className="bg-card/90 backdrop-blur-sm border border-border/60 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 h-full shadow-card">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <Avatar className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0">
                    <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || "User"} />
                    <AvatarFallback className="bg-gradient-to-br from-accent/15 to-primary/15 text-accent text-sm">
                      {profile.display_name?.charAt(0)?.toUpperCase() || <Users className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-medium text-foreground text-sm sm:text-base truncate">
                    {profile.display_name || "User"}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSendRequest(profile.id)}
                  className="flex-shrink-0 h-8 sm:h-9 px-2.5 sm:px-3 text-xs sm:text-sm"
                >
                  <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                  Add
                </Button>
              </div>
            )}
          />
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
