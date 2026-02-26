import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Bot,
  User,
  Loader2,
  MessageSquare,
  ChevronLeft,
  ExternalLink,
  Plus,
  History,
  Menu,
  X,
} from 'lucide-react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown, { type Components } from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

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

const SUGGESTED_QUESTIONS = [
  'What is PM2.5 and why is it dangerous?',
  'How does the AQI scale work?',
  'What mask should I wear when AQI is high?',
  "What is Manila's typical air quality?",
  'How does air pollution affect children with asthma?',
]

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

      <div className={cn('max-w-[85%] sm:max-w-[75%] flex flex-col gap-2', isUser && 'items-end')}>
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

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {message.sources.map((src, i) => (
              <a
                key={`${src.url}-${i}`}
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

const ChatSection = () => {
  const { user } = useAuth()
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    data: sessions,
    refetch: refetchSessions,
    isLoading: isLoadingSessions,
    error: sessionsError,
  } = trpc.chat.listSessions.useQuery()
  const { data: history, isLoading: isLoadingHistory } = trpc.chat.getSessionMessages.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId }
  )

  // clears messages on new chat start.
  useEffect(() => {
    if (!sessionId) {
      setMessages([])
    }
  }, [sessionId])

  useEffect(() => {
    if (history) {
      setMessages(
        history.map(m => ({
          ...m,
          role: m.role as 'user' | 'assistant',
          timestamp: new Date(m.timestamp),
        }))
      )
    }
  }, [history])

  const askMutation = trpc.chat.ask.useMutation({
    onSuccess: data => {
      const isNewSession = !sessionId
      if (isNewSession) {
        navigate(`/chat/${data.sessionId}`, { replace: true })
        refetchSessions()
      }

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

    // extracts city matches from predefined list.
    const cities = [
      'bangkok',
      'manila',
      'jakarta',
      'singapore',
      'kuala lumpur',
      'ho chi minh',
      'hanoi',
      'phnom penh',
      'yangon',
      'vientiane',
    ]
    const cityMatch = cities.find(c => trimmed.toLowerCase().includes(c))

    askMutation.mutate({
      question: trimmed,
      sessionId,
      city: cityMatch,
    })
  }

  const startNewChat = () => {
    navigate('/chat')
    setSidebarOpen(false)
  }

  const selectSession = (id: string) => {
    navigate(`/chat/${id}`)
    setSidebarOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage(inputValue)
  }

  const firstName = user?.displayName?.split(' ')[0] ?? null
  const showEmpty = messages.length === 0 && !askMutation.isPending && !isLoadingHistory

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden relative">
      <header className="shrink-0 z-30 bg-background backdrop-blur-md border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-foreground" />
            </Button>
            <div className="hidden lg:block">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1 text-muted-foreground hover:bg-slate-100"
              >
                <Link to="/dashboard">
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </Link>
              </Button>
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-foreground">Ask AI</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-medium opacity-70">
                Personal Air Quality Guide
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={startNewChat}
              variant="outline"
              size="sm"
              className="gap-2 shadow-sm bg-background hover:bg-slate-50"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Chat</span>
              <span className="sm:hidden">New</span>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:flex gap-2 text-muted-foreground hover:bg-slate-100"
            >
              <Link to="/dashboard">
                <ExternalLink className="w-4 h-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex max-w-7xl mx-auto w-full overflow-hidden relative">
          {isSidebarOpen && (
            <div
              className="fixed inset-0 bg-white/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-72 border-r border-border flex flex-col transition-transform lg:relative lg:translate-x-0 lg:z-0 lg:inset-auto',
              isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <div className="p-4 flex flex-col h-full bg-background lg:bg-transparent">
              <div className="flex items-center justify-between mb-6">
                <h2 className="flex items-center gap-2 font-semibold text-sm text-foreground">
                  <History className="w-4 h-4 text-primary" />
                  Recent Chats
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="w-5 h-5 shadow-sm" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2 custom-scrollbar">
                {isLoadingSessions && (
                  <div className="flex flex-col gap-2 p-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-9 w-full rounded-lg bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                )}
                {sessionsError && (
                  <p className="text-xs text-center text-destructive py-8">
                    Failed to load history
                  </p>
                )}
                {!isLoadingSessions &&
                  sessions?.map(s => (
                    <button
                      key={s.id}
                      onClick={() => selectSession(s.id)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-xl text-sm truncate transition-all duration-200',
                        sessionId === s.id
                          ? 'bg-primary text-primary-foreground shadow-sm scale-[1.02]'
                          : 'hover:bg-chart-4 hover:shadow-sm text-muted-foreground hover:text-white'
                      )}
                    >
                      {s.title}
                    </button>
                  ))}
                {!isLoadingSessions && sessions?.length === 0 && (
                  <div className="py-12 text-center">
                    <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No past chats yet</p>
                  </div>
                )}
              </div>

              <div className="mt-auto pt-4 border-t border-border lg:hidden">
                <Button
                  asChild
                  variant="ghost"
                  className="w-full justify-start gap-2 h-10 hover:bg-slate-100"
                >
                  <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
                    <ChevronLeft className="w-4 h-4" />
                    Back to Dashboard
                  </Link>
                </Button>
              </div>
            </div>
          </aside>

          <main className="flex-1 flex flex-col min-w-0 bg-background lg:border-l lg:border-border overflow-y-auto scroll-smooth scrollbar-hide">
            <div className="max-w-4xl mx-auto w-full px-4 py-8">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mb-2 text-primary" />
                  <p className="text-sm font-medium">Loading messages...</p>
                </div>
              ) : showEmpty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center max-w-lg mx-auto">
                  <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mb-6 shadow-indigo-100/50 shadow-xl rotate-3">
                    <MessageSquare className="w-8 h-8 text-primary -rotate-3" />
                  </div>
                  <h2 className="text-2xl font-bold mb-3 text-foreground">
                    {firstName ? `Hello, ${firstName}!` : 'Hello!'}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-10 leading-relaxed max-w-[320px]">
                    I can help you understand air quality levels, health risks, and protection
                    measures across Southeast Asia.
                  </p>

                  <div className="w-full space-y-3">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-px flex-1 bg-slate-100" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                        Try asking
                      </p>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>
                    {SUGGESTED_QUESTIONS.map(q => (
                      <button
                        key={q}
                        className="w-full text-left p-4 rounded-2xl border border-slate-100 bg-slate-50/30 hover:border-primary/40 hover:bg-white hover:shadow-md hover:shadow-primary/5 transition-all text-sm group active:scale-[0.98]"
                        onClick={() => sendMessage(q)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700 group-hover:text-primary transition-colors">
                            {q}
                          </span>
                          <Send className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map(msg => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  {askMutation.isPending && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <footer className="shrink-0 bg-background border-t border-border px-4 py-4 md:py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Input
                type="text"
                placeholder="Ask about air quality..."
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={askMutation.isPending}
                className="h-12 md:h-14 rounded-2xl border-slate-200 bg-slate-50/50 focus-visible:ring-primary px-4 pr-12 text-base shadow-sm focus:bg-white transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:block">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-white border-slate-200 px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">↵</span> Enter
                </kbd>
              </div>
            </div>
            <Button
              onClick={() => sendMessage(inputValue)}
              disabled={askMutation.isPending || inputValue.trim().length === 0}
              size="icon"
              className="h-12 w-12 md:h-14 md:w-14 rounded-2xl transition-all active:scale-95 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90"
            >
              {askMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <div className="flex -space-x-1">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium opacity-60 flex items-center gap-1">
              AI-generated advice • Professional consultation recommended
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default ChatSection
