import { useEffect, useState } from "react";
import { createHighlighter, type Highlighter } from "shiki";

export type AgentCodeLanguage =
  | "bash"
  | "diff"
  | "json"
  | "text"
  | "tsx"
  | "typescript";

export type AgentCodeToken = {
  content: string;
  offset: number;
  light?: string;
  dark?: string;
};

type AgentCodeTokenLines = AgentCodeToken[][];

type TokenResult = {
  key: string;
  code: string;
  language: AgentCodeLanguage;
  lines: AgentCodeTokenLines;
};

const LIGHT_THEME = "github-light-high-contrast";
const DARK_THEME = "github-dark-high-contrast";
let highlighterPromise: Promise<Highlighter> | null = null;
const tokenCache = new Map<string, AgentCodeTokenLines>();

function getHighlighter() {
  highlighterPromise ??= createHighlighter({
    themes: [LIGHT_THEME, DARK_THEME],
    langs: ["bash", "diff", "json", "tsx", "typescript"],
  });
  return highlighterPromise;
}

function cacheKey(code: string, language: AgentCodeLanguage) {
  return `${language}\u0000${code}`;
}

export function useAgentCodeTokens(
  code: string,
  language: AgentCodeLanguage,
) {
  const key = cacheKey(code, language);
  const cached = tokenCache.get(key);
  const [result, setResult] = useState<TokenResult | null>(null);

  useEffect(() => {
    if (tokenCache.has(key)) return;

    let cancelled = false;
    void getHighlighter().then((highlighter) => {
      if (cancelled) return;
      const lines = highlighter
        .codeToTokensWithThemes(code, {
          lang: language,
          themes: { light: LIGHT_THEME, dark: DARK_THEME },
        })
        .map((line) =>
          line.map((token) => ({
            content: token.content,
            offset: token.offset,
            light: token.variants.light?.color,
            dark: token.variants.dark?.color,
          })),
        );
      tokenCache.set(key, lines);
      setResult({ key, code, language, lines });
    });

    return () => {
      cancelled = true;
    };
  }, [code, key, language]);

  if (cached) return cached;
  if (result?.key === key) return result.lines;
  if (result?.language === language && code.startsWith(result.code)) {
    return result.lines;
  }
  return null;
}
