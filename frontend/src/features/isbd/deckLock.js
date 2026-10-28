import { createContext } from 'react'
import { ownerOf } from '../../shared/constants/fieldIndex'

const LOCKED_OWNERS = new Set(['gssm', 'derived'])

/** Which deck cells are shown but never edited; SlideRenderer narrows it to the open deal (monday fields lock once linked). */
export const DeckLockContext = createContext((fieldKey) => LOCKED_OWNERS.has(ownerOf(fieldKey)))
