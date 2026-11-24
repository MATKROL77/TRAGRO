/** Íconos SVG propios (sin dependencias). */
type P = { size?: number };
const svg = (d: React.ReactNode, size = 20) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
export const IconCamera = ({ size }: P) => svg(<><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>, size);
export const IconPlay = ({ size }: P) => svg(<path d="M7 5l12 7-12 7z" />, size);
export const IconPause = ({ size }: P) => svg(<><path d="M8 5v14" /><path d="M16 5v14" /></>, size);
export const IconFold = ({ size }: P) => svg(<><path d="M3 17h18" /><path d="M6 17V8l5 4" /><path d="M18 17V8l-5 4" /></>, size);
export const IconUnit = ({ size }: P) => svg(<><circle cx="7" cy="16" r="4" /><circle cx="17" cy="17" r="3" /><path d="M7 12V5h6l2 6" /></>, size);
export const IconFull = ({ size }: P) => svg(<><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></>, size);
export const IconShot = ({ size }: P) => svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /></>, size);
export const IconShare = ({ size }: P) => svg(<><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 11l7.6-4" /><path d="M8.2 13l7.6 4" /></>, size);
export const IconClose = ({ size }: P) => svg(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, size);
export const IconChevron = ({ size }: P) => svg(<path d="M9 6l6 6-6 6" />, size);
export const IconBack = ({ size }: P) => svg(<path d="M15 6l-6 6 6 6" />, size);
export const IconInfo = ({ size }: P) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.5" /></>, size);
export const IconWarn = ({ size }: P) => svg(<><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18v.5" /></>, size);
export const IconCheck = ({ size }: P) => svg(<path d="M5 12l5 5 9-10" />, size);
export const IconMore = ({ size }: P) => svg(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>, size);
export const IconWhatsapp = ({ size }: P) => svg(<><path d="M4 20l1.3-4A8 8 0 1 1 8 19z" /><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z" /></>, size);
export const IconMail = ({ size }: P) => svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>, size);
export const IconPdf = ({ size }: P) => svg(<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 14h6" /><path d="M9 17h4" /></>, size);
export const IconCompare = ({ size }: P) => svg(<><rect x="3" y="5" width="7" height="14" rx="1.5" /><rect x="14" y="5" width="7" height="14" rx="1.5" /></>, size);
export const IconReset = ({ size }: P) => svg(<><path d="M4 4v6h6" /><path d="M5 15a8 8 0 1 0 1-7l-2 2" /></>, size);
export const IconGlobe = ({ size }: P) => svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3.5 3 14.5 0 18" /><path d="M12 3c-3 3.5-3 14.5 0 18" /></>, size);
export const IconTractor = ({ size }: P) => svg(<><circle cx="7" cy="16" r="4" /><circle cx="18" cy="17" r="2.5" /><path d="M4 12V7h6l1 5h6l2 3" /></>, size);
export const IconPin = ({ size }: P) => svg(<><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /></>, size);
export const IconChart = ({ size }: P) => svg(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>, size);
