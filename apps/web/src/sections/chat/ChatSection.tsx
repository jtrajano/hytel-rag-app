import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, MessageSquare, ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

// ── Types ────────────────────────────────────────────────────────────────────

interface Source {
  label: string
  url?: string | null
  chunk_index?: number | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  sources?: Source[]
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

function SourceChips({ sources }: { sources: Source[] }) {
  if (!sources.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map(s => (
        <span key={s.label}>
          {s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              {s.label}
            </a>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {s.label}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

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
      <div className={cn('max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}
        >
          {message.content}
        </div>
        {!isUser && message.sources && <SourceChips sources={message.sources} />}
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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const askMutation = trpc.chat.ask.useMutation()
  const isTyping = askMutation.isPending

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

    askMutation.mutate(
      { question: trimmed },
      {
        onSuccess(data) {
          setMessages(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: data.answer,
              sources: data.sources,
              timestamp: new Date(),
            },
          ])
        },
        onError() {
          setMessages(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content:
                "Sorry, I couldn't get a response right now. Please check your connection and try again.",
              timestamp: new Date(),
            },
          ])
        },
      }
    )
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
