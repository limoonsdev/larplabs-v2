/**
 * LarpLabs V2 — Logos paiement (SVG inline) + logo LarpPay Services.
 */

export function VisaLogo({ className = "h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 16" className={className} aria-label="Visa">
      <rect x="0.5" y="0.5" width="47" height="15" rx="2.5" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      <text x="24" y="12.5" textAnchor="middle" fontSize="11" fontWeight="900" fontStyle="italic" fill="#1A1F71" fontFamily="Arial, sans-serif">
        VISA
      </text>
    </svg>
  );
}

export function MastercardLogo({ className = "h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 16" className={className} aria-label="Mastercard">
      <rect x="0.5" y="0.5" width="47" height="15" rx="2.5" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      <circle cx="20" cy="8" r="5" fill="#EB001B" />
      <circle cx="28" cy="8" r="5" fill="#F79E1B" fillOpacity="0.85" />
    </svg>
  );
}

export function AmexLogo({ className = "h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 16" className={className} aria-label="Amex">
      <rect x="0.5" y="0.5" width="47" height="15" rx="2.5" fill="#2E77BC" />
      <text x="24" y="12" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#fff" fontFamily="Arial, sans-serif">
        AMEX
      </text>
    </svg>
  );
}

export function CbLogo({ className = "h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 16" className={className} aria-label="CB">
      <rect x="0.5" y="0.5" width="47" height="15" rx="2.5" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      <text x="15" y="12" textAnchor="middle" fontSize="8" fontWeight="900" fill="#004B8D" fontFamily="Arial, sans-serif">
        CB
      </text>
      <rect x="24" y="4" width="14" height="8" rx="1.5" fill="none" stroke="#004B8D" strokeWidth="1.4" />
      <path d="M27 6.5h8M27 9.5h8" stroke="#E30613" strokeWidth="1.2" />
    </svg>
  );
}

export function LarpPayLogo({ className = "h-8" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="w-8 h-8 rounded-xl bg-berry text-white grid place-items-center font-display font-extrabold text-lg border-2 border-ink">
        L
      </span>
      <span className="font-display font-extrabold text-lg leading-none">
        LarpPay <span className="text-ink/50 font-sans font-medium text-sm">Services</span>
      </span>
    </span>
  );
}

export function PayLogosRow({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <VisaLogo />
      <MastercardLogo />
      <AmexLogo />
      <CbLogo />
    </span>
  );
}
