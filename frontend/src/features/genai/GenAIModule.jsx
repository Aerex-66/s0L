import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { FIELD_INDEX, readPath } from '../../shared/constants/fieldIndex'
import { BobLogo } from '../../shared/ui/Icons'
import './GenAIModule.css'

const GENAI_TERMS = /\b(gen ?ai|generative ai|generative|watsonx|llms?|large language models?|copilots?|ai assistants?|ai agents?|agentic|consulting advantage)\b/i

/** Every text field on the record that mentions GenAI, with a short excerpt around the first mention. */
function mentionsOf(deal) {
  const found = []
  for (const [key, entry] of Object.entries(FIELD_INDEX)) {
    if (entry.owner === 'derived') continue
    const value = readPath(deal, key)
    if (typeof value !== 'string') continue
    const match = GENAI_TERMS.exec(value)
    if (!match) continue
    const start = Math.max(0, match.index - 70)
    const end = Math.min(value.length, match.index + match[0].length + 90)
    found.push({
      key,
      label: entry.label,
      before: (start > 0 ? '…' : '') + value.slice(start, match.index),
      term: match[0],
      after: value.slice(match.index + match[0].length, end) + (end < value.length ? '…' : ''),
    })
  }
  return found
}

/** GenAI in the deal: what the record already says about it, gathered in one place. */
export default function GenAIModule({ deal }) {
  const mentions = useMemo(() => mentionsOf(deal), [deal])
  const answer = readPath(deal, 'genai_included')

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h2 className="ws-page-title"><BobLogo size={22} className="module-logo--head" />GenAI</h2>
        <span className="ws-page-note">Generative AI in this deal&apos;s solution</span>
      </div>

      <div className="ws-split">
        <div className="ws-stack">
          <div className="ws-empty">
            <span className="ws-empty-icon" aria-hidden="true"><Sparkles size={22} strokeWidth={1.5} /></span>
            <h3 className="ws-empty-title">GenAI is new</h3>
            <p className="ws-empty-text">
              This is where the deal&apos;s generative AI work comes together. For now it gathers what the deal record
              already says about GenAI: the iSBD&apos;s answer, and every place the deal&apos;s own text mentions it.
            </p>
          </div>

          <section className="ws-panel" aria-labelledby="genai-mentions">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="genai-mentions">Where the deal mentions GenAI</h3>
              <span className="ws-panel-note">{mentions.length} field{mentions.length === 1 ? '' : 's'}</span>
            </div>
            {mentions.length ? (
              <ul className="genai-mentions">
                {mentions.map((m) => (
                  <li key={m.key}>
                    <span className="genai-mention-field">{m.label}</span>
                    <p className="genai-mention-text">{m.before}<mark>{m.term}</mark>{m.after}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-empty-text">Nothing on the record mentions GenAI, watsonx, LLMs or AI assistants yet.</p>
            )}
          </section>
        </div>

        <section className="ws-panel" aria-labelledby="genai-isbd">
          <div className="ws-panel-head">
            <h3 className="ws-panel-title" id="genai-isbd">In the iSBD</h3>
          </div>
          <ul className="ws-rows">
            <li className="ws-row">
              <span className="ws-row-label">GenAI in the solution</span>
              <span className={`ws-row-value${answer ? '' : ' is-empty'}`}>
                {answer || 'Not answered yet'}
                <span className="ws-row-sub">Answered in the iSBD</span>
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
