import { useEffect, useState } from 'react'
import { Sunrise, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { trpc } from '@/lib/trpc'
import { useAuth } from '@/hooks/useAuth'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function getCached(city: string): string | null {
  try {
    const raw = localStorage.getItem(`morning_briefing:${city}`)
    if (!raw) return null
    const { answer, cachedAt } = JSON.parse(raw) as { answer: string; cachedAt: number }
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null
    return answer
  } catch {
    return null
  }
}

function setCached(city: string, answer: string) {
  try {
    localStorage.setItem(
      `morning_briefing:${city}`,
      JSON.stringify({ answer, cachedAt: Date.now() })
    )
  } catch {
    // ignore storage quota errors
  }
}

interface MorningSummarySectionProps {
  homeCity?: string | null
}

const MorningSummarySection = ({ homeCity }: MorningSummarySectionProps) => {
  const { user, loading } = useAuth()
  const [cachedAnswer, setCachedAnswer] = useState<string | null>(null)
  const [cacheChecked, setCacheChecked] = useState(false)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  useEffect(() => {
    setCacheChecked(false)
    setCachedAnswer(null)

    if (!homeCity) {
      setCacheChecked(true)
      return
    }

    const cached = getCached(homeCity)
    if (cached) {
      setCachedAnswer(cached)
    }
    setCacheChecked(true)
  }, [homeCity])

  const briefingQuery = trpc.chat.askBriefing.useQuery(
    {
      question: `Give me a morning air quality briefing for ${homeCity ?? 'my city'}. Include the current air quality rating and PM2.5 levels, health recommendations especially for sensitive groups, and the short-term forecast for today.`,
      city: homeCity ?? undefined,
    },
    {
      enabled: cacheChecked && !loading && !!user && !!homeCity && !cachedAnswer,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  )

  useEffect(() => {
    if (!homeCity || !briefingQuery.data?.answer) return
    setCached(homeCity, briefingQuery.data.answer)
  }, [briefingQuery.data?.answer, homeCity])

  const answer = cachedAnswer ?? briefingQuery.data?.answer
  const isPending = briefingQuery.isPending
  const isError = briefingQuery.isError

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <Sunrise className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Morning Health Briefing
            </p>
            <p className="text-xs text-muted-foreground">
              {homeCity ?? 'Set your location'} - {today}
            </p>
          </div>
        </div>

        <Separator className="mb-4" />

        {isPending && !answer && (
          <div className="py-2 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            Generating your morning briefing...
          </div>
        )}

        {answer && (
          <div className="text-sm leading-relaxed text-foreground">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
                ),
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                h1: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                h3: ({ children }) => <p className="font-medium mb-1">{children}</p>,
              }}
            >
              {answer}
            </ReactMarkdown>
          </div>
        )}

        {!isPending && isError && !answer && (
          <p className="text-sm text-muted-foreground">
            Unable to load briefing. Please refresh the page.
          </p>
        )}

        {!isPending && !answer && !isError && (
          <p className="text-sm text-muted-foreground">
            Set your home city to get a personalised morning briefing.
          </p>
        )}

        <Separator className="my-4" />

        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
          <Badge variant="secondary" className="text-xs font-normal">
            Generated by Gemini AI
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export default MorningSummarySection
