/**
 * 应用品牌标识（屏幕 + 光标）：蓝色渐变圆角底 + 深色远控画面 + 白色指针。
 * 图形与 public/favicon.svg、桌面图标同源，改一处记得同步三处。
 */
export function BrandLogo({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <defs>
        <linearGradient id="uurc-brand-tile" x1="0.08" y1="0" x2="0.92" y2="1">
          <stop offset="0" stopColor="#7BA6FF" />
          <stop offset="0.42" stopColor="#3D66F7" />
          <stop offset="1" stopColor="#221FC2" />
        </linearGradient>
        <linearGradient id="uurc-brand-glass" x1="0.1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#1E3058" />
          <stop offset="1" stopColor="#080D1C" />
        </linearGradient>
        <linearGradient id="uurc-brand-sheen" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.26" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#uurc-brand-tile)" />
      <rect width="512" height="512" rx="116" fill="url(#uurc-brand-sheen)" />
      <rect
        x="96"
        y="112"
        width="320"
        height="208"
        rx="52"
        fill="url(#uurc-brand-glass)"
        stroke="#ffffff"
        strokeOpacity="0.92"
        strokeWidth="17"
      />
      <path d="M243 167v100l24-22 20 44 26-12-20-44h33z" fill="#ffffff" />
      <path d="M256 324v44" stroke="#ffffff" strokeWidth="23" strokeLinecap="round" />
      <path d="M192 396h128" stroke="#ffffff" strokeWidth="23" strokeLinecap="round" />
    </svg>
  );
}
