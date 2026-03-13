import React, { useRef, useEffect, useState } from 'react'
import { useAiStore } from '../../store/aiStore'
import styles from './AiPanel.module.css'

const isNativeMode = import.meta.env.VITE_MODE === 'native'
const mcpUrl = isNativeMode ? `http://${location.host}/mcp` : null

export default function AiPanel() {
  const { messages, loading, daemonApiKey, hasKey, sendMessage, clearMessages, initDaemonKey } =
    useAiStore()

  // Try to get API key from daemon on first mount
  useEffect(() => {
    initDaemonKey()
  }, [])
  const [input, setInput] = useState('')
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

  if (!hasKey()) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>AI Assistant</span>
        </div>
        <div className={styles.setupContent}>
          <div className={styles.setupIcon}>✦</div>
          <p className={styles.setupTitle}>AI not available</p>
          <p className={styles.setupDesc}>
            AI Assistant requires native mode with <code>ANTHROPIC_API_KEY</code> set.
          </p>
          {mcpUrl && (
            <div className={styles.mcpBox}>
              <p className={styles.mcpTitle}>Connect via Claude Code CLI:</p>
              <code className={styles.mcpCmd}>
                claude mcp add eerie {mcpUrl}
              </code>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>AI Assistant</span>
        <div className={styles.headerActions}>
          {mcpUrl && (
            <span
              className={styles.mcpBadge}
              title={`MCP server: claude mcp add eerie ${mcpUrl}`}
            >
              MCP
            </span>
          )}
          {messages.length > 0 && (
            <button
              className={styles.iconBtn}
              onClick={clearMessages}
              title="Clear conversation"
            >
              ↺
            </button>
          )}
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
