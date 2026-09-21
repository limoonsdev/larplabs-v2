/**
 * LarpLabs V2 — Vrais logos plateformes (SVG inline, monochrome blanc).
 * Utilisation : <PlatformLogo id="youtube" className="w-5 h-5" />
 * Se pose sur les pastilles couleur des presets (texte blanc).
 */

const PATHS: Record<string, React.ReactNode> = {
  youtube: (
    <>
      <rect x="2" y="5.5" width="20" height="13" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" />
    </>
  ),
  tiktok: (
    <path
      d="M14.5 3v10.8a3.9 3.9 0 1 1-3.1-3.8V7.2a6.9 6.9 0 1 0 6.1 6.8V9.6A6.3 6.3 0 0 0 21 11V8a3.6 3.6 0 0 1-3.5-3.4V3z"
      fill="currentColor"
    />
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="1.5" fill="currentColor" />
    </>
  ),
  twitch: (
    <>
      <path
        d="M4 3h16v11l-4 4h-4l-2.5 2.5H7V18H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 8v4M14 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  x: (
    <path
      d="M4 3.5h4.6l4.1 5.6 4.9-5.6h2.9l-6.3 7.2 6.6 9.8h-4.6l-4.5-6.1-5.4 6.1H3.5l6.9-7.9z"
      fill="currentColor"
    />
  ),
  facebook: (
    <path
      d="M14.5 8.5H16V5h-2.2c-2 0-3.3 1.3-3.3 3.3v2.2H8.5V14h2v7h3.5v-7h2.3l.7-3.5h-3V8.7z"
      fill="currentColor"
    />
  ),
  kick: (
    <text
      x="12"
      y="17"
      textAnchor="middle"
      fontSize="14"
      fontWeight="900"
      fontStyle="italic"
      fill="currentColor"
      fontFamily="Arial, sans-serif"
    >
      K
    </text>
  ),
  spotify: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 10.2c2.8-.8 5.6-.4 7.8 1M8.3 12.8c2.2-.6 4.4-.3 6.2.9M8.5 15.2c1.7-.5 3.3-.2 4.7.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
  reddit: (
    <>
      <circle cx="12" cy="13.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="9.7" cy="12.8" r="1.2" fill="currentColor" />
      <circle cx="14.3" cy="12.8" r="1.2" fill="currentColor" />
      <path d="M9.5 16c1.6 1 3.4 1 5 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 7V4.5L15.5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.5" cy="5" r="1.2" fill="currentColor" />
    </>
  ),
  google: (
    <text
      x="12"
      y="17.5"
      textAnchor="middle"
      fontSize="15"
      fontWeight="900"
      fill="currentColor"
      fontFamily="Arial, sans-serif"
    >
      G
    </text>
  ),
  shop: (
    <>
      <path
        d="M3 4h2.5l2.2 11h10.6l2.2-7.5H7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19" r="1.4" fill="currentColor" />
      <circle cx="16.5" cy="19" r="1.4" fill="currentColor" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 8l2-4 4 2 3-3 4 2 3-2 2 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10.5 11.5v5l4.5-2.5z" fill="currentColor" />
    </>
  ),
  rumble: (
    <text
      x="12"
      y="17.5"
      textAnchor="middle"
      fontSize="15"
      fontWeight="900"
      fontStyle="italic"
      fill="currentColor"
      fontFamily="Arial, sans-serif"
    >
      R
    </text>
  ),
  dailymotion: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 8.5v7l6-3.5z" fill="currentColor" />
    </>
  ),
  pinterest: (
    <text
      x="12"
      y="18"
      textAnchor="middle"
      fontSize="16"
      fontWeight="900"
      fill="currentColor"
      fontFamily="Georgia, serif"
    >
      P
    </text>
  ),
  linkedin: (
    <text
      x="12"
      y="17"
      textAnchor="middle"
      fontSize="11"
      fontWeight="900"
      fill="currentColor"
      fontFamily="Arial, sans-serif"
    >
      in
    </text>
  ),
  telegram: (
    <path
      d="M21 4L3 11.2l6.3 2.4L11.5 20l3.9-4.5 5.3 1.6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),
  steam: (
    <>
      <circle cx="9" cy="14" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="14" r="1.6" fill="currentColor" />
      <path d="M13 10.5L19 5m0 0h-3.5M19 5v3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

export function PlatformLogo({ id, className = "w-5 h-5" }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {PATHS[id] ?? PATHS["video"]}
    </svg>
  );
}
