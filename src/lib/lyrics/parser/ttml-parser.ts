import type { LyricsLine, LyricsWord } from '@/lib/lyrics/domain/types'

import { DOMParser } from '@xmldom/xmldom'

import { resolveSingersAndAgents } from './singer-tracker'

type ContainerMode = 'par' | 'seq'
type TrackRole = 'background' | 'translation' | 'romanization' | null

interface TimingParameters {
  effectiveFrameRate: number
  subFrameRate: number
  tickRate: number
}

interface TimingContext {
  startMs: number
  endMs: number | null
  mode: ContainerMode
  cursorMs: number
  hasTimedAncestor: boolean
}

interface ElementTiming {
  startMs: number
  endMs: number | null
  ownEndMs: number | null
  hasTiming: boolean
  hasOwnTiming: boolean
}

interface TtmlTrack {
  text: string
  words: LyricsWord[]
  pendingPrefix: string
}

interface TtmlContent {
  main: TtmlTrack
  background: TtmlTrack
  translations: Array<{ language: string; text: string }>
  romanization: string | null
  agent: string | null
}

interface TtmlExtra {
  startMs: number | null
  role: 'translation' | 'romanization'
  language: string
  text: string
}

const TIME_CONTAINER_NAMES = new Set(['tt', 'body', 'div', 'p', 'span', 'region'])
const XML_TEXT_MIME = 'application/xml'

function elementName(element: Element): string {
  return (element.localName || element.tagName.split(':').at(-1) || '').toLowerCase()
}

function childElements(element: Element): Element[] {
  const children: Element[] = []
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 1) children.push(node as Element)
  }
  return children
}

function attribute(element: Element, name: string): string | null {
  const wanted = name.toLowerCase()
  for (const item of Array.from(element.attributes)) {
    const localName = (item.localName || item.name.split(':').at(-1) || '').toLowerCase()
    if (localName === wanted) return item.value
  }
  return null
}

function textContent(node: Node): string {
  if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? ''
  if (node.nodeType === 1 && elementName(node as Element) === 'br') return '\n'
  return Array.from(node.childNodes)
    .map((child) => textContent(child))
    .join('')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function positiveNumber(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readTimingParameters(root: Element): TimingParameters {
  const frameRate = positiveNumber(attribute(root, 'frameRate')) ?? 30
  const multiplierParts = attribute(root, 'frameRateMultiplier')?.trim().split(/\s+/u) ?? []
  const multiplier =
    multiplierParts.length === 2
      ? (Number(multiplierParts[0]) || 0) / (Number(multiplierParts[1]) || 0)
      : 1
  const effectiveFrameRate =
    Number.isFinite(multiplier) && multiplier > 0 ? frameRate * multiplier : frameRate
  const subFrameRate = positiveNumber(attribute(root, 'subFrameRate')) ?? 1
  const tickRate =
    positiveNumber(attribute(root, 'tickRate')) ??
    (attribute(root, 'frameRate') ? effectiveFrameRate * subFrameRate : 1)

  return { effectiveFrameRate, subFrameRate, tickRate }
}

function finiteMilliseconds(seconds: number): number | null {
  const milliseconds = seconds * 1000
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? Math.round(milliseconds) : null
}

function parseTimeExpression(raw: string | null, parameters: TimingParameters): number | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null

  const offset = /^((?:\d+(?:\.\d*)?|\.\d+))(ms|h|m|s|f|t)$/iu.exec(value)
  if (offset) {
    const count = Number(offset[1])
    if (!Number.isFinite(count) || count < 0) return null
    const unit = offset[2]?.toLowerCase()
    const seconds =
      unit === 'ms'
        ? count / 1000
        : unit === 'h'
          ? count * 3600
          : unit === 'm'
            ? count * 60
            : unit === 'f'
              ? count / parameters.effectiveFrameRate
              : unit === 't'
                ? count / parameters.tickRate
                : count
    return finiteMilliseconds(seconds)
  }

  const parts = value.split(':')
  if (parts.length === 4) {
    const hours = Number(parts[0])
    const minutes = Number(parts[1])
    const seconds = Number(parts[2])
    const [framesText, subFramesText] = (parts[3] ?? '').split('.')
    const frames = Number(framesText)
    const subFrames = subFramesText === undefined ? 0 : Number(subFramesText)
    if (
      [hours, minutes, seconds, frames, subFrames].some(
        (part) => !Number.isFinite(part) || part < 0,
      )
    ) {
      return null
    }
    const clockSeconds = hours * 3600 + minutes * 60 + seconds
    const frameSeconds =
      (frames + subFrames / parameters.subFrameRate) / parameters.effectiveFrameRate
    return finiteMilliseconds(clockSeconds + frameSeconds)
  }

  if (parts.length === 3) {
    const hours = Number(parts[0])
    const minutes = Number(parts[1])
    const seconds = Number(parts[2])
    if ([hours, minutes, seconds].some((part) => !Number.isFinite(part) || part < 0)) return null
    return finiteMilliseconds(hours * 3600 + minutes * 60 + seconds)
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0])
    const seconds = Number(parts[1])
    if ([minutes, seconds].some((part) => !Number.isFinite(part) || part < 0)) return null
    return finiteMilliseconds(minutes * 60 + seconds)
  }

  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? finiteMilliseconds(seconds) : null
}

function hasAppleAbsoluteTiming(root: Element): boolean {
  const usesAppleTiming = Array.from(root.attributes).some(
    (item) => item.localName?.toLowerCase() === 'timing' && item.value.trim(),
  )
  const declaresAppleNamespace = Array.from(root.attributes).some(
    (item) =>
      item.name.startsWith('xmlns:') && item.value === 'http://music.apple.com/lyric-ttml-internal',
  )
  return usesAppleTiming && declaresAppleNamespace
}

function resolveElementTimings(
  root: Element,
  parameters: TimingParameters,
  appleAbsoluteTiming: boolean,
): WeakMap<Element, ElementTiming> {
  const timings = new WeakMap<Element, ElementTiming>()

  function resolveChildren(element: Element, context: TimingContext): number | null {
    let cursorMs = context.cursorMs
    let latestEndMs: number | null = null

    for (const child of childElements(element)) {
      const childEndMs = resolveElement(child, { ...context, cursorMs })
      const childTiming = timings.get(child)
      if (childEndMs !== null) {
        latestEndMs = latestEndMs === null ? childEndMs : Math.max(latestEndMs, childEndMs)
      }
      if (context.mode === 'seq' && TIME_CONTAINER_NAMES.has(elementName(child))) {
        cursorMs = childEndMs ?? childTiming?.startMs ?? cursorMs
      }
    }

    return context.mode === 'seq' ? cursorMs : latestEndMs
  }

  function resolveElement(element: Element, parent: TimingContext): number | null {
    if (!TIME_CONTAINER_NAMES.has(elementName(element))) {
      return resolveChildren(element, parent)
    }

    const beginText = attribute(element, 'begin')
    const endText = attribute(element, 'end')
    const durationText = attribute(element, 'dur')
    const beginOffset = parseTimeExpression(beginText, parameters)
    const endOffset = parseTimeExpression(endText, parameters)
    const duration = parseTimeExpression(durationText, parameters)
    const baseMs = parent.mode === 'seq' ? parent.cursorMs : parent.startMs
    const hasOwnTiming = beginText !== null || endText !== null || durationText !== null
    const startMs =
      appleAbsoluteTiming && beginOffset !== null ? beginOffset : baseMs + (beginOffset ?? 0)
    const calculatedEnd =
      endOffset === null ? null : appleAbsoluteTiming ? endOffset : baseMs + endOffset
    const durationEnd = duration === null ? null : startMs + duration
    const unclippedOwnEndMs =
      calculatedEnd !== null && durationEnd !== null
        ? Math.min(calculatedEnd, durationEnd)
        : (calculatedEnd ?? durationEnd)
    const ownEndMs =
      parent.endMs === null || unclippedOwnEndMs === null
        ? unclippedOwnEndMs
        : Math.min(unclippedOwnEndMs, parent.endMs)
    const mode: ContainerMode =
      attribute(element, 'timeContainer')?.toLowerCase() === 'seq' ? 'seq' : 'par'
    const hasTiming = parent.hasTimedAncestor || hasOwnTiming
    const childEndMs = resolveChildren(element, {
      startMs,
      endMs: ownEndMs ?? parent.endMs,
      mode,
      cursorMs: startMs,
      hasTimedAncestor: hasTiming,
    })
    const naturalEndMs = ownEndMs ?? childEndMs ?? parent.endMs
    const endMs =
      parent.endMs === null || naturalEndMs === null
        ? naturalEndMs
        : Math.min(naturalEndMs, parent.endMs)

    timings.set(element, { startMs, endMs, ownEndMs, hasTiming, hasOwnTiming })
    return endMs
  }

  resolveElement(root, {
    startMs: 0,
    endMs: null,
    mode: 'par',
    cursorMs: 0,
    hasTimedAncestor: false,
  })

  return timings
}

