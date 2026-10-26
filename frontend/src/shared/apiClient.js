import { API_URL } from './constants'

export function buildUrl(path, baseUrl) {
  if (/^https?:\/\//i.test(path)) return path
  const root = (baseUrl || API_URL || '').replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${root}${normalizedPath}`
}

export async function apiRequest(path, options = {}, baseUrl) {
  const url = buildUrl(path, baseUrl)
  const response = await fetch(url, options)

  if (!response.ok) {
    let errorMsg = `Request failed (${response.status})`
    try {
      const body = await response.json()
      errorMsg = body.error || body.message || errorMsg
    } catch {
      const text = await response.text().catch(() => '')
      if (text) errorMsg = text
    }
    throw new Error(errorMsg)
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export function get(path, baseUrl) {
  return apiRequest(path, { method: 'GET' }, baseUrl)
}

export function post(path, body, baseUrl) {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, baseUrl)
}

export function put(path, body, baseUrl) {
  return apiRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, baseUrl)
}

export function del(path, baseUrl) {
  return apiRequest(path, { method: 'DELETE' }, baseUrl)
}

/**
 * Post a FormData body (multipart/form-data) — used for file uploads.
 * Do NOT set Content-Type; the browser adds the boundary automatically.
 */
export function postFormData(path, formData, baseUrl) {
  return apiRequest(path, {
    method: 'POST',
    body: formData,
  }, baseUrl)
}
