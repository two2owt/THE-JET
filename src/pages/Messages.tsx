import { useEffect, useState, useRef } from "react";
import { MessageContent } from "@/components/chat/MessageContent";
import { ChatImage } from "@/components/chat/ChatImage";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
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

/* ─── Shared adaptive style tokens (mirrors Social page) ─── */
const DEFAULT_AVATAR_SRC = "/jet-email-logo.png";

const convoCardStyle: React.CSSProperties = {
  gap: 'clamp(10px, 3vw, 14px)',
  padding: 'clamp(10px, 2.8vw, 14px) clamp(12px, 3.2vw, 16px)',
};

const nameStyle: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 1,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  minHeight: 'calc(1.3em)',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  width: '100%',
};

const subtitleStyle: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 1,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  minHeight: 'calc(1.3em)',
};

// Consistent, fluid avatar sizing — keeps the JET mark legible from 320px to desktop
// while preserving the 44x44 minimum touch target on mobile.
const avatarClass =
  "h-11 w-11 sm:h-12 sm:w-12 lg:h-[52px] lg:w-[52px] aspect-square shrink-0 ring-1 ring-border/60";
const avatarHeaderClass =
  "h-10 w-10 sm:h-11 sm:w-11 aspect-square shrink-0 ring-1 ring-border/60";
const avatarImageClass = "object-cover";
const avatarFallbackClass =
  "bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-medium";

function DisplayName({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const merged: React.CSSProperties = expanded
    ? {
        ...nameStyle,
        ...style,
        WebkitLineClamp: 'unset' as any,
        display: 'block',
        whiteSpace: 'normal',
        overflow: 'visible',
      }
    : { ...nameStyle, ...style };
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      className={className}
      style={merged}
    >
      {name}
    </button>
  );
}

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
            onAction={() => { rememberPostAuthRedirect(); navigate("/auth"); }}
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
        <h1 className="heading-luxe-gradient">
          Messages
        </h1>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {conversations.map((c) => (
            <button
              key={c.friendId}
              onClick={() => onSelect(c.friendId)}
              className="w-full flex items-center hover:bg-muted/50 transition-colors text-left"
              style={convoCardStyle}
            >
              <div className="relative shrink-0">
                <Avatar className={avatarClass}>
                  <AvatarImage
                    src={c.friendAvatar || DEFAULT_AVATAR_SRC}
                    alt={c.friendName}
                    className={avatarImageClass}
                  />
                  <AvatarFallback className={avatarFallbackClass} delayMs={400}>
                    {c.friendName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {c.unreadCount > 0 && (
                  <Badge
                    className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] bg-destructive text-destructive-foreground ring-2 ring-background"
                    aria-label={`${c.unreadCount} unread message${c.unreadCount === 1 ? '' : 's'}`}
                  >
                    {c.unreadCount}
                  </Badge>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex-1 min-w-0">
                    <DisplayName
                      name={c.friendName}
                      className={`heading-luxe-card ${c.unreadCount > 0 ? "font-bold" : "font-medium"}`}
                    />
                  </div>
                  {c.lastMessageAt && (
                    <span className={`heading-luxe-eyebrow flex-shrink-0 ${c.unreadCount > 0 ? "!text-primary" : ""}`}>
                      {formatConvoTime(c.lastMessageAt)}
                    </span>
                  )}
                </div>
                <p
                  className={`body-luxe-muted mt-0.5 ${c.unreadCount > 0 ? "!text-foreground font-medium" : ""}`}
                  style={subtitleStyle}
                >
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

  const { messages, loading, sendMessage, sendImage, markAsRead, isFriendTyping, sendTyping } =
    useMessages(userId, friendId);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isFriendTyping]);

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
      <div
        className="flex items-center border-b border-border/60 bg-card/60 backdrop-blur-sm"
        style={{ ...convoCardStyle, gap: 'clamp(8px, 2.4vw, 12px)' }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="flex-shrink-0 -ml-1"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Avatar className={avatarHeaderClass}>
          <AvatarImage
            src={friend?.friendAvatar || DEFAULT_AVATAR_SRC}
            alt={friend?.friendName || "Friend"}
            className={avatarImageClass}
          />
          <AvatarFallback className={avatarFallbackClass} delayMs={400}>
            {(friend?.friendName || "F").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <DisplayName
            name={friend?.friendName || "Chat"}
            className="heading-luxe-card"
          />
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 w-full overflow-x-hidden" >
        <div
          className="w-full"
          style={{ padding: 'clamp(10px, 2.8vw, 14px) clamp(12px, 3.2vw, 16px)' }}
        >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="body-luxe-muted">Loading messages…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Users className="w-10 h-10 text-muted-foreground/40" />
            <p className="body-luxe-muted text-center">
              No messages yet. Say hi!
            </p>
          </div>
        ) : (
          <div
            className="w-full overflow-hidden"
            style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 2.2vw, 12px)' }}
          >
            {messages.map((msg) => {
              const isMine = msg.sender_id === userId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`min-w-0 overflow-hidden rounded-2xl ${
                      isMine
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                    style={{
                      maxWidth: 'min(78%, 520px)',
                      padding: 'clamp(6px, 1.6vw, 10px) clamp(10px, 2.6vw, 14px)',
                    }}
                  >
                    {msg.image_url && <ChatImage value={msg.image_url} cacheBust={msg.created_at} />}
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
            {isFriendTyping && (
              <div className="flex justify-start" aria-live="polite" aria-label={`${friend?.friendName || 'Friend'} is typing`}>
                <div
                  className="bg-muted text-foreground rounded-2xl rounded-bl-md inline-flex items-center gap-1"
                  style={{ padding: 'clamp(8px, 2vw, 12px) clamp(12px, 2.6vw, 16px)' }}
                >
                  <span className="typing-dot" style={{ animationDelay: '0ms' }} />
                  <span className="typing-dot" style={{ animationDelay: '150ms' }} />
                  <span className="typing-dot" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div
        className="border-t border-border/60 bg-card/60 backdrop-blur-sm flex items-center"
        style={{
          gap: 'clamp(6px, 1.8vw, 10px)',
          padding: 'clamp(8px, 2.2vw, 12px) clamp(12px, 3.2vw, 16px)',
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
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) sendTyping();
          }}
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
