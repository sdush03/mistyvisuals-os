'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  data?: any
  action?: any
  type?: string
}

const STORAGE_KEY = 'mistyai_chat_history'
const WELCOME_MSG: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm MistyAI 👋\nAsk me anything about your leads, or tell me to create one.",
  type: 'answer',
}
const genId = () => Math.random().toString(36).slice(2, 10)

function formatDealValue(val: any) {
  const num = Number(val || 0)
  if (!num) return null
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `₹${(num / 1000).toFixed(0)}k`
  return `₹${Math.round(num).toLocaleString('en-IN')}`
}

function LeadCard({ lead }: { lead: any }) {
  return (
    <a
      href={`/leads/${lead.id}`}
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition group"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white/90 truncate group-hover:text-white transition">
          {lead.name}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/50 flex-wrap">
          <span>{lead.status}</span>
          {lead.heat && <span className={lead.heat === 'Hot' ? 'text-red-400' : lead.heat === 'Warm' ? 'text-amber-400' : 'text-blue-400'}>● {lead.heat}</span>}
          {lead.event_date && <span>📅 {new Date(lead.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
          {lead.event_type && <span>· {lead.event_type}</span>}
          {lead.city && <span>· {lead.city}</span>}
        </div>
      </div>
      {lead.deal_value && (
        <span className="text-xs font-medium text-emerald-400 shrink-0">{formatDealValue(lead.deal_value)}</span>
      )}
    </a>
  )
}

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return [WELCOME_MSG]
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [WELCOME_MSG]
}

function saveMessages(messages: Message[]) {
  try {
    // Only save text content (not data/lead cards) to keep storage small
    const toSave = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      type: m.type,
    }))
    // Keep last 50 messages max
    const trimmed = toSave.slice(-50)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {}
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG])
  const [hydrated, setHydrated] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [pendingAction, setPendingAction] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<{ name: string, mimeType: string, base64: string } | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  // Load from localStorage on mount (client only)
  useEffect(() => {
    setMessages(loadMessages())
    setHydrated(true)
  }, [])

  // Save to localStorage whenever messages change
  useEffect(() => {
    if (hydrated) saveMessages(messages)
  }, [messages, hydrated])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open])

  const clearChat = useCallback(() => {
    setMessages([WELCOME_MSG])
    setPendingAction(null)
  }, [])

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 80) + 'px'
  }, [])

  useEffect(() => { resizeTextarea() }, [input, resizeTextarea])

  // Speech-to-text
  const toggleMic = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.interimResults = true
    recognition.continuous = true
    recognitionRef.current = recognition

    let finalTranscript = ''

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' '
        } else {
          interim = result[0].transcript
        }
      }
      // Show final + interim in the input
      setInput(finalTranscript + interim)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognition.start()
    setListening(true)
  }, [listening])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      setSelectedFile({
        name: file.name,
        mimeType: file.type,
        base64: event.target?.result as string
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() && !selectedFile) return

    const userMsg: Message = { id: genId(), role: 'user', content: text.trim() || `(Uploaded File: ${selectedFile?.name})` }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    const filePayload = selectedFile ? { data: selectedFile.base64, mimeType: selectedFile.mimeType } : undefined
    setSelectedFile(null)
    setLoading(true)

    try {
      const history = messages
        .filter(m => m.id !== 'welcome')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text.trim(),
          history,
          file: filePayload,
          pageContext: {
            url: window.location.pathname,
            title: document.title
          }
        }),
      })

      const data = await res.json()

      let content = data.message || data.error || 'Something went wrong'

      if (data.type === 'query_result' && data.data) {
        if (data.data.intent === 'count') {
          content = `${data.message}\n\n**Count: ${data.data.count}**`
        }
        if (data.data.error) {
          content += `\n\n⚠️ ${data.data.error}`
        }
      }

      if (data.type === 'confirm_action') {
        setPendingAction(data.action)
        // If the backend has provided a rich markdown confirmation, we just display it!
        content = data.message
      }

      const assistantMsg: Message = {
        id: genId(),
        role: 'assistant',
        content,
        data: data.data,
        action: data.action,
        type: data.type,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: genId(),
        role: 'assistant',
        content: 'Sorry, I couldn\'t connect. Please try again.',
        type: 'answer',
      }])
    } finally {
      setLoading(false)
    }
  }

  const confirmAction = async () => {
    if (!pendingAction) return
    setLoading(true)
    setPendingAction(null)

    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: pendingAction }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        id: genId(),
        role: 'assistant',
        content: data.message || (data.success ? '✅ Done!' : '❌ Failed'),
        type: 'action_result',
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: genId(),
        role: 'assistant',
        content: '❌ Failed to execute. Please try again.',
        type: 'answer',
      }])
    } finally {
      setLoading(false)
    }
  }

  const cancelAction = () => {
    setPendingAction(null)
    setMessages(prev => [...prev, {
      id: genId(),
      role: 'assistant',
      content: 'No problem, cancelled! What else can I help with?',
      type: 'answer',
    }])
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          open
            ? 'bg-neutral-800 hover:bg-neutral-700 rotate-0'
            : 'bg-gradient-to-br from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 shadow-violet-500/25'
        }`}
        aria-label={open ? 'Close AI chat' : 'Open AI chat'}
      >
        {open ? (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
        )}
      </button>

      {/* Chat panel */}
      <div
        className={`fixed bottom-24 right-6 z-[9998] w-[400px] max-w-[calc(100vw-48px)] transition-all duration-300 origin-bottom-right ${
          open ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl shadow-black/40 border border-white/10 overflow-hidden flex flex-col" style={{ height: 'min(520px, calc(100vh - 160px))' }}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/5 bg-gradient-to-r from-violet-900/40 to-indigo-900/40 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-violet-500/20">
                  ✦
                </div>
                <div>
                  <div className="text-sm font-semibold text-white/90">MistyAI</div>
                  <div className="text-[10px] text-white/40 font-medium">CRM Assistant</div>
                </div>
              </div>
              {messages.length > 1 && (
                <button
                  onClick={clearChat}
                  className="text-[11px] text-white/30 hover:text-white/60 transition px-2 py-1 rounded-lg hover:bg-white/5"
                  title="Clear chat"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-violet-600/80 text-white rounded-br-md'
                    : 'bg-white/8 text-white/85 border border-white/5 rounded-bl-md'
                }`}>
                  {msg.content.split('\n').map((line, i) => (
                    <span key={i}>
                      {line.startsWith('**') && line.endsWith('**')
                        ? <strong className="text-white/95">{line.replace(/\*\*/g, '')}</strong>
                        : line.startsWith('• ')
                          ? <span className="block ml-1 text-white/70">{line}</span>
                          : line
                      }
                      {i < msg.content.split('\n').length - 1 && <br />}
                    </span>
                  ))}

                  {/* Lead cards for query results */}
                  {msg.type === 'query_result' && msg.data?.leads?.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-white/5 pt-2">
                      {msg.data.leads.slice(0, 8).map((lead: any, idx: number) => (
                        <LeadCard key={lead.id + '-' + idx} lead={lead} />
                      ))}
                      {msg.data.leads.length > 8 && (
                        <div className="text-[11px] text-white/30 text-center pt-1">
                          + {msg.data.leads.length - 8} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/8 border border-white/5 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Confirm/Cancel buttons */}
            {pendingAction && !loading && (
              <div className="flex gap-2 justify-start pl-1">
                <button
                  onClick={confirmAction}
                  className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 transition shadow-sm"
                >
                  Yes, confirm
                </button>
                <button
                  onClick={cancelAction}
                  className="px-4 py-1.5 rounded-full bg-white/10 text-white/60 text-xs font-medium hover:bg-white/15 transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] flex flex-col">
            {selectedFile && (
              <div className="mb-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-violet-300">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                </div>
                <button type="button" onClick={() => setSelectedFile(null)} className="text-white/40 hover:text-white/80 p-1 bg-black/20 rounded-md">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                </button>
              </div>
            )}

            <form
              onSubmit={e => { e.preventDefault(); sendMessage(input) }}
              className="flex items-end gap-1.5"
            >
              <input type="file" ref={fileInputRef} className="hidden" accept="audio/*,image/*,application/pdf" onChange={handleFileChange} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-10 h-10 rounded-xl flex flex-col items-center justify-center transition shrink-0 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 mb-[1px]"
                title="Attach audio or image"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
              
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
                placeholder="Ask anything about your leads..."
                disabled={loading}
                rows={1}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition disabled:opacity-50 resize-none overflow-hidden leading-snug"
                style={{ minHeight: '40px', maxHeight: '80px' }}
              />
              <button
                type="button"
                onClick={toggleMic}
                disabled={loading}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition shrink-0 ${
                  listening
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                }`}
                title={listening ? 'Stop recording' : 'Speak'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" /></svg>
              </button>
              <button
                type="submit"
                disabled={loading || (!input.trim() && !selectedFile)}
                className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/20 text-white flex items-center justify-center transition shrink-0 mb-[1px]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </form>
            <div className="text-[10px] text-white/20 text-center mt-2">
              powered by Gemini · MistyAI
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
