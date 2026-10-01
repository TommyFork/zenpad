import type { TaskProgress } from '../lib/tasks'

// The wedge for a share of the circle, starting at twelve o'clock and going clockwise.
function wedge(share: number, radius: number): string {
  const angle = share * 2 * Math.PI
  const x = 8 + radius * Math.sin(angle)
  const y = 8 - radius * Math.cos(angle)
  return `M8 8V${8 - radius}A${radius} ${radius} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)}Z`
}

interface ProgressRingProps {
  progress: TaskProgress
  size?: number
}

// A circle that fills like a pie as tasks are checked off, and becomes a check mark once they all are.
export function ProgressRing({ progress, size = 14 }: ProgressRingProps) {
  const share = progress.total === 0 ? 0 : progress.done / progress.total
  const complete = share === 1
  return (
    <svg className={complete ? 'progress-ring is-complete' : 'progress-ring'} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {complete ? (
        <>
          <circle className="progress-ring-fill" cx="8" cy="8" r="7.5" />
          <path className="progress-ring-check" d="M5 8.3l2 2 4-4.3" />
        </>
      ) : (
        <>
          <circle className="progress-ring-outline" cx="8" cy="8" r="6.75" />
          {share > 0 && <path className="progress-ring-fill" d={wedge(share, 4.5)} />}
        </>
      )}
    </svg>
  )
}
