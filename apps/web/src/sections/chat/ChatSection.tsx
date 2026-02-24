import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, MessageSquare, ChevronLeft, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import ReactMarkdown, { type Components } from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RagSource {
  label: string
  url: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: RagSource[]
  timestamp: Date
}

// ── Suggested questions ────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'What is PM2.5 and why is it dangerous?',
  'How does the AQI scale work?',
  'What mask should I wear when AQI is high?',
  "What is Manila's typical air quality?",
  'How does air pollution affect children with asthma?',
]

// ── Markdown renderer ──────────────────────────────────────────────────────────

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  h1: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-medium mb-1">{children}</p>,
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

      <div className={cn('max-w-[75%] flex flex-col gap-2', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
          )}
        </div>

        {/* Source citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {message.sources.map((src, i) => (
              <a
                key={src.url}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3 h-3" />[{i + 1}] {src.label}
              </a>
            ))}
          </div>
        )}
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

// ── Main Section ───────────────────────────────────────────────────────────────

const ChatSection = () => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const askMutation = trpc.chat.ask.useMutation({
    onSuccess: data => {
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMsg])
    },
    onError: err => {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, something went wrong: ${err.message}. Please try again.`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, askMutation.isPending])

  const sendMessage = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || askMutation.isPending) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInputValue('')

    // Extract city and/or country from user message (simple heuristic)
    const cityMatch = trimmed.match(
      /\b(bangkok|manila|jakarta|singapore|kuala lumpur|ho chi minh|hanoi|phnom penh|yangon|vientiane)\b/i
    )
    const countryMatch = trimmed.match(
      /\b(thailand|philippines|indonesia|malaysia|vietnam|cambodia|myanmar|laos|brunei|singapore|timor.?leste)\b/i
    )
    askMutation.mutate({
      question: trimmed,
      city: cityMatch ? cityMatch[0] : undefined,
      country: countryMatch ? countryMatch[0] : undefined,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage(inputValue)
  }

  const firstName = user?.displayName?.split(' ')[0] ?? null
  const showEmpty = messages.length === 0 && !askMutation.isPending

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
            {askMutation.isPending && <TypingIndicator />}
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
            disabled={askMutation.isPending}
            className="flex-1"
          />
          <Button
            onClick={() => sendMessage(inputValue)}
            disabled={askMutation.isPending || inputValue.trim().length === 0}
            size="icon"
            className="flex-shrink-0"
          >
            {askMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="max-w-2xl mx-auto mt-2 flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Responses are for informational purposes only
          </p>
        </div>
      </div>
    </div>
  )
}

export default ChatSection
