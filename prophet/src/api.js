// API client — wraps fetch with auth token
import { API_BASE, DEV_MODE } from './config'

const DEV_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkZXYtdXNlci0xIiwibmFtZSI6IkRldiBVc2VyIiwiZW1haWwiOiJkZXZAYW50aGVuZS5haSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.'

async function authFetch(url, options = {}, getToken) {
  let token = DEV_MODE ? DEV_TOKEN : await getToken()
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return null
  return res.json().catch(() => null)
}

export function createApiClient(getToken) {
  const call = (url, opts) => authFetch(url, opts, getToken)
  return {
    // Tools
    getTools: () => call('/api/tools'),
    callTool: (toolId, params) => call(`/api/tools/call/${toolId}`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),

    // Agents
    listMyAgents: () => call('/api/agents'),
    listStoreAgents: () => call('/api/agents/store'),
    listAllAgents: () => call('/api/agents/admin/all'),
    getAgent: (id) => call(`/api/agents/${id}`),
    createAgent: (body) => call('/api/agents', { method: 'POST', body: JSON.stringify(body) }),
    updateAgent: (id, body) => call(`/api/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteAgent: (id) => call(`/api/agents/${id}`, { method: 'DELETE' }),
    copyAgent: (id) => call(`/api/agents/${id}/copy`, { method: 'POST' }),

    // User
    getMe: () => call('/api/users/me'),

    // Runs
    listRuns: () => call('/api/runs'),

    // SSE streaming run
    runAgentStream: (agentId, message, sessionId, aoiOverride, onToken, onToolStart, onToolEnd, onDone, onError, getTokenFn) => {
      const runStream = async () => {
        let token = DEV_MODE ? DEV_TOKEN : await getTokenFn()
        const res = await fetch(`${API_BASE}/api/run/${agentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message, session_id: sessionId, ...(aoiOverride ? { aoi_override: aoiOverride } : {}) }),
        })
        if (!res.ok) {
          onError?.(`HTTP ${res.status}`)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'token') onToken?.(evt.content)
              else if (evt.type === 'tool_start') onToolStart?.(evt.tool, evt.input)
              else if (evt.type === 'tool_end') onToolEnd?.(evt.tool, evt.output)
              else if (evt.type === 'done') onDone?.(evt.run_id)
              else if (evt.type === 'error') onError?.(evt.message)
            } catch {}
          }
        }
      }
      runStream()
    },
  }
}
