import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  pronouns: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
  preferences: Json | null;
}

export interface UpdateProfileInput {
  display_name: string;
  bio: string | null;
  gender: string | null;
  pronouns: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
}

export const profileQueryKey = (userId?: string) => ["profile", userId] as const;

/**
 * Single source of truth for the authenticated user's profile.
 *
 * Wraps all Supabase reads/writes for `public.profiles` (and avatar
 * storage) behind React Query so consumers get caching, dedupe,
 * optimistic updates, and consistent loading/error state.
 */
export function useProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = profileQueryKey(userId);

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();

      if (error) {
        // Row missing — auto-create a minimal profile so the page can render.
        if (error.code === "PGRST116") {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const fallbackName = user?.email?.split("@")[0] || "User";
          const { data: created, error: createErr } = await supabase
            .from("profiles")
            .insert({ id: userId!, display_name: fallbackName })
            .select()
            .single();
          if (createErr) throw createErr;
          return created as Profile;
        }
        throw error;
      }
      return data as Profile;
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      if (!userId) throw new Error("No user");
      const { error } = await supabase
        .from("profiles")
        .update(input)
        .eq("id", userId);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      // Optimistically merge so the UI reflects the save without a refetch.
      queryClient.setQueryData<Profile | undefined>(key, (prev) =>
        prev ? { ...prev, ...input } : prev,
      );
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const uploadAvatar = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!userId) throw new Error("No user");

      // Client-side guardrails mirroring the bucket constraints.
      const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
      const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
      const contentType = blob.type || "image/jpeg";
      if (!ALLOWED.includes(contentType)) {
        throw new Error("Unsupported image type. Use JPEG, PNG, or WebP.");
      }
      if (blob.size > MAX_BYTES) {
        throw new Error("Image is too large. Max size is 2 MB.");
      }

      const ext =
        contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      // Stable per-user path so re-uploads overwrite cleanly.
      const fileName = `${userId}/avatar.${ext}`;

      // Clean up any other avatar variants (different extensions) the user may have.
      const { data: existing } = await supabase.storage.from("avatars").list(userId);
      if (existing?.length) {
        const stale = existing
          .map((f) => `${userId}/${f.name}`)
          .filter((p) => p !== fileName);
        if (stale.length) await supabase.storage.from("avatars").remove(stale);
      }

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, { upsert: true, contentType, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      // Public bucket — derive the public URL and append a cache-buster so the
      // <img> reloads immediately after an upsert overwrite.
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const bustedUrl = `${pub.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: bustedUrl })
        .eq("id", userId);
      if (updateError) throw updateError;

      return bustedUrl;
    },
    onSuccess: (bustedUrl) => {
      queryClient.setQueryData<Profile | undefined>(key, (prev) =>
        prev ? { ...prev, avatar_url: bustedUrl } : prev,
      );
    },
  });

  const updatePreferences = useMutation({
    mutationFn: async (preferences: Json) => {
      if (!userId) throw new Error("No user");
      const { error } = await supabase
        .from("profiles")
        .update({ preferences })
        .eq("id", userId);
      if (error) throw error;
      return preferences;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData<Profile | undefined>(key, (prev) =>
        prev ? { ...prev, preferences } : prev,
      );
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const checkDisplayNameUnique = useCallback(
    async (name: string): Promise<boolean> => {
      if (!userId) return true;
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("display_name", name)
        .neq("id", userId)
        .limit(1);
      // Fail-open on transient errors — the server unique constraint
      // (23505) is the real source of truth on save.
      if (error) return true;
      return !data || data.length === 0;
    },
    [userId],
  );

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    updateProfile: updateProfile.mutateAsync,
    isSaving: updateProfile.isPending,
    uploadAvatar: uploadAvatar.mutateAsync,
    isUploading: uploadAvatar.isPending,
    updatePreferences: updatePreferences.mutateAsync,
    isSavingPreferences: updatePreferences.isPending,
    checkDisplayNameUnique,
  };
}