import { useAvatarUrl } from "../hooks/useAvatarUrl";

type UserAvatarProps = {
  name: string;
  avatarPath?: string | null;

  /**
   * Usado para prévia local com URL.createObjectURL().
   */
  imageUrl?: string | null;

  size?: number;
  className?: string;
};

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "?";
}

export function UserAvatar({
  name,
  avatarPath,
  imageUrl,
  size = 48,
  className = "",
}: UserAvatarProps) {
  /*
   * Quando existe uma imagem de prévia,
   * não precisamos buscar a imagem no Storage.
   */
  const { avatarUrl, loading } = useAvatarUrl(imageUrl ? null : avatarPath);

  const finalImageUrl = imageUrl || avatarUrl;

  const avatarStyle = {
    width: `${size}px`,
    height: `${size}px`,
  };

  if (loading && !imageUrl) {
    return (
      <div
        style={avatarStyle}
        className={`shrink-0 animate-pulse rounded-full bg-slate-200 ${className}`}
        aria-label="Carregando foto"
      />
    );
  }

  if (finalImageUrl) {
    return (
      <img
        src={finalImageUrl}
        alt={`Foto de ${name}`}
        style={avatarStyle}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={avatarStyle}
      title={name}
      className={`flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