function roleKind(role: string | null): TrackRole {
  const normalized = role?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'x-bg' || normalized === 'background' || normalized === 'x-background') {
    return 'background'
  }
  if (normalized === 'x-translation' || normalized === 'translation') return 'translation'
  if (
    normalized === 'x-roman' ||
    normalized === 'x-romanization' ||
    normalized === 'romanization' ||
    normalized === 'transliteration'
  ) {
    return 'romanization'
  }
  return null
}

function hasTimedSpanDescendant(
  element: Element,
  timings: WeakMap<Element, ElementTiming>,
): boolean {
  for (const child of childElements(element)) {
    const role = roleKind(attribute(child, 'role'))
    if (role === 'translation' || role === 'romanization') continue
    if (elementName(child) === 'span' && timings.get(child)?.hasOwnTiming) return true
    if (hasTimedSpanDescendant(child, timings)) return true
  }
  return false
}

function normalizedAgentReference(value: string | null): string | null {
  const reference = value?.trim().split(/\s+/u)[0]?.replace(/^#/u, '')
  return reference || null
}

function findInheritedAgent(element: Element): string | null {
  let current: Element | null = element
  while (current) {
    const agent = normalizedAgentReference(attribute(current, 'agent'))
    if (agent) return agent
    current = current.parentElement
  }
  return null
}

function inheritedLanguage(element: Element): string {
  let current: Element | null = element
  while (current) {
    const language = attribute(current, 'lang')
    if (language?.trim()) return language.trim()
    current = current.parentElement
  }
  return 'en'
}

function collectTtmlContent(
  paragraph: Element,
  timings: WeakMap<Element, ElementTiming>,
  inheritedRole: TrackRole = null,
): TtmlContent {
  const content: TtmlContent = {
    main: { text: '', words: [], pendingPrefix: '' },
    background: { text: '', words: [], pendingPrefix: '' },
    translations: [],
    romanization: null,
    agent: null,
  }

  function appendText(track: TtmlTrack, value: string): void {
    if (!value) return
    if (value.trim() === '' && /[\r\n]/u.test(value)) return
    track.text += value
    if (value.trim() === '') {
      const normalizedSpace = value.replace(/\s+/gu, ' ')
      const lastWord = track.words.at(-1)
      if (lastWord) lastWord.text += normalizedSpace
      else track.pendingPrefix += normalizedSpace
    } else if (track.words.length === 0) {
      track.pendingPrefix += value
    }
  }

  function visit(element: Element, inheritedRole: TrackRole = null): void {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        const role = inheritedRole
        const track = role === 'background' ? content.background : content.main
        appendText(track, child.nodeValue ?? '')
        continue
      }
      if (child.nodeType !== 1) continue

      const childElement = child as Element
      const timing = timings.get(childElement)
      if (timing?.endMs !== null && timing?.endMs !== undefined && timing.endMs <= timing.startMs) {
        continue
      }
      const role = roleKind(attribute(childElement, 'role')) ?? inheritedRole
      if (elementName(childElement) === 'br') {
        appendText(role === 'background' ? content.background : content.main, ' ')
        continue
      }
      if (role === 'translation') {
        const text = normalizeWhitespace(textContent(childElement))
        if (text) content.translations.push({ language: inheritedLanguage(childElement), text })
        continue
      }
      if (role === 'romanization') {
        const text = normalizeWhitespace(textContent(childElement))
        if (text) content.romanization = text
        continue
      }

      const agent = normalizedAgentReference(attribute(childElement, 'agent'))
      if (agent && !content.agent) content.agent = agent

      if (
        elementName(childElement) === 'span' &&
        timing?.hasOwnTiming &&
        !hasTimedSpanDescendant(childElement, timings)
      ) {
        const text = textContent(childElement)
        const track = role === 'background' ? content.background : content.main
        if (text.trim()) {
          track.text += text
          const wordText = `${track.pendingPrefix}${text}`
          track.pendingPrefix = ''
          track.words.push({
            text: wordText,
            startMs: timing.startMs,
            ...(timing.ownEndMs !== null ? { endMs: timing.ownEndMs } : {}),
          })
        }
        continue
      }

      visit(childElement, role)
    }
  }

  visit(paragraph, inheritedRole)
  return content
}

