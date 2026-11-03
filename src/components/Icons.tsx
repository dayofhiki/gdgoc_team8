type P = { size?: number; color?: string };

export const BackIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M15.5 3 6.5 12l9 9" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CloseIcon = ({ size = 24, color = "currentColor" }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5 5l14 14M19 5 5 19" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
  </svg>
);

export const ChevronRight = ({ size = 20, color = "#B0B8C1" }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
    <path d="m7.5 5 5 5-5 5" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CheckCircle = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="12" fill="#3182F6" />
    <path d="m7.5 12.3 3 3 6-6.3" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const InfoIcon = ({ size = 18, color = "#8B95A1" }: P) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
    <circle cx="9" cy="9" r="7.5" fill={color} />
    <path d="M9 8.2v4.3" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
    <circle cx="9" cy="5.8" r="0.9" fill="#fff" />
  </svg>
);

export const LockIcon = ({ size = 22, color = "#3182F6", filled = false }: P & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
    <rect x="4" y="9.5" width="14" height="10" rx="2.5" stroke={color} strokeWidth={1.83} fill={filled ? color : "none"} />
    <path d="M7.5 9.5V7a3.5 3.5 0 0 1 7 0v2.5" stroke={color} strokeWidth={1.83} strokeLinecap="round" />
    {!filled && <circle cx="11" cy="14.5" r="1.1" fill={color} />}
  </svg>
);

export const SendIcon = ({ size = 22, color = "#3182F6" }: P) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
    <path d="M19 3 9.5 12.5M19 3l-5.5 16-4-6.5L3 8.5 19 3Z" stroke={color} strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ClockIcon = ({ size = 19, color = "#3182F6" }: P) => (
  <svg width={size} height={size} viewBox="0 0 19 19" fill="none" aria-hidden>
    <circle cx="9.5" cy="9.5" r="7" stroke={color} strokeWidth={1.58} />
    <path d="M9.5 5.5v4l2.5 1.5" stroke={color} strokeWidth={1.58} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PlusIcon = ({ size = 24, color = "#3182F6" }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 6v12M6 12h12" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
  </svg>
);

export const PersonIcon = ({ size = 22, color = "#8B95A1" }: P) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
    <circle cx="11" cy="7.5" r="3.5" fill={color} />
    <path d="M4 18c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5v.5H4V18Z" fill={color} />
  </svg>
);
