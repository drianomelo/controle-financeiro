import { useEffect, useState } from "react";
import { getAvatarUrl } from "../lib/avatar";

export function useAvatarUrl(avatarPath: string | null | undefined) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(Boolean(avatarPath));

  useEffect(() => {
    let isMounted = true;

    async function loadAvatar() {
      if (!avatarPath) {
        setAvatarUrl(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const loadedAvatarUrl = await getAvatarUrl(avatarPath);

      if (!isMounted) {
        return;
      }

      setAvatarUrl(loadedAvatarUrl);
      setLoading(false);
    }

    loadAvatar();

    return () => {
      isMounted = false;
    };
  }, [avatarPath]);

  return {
    avatarUrl,
    loading,
  };
}
