/** The web address a person typed, or null: only http(s) links are ever opened, never javascript: or file: ones. */
export function webLink(value) {
  const text = String(value ?? '').trim()
  if (!/^https?:\/\//i.test(text)) return null
  try {
    return new URL(text).href
  } catch {
    return null
  }
}
