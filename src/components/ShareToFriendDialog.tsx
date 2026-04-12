import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Check, MapPin, Loader2 } from "lucide-react";
import { useConnections } from "@/hooks/useConnections";
import { supabase } from "@/integrations/supabase/client";
import { getVenueDeepLink } from "@/utils/shareUtils";
import { toast } from "sonner";

interface ShareToFriendDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  venue: {
    id: string;
    name: string;
    neighborhood?: string;
    category?: string;
    activity?: number;
  };
}

export function ShareToFriendDialog({
  isOpen,
  onClose,
  userId,
  venue,
}: ShareToFriendDialogProps) {
  const { connections, loading } = useConnections(userId);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);

  const handleSend = async (friendId: string) => {
    setSending(friendId);
    try {
      const conversationId = [userId, friendId].sort().join("_");
      const deepLink = getVenueDeepLink(venue.name);
      const message = `📍 Check out ${venue.name}${venue.neighborhood ? ` in ${venue.neighborhood}` : ""}!\n${deepLink}`;

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        recipient_id: friendId,
        content: message,
      });

      if (error) throw error;

      setSentTo((prev) => new Set(prev).add(friendId));
      toast.success("Sent!", { description: `Shared ${venue.name} with your friend` });
    } catch (err) {
      console.error("Error sending venue share:", err);
      toast.error("Couldn't send", { description: "Please try again" });
    } finally {
      setSending(null);
    }
  };

  const handleClose = () => {
    setSentTo(new Set());
    onClose();
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10000] translate-x-[-50%] translate-y-[-50%] sm:max-w-sm w-full max-h-[70vh] flex flex-col p-0 gap-0 bg-card/95 backdrop-blur-xl border border-primary/20 shadow-lg sm:rounded-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        <DialogHeader className="px-4 py-3 border-b border-border/50">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Send to Friend
          </DialogTitle>
        </DialogHeader>

        {/* Venue preview */}
        <div className="px-4 py-3 border-b border-border/30 bg-primary/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{venue.name}</p>
              {venue.neighborhood && (
                <p className="text-xs text-muted-foreground truncate">{venue.neighborhood}</p>
              )}
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-[150px] max-h-[40vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
              <p className="text-muted-foreground text-sm text-center">
                No connections yet. Add friends to share venues with them!
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {connections.map((conn) => {
                const friendId = conn.user_id === userId ? conn.friend_id : conn.user_id;
                const profile = conn.profile;
                const isSent = sentTo.has(friendId);
                const isSending = sending === friendId;

                return (
                  <div
                    key={conn.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors"
                  >
                    <Avatar className="w-9 h-9" style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', flexShrink: 0 }}>
                      <AvatarImage src={profile?.avatar_url || undefined} style={{ width: '36px', height: '36px', objectFit: 'cover' }} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {(profile?.display_name || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm font-medium text-foreground truncate">
                      {profile?.display_name || "Unknown"}
                    </span>
                    <Button
                      size="sm"
                      variant={isSent ? "ghost" : "default"}
                      disabled={isSent || isSending}
                      onClick={() => handleSend(friendId)}
                      className={`h-8 px-3 text-xs font-semibold rounded-lg ${
                        isSent
                          ? "text-primary"
                          : "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"
                      }`}
                    >
                      {isSending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isSent ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Sent
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 mr-1" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
