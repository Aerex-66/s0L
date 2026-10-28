/**
 * A deal's description as a tile shows it: without the client's name when it repeats the
 * headline ("USAA RISE MSP" -> "RISE MSP"), split into parts at " - " / " | " separators.
 */
export function descriptionParts(description, client) {
  let text = String(description ?? '').trim().replace(/\s+/g, ' ')
  const name = String(client ?? '').trim().replace(/\s+/g, ' ')
  if (name && text.toLowerCase().startsWith(name.toLowerCase())) {
    const next = text.charAt(name.length)
    // Only a whole-word repeat: "Intel RR3" loses "Intel", "Intelligent Automation" keeps it.
    if (!next || /[\s:,|/–—-]/.test(next)) text = text.slice(name.length).replace(/^[\s:,|/–—-]+/, '')
  }
  return text.split(/\s+[-–—|]\s+/).map((part) => part.trim()).filter(Boolean)
}
