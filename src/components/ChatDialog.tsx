import { useState, useRef, useEffect } from "react";
import { MessageContent } from "@/components/chat/MessageContent";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Image as ImageIcon, Check, CheckCheck, Users } from "lucide-react";
import { useMessages, type Message } from "@/hooks/useMessages";
import { format } from "date-fns";

interface ChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  friendId: string;
  friendName: string;
  friendAvatar?: string | null;
}

export function ChatDialog({
  isOpen,
  onClose,
  userId,
  friendId,
  friendName,
  friendAvatar,
}: ChatDialogProps) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, loading, sendMessage, sendImage, markAsRead } = useMessages(
    userId,
    friendId
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark as read when dialog opens or new messages arrive
  useEffect(() => {
    if (isOpen) markAsRead();
  }, [isOpen, messages.length, markAsRead]);

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

  const renderReadIndicator = (msg: Message) => {
    if (msg.sender_id !== userId) return null;
    return msg.read_at ? (
      <CheckCheck className="w-3.5 h-3.5 text-primary" />
    ) : (
      <Check className="w-3.5 h-3.5 text-muted-foreground" />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={friendAvatar || undefined} alt={friendName} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {friendName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-base font-semibold">{friendName}</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 py-3 min-h-[300px] max-h-[50vh]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">Loading messages…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
              <Users className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm text-center">
                No messages yet. Say hi to {friendName}!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
                        {renderReadIndicator(msg)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
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
            className="flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
