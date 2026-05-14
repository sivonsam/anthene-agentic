import React, { useEffect, useRef } from 'react'

// Shows notification messages, auto-dismisses after 3s
// Props: message, type ('success'|'error'), onDismiss
export default function Toast({ message, type = 'success', onDismiss }) {
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss?.(), 3000)
    return () => clearTimeout(timerRef.current)
  }, [message, onDismiss])

  return (
    <div className={`toast toast-${type}`} role="alert">
      <span className="toast-icon">{type === 'success' ? '✅' : '❌'}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onDismiss} aria-label="Sulje">✕</button>
    </div>
  )
}

// Container for multiple toasts
export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}
