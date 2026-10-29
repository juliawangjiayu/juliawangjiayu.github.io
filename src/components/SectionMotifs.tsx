type MotifProps = {
  className?: string;
};

export function FrogMotif({ className }: MotifProps) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 94 78">
      <ellipse cx="47" cy="65" fill="#b4c7a8" rx="44" ry="12" />
      <path d="M54 54 L84 58 L69 66 Z" fill="#eaf0e6" />
      <ellipse cx="46" cy="45" fill="#718c65" rx="29" ry="18" />
      <circle cx="32" cy="26" fill="#819a72" r="11" />
      <circle cx="59" cy="26" fill="#819a72" r="11" />
      <circle cx="32" cy="24" fill="#2e3d2b" r="3" />
      <circle cx="59" cy="24" fill="#2e3d2b" r="3" />
      <path d="M40 43 Q46 47 53 42" fill="none" stroke="#344631" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function WitchMotif({ className }: MotifProps) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 120 76">
      <path d="M11 58 Q54 46 96 54 M94 51 L110 43 M94 54 L112 55 M94 57 L108 66" fill="none" stroke="#8b704b" strokeLinecap="round" strokeWidth="3" />
      <path d="M40 47 Q53 35 69 42 L77 53 Q60 50 42 56Z" fill="#75658e" />
      <circle cx="51" cy="31" fill="#dfb185" r="10" />
      <path d="M40 27 L51 8 L62 27 Q51 22 40 27Z" fill="#514a5d" />
      <path d="M45 42 Q34 48 29 58 M63 43 Q75 37 81 31" fill="none" stroke="#dfb185" strokeLinecap="round" strokeWidth="4" />
      <circle cx="54" cy="31" fill="#302f2a" r="1.5" />
    </svg>
  );
}

export function FlightTrail({ className }: MotifProps) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 250 160">
      <path d="M6 146 C61 23 136 17 147 91 S207 123 243 17" fill="none" stroke="currentColor" strokeDasharray="3 8" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M18 40 L21 47 L28 50 L21 53 L18 60 L15 53 L8 50 L15 47 Z" fill="#d3a86d" />
    </svg>
  );
}
