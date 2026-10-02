import type { LyricsFormat, LyricsLine, LyricsSyncLevel, LyricsWord } from '../types'

import { formatTime, parseLrcTime, parseTtmlTime } from '@/lib/lyrics/utils/time'
import {
  findAgentAttribute,
  getAttribute,
  getTextContent,
  parseXml,
  type XmlElement,
} from '@/lib/lyrics/utils/xml'

import { needsRomanization, romanize } from './romanizer'
import {
  matchInlineSingerPrefix,
  parseStandaloneSingerHeader,
  resolveSingersAndAgents,
  SingerTracker,
  stripTags,
} from './singer-tracker'
import { asEnhancedLrc } from './timed-formats'

function findLastMatchingIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const item = arr[i]
    if (item !== undefined && predicate(item)) return i
  }
  return -1
}

export interface ParsedLyrics {
  format: LyricsFormat
  syncLevel: LyricsSyncLevel
  plainText: string
  lines: LyricsLine[]
}

export function inferWordEnds(words: LyricsWord[], lineEndMs: number): LyricsWord[] {
  if (words.length === 0) return words
  return words.map((word, index) => {
    const nextStart = words[index + 1]?.startMs
    const inferred = nextStart ?? lineEndMs
    const end =
      word.endMs !== undefined && word.endMs > word.startMs
        ? word.endMs
        : Math.max(inferred, word.startMs + 1)
    return {
      ...word,
      endMs: end,
    }
  })
}

export function withLineEnds(lines: LyricsLine[], durationMs: number = 0): LyricsLine[] {
  const sorted = [...lines].sort((a, b) => a.startMs - b.startMs)
  const defaultLineDuration = 3500

  return sorted.map((line, index) => {
    const nextStart =
      sorted[index + 1]?.startMs !== undefined && (sorted[index + 1]?.startMs ?? 0) > line.startMs
        ? sorted[index + 1]?.startMs
        : null
    const allWords = [...(line.words ?? []), ...(line.backgroundWords ?? [])]
    const wordEnd = allWords.length > 0 ? Math.max(...allWords.map((w) => w.endMs ?? 0)) : null
    const gapToNext = nextStart !== null && nextStart !== undefined ? nextStart - line.startMs : 0

    const end =
      (line.endMs > line.startMs ? line.endMs : null) ??
      (wordEnd !== null && wordEnd > line.startMs ? wordEnd : null) ??
      (nextStart !== null && nextStart !== undefined && gapToNext >= defaultLineDuration + 5000
        ? line.startMs + defaultLineDuration
        : nextStart) ??
      (durationMs > line.startMs ? durationMs : line.startMs + 3000)

    const words = line.words ? inferWordEnds(line.words, end) : undefined
    const backgroundWords = line.backgroundWords
      ? inferWordEnds(line.backgroundWords, end)
      : undefined

    return {
      ...line,
      endMs: end,
      words,
      backgroundWords,
    }
  })
}

export function insertInstrumentalBreaks(
  lines: LyricsLine[],
  durationMs: number = 0,
): LyricsLine[] {
  if (lines.length === 0) return lines

  const result: LyricsLine[] = []
  const first = lines[0]
  if (first && !first.isInstrumental && first.startMs >= 5000) {
    result.push({
      text: '',
      startMs: 0,
      endMs: first.startMs,
      isInstrumental: true,
    })
  }

  for (const line of lines) {
    const previous = result.filter((l) => !l.isInstrumental).slice(-1)[0]
    if (previous && line.startMs - previous.endMs >= 5000) {
      result.push({
        text: '',
        startMs: previous.endMs,
        endMs: line.startMs,
        isInstrumental: true,
      })
    }
    result.push(line)
  }

  const last = result.filter((l) => !l.isInstrumental).slice(-1)[0]
  if (last && durationMs > last.endMs && durationMs - last.endMs >= 5000) {
    result.push({
      text: '',
      startMs: last.endMs,
      endMs: durationMs,
      isInstrumental: true,
    })
  }

  return result
}

export function parseTextLines(
  rawText: string,
  options: { mainArtist?: string | null } = {},
): LyricsLine[] {
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const parsedLines: LyricsLine[] = []
  const singerTracker = new SingerTracker()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const headerInfo = parseStandaloneSingerHeader(trimmed)
    if (headerInfo) {
      singerTracker.setSinger(headerInfo)
      continue
    }

    const timeTagRegex = /\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g
    const timestamps: number[] = []
    let match: RegExpExecArray | null = null

    while (true) {
      match = timeTagRegex.exec(trimmed)
      if (!match) break
      const rawTime = match[1]
      const parsedTime = rawTime ? parseLrcTime(rawTime) : null
      if (parsedTime !== null) {
        timestamps.push(parsedTime)
      }
    }

    const strippedText = trimmed.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()

    const bodyHeader = parseStandaloneSingerHeader(strippedText)
    if (bodyHeader) {
      singerTracker.setSinger(bodyHeader)
      continue
    }

    const inline = matchInlineSingerPrefix(strippedText)
    let lyricText = strippedText
    if (inline) {
      singerTracker.setSinger(inline.singer)
      lyricText = inline.remainingText
    }

    const wordTagRegex = /<(\d{1,2}:\d{2}(?:\.\d{1,3})?)>([^<]*)/g
    const words: LyricsWord[] = []
    let wordMatch: RegExpExecArray | null = null

    while (true) {
      wordMatch = wordTagRegex.exec(lyricText)
      if (!wordMatch) break
      const rawTime = wordMatch[1]
      const startMs = rawTime ? parseLrcTime(rawTime) : null
      const rawWord = stripTags(wordMatch[2] ?? '')
      const text = rawWord.endsWith(' ') ? `${rawWord.trim()} ` : rawWord.trim()
      if (startMs !== null && text.length > 0) {
        words.push({
          text,
          startMs,
        })
      }
    }

    const cleanLineText =
      words.length > 0 ? words.map((w) => w.text).join('') : stripTags(lyricText).trim()

    if (timestamps.length > 0) {
      for (const time of timestamps) {
        parsedLines.push({
          text: cleanLineText,
          startMs: time,
          endMs: 0,
          words: words.length > 0 ? words : undefined,
          singer: singerTracker.currentSinger ?? undefined,
          agent: singerTracker.currentAgent ?? undefined,
        })
      }
    } else if (cleanLineText.length > 0) {
      parsedLines.push({
        text: cleanLineText,
        startMs: 0,
        endMs: 0,
        singer: singerTracker.currentSinger ?? undefined,
        agent: singerTracker.currentAgent ?? undefined,
      })
    }
  }

  const withSingers = resolveSingersAndAgents(parsedLines, options.mainArtist)
  return withSingers.sort((a, b) => a.startMs - b.startMs)
}

interface TtmlContent {
  words: LyricsWord[]
  backgroundWords: LyricsWord[]
  translations: Array<{ language: string; text: string }>
  romanization: string | null
  agent: string | null
}

function getTtmlVisibleText(
  element: XmlElement,
  inheritedRole: string | null = null,
  includeBackground = false,
): string {
  const role = getAttribute(element, 'ttm:role') ?? inheritedRole
  if (
    role === 'x-translation' ||
    role === 'x-roman' ||
    (!includeBackground && (role === 'x-bg' || role === 'background'))
  ) {
    return ''
  }

  return element.children
    .map((child) =>
      typeof child === 'string' ? child : getTtmlVisibleText(child, role, includeBackground),
    )
    .join('')
}

function hasTimedTtmlDescendant(element: XmlElement): boolean {
  for (const child of element.children) {
    if (typeof child === 'string') continue
    const role = getAttribute(child, 'ttm:role')
    if (role === 'x-translation' || role === 'x-roman') continue
    if (child.localName === 'span' && getAttribute(child, 'begin')) return true
    if (hasTimedTtmlDescendant(child)) return true
  }
  return false
}

