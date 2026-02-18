import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, MessageSquare, ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// ── Simulated responses ───────────────────────────────────────────────────────

const RESPONSES: Record<string, string> = {
  pm25: 'PM2.5 refers to fine particulate matter with a diameter of 2.5 micrometers or less. These tiny particles can penetrate deep into the lungs and enter the bloodstream. In Southeast Asia, PM2.5 is primarily driven by vehicle emissions, industrial activity, and seasonal biomass burning. The WHO safe limit is 15 µg/m³ annual mean.',
  aqi: 'The Air Quality Index (AQI) is a standardized scale from 0 to 500 used to communicate pollution levels. Good (0–50), Moderate (51–100), Unhealthy for Sensitive Groups (101–150), Unhealthy (151–200), Very Unhealthy (201–300), and Hazardous (301+). AirCare SEA uses the US EPA AQI standard.',
  mask: 'For air quality protection, an N95 or KN95 respirator is recommended when AQI exceeds 150. Surgical masks offer limited protection against PM2.5. Ensure your mask fits snugly — gaps around the nose and chin significantly reduce effectiveness. Replace masks regularly and avoid reusing disposable masks.',
  manila:
    "Manila's air quality is typically Unhealthy (AQI 150–200) during dry season months (November–April) due to traffic density, industrial zones in nearby Cavite and Laguna, and limited coastal wind dispersion. Improvement is common during typhoon season when rainfall washes pollutants from the air.",
  jakarta:
    "Jakarta consistently ranks among the most polluted cities in Southeast Asia, with AQI regularly reaching Very Unhealthy levels (200+). The city's 10 million vehicles and surrounding industrial zones contribute heavily. The government has active relocation and green infrastructure plans to address long-term air quality.",
  bangkok:
    'Bangkok experiences moderate to unhealthy air quality, especially during November–February when cool, still air traps pollutants near the ground. PM2.5 from vehicle exhaust and crop burning in northern Thailand both contribute. The city has expanded its BTS and MRT network partly to reduce traffic-related emissions.',
  singapore:
    'Singapore generally has among the best air quality in Southeast Asia (AQI 20–60 on typical days) due to strict vehicle and industrial emission standards and minimal heavy industry. However, it is affected by seasonal haze from Sumatra and Kalimantan fires during June–October, which can push AQI above 150.',
  children:
    'Children are particularly vulnerable to air pollution because their lungs are still developing and they breathe more air relative to body weight than adults. When AQI exceeds 100, limit outdoor play time, especially vigorous activity. Keep children indoors with windows closed and use air purifiers with HEPA filters if available.',
  asthma:
    "People with asthma should be especially cautious when AQI exceeds 100. Always carry a reliever inhaler outdoors. Consider using a controller inhaler if prescribed by your doctor, especially during haze season. Monitor symptoms closely — air pollution can trigger attacks even before AQI reaches 'Unhealthy' levels.",
  protect:
    'To protect yourself from air pollution: (1) Check AQI before going outside. (2) Wear an N95 mask when AQI > 150. (3) Exercise indoors on high-pollution days. (4) Keep windows closed and use air purifiers with HEPA filters. (5) Stay hydrated — it helps your body flush inhaled particles. (6) Limit outdoor exposure during peak traffic hours (7–9 AM, 5–8 PM).',
  default:
    "That's a great question about air quality in Southeast Asia. Based on available data, PM2.5 remains the primary pollutant of concern across the region. I recommend checking the real-time AQI for your specific location and limiting outdoor activity when levels exceed 100 (Unhealthy for Sensitive Groups). Would you like specific guidance for your health profile or city?",
}

function getResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('pm2.5') || lower.includes('pm 2.5') || lower.includes('particulate'))
    return RESPONSES.pm25
  if (lower.includes('aqi') || lower.includes('air quality index') || lower.includes('scale'))
    return RESPONSES.aqi
  if (lower.includes('mask') || lower.includes('n95') || lower.includes('respirator'))
    return RESPONSES.mask
  if (lower.includes('manila') || lower.includes('philippines')) return RESPONSES.manila
  if (lower.includes('jakarta') || lower.includes('indonesia')) return RESPONSES.jakarta
  if (lower.includes('bangkok') || lower.includes('thailand')) return RESPONSES.bangkok
  if (lower.includes('singapore')) return RESPONSES.singapore
  if (
    lower.includes('child') ||
    lower.includes('kid') ||
    lower.includes('baby') ||
    lower.includes('school')
  )
    return RESPONSES.children
  if (lower.includes('asthma') || lower.includes('inhaler') || lower.includes('breathing'))
    return RESPONSES.asthma
  if (
    lower.includes('protect') ||
    lower.includes('safe') ||
    lower.includes('tips') ||
    lower.includes('avoid')
  )
    return RESPONSES.protect
  return RESPONSES.default
}

// ── Suggested questions ───────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'What is PM2.5 and why is it dangerous?',
  'How does the AQI scale work?',
  'What mask should I wear when AQI is high?',
  "What is Manila's typical air quality?",
  'How does air pollution affect children with asthma?',
]

// ── Sub-components ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-3 items-start', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
          isUser ? 'bg-primary' : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted text-foreground rounded-tl-sm'
        )}
      >
        {message.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

// ── Main Section ──────────────────────────────────────────────────────────────

const ChatSection = () => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMessage = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isTyping) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsTyping(true)

    setTimeout(() => {
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: getResponse(trimmed),
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMsg])
      setIsTyping(false)
    }, 800)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage(inputValue)
  }

  const firstName = user?.displayName?.split(' ')[0] ?? null
  const showEmpty = messages.length === 0 && !isTyping

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 text-muted-foreground hover:text-foreground"
          >
            <Link to="/dashboard">
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Ask AI</h1>
            <p className="text-sm text-muted-foreground">Air quality &amp; environmental Q&amp;A</p>
          </div>
        </div>
      </header>

      {/* Scrollable messages */}
      <main className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-4 py-6">
        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageSquare className="w-7 h-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">
              {firstName ? `Hi, ${firstName}!` : 'Hi there!'}
            </h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs">
              Ask me anything about air quality, pollution, and how to protect your health across
              Southeast Asia.
            </p>

            <div className="w-full space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Suggested questions
              </p>
              {SUGGESTED_QUESTIONS.map(q => (
                <Card
                  key={q}
                  className="cursor-pointer border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => sendMessage(q)}
                >
                  <CardContent className="px-4 py-3">
                    <p className="text-sm text-foreground">{q}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!showEmpty && (
          <div className="space-y-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Sticky input bar */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Input
            type="text"
            placeholder="Ask about air quality..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
            className="flex-1"
          />
          <Button
            onClick={() => sendMessage(inputValue)}
            disabled={isTyping || inputValue.trim().length === 0}
            size="icon"
            className="flex-shrink-0"
          >
            {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <div className="max-w-2xl mx-auto mt-2 flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Powered by Gemini AI · Responses are for informational purposes only
          </p>
        </div>
      </div>
    </div>
  )
}

export default ChatSection
