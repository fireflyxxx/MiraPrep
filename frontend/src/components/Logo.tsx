type LogoSize = "sm" | "md" | "lg";
export type LogoVariant = "mirror-m" | "mirror-chat" | "mirror-wave" | "mirror-score" | "mirror-wordmark";

const sizeMap = {
  sm: { mark: 24, text: "text-[18px]", gap: "gap-2" },
  md: { mark: 30, text: "text-[21px]", gap: "gap-2.5" },
  lg: { mark: 36, text: "text-[22px]", gap: "gap-3" },
};

function MirrorMark({
  size,
  variant,
}: {
  size: number;
  variant: LogoVariant;
}) {
  const stroke = variant === "mirror-wordmark" ? 2.2 : 2.6;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={`mirror-face-${variant}`} x1="9" y1="7" x2="31" y2="35">
          <stop stopColor="#ffffff" />
          <stop offset="0.52" stopColor="#fff2e8" />
          <stop offset="1" stopColor="#ffe0cc" />
        </linearGradient>
        <linearGradient id={`mirror-shine-${variant}`} x1="11" y1="9" x2="28" y2="28">
          <stop stopColor="#ffffff" stopOpacity="0.94" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect
        x="7.5"
        y="5.5"
        width="25"
        height="29"
        rx="9"
        transform="rotate(-6 20 20)"
        fill={`url(#mirror-face-${variant})`}
        stroke="#0a0a0a"
        strokeWidth={stroke}
      />
      <path
        d="M13.7 11.5C16.7 9.6 22.1 8.8 26.1 10.6"
        stroke={`url(#mirror-shine-${variant})`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {variant === "mirror-m" && (
        <path
          d="M12.8 27.2V16.1L19.5 23.2L26.4 16.1V27.2"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {variant === "mirror-chat" && (
        <>
          <path
            d="M12.7 16.2H27.1C28.5 16.2 29.5 17.2 29.5 18.6V24C29.5 25.4 28.5 26.4 27.1 26.4H20.4L16.1 29.4V26.4H12.7C11.3 26.4 10.3 25.4 10.3 24V18.6C10.3 17.2 11.3 16.2 12.7 16.2Z"
            fill="#fff7ed"
            stroke="#f97316"
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <path d="M15 21.2H25" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {variant === "mirror-wave" && (
        <g stroke="#f97316" strokeLinecap="round" strokeWidth="3">
          <path d="M14 23V20" />
          <path d="M18 25.5V17.5" />
          <path d="M22 27V16" />
          <path d="M26 24V19" />
        </g>
      )}

      {variant === "mirror-score" && (
        <>
          <path
            d="M13.3 22.3L18 26.8L27.2 15.7"
            stroke="#f97316"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M29 27.8L31.8 32.1"
            stroke="#0a0a0a"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </>
      )}

      {variant === "mirror-wordmark" && (
        <path
          d="M12.8 24.5C15.6 19 21.2 15.8 27.5 15.4"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default function Logo({
  size = "md",
  variant = "mirror-wordmark",
  markOnly = false,
}: {
  size?: LogoSize;
  variant?: LogoVariant;
  markOnly?: boolean;
}) {
  const { mark, text, gap } = sizeMap[size];

  return (
    <span className={`inline-flex items-center ${gap}`}>
      <MirrorMark size={mark} variant={variant} />
      {!markOnly && (
        <span className={`font-display font-bold tracking-tight ${text}`}>
          MiraPrep
          <span className="text-orange-500">.</span>
        </span>
      )}
    </span>
  );
}
