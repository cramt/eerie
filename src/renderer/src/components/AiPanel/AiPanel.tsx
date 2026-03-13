import React, { useRef, useEffect, useState } from 'react'
import { useAiStore } from '../../store/aiStore'
import styles from './AiPanel.module.css'

export default function AiPanel() {
  const { messages, loading, apiKey, setApiKey, clearApiKey, sendMessage, clearMessages } =
    useAiStore()
  const [input, setInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [showKeyForm, setShowKeyForm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    await sendMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSaveKey = () => {
    const key = keyInput.trim()
    if (!key) return
    setApiKey(key)
    setKeyInput('')
    setShowKeyForm(false)
  }

  if (!apiKey || showKeyForm) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>AI Assistant</span>
          {apiKey && (
            <button className={styles.iconBtn} onClick={() => setShowKeyForm(false)} title="Cancel">
              ✕
            </button>
          )}
        </div>
        <div className={styles.setupContent}>
          <div className={styles.setupIcon}>✦</div>
          <p className={styles.setupTitle}>Claude API key required</p>
          <p className={styles.setupDesc}>
            Enter your Anthropic API key to enable AI-assisted circuit design.
            Get one at{' '}
            <span className={styles.setupLink}>console.anthropic.com</span>
            {' '}— uses the same account as your Claude Code subscription.
          </p>
          <input
            className={styles.keyInput}
            type="password"
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
            autoFocus
          />
          <button
            className={styles.saveKeyBtn}
            onClick={handleSaveKey}
            disabled={!keyInput.trim()}
          >
            Save key
          </button>
          <p className={styles.setupNote}>
            Key is stored only in your browser's localStorage.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>AI Assistant</span>
        <div className={styles.headerActions}>
          {messages.length > 0 && (
            <button
              className={styles.iconBtn}
              onClick={clearMessages}
              title="Clear conversation"
            >
              ↺
            </button>
          )}
          <button
            className={styles.iconBtn}
            onClick={() => setShowKeyForm(true)}
            title="Change API key"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>✦</div>
            <p>Ask me to help design, analyze, or modify your circuit.</p>
            <div className={styles.suggestions}>
              {[
                'Explain this circuit',
                'What is the voltage at VMID?',
                'Change R1 to 4.7kΩ',
                'Add a 100nF bypass capacitor',
              ].map(s => (
                <button
                  key={s}
                  className={styles.suggestion}
                  onClick={() => {
                    setInput(s)
                    inputRef.current?.focus()
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`${styles.message} ${styles[msg.role]}`}
          >
            <div className={styles.messageRole}>
              {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'Claude'}
            </div>
            <div className={styles.messageContent}>{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className={`${styles.message} ${styles.assistant}`}>
            <div className={styles.messageRole}>Claude</div>
            <div className={styles.thinking}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this circuit... (Enter to send)"
          rows={3}
          disabled={loading}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || loading}
          title="Send (Enter)"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
