-- Drop and recreate discoverable_profiles view to show all signed-up users
DROP VIEW IF EXISTS discoverable_profiles;

CREATE OR REPLACE VIEW discoverable_profiles 
WITH (security_invoker = true)
AS
SELECT 
  id,
  display_name,
  avatar_url
FROM profiles p
WHERE 
  -- Exclude current user
  id <> auth.uid()
  -- Exclude already accepted connections
  AND NOT EXISTS (
    SELECT 1 FROM user_connections uc
    WHERE uc.status = 'accepted'
    AND ((uc.user_id = auth.uid() AND uc.friend_id = p.id) 
      OR (uc.friend_id = auth.uid() AND uc.user_id = p.id))
  )
  -- Exclude pending connections
  AND NOT EXISTS (
    SELECT 1 FROM user_connections uc
    WHERE uc.status = 'pending'
    AND ((uc.user_id = auth.uid() AND uc.friend_id = p.id) 
      OR (uc.friend_id = auth.uid() AND uc.user_id = p.id))
  );

-- Grant access to authenticated users
GRANT SELECT ON discoverable_profiles TO authenticated;