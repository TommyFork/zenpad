import type { TaskProgress } from '../lib/tasks'

const RADIUS = 6.25
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface ProgressRingProps {
  progress: TaskProgress
  size?: number
}

// A small circle that fills as tasks are checked off, and turns into a check mark once they all are.
export function ProgressRing({ progress, size = 14 }: ProgressRingProps) {
  const complete = progress.done === progress.total
  return (
    <svg className={complete ? 'progress-ring is-complete' : 'progress-ring'} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {complete ? (
        <>
          <circle className="progress-ring-fill" cx="8" cy="8" r="8" />
          <path className="progress-ring-check" d="M4.8 8.2l2.1 2.1 4.3-4.4" />
        </>
      ) : (
        <>
          <circle className="progress-ring-track" cx="8" cy="8" r={RADIUS} />
          {/* With nothing done yet, the bar's round cap would still show as a dot. */}
          {progress.done > 0 && (
            <circle
              className="progress-ring-bar"
              cx="8"
              cy="8"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress.done / progress.total)}
              transform="rotate(-90 8 8)"
            />
          )}
        </>
      )}
    </svg>
  )
}
