import type { LyricsHttpPort } from '@/lib/lyrics/application/ports'
import type { LyricsLine, LyricsTranslation } from '@/lib/lyrics/domain/types'

import { formEncode } from './sources/encoding'

function parseTranslationResponse(rawJson: string): string | null {
  try {
    const jsonArray = JSON.parse(rawJson)
    if (!Array.isArray(jsonArray)) return null
    const sentences = jsonArray[0]
    if (!Array.isArray(sentences)) return null

    let result = ''
    for (const sentence of sentences) {
      if (Array.isArray(sentence) && typeof sentence[0] === 'string') {
        result += sentence[0]
      }
    }
    return result.trim() || null
  } catch {
    return null
  }
}

export async function translateText(
  text: string,
  targetLanguage: string,
  http: LyricsHttpPort,
): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  const encoded = formEncode(trimmed)
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=${formEncode(targetLanguage)}&q=${encoded}`

  const response = await http.get(url)
  if (!response) return null

  return parseTranslationResponse(response)
}

export async function translateLyricsLines(
  lines: LyricsLine[],
  targetLanguage: string = 'en',
  http: LyricsHttpPort,
): Promise<LyricsLine[]> {
  const nonInstrumental = lines.filter((l) => !l.isInstrumental && l.text.trim().length > 0)
  if (nonInstrumental.length === 0) return lines

  const joinedText = nonInstrumental.map((l) => l.text.trim()).join('\n')
  const translatedJoined = await translateText(joinedText, targetLanguage, http)
  const parsedLines = translatedJoined?.split(/\r?\n/).map((s) => s.trim())

  const translationsMap = new Map<string, string>()

  if (parsedLines && parsedLines.length === nonInstrumental.length) {
    for (let i = 0; i < nonInstrumental.length; i++) {
      const original = nonInstrumental[i]?.text.trim()
      const tr = parsedLines[i] ?? ''
      if (original) {
        translationsMap.set(original, tr)
      }
    }
  } else {
    const promises = nonInstrumental.map(async (line) => {
      const original = line.text.trim()
      const tr = await translateText(original, targetLanguage, http)
      return { original, tr: tr ?? '' }
    })
    const results = await Promise.all(promises)
    for (const { original, tr } of results) {
      translationsMap.set(original, tr)
    }
  }

  return lines.map((line) => {
    if (line.isInstrumental) return line
    const original = line.text.trim()
    const translation = translationsMap.get(original)
    if (!translation) return line

    const existing = line.translations ?? []
    const updatedTranslations: LyricsTranslation[] = [
      ...existing.filter((t) => t.language !== targetLanguage),
      { language: targetLanguage, text: translation },
    ]

    return {
      ...line,
      translations: updatedTranslations,
    }
  })
}
