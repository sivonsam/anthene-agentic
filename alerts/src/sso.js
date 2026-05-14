// SSO utility — token passing between apps via URL parameter
const TOKEN_KEY = 'anthene_token'
const USER_KEY = 'anthene_user'
const SSO_PARAM = 'sso_token'

export function initSSO() {
  const params = new URLSearchParams(window.location.search)
  const urlToken = params.get(SSO_PARAM)
  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken)
    params.delete(SSO_PARAM)
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash
    window.history.replaceState({}, '', newUrl)
    return urlToken
  }
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function isTokenValid(token) {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch { return false }
}

export function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return new Date(payload.exp * 1000)
  } catch { return null }
}

export function appendSSOToken(url, token) {
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${SSO_PARAM}=${encodeURIComponent(token)}`
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
