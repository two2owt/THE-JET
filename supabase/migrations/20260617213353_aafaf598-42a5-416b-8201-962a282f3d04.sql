ALTER TABLE public.push_subscriptions
ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS push_subscriptions_user_platform_idx
ON public.push_subscriptions (user_id, platform) WHERE active = true;