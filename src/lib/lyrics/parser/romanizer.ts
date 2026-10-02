export type TransliterateFn = (text: string) => string | null

let customTransliterator: TransliterateFn | null = null

export function setCustomTransliterator(fn: TransliterateFn | null): void {
  customTransliterator = fn
}

export function needsRomanization(text: string): boolean {
  if (!text.trim()) return false
  const nonLatinScript = /[^\p{sc=Latin}\p{sc=Common}\p{sc=Inherited}\s\d\p{P}\p{S}]/u
  return nonLatinScript.test(text)
}

export function romanize(text: string): string | null {
  if (!text.trim() || !needsRomanization(text)) return null
  if (customTransliterator) {
    try {
      const res = customTransliterator(text)
      return res?.trim() && res.trim() !== text.trim() ? res.trim() : null
    } catch {
      return null
    }
  }
  return null
}
