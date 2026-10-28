import { SearchIcon } from '../../../shared/ui/Icons'

/** The underline search field over a deal list. */
export default function DealSearch({ value, onChange, placeholder = 'Filter...' }) {
  return (
    <div className="deals-search-float">
      <SearchIcon className="search-icon" />
      <input
        type="text"
        className="search-input-compact"
        placeholder={placeholder}
        aria-label="Search the deals"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" aria-label="Clear the search" onClick={() => onChange('')}>×</button>
      )}
    </div>
  )
}
