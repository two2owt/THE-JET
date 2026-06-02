import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      const fileName = `${userId}/avatar.jpg`;

      // Best-effort cleanup of the previous object (ignore failures).
      const current = query.data?.avatar_url;
      if (current) {
        const oldPath = current.split("?")[0].split("/").slice(-2).join("/");
        await supabase.storage.from("avatars").remove([oldPath]);
      }

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);
      // Cache-bust so the new image renders immediately.
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;

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
    checkDisplayNameUnique,
  };
}