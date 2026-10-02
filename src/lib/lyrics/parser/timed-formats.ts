import type { LyricsLine, LyricsWord } from '@/lib/lyrics/domain/types'

const KRC_WORD_REGEX = /<(\d+),(\d+),\d+>([^<]*)/g
const QRC_WORD_REGEX = /\((\d+),(\d+)\)/g
const YRC_WORD_REGEX = /\((\d+),(\d+),\d+\)([^(]*)/g

export function parseKrc(raw: string): LyricsLine[] {
  const lines: LyricsLine[] = []
  const rawLines = raw.split(/\r?\n/)

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('[')) continue

    const bracketEnd = trimmed.indexOf(']')
    if (bracketEnd === -1) continue

    const header = trimmed.slice(1, bracketEnd)
    const headerParts = header.split(',').map((s) => s.trim())
    if (headerParts.length < 2) continue

    const lineStart = Number.parseInt(headerParts[0] ?? '', 10)
    const lineDuration = Number.parseInt(headerParts[1] ?? '', 10)
    if (!Number.isFinite(lineStart) || lineStart < 0) continue

    const lineEnd =
      lineStart + (Number.isFinite(lineDuration) && lineDuration > 0 ? lineDuration : 0)
    const content = trimmed.slice(bracketEnd + 1)

    const words: LyricsWord[] = []
    let match: RegExpExecArray | null = null
    KRC_WORD_REGEX.lastIndex = 0

    while (true) {
      match = KRC_WORD_REGEX.exec(content)
      if (!match) break
      const offsetMs = Number.parseInt(match[1] ?? '', 10)
      const durationMs = Number.parseInt(match[2] ?? '', 10)
      const text = match[3] ?? ''
      if (Number.isFinite(offsetMs) && Number.isFinite(durationMs) && text.length > 0) {
        words.push({
          text,
          startMs: lineStart + offsetMs,
          endMs: lineStart + offsetMs + durationMs,
        })
      }
    }

    const lineText = words.length > 0 ? words.map((w) => w.text).join('') : content
    lines.push({
      text: lineText,
      startMs: lineStart,
      endMs: lineEnd,
      words: words.length > 0 ? words : undefined,
    })
  }

  return lines.sort((a, b) => a.startMs - b.startMs)
}

export function parseQrc(raw: string): LyricsLine[] {
  const lines: LyricsLine[] = []
  const rawLines = raw.split(/\r?\n/)

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('[')) continue

    const bracketEnd = trimmed.indexOf(']')
    if (bracketEnd === -1) continue

    const header = trimmed.slice(1, bracketEnd)
    const headerParts = header.split(',').map((s) => s.trim())
    if (headerParts.length < 2) continue

    const lineStart = Number.parseInt(headerParts[0] ?? '', 10)
    const lineDuration = Number.parseInt(headerParts[1] ?? '', 10)
    if (!Number.isFinite(lineStart) || lineStart < 0) continue

    const lineEnd =
      lineStart + (Number.isFinite(lineDuration) && lineDuration > 0 ? lineDuration : 0)
    const content = trimmed.slice(bracketEnd + 1)

    const words: LyricsWord[] = []
    let lastIdx = 0
    let match: RegExpExecArray | null = null
    QRC_WORD_REGEX.lastIndex = 0

    while (true) {
      match = QRC_WORD_REGEX.exec(content)
      if (!match) break
      const wordText = content.slice(lastIdx, match.index)
      const offsetMs = Number.parseInt(match[1] ?? '', 10)
      const durationMs = Number.parseInt(match[2] ?? '', 10)

      if (Number.isFinite(offsetMs) && Number.isFinite(durationMs) && wordText.length > 0) {
        words.push({
          text: wordText,
          startMs: offsetMs,
          endMs: offsetMs + durationMs,
        })
      }
      lastIdx = QRC_WORD_REGEX.lastIndex
    }

    const trailingText = content.slice(lastIdx)
    if (trailingText && words.length > 0) {
      const lastWordIndex = words.length - 1
      const lastWord = words[lastWordIndex]
      if (lastWord) {
        words[lastWordIndex] = { ...lastWord, text: `${lastWord.text}${trailingText}` }
      }
    }

    const lineText = words.length > 0 ? words.map((w) => w.text).join('') : content
    lines.push({
      text: lineText,
      startMs: lineStart,
      endMs: lineEnd,
      words: words.length > 0 ? words : undefined,
    })
  }

  return lines.sort((a, b) => a.startMs - b.startMs)
}

