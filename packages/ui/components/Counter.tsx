import { useState } from 'react'

interface CounterProps {
  initialCount?: number
}

export function Counter({ initialCount = 0 }: CounterProps) {
  const [count, setCount] = useState(initialCount)

  return (
    <button
      onClick={() => setCount(c => c + 1)}
      className="rounded-lg border border-transparent px-5 py-2 text-base font-medium bg-slate-900 text-white cursor-pointer transition-colors hover:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/50"
    >
      count is {count}
    </button>
  )
}
