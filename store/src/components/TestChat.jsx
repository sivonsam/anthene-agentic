import React, { useState, useRef, useEffect } from 'react'

export default function TestChat({ agent, onRun }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [activeTools, setActiveTools] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setStreaming(true)

    let aiContent = ''
    setMessages(m => [...m, { role: 'assistant', content: '', streaming: true }])

    onRun(
      userMsg,
      // onToken
      (token) => {
        aiContent += token
        setMessages(m => m.map((msg, i) =>
          i === m.length - 1 ? { ...msg, content: aiContent } : msg
        ))
      },
      // onToolStart
      (tool, input) => {
        setActiveTools(t => [...t, { tool, status: 'running', input }])
      },
      // onToolEnd
      (tool) => {
        setActiveTools(t => t.map(a => a.tool === tool ? { ...a, status: 'done' } : a))
      },
      // onDone
      () => {
        setStreaming(false)
        setMessages(m => m.map((msg, i) =>
          i === m.length - 1 ? { ...msg, streaming: false } : msg
        ))
        setActiveTools([])
      },
      // onError
      (err) => {
        setStreaming(false)
        setMessages(m => [...m.filter(x => !x.streaming),
          { role: 'error', content: `Virhe: ${err}` }])
        setActiveTools([])
      },
    )
  }

  return (
    <div className="test-chat">
      <div className="test-chat-header">
        <span>🧪 Testaa: <strong>{agent?.name || 'Agentti'}</strong></span>
        {agent?.tools?.length > 0 && (
          <span className="tools-badge">{agent.tools.length} työkalua</span>
        )}
      </div>

      <div className="test-chat-messages">
        {messages.length === 0 && (
          <div className="test-chat-empty">Kirjoita viesti testataksesi agenttia…</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
            <span className="chat-role">{msg.role === 'user' ? '👤' : msg.role === 'error' ? '❌' : '🤖'}</span>
            <span className="chat-content">
              {msg.content}
              {msg.streaming && <span className="blink">▌</span>}
            </span>
          </div>
        ))}
        {activeTools.map((t, i) => (
          <div key={i} className="tool-indicator">
            {t.status === 'running' ? '⚙️' : '✅'} <code>{t.tool}</code>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="test-chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Kirjoita testikysymys…"
          disabled={streaming}
        />
        <button onClick={send} disabled={streaming || !input.trim()}>
          {streaming ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}
