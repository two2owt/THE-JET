import { useEffect, useState, useRef } from "react";
import { MessageContent } from "@/components/chat/MessageContent";
import { ChatImage } from "@/components/chat/ChatImage";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { useConversations, type Conversation } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  ArrowLeft,
  Send,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Users,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { MessagesPageSkeleton } from "@/components/skeletons/PageSkeletons";

function formatConvoTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

export default function Messages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFriendId = searchParams.get("chat");

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { conversations, loading: convosLoading } = useConversations(user?.id);

  const openChat = (friendId: string) => {
    setSearchParams({ chat: friendId });
  };

  const closeChat = () => {
    setSearchParams({});
  };

  if (!user) {
    return (
      <PageLayout defaultTab="social" headerConfig={{ hideSearch: true }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
          <EmptyState
            icon={MessageCircle}
            title="Sign in to message"
            description="Create an account to chat with your friends"
            actionLabel="Sign In"
            onAction={() => navigate("/auth")}
          />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout defaultTab="social" headerConfig={{ hideSearch: true }}>
      <div className="max-w-2xl mx-auto w-full h-full flex flex-col overflow-hidden">
        {activeFriendId ? (
          <ChatView
            userId={user.id}
            friendId={activeFriendId}
            conversations={conversations}
            onBack={closeChat}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            loading={convosLoading}
            onSelect={openChat}
          />
        )}
      </div>
    </PageLayout>
  );
}

/* ─── Conversation List ─── */

function ConversationList({
  conversations,
  loading,
  onSelect,
}: {
  conversations: Conversation[];
  loading: boolean;
  onSelect: (friendId: string) => void;
}) {
  if (loading) {
    return <MessagesPageSkeleton />;
  }

  if (conversations.length === 0) {
    return (
      <div className="px-4 py-fluid-lg">
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Connect with friends on the Social page to start chatting"
          actionLabel="Find Friends"
          onAction={() => window.location.assign("/social")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-border/60">
        <h1 className="text-fluid-2xl sm:text-fluid-3xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">Messages</h1>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {conversations.map((c) => (
            <button
              key={c.friendId}
              onClick={() => onSelect(c.friendId)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="relative" style={{ flexShrink: 0, width: '48px', height: '48px' }}>
                <Avatar className="w-12 h-12" style={{ width: '48px', height: '48px', minWidth: '48px', minHeight: '48px' }}>
                  <AvatarImage src={c.friendAvatar || undefined} alt={c.friendName} style={{ width: '48px', height: '48px', objectFit: 'cover' }} />
                  <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
                    {c.friendName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {c.unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] bg-destructive text-destructive-foreground">
                    {c.unreadCount}
                  </Badge>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${c.unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                    {c.friendName}
                  </p>
                  {c.lastMessageAt && (
                    <span className={`text-[11px] flex-shrink-0 ml-2 ${c.unreadCount > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {formatConvoTime(c.lastMessageAt)}
                    </span>
                  )}
                </div>
                <p className={`text-xs truncate mt-0.5 ${c.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {c.lastMessage || "Start a conversation"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── Chat View ─── */

function ChatView({
  userId,
  friendId,
  conversations,
  onBack,
}: {
  userId: string;
  friendId: string;
  conversations: Conversation[];
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const friend = conversations.find((c) => c.friendId === friendId);

  const { messages, loading, sendMessage, sendImage, markAsRead } = useMessages(
    userId,
    friendId
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark as read
  useEffect(() => {
    markAsRead();
  }, [messages.length, markAsRead]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await sendImage(file);
      e.target.value = "";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-card/60 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Avatar className="w-9 h-9" style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', flexShrink: 0 }}>
          <AvatarImage src={friend?.friendAvatar || undefined} alt={friend?.friendName || "Friend"} style={{ width: '36px', height: '36px', objectFit: 'cover' }} />
          <AvatarFallback className="bg-gradient-to-br from-primary/15 to-accent/15 text-primary text-sm">
            {(friend?.friendName || "F").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <p className="font-semibold text-foreground text-sm truncate">
          {friend?.friendName || "Chat"}
        </p>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4 py-3 w-full overflow-x-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">Loading messages…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Users className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm text-center">
              No messages yet. Say hi!
            </p>
          </div>
        ) : (
          <div className="space-y-3 w-full overflow-hidden">
            {messages.map((msg) => {
              const isMine = msg.sender_id === userId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] min-w-0 overflow-hidden rounded-2xl px-3.5 py-2 ${
                      isMine
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.image_url && <ChatImage value={msg.image_url} />}
                    {msg.content && (
                      <MessageContent content={msg.content} isMine={isMine} />
                    )}
                    <div
                      className={`flex items-center gap-1 mt-1 ${
                        isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <span
                        className={`text-[10px] ${
                          isMine
                            ? "text-primary-foreground/60"
                            : "text-muted-foreground"
                        }`}
                      >
                        {format(new Date(msg.created_at), "h:mm a")}
                      </span>
                      {isMine &&
                        (msg.read_at ? (
                          <CheckCheck className="w-3.5 h-3.5 text-primary-foreground/80" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-primary-foreground/50" />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input bar */}
      <div
        className="px-4 py-3 border-t border-border/60 bg-card/60 backdrop-blur-sm flex items-center gap-2"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
        }}
      >
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className="hidden"
          onChange={handleImageUpload}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0"
        >
          <ImageIcon className="w-5 h-5" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="flex-1"
        />
        <Button
          onClick={handleSend}
          disabled={!text.trim()}
          size="icon"
          className="flex-shrink-0 bg-gradient-primary"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
