UPDATE public.realtime_guard_allowlist
SET sensitivity = 'public',
    note = 'Heartbeat only (profile id + created/updated flag + timestamp). All authenticated users can read because /social surfaces every signed-up user.'
WHERE table_name = 'profile_pulse';