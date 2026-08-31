import { createContext } from 'react'

/** Lets transcript disclosures leave automatic output following before resizing. */
export const TranscriptInteractionContext = createContext<(() => void) | undefined>(undefined)
