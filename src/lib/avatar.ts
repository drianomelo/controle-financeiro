import { supabase } from "./supabase";

const URL_DURATION_SECONDS = 60 * 60 * 12;
const CACHE_SAFETY_SECONDS = 60 * 5;

type CachedAvatar = {
  url: string;
  expiresAt: number;
};

const avatarCache = new Map<string, CachedAvatar>();

export async function getAvatarUrl(
  avatarPath: string | null | undefined,
): Promise<string | null> {
  if (!avatarPath) {
    return null;
  }

  const cachedAvatar = avatarCache.get(avatarPath);

  if (cachedAvatar && cachedAvatar.expiresAt > Date.now()) {
    return cachedAvatar.url;
  }

  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(avatarPath, URL_DURATION_SECONDS);

  if (error) {
    console.error("Erro ao carregar avatar:", error);

    return null;
  }

  avatarCache.set(avatarPath, {
    url: data.signedUrl,
    expiresAt:
      Date.now() + (URL_DURATION_SECONDS - CACHE_SAFETY_SECONDS) * 1000,
  });

  return data.signedUrl;
}

export function clearAvatarCache(avatarPath?: string | null) {
  if (avatarPath) {
    avatarCache.delete(avatarPath);
    return;
  }

  avatarCache.clear();
}
