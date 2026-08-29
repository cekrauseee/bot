import { useEffect, useState } from 'react'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import bash from 'shiki/langs/bash.mjs'
import diff from 'shiki/langs/diff.mjs'
import json from 'shiki/langs/json.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import darkTheme from 'shiki/themes/github-dark-high-contrast.mjs'
import lightTheme from 'shiki/themes/github-light-high-contrast.mjs'

export type AgentCodeLanguage =
  | 'bash'
  | 'diff'
  | 'json'
  | 'text'
  | 'tsx'
  | 'typescript'

export interface AgentCodeToken {
  content: string
  offset: number
  light?: string
  dark?: string
}

export type AgentCodeTokenLines = AgentCodeToken[][]

const LIGHT_THEME = 'github-light-high-contrast'
const DARK_THEME = 'github-dark-high-contrast'
let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null
const tokenCache = new Map<string, AgentCodeTokenLines>()

const highlighter = () => {
  highlighterPromise ??= createHighlighterCore({
    themes: [lightTheme, darkTheme],
    langs: [bash, diff, json, tsx, typescript],
    engine: createJavaScriptRegexEngine(),
  })
  return highlighterPromise
}

const cacheKey = (code: string, language: AgentCodeLanguage) =>
  `${language}\u0000${code}`

export function useAgentCodeTokens(code: string, language: AgentCodeLanguage) {
  const key = cacheKey(code, language)
  const cached = tokenCache.get(key)
  const [result, setResult] = useState<{
    key: string
    code: string
    language: AgentCodeLanguage
    lines: AgentCodeTokenLines
  } | null>(() => cached ? { key, code, language, lines: cached } : null)

  useEffect(() => {
    if (tokenCache.has(key)) return
    let cancelled = false
    void highlighter().then((instance) => {
      if (cancelled) return
      const lines = instance.codeToTokensWithThemes(code, {
        lang: language,
        themes: { light: LIGHT_THEME, dark: DARK_THEME },
      }).map((line) => line.map((token) => ({
        content: token.content,
        offset: token.offset,
        light: token.variants.light?.color,
        dark: token.variants.dark?.color,
      })))
      tokenCache.set(key, lines)
      setResult({ key, code, language, lines })
    })
    return () => {
      cancelled = true
    }
  }, [code, key, language])

  if (cached) return cached
  if (result?.key === key) return result.lines
  if (result?.language === language && code.startsWith(result.code)) return result.lines
  return null
}