function collectTtmlContent(element: XmlElement, content: TtmlContent): void {
  function visit(node: XmlElement, inheritedRole: string | null = null): void {
    for (const child of node.children) {
      if (typeof child === 'string') {
        if (!child.includes('\n') && child.includes(' ')) {
          const role = inheritedRole
          const words =
            role === 'x-bg' || role === 'background' ? content.backgroundWords : content.words
          const lastWord = words[words.length - 1]
          if (lastWord && !lastWord.text.endsWith(' ')) {
            words[words.length - 1] = { ...lastWord, text: `${lastWord.text} ` }
          }
        }
        continue
      }

      const role = getAttribute(child, 'ttm:role') ?? inheritedRole
      if (role === 'x-translation') {
        const text = getTextContent(child).trim()
        if (text) {
          content.translations.push({
            language: getAttribute(child, 'xml:lang') ?? getAttribute(child, 'lang') ?? 'en',
            text,
          })
        }
        continue
      }
      if (role === 'x-roman') {
        const text = getTextContent(child).trim()
        if (text) content.romanization = text
        continue
      }

      const agent = findAgentAttribute(child)
      if (agent && !content.agent) content.agent = agent

      const beginAttr = child.localName === 'span' ? getAttribute(child, 'begin') : null
      if (beginAttr && !hasTimedTtmlDescendant(child)) {
        const startMs = parseTtmlTime(beginAttr)
        const text = getTtmlVisibleText(child, null, role === 'x-bg' || role === 'background')
        if (startMs !== null && text.trim()) {
          const endAttr = getAttribute(child, 'end')
          const durationAttr = getAttribute(child, 'dur')
          const explicitEnd = endAttr ? parseTtmlTime(endAttr) : null
          const duration = durationAttr ? parseTtmlTime(durationAttr) : null
          const word: LyricsWord = {
            text,
            startMs,
            endMs: explicitEnd ?? (duration !== null ? startMs + duration : undefined),
          }
          const words =
            role === 'x-bg' || role === 'background' ? content.backgroundWords : content.words
          words.push(word)
          continue
        }
      }

      visit(child, role)
    }
  }

  visit(element)
}

export function parseTtml(
  ttmlXml: string,
  options: { mainArtist?: string | null } = {},
): LyricsLine[] {
  const root = parseXml(ttmlXml)
  if (!root) return []

  const agentMap = new Map<string, string>()
  const singerTracker = new SingerTracker()

  function findMetadata(el: XmlElement) {
    if (el.localName === 'agent') {
      const id = getAttribute(el, 'xml:id') ?? getAttribute(el, 'id')
      const name = getAttribute(el, 'name') ?? getTextContent(el).trim()
      if (id && name) {
        agentMap.set(id, name)
        singerTracker.registerSinger(name, id)
      }
    }
    for (const child of el.children) {
      if (typeof child !== 'string') {
        findMetadata(child)
      }
    }
  }
  findMetadata(root)

  const paragraphs: XmlElement[] = []
  function findParagraphs(el: XmlElement) {
    if (el.localName === 'p') {
      paragraphs.push(el)
    } else {
      for (const child of el.children) {
        if (typeof child !== 'string') {
          findParagraphs(child)
        }
      }
    }
  }
  findParagraphs(root)

  const output: LyricsLine[] = []

  for (const p of paragraphs) {
    const beginAttr = getAttribute(p, 'begin')
    const endAttr = getAttribute(p, 'end')
    const durationAttr = getAttribute(p, 'dur')
    const role = getAttribute(p, 'ttm:role')
    const language = getAttribute(p, 'xml:lang') ?? getAttribute(p, 'lang') ?? 'en'
    const paragraphStart = beginAttr ? parseTtmlTime(beginAttr) : null
    const content: TtmlContent = {
      words: [],
      backgroundWords: [],
      translations: [],
      romanization: null,
      agent: null,
    }

    if (role !== 'x-translation' && role !== 'x-roman') {
      collectTtmlContent(p, content)
    }

    const lineStart =
      paragraphStart ??
      [...content.words, ...content.backgroundWords].reduce<number | null>(
        (earliest, word) => (earliest === null ? word.startMs : Math.min(earliest, word.startMs)),
        null,
      )
    const explicitEnd = endAttr ? parseTtmlTime(endAttr) : null
    const paragraphDuration = durationAttr ? parseTtmlTime(durationAttr) : null
    const wordEnd = [...content.words, ...content.backgroundWords].reduce<number | null>(
      (latest, word) =>
        word.endMs === undefined
          ? latest
          : latest === null
            ? word.endMs
            : Math.max(latest, word.endMs),
      null,
    )
    const lineEnd =
      explicitEnd ??
      (lineStart !== null && paragraphDuration !== null ? lineStart + paragraphDuration : null) ??
      wordEnd ??
      0
    const matchingIndex =
      lineStart === null ? -1 : findLastMatchingIndex(output, (line) => line.startMs === lineStart)
    const targetIndex = matchingIndex >= 0 ? matchingIndex : output.length - 1
    const target = targetIndex >= 0 ? output[targetIndex] : undefined

    if (role === 'x-roman') {
      const text = getTextContent(p).trim()
      if (target && text) output[targetIndex] = { ...target, romanization: text }
      continue
    }
    if (role === 'x-translation') {
      const text = getTextContent(p).trim()
      if (target && text) {
        const translations = (target.translations ?? []).filter(
          (item) => item.language !== language,
        )
        output[targetIndex] = {
          ...target,
          translations: [...translations, { language, text }],
        }
      }
      continue
    }

    const agentAttr = findAgentAttribute(p) ?? content.agent
    const singer = agentAttr ? (agentMap.get(agentAttr) ?? agentAttr) : undefined
    const agent =
      agentAttr ?? (singer ? (singerTracker.getAgentForSinger(singer) ?? undefined) : undefined)
    const text = getTtmlVisibleText(p).trim()
    const lineText =
      content.words.length > 0 ? content.words.map((word) => word.text).join('') : text

    if (
      lineStart !== null &&
      (lineText || content.words.length > 0 || content.backgroundWords.length > 0)
    ) {
      output.push({
        text: lineText,
        startMs: lineStart,
        endMs: lineEnd,
        words: content.words.length > 0 ? content.words : undefined,
        backgroundWords: content.backgroundWords.length > 0 ? content.backgroundWords : undefined,
        singer,
        agent,
        romanization: content.romanization ?? undefined,
        translations: content.translations.length > 0 ? content.translations : undefined,
      })
    }
  }

  const withSingers = resolveSingersAndAgents(output, options.mainArtist)
  return withSingers.sort((a, b) => a.startMs - b.startMs)
}

