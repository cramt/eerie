import React, { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import * as api from '../../api'
import './AiChat.css'

export default function AiChat() {
  const { chatMessages, chatSessionId, addChatMessage, setChatSessionId, setRail } = useUiStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    addChatMessage({ role: 'user', text })
    setLoading(true)
    try {
      const res = await api.aiChat(text, chatSessionId ?? undefined)
      addChatMessage({ role: 'assistant', text: res.text })
      setChatSessionId(res.session_id)
    } catch (err) {
      addChatMessage({ role: 'assistant', text: `Error: ${err}` })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-header">
        <span>AI Assistant</span>
        <button className="ai-chat-close" onClick={() => setRail('ai', 'hidden')} aria-label="Close" title="Close  ⌘4">×</button>
      </div>
      <div className="ai-chat-messages">
        {chatMessages.length === 0 && (
          <div className="ai-chat-empty">ask anything about your circuit</div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
            <span className="ai-chat-role">{msg.role === 'user' ? 'You' : 'Claude'}</span>
            <pre className="ai-chat-text">{msg.text}</pre>
          </div>
        ))}
        {loading && (
          <div className="ai-chat-msg ai-chat-msg--assistant">
            <span className="ai-chat-role">Claude</span>
            <span className="ai-chat-thinking">thinking…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="ai-chat-input-row">
        <textarea
          className="ai-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ask claude…  enter to send"
          rows={3}
          disabled={loading}
        />
        <button className="ai-chat-send" onClick={send} disabled={loading || !input.trim()}>
          send
        </button>
      </div>
    </div>
  )
}
