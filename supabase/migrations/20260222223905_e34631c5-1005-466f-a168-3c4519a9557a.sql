
-- Create messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  content TEXT,
  image_url TEXT,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast conversation lookups
CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_messages_recipient_unread ON public.messages (recipient_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages they sent or received
CREATE POLICY "Users can view own messages"
ON public.messages FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can send messages only to accepted connections
CREATE POLICY "Users can send messages to connections"
ON public.messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.user_connections
    WHERE status = 'accepted'
    AND (
      (user_id = auth.uid() AND friend_id = messages.recipient_id)
      OR (friend_id = auth.uid() AND user_id = messages.recipient_id)
    )
  )
);

-- Users can update messages they received (for read receipts)
CREATE POLICY "Recipients can mark messages as read"
ON public.messages FOR UPDATE
USING (auth.uid() = recipient_id);

-- Users can delete their own sent messages
CREATE POLICY "Users can delete own messages"
ON public.messages FOR DELETE
USING (auth.uid() = sender_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