export function parseYrc(raw: string): LyricsLine[] {
  const lines: LyricsLine[] = []
  const rawLines = raw.split(/\r?\n/)

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('[')) continue

    const bracketEnd = trimmed.indexOf(']')
    if (bracketEnd === -1) continue

    const header = trimmed.slice(1, bracketEnd)
    const headerParts = header.split(',').map((s) => s.trim())
    if (headerParts.length < 2) continue

    const lineStart = Number.parseInt(headerParts[0] ?? '', 10)
    const lineDuration = Number.parseInt(headerParts[1] ?? '', 10)
    if (!Number.isFinite(lineStart) || lineStart < 0) continue

    const lineEnd =
      lineStart + (Number.isFinite(lineDuration) && lineDuration > 0 ? lineDuration : 0)
    const content = trimmed.slice(bracketEnd + 1)

    const words: LyricsWord[] = []
    let match: RegExpExecArray | null = null
    YRC_WORD_REGEX.lastIndex = 0

    while (true) {
      match = YRC_WORD_REGEX.exec(content)
      if (!match) break
      const offsetMs = Number.parseInt(match[1] ?? '', 10)
      const durationMs = Number.parseInt(match[2] ?? '', 10)
      const text = match[3] ?? ''

      if (Number.isFinite(offsetMs) && Number.isFinite(durationMs) && text.length > 0) {
        words.push({
          text,
          startMs: lineStart + offsetMs,
          endMs: lineStart + offsetMs + durationMs,
        })
      }
    }

    const lineText = words.length > 0 ? words.map((w) => w.text).join('') : content
    lines.push({
      text: lineText,
      startMs: lineStart,
      endMs: lineEnd,
      words: words.length > 0 ? words : undefined,
    })
  }

  return lines.sort((a, b) => a.startMs - b.startMs)
}

export function parseRichsync(richsyncJson: string): LyricsLine[] | null {
  try {
    const data: unknown = JSON.parse(richsyncJson)
    if (!Array.isArray(data)) return null

    const lines: LyricsLine[] = []

    for (const rawItem of data) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue
      const item = rawItem as Record<string, unknown>
      const startSeconds = item.ts === undefined ? 0 : item.ts
      const endSeconds = item.te === undefined ? 0 : item.te
      if (
        typeof startSeconds !== 'number' ||
        !Number.isFinite(startSeconds) ||
        startSeconds < 0 ||
        typeof endSeconds !== 'number' ||
        !Number.isFinite(endSeconds) ||
        endSeconds < 0
      ) {
        continue
      }

      const startMs = Math.round(startSeconds * 1000)
      const endMs = Math.round(endSeconds * 1000)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
      const rawWords = Array.isArray(item.l) ? item.l : []
      const timedWords = rawWords.flatMap((rawWord) => {
        if (!rawWord || typeof rawWord !== 'object' || Array.isArray(rawWord)) return []
        const word = rawWord as Record<string, unknown>
        const text = typeof word.c === 'string' ? word.c : ''
        const offset = word.o === undefined ? 0 : word.o
        if (
          !text ||
          typeof offset !== 'number' ||
          !Number.isFinite(offset) ||
          offset < 0 ||
          !Number.isFinite(startMs + offset * 1000)
        ) {
          return []
        }
        return [{ text, offsetMs: Math.round(offset * 1000) }]
      })
      if (timedWords.length === 0) continue

      const words: LyricsWord[] = timedWords.map((word, index) => ({
        text: word.text,
        startMs: startMs + word.offsetMs,
        endMs:
          timedWords[index + 1] !== undefined
            ? startMs + (timedWords[index + 1]?.offsetMs ?? 0)
            : endMs,
      }))
      const totalText = timedWords.map((word) => word.text).join('')

      lines.push({
        text: totalText,
        startMs,
        endMs,
        words: words.length > 0 ? words : undefined,
      })
    }

    return lines.sort((a, b) => a.startMs - b.startMs)
  } catch {
    return null
  }
}

interface MusixmatchSubtitleCue {
  text?: string
  time?: {
    total?: number | string
  }
}

export function parseSubtitles(
  raw: string,
  fallbackLrcParser?: (text: string) => LyricsLine[],
): LyricsLine[] | null {
  const lrc = fallbackLrcParser ? fallbackLrcParser(raw) : []
  if (lrc.some((it) => it.startMs > 0)) return lrc

  try {
    const cues: MusixmatchSubtitleCue[] = JSON.parse(raw)
    if (!Array.isArray(cues)) return null

    const lines: LyricsLine[] = []
    for (const cue of cues) {
      if (!cue || typeof cue !== 'object') continue
      const total = cue.time?.total
      const startMs =
        typeof total === 'number'
          ? Math.round(total * 1000)
          : typeof total === 'string'
            ? Math.round(Number.parseFloat(total) * 1000)
            : null
      const text = typeof cue.text === 'string' ? cue.text : null
      if (startMs !== null && Number.isFinite(startMs) && startMs >= 0 && text !== null) {
        lines.push({
          text,
          startMs,
          endMs: 0,
        })
      }
    }

    return lines.length > 0 ? lines.sort((a, b) => a.startMs - b.startMs) : null
  } catch {
    return null
  }
}
