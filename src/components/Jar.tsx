import { useId } from 'react'

// A chunky jar whose liquid level shows how full a bill jar is.
// Server- and client-safe (no state); the wave is pure CSS animation.

const FILLS = {
  mandarin: { liquid: '#ff6b00', crest: '#ff8a33' },
  crest: { liquid: '#ffc72c', crest: '#ffd965' },
  forest: { liquid: '#1d5a3f', crest: '#2f7a57' },
} as const

export type JarColor = keyof typeof FILLS

export function Jar({
  pct,
  color = 'mandarin',
  className = '',
  lid = '#ffc72c',
  children,
}: {
  pct: number
  color?: JarColor
  className?: string
  lid?: string
  children?: React.ReactNode
}) {
  const id = useId().replace(/:/g, '')
  const level = Math.max(0, Math.min(100, pct))
  // Inner jar body spans y=44..196 (152px). Liquid top moves with level.
  const top = 196 - (152 * level) / 100
  const { liquid, crest } = FILLS[color]
  const wave = (y: number) =>
    `M0 ${y} Q 25 ${y - 7} 50 ${y} T 100 ${y} T 150 ${y} T 200 ${y} T 250 ${y} T 300 ${y} T 350 ${y} T 400 ${y} V 210 H 0 Z`

  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 160 210" className="h-full w-full overflow-visible" role="img" aria-label={`${level}% full`}>
        <defs>
          <clipPath id={`body-${id}`}>
            <path d="M22 52c0-8 6-14 14-14h88c8 0 14 6 14 14v128c0 10-8 18-18 18H40c-10 0-18-8-18-18z" />
          </clipPath>
        </defs>
        {/* shadow */}
        <path d="M28 58c0-8 6-14 14-14h88c8 0 14 6 14 14v128c0 10-8 18-18 18H46c-10 0-18-8-18-18z" fill="#0b1f16" />
        {/* body */}
        <path d="M22 52c0-8 6-14 14-14h88c8 0 14 6 14 14v128c0 10-8 18-18 18H40c-10 0-18-8-18-18z" fill="#fff6e5" />
        <g clipPath={`url(#body-${id})`}>
          {level > 0 && (
            <>
              <g style={{ transform: `translateY(${top - 6}px)`, transition: 'transform 900ms cubic-bezier(.34,1.3,.64,1)' }}>
                <path d={wave(6)} fill={crest} className="animate-wave-slow" />
              </g>
              <g style={{ transform: `translateY(${top}px)`, transition: 'transform 900ms cubic-bezier(.34,1.3,.64,1)' }}>
                <path d={wave(6)} fill={liquid} className="animate-wave" />
              </g>
            </>
          )}
          {/* shine */}
          <rect x="34" y="56" width="10" height="90" rx="5" fill="#ffffff" opacity="0.55" />
        </g>
        <path
          d="M22 52c0-8 6-14 14-14h88c8 0 14 6 14 14v128c0 10-8 18-18 18H40c-10 0-18-8-18-18z"
          fill="none"
          stroke="#0b1f16"
          strokeWidth="5"
        />
        {/* lid */}
        <rect x="40" y="12" width="80" height="26" rx="8" fill="#0b1f16" transform="translate(4 4)" />
        <rect x="40" y="12" width="80" height="26" rx="8" fill={lid} stroke="#0b1f16" strokeWidth="5" />
        <line x1="54" y1="25" x2="106" y2="25" stroke="#0b1f16" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      </svg>
      {children && <div className="absolute inset-x-0 top-[34%] flex flex-col items-center text-center">{children}</div>}
    </div>
  )
}