function parseAgentNames(root: Element): Map<string, string> {
  const agents = new Map<string, string>()

  function visit(element: Element): void {
    if (elementName(element) === 'agent') {
      const id = normalizedAgentReference(attribute(element, 'id'))
      const nameElement = childElements(element).flatMap((child) => [
        ...(elementName(child) === 'name' ? [child] : []),
        ...allDescendants(child).filter((descendant) => elementName(descendant) === 'name'),
      ])[0]
      const name = normalizeWhitespace(
        attribute(element, 'name') ?? (nameElement ? textContent(nameElement) : ''),
      )
      if (id && name) agents.set(id, name)
    }
    for (const child of childElements(element)) visit(child)
  }

  visit(root)
  return agents
}

function allDescendants(element: Element): Element[] {
  const descendants: Element[] = []
  for (const child of childElements(element)) {
    descendants.push(child, ...allDescendants(child))
  }
  return descendants
}

function findParagraphs(root: Element): Element[] {
  return allDescendants(root).filter((element) => elementName(element) === 'p')
}

function attachExtra(lines: LyricsLine[], extra: TtmlExtra): LyricsLine[] {
  const matchingIndex =
    extra.startMs === null ? -1 : lines.findLastIndex((line) => line.startMs === extra.startMs)
  const targetIndex = matchingIndex >= 0 ? matchingIndex : lines.length - 1
  if (targetIndex < 0) return lines

  const target = lines[targetIndex]
  if (!target) return lines
  if (extra.role === 'romanization') {
    lines[targetIndex] = { ...target, romanization: extra.text }
  } else {
    const translations = (target.translations ?? []).filter(
      (translation) => translation.language !== extra.language,
    )
    lines[targetIndex] = {
      ...target,
      translations: [...translations, { language: extra.language, text: extra.text }],
    }
  }
  return lines
}

function parseHeadTracks(root: Element, linesByKey: Map<string, LyricsLine>): void {
  for (const container of allDescendants(root)) {
    const role = elementName(container)
    if (role !== 'translation' && role !== 'transliteration' && role !== 'romanization') continue

    const translation = role === 'translation'
    const language = inheritedLanguage(container)
    for (const textElement of allDescendants(container).filter(
      (child) => elementName(child) === 'text',
    )) {
      const key = normalizedAgentReference(attribute(textElement, 'for'))
      if (!key) continue
      const line = linesByKey.get(key)
      const text = normalizeWhitespace(textContent(textElement))
      if (!line || !text) continue

      if (translation) {
        const translations = (line.translations ?? []).filter((item) => item.language !== language)
        line.translations = [...translations, { language, text }]
      } else {
        line.romanization = text
      }
    }
  }
}