export function fromText(
  rawText: string,
  durationMs: number = 0,
  options: {
    ttmlRaw?: string
    structuredLines?: LyricsLine[]
    mainArtist?: string | null
  } = {},
): ParsedLyrics {
  let lines: LyricsLine[] = []
  const cleanedText = rawText.trim().replace(/^\uFEFF/, '')

  if (options.structuredLines && options.structuredLines.length > 0) {
    lines = resolveSingersAndAgents([...options.structuredLines], options.mainArtist)
  } else if (options.ttmlRaw) {
    const ttmlLines = parseTtml(options.ttmlRaw, { mainArtist: options.mainArtist })
    lines =
      ttmlLines.length > 0
        ? ttmlLines
        : parseTextLines(cleanedText, { mainArtist: options.mainArtist })
  } else if (cleanedText.startsWith('<tt') || cleanedText.startsWith('<?xml')) {
    lines = parseTtml(rawText, { mainArtist: options.mainArtist })
  } else {
    lines = parseTextLines(cleanedText, { mainArtist: options.mainArtist })
  }

  const hasWordTimings = lines.some(
    (line) => (line.words?.length ?? 0) > 0 || (line.backgroundWords?.length ?? 0) > 0,
  )
  const hasLineTimings = lines.some((l) => l.startMs > 0)

  let syncLevel: LyricsSyncLevel = 'plain'
  let format: LyricsFormat = 'plain'

  if (hasWordTimings) {
    syncLevel = 'word'
    format = 'elrc'
  } else if (hasLineTimings) {
    syncLevel = 'line'
    format = 'lrc'
  }

  let processedLines = lines
  if (syncLevel !== 'plain') {
    const withEnds = withLineEnds(lines, durationMs)
    processedLines = insertInstrumentalBreaks(withEnds, durationMs)
  }

  for (let i = 0; i < processedLines.length; i++) {
    const line = processedLines[i]
    if (line && !line.isInstrumental && !line.romanization && needsRomanization(line.text)) {
      const rom = romanize(line.text)
      if (rom && rom.toLowerCase() !== line.text.toLowerCase()) {
        processedLines[i] = {
          ...line,
          romanization: rom,
        }
      }
    }
  }

  const nonInstrumental = processedLines.filter((l) => !l.isInstrumental)
  const plainText = nonInstrumental
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join('\n')

  return {
    format,
    syncLevel,
    plainText,
    lines: processedLines,
  }
}

export function convertTtml(
  ttmlXml: string,
  elrc: boolean = false,
  mainArtist?: string | null,
  durationMs: number = 0,
): string | null {
  const parsed = fromText('', durationMs, { ttmlRaw: ttmlXml, mainArtist })
  const nonInstrumental = parsed.lines.filter((l) => !l.isInstrumental)
  if (nonInstrumental.length === 0) return null
  if (elrc && !nonInstrumental.some((line) => (line.words?.length ?? 0) > 0)) return null
  if (elrc) {
    return asEnhancedLrc(nonInstrumental)
  }
  return nonInstrumental.map((line) => `[${formatTime(line.startMs)}]${line.text}`).join('\n')
}
