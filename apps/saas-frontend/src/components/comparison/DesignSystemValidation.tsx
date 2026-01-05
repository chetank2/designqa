import { FC } from 'react'
import { DesignSystemValidationResult } from '@/types'

interface DesignSystemValidationProps {
  results?: DesignSystemValidationResult
}

export const DesignSystemValidation: FC<DesignSystemValidationProps> = ({ results }) => {
  if (!results) {
    return null
  }

  const figmaMatches = results.figma.matches.length
  const figmaDeviations = results.figma.deviations.length
  const webMatches = results.web.matches.length
  const webDeviations = results.web.deviations.length

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-gray-900">Design System Validation</div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${
          results.summary === 'consistent' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {results.summary === 'consistent' ? 'Consistent' : 'Deviations'}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-gray-50 p-3">
          <div className="font-medium text-gray-800">Figma</div>
          <div className="mt-1 text-xs text-gray-600">
            Matches: {figmaMatches} · Deviations: {figmaDeviations}
          </div>
          {figmaDeviations > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {results.figma.deviations.slice(0, 3).map((item, idx) => (
                <li key={`figma-dev-${idx}`}>
                  {item.property}: {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md bg-gray-50 p-3">
          <div className="font-medium text-gray-800">Web</div>
          <div className="mt-1 text-xs text-gray-600">
            Matches: {webMatches} · Deviations: {webDeviations}
          </div>
          {webDeviations > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {results.web.deviations.slice(0, 3).map((item, idx) => (
                <li key={`web-dev-${idx}`}>
                  {item.property}: {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default DesignSystemValidation