export function parseTtml(
  ttmlXml: string,
  options: { mainArtist?: string | null } = {},
): LyricsLine[] {
  const source = ttmlXml.trim().replace(/^\uFEFF/u, '')
  if (!source || /<!DOCTYPE\b/iu.test(source)) return []

  let root: Element | null
  try {
    const document = new DOMParser({
      onError(level, message) {
        if (level !== 'warning') throw new Error(message)
      },
    }).parseFromString(source, XML_TEXT_MIME)
    root = document.documentElement as unknown as Element
  } catch {
    return []
  }

  if (!root || elementName(root) !== 'tt') return []

  const parameters = readTimingParameters(root)
  const timings = resolveElementTimings(root, parameters, hasAppleAbsoluteTiming(root))
  const agentNames = parseAgentNames(root)
  const lines: LyricsLine[] = []
  const extras: TtmlExtra[] = []
  const lineKeys = new Map<string, LyricsLine>()

  for (const paragraph of findParagraphs(root)) {
    const role = roleKind(attribute(paragraph, 'role'))
    const timing = timings.get(paragraph)
    const content = collectTtmlContent(paragraph, timings, role)
    const words = content.main.words
    const backgroundWords = content.background.words
    const earliestWord = [...words, ...backgroundWords].reduce<number | null>(
      (earliest, word) => (earliest === null ? word.startMs : Math.min(earliest, word.startMs)),
      null,
    )
    const lineStart =
      timing?.hasTiming || words.length > 0 || backgroundWords.length > 0
        ? (timing?.startMs ?? earliestWord)
        : earliestWord
    const wordEnd = [...words, ...backgroundWords].reduce<number | null>(
      (latest, word) =>
        word.endMs === undefined
          ? latest
          : latest === null
            ? word.endMs
            : Math.max(latest, word.endMs),
      null,
    )
    const lineEnd = timing?.endMs ?? wordEnd ?? lineStart ?? 0
    const text = normalizeWhitespace(content.main.text)

    if (role === 'translation' || role === 'romanization') {
      const extraText = normalizeWhitespace(textContent(paragraph))
      if (extraText) {
        extras.push({
          startMs: timing?.hasOwnTiming ? timing.startMs : null,
          role,
          language: inheritedLanguage(paragraph),
          text: extraText,
        })
      }
      continue
    }

    if (
      lineStart === null ||
      (timing?.endMs !== null && timing?.endMs !== undefined && timing.endMs < lineStart) ||
      (!text && words.length === 0 && backgroundWords.length === 0)
    ) {
      continue
    }

    const inheritedAgent = findInheritedAgent(paragraph) ?? content.agent
    const key =
      normalizedAgentReference(attribute(paragraph, 'key')) ??
      normalizedAgentReference(attribute(paragraph, 'id'))
    const line: LyricsLine = {
      text,
      startMs: lineStart,
      endMs: lineEnd,
      ...(words.length > 0 ? { words } : {}),
      ...(backgroundWords.length > 0 ? { backgroundWords } : {}),
      ...(inheritedAgent ? { agent: inheritedAgent } : {}),
      ...(inheritedAgent && agentNames.has(inheritedAgent)
        ? { singer: agentNames.get(inheritedAgent) }
        : {}),
      ...(content.romanization ? { romanization: content.romanization } : {}),
      ...(content.translations.length > 0 ? { translations: content.translations } : {}),
    }
    lines.push(line)
    if (key) lineKeys.set(key, line)
  }

  parseHeadTracks(root, lineKeys)
  for (const extra of extras) attachExtra(lines, extra)

  const sourceAgents = lines.map((line) => line.agent)
  const resolved = resolveSingersAndAgents(lines, options.mainArtist)
  return resolved
    .map((line, index) => {
      const sourceAgent = sourceAgents[index]
      return sourceAgent ? { ...line, agent: sourceAgent } : line
    })
    .sort((left, right) => left.startMs - right.startMs)
}
