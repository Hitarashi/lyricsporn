import type { LyricsLine, LyricsWord } from '../types'

export function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, '')
}

export function parseStandaloneSingerHeader(text: string): string | null {
  const trimmed = text.trim()
  const bracketMatch = /^[[(]([^\])]+)[\])]\s*:?$/u.exec(trimmed)
  if (bracketMatch) {
    return bracketMatch[1]?.trim() ?? null
  }
  const colonMatch = /^([^:]+)\s*[:：]$/u.exec(trimmed)
  if (colonMatch && !colonMatch[1]?.includes('http')) {
    return colonMatch[1]?.trim() ?? null
  }
  return null
}

export function matchInlineSingerPrefix(
  text: string,
): { singer: string; remainingText: string } | null {
  const colonMatch = /^([^:\n]{1,40})\s*[:：]\s*(.*)$/u.exec(text)
  if (colonMatch?.[1] && colonMatch[2] !== undefined) {
    const candidate = colonMatch[1].trim()
    if (
      !/^\d+$/.test(candidate) &&
      !candidate.startsWith('http') &&
      !candidate.includes('<') &&
      !candidate.includes('>') &&
      !candidate.includes('[') &&
      !candidate.includes(']')
    ) {
      return {
        singer: candidate,
        remainingText: colonMatch[2],
      }
    }
  }

  const bracketPrefixMatch = /^[[(]([^\])]+)[\])]\s*:?\s*(.*)$/u.exec(text)
  if (bracketPrefixMatch?.[1] && bracketPrefixMatch[2] !== undefined) {
    return {
      singer: bracketPrefixMatch[1].trim(),
      remainingText: bracketPrefixMatch[2],
    }
  }

  return null
}

export class SingerTracker {
  private singerToAgent = new Map<string, string>()
  private registeredSingers: string[] = []
  private currentSingerState: string | null = null
  private currentAgentState: string | null = null

  get currentSinger(): string | null {
    return this.currentSingerState
  }

  get currentAgent(): string | null {
    return this.currentAgentState
  }

  isDuetOrGroup(singer: string): boolean {
    const s = singer.toLowerCase()
    return (
      s.includes('&') ||
      s.includes('/') ||
      s.includes(' and ') ||
      s.includes(' feat') ||
      s.includes(' ft') ||
      s.includes(' with ') ||
      s.includes('both') ||
      s.includes('all') ||
      s.includes('together') ||
      s.includes('chorus') ||
      s.includes('duet') ||
      s.includes('合')
    )
  }

  registerSinger(singer: string, preferredAgent?: string): string {
    const trimmed = singer.trim()
    if (!trimmed) return 'v1'

    const existing = this.singerToAgent.get(trimmed.toLowerCase())
    if (existing) {
      if (preferredAgent && existing !== preferredAgent) {
        this.singerToAgent.set(trimmed.toLowerCase(), preferredAgent)
        return preferredAgent
      }
      return existing
    }

    let agent = preferredAgent
    if (!agent) {
      if (this.isDuetOrGroup(trimmed)) {
        agent = 'v3'
      } else {
        const soloSingers = this.registeredSingers.filter((s) => !this.isDuetOrGroup(s))
        if (soloSingers.length === 0) {
          agent = 'v1'
        } else if (soloSingers.length === 1) {
          agent = 'v2'
        } else {
          agent = `v${soloSingers.length + 1}`
        }
      }
    }

    this.singerToAgent.set(trimmed.toLowerCase(), agent)
    if (!this.registeredSingers.includes(trimmed.toLowerCase())) {
      this.registeredSingers.push(trimmed.toLowerCase())
    }
    return agent
  }

  getAgentForSinger(singer: string): string | null {
    const trimmed = singer.trim()
    if (!trimmed) return null
    if (this.isDuetOrGroup(trimmed)) {
      return 'v3'
    }
    return this.singerToAgent.get(trimmed.toLowerCase()) ?? null
  }

  setSinger(singer: string | null): void {
    if (!singer?.trim()) {
      this.currentSingerState = null
      this.currentAgentState = null
      return
    }

    const trimmed = singer.trim()
    this.currentSingerState = trimmed

    if (!this.singerToAgent.has(trimmed.toLowerCase())) {
      this.registerSinger(trimmed)
    }
    this.currentAgentState = this.singerToAgent.get(trimmed.toLowerCase()) ?? null
  }

  clear(): void {
    this.currentSingerState = null
    this.currentAgentState = null
  }
}

export function resolveSingersAndAgents(
  lines: LyricsLine[],
  mainArtist?: string | null,
): LyricsLine[] {
  const tracker = new SingerTracker()

  const observedSingers = new Set<string>()
  for (const line of lines) {
    if (line.singer) {
      observedSingers.add(line.singer.trim())
    }
    const header = parseStandaloneSingerHeader(line.text)
    if (header) {
      observedSingers.add(header)
    }
    const inline = matchInlineSingerPrefix(line.text)
    if (inline) {
      observedSingers.add(inline.singer)
    }
  }

  const soloSingers: string[] = []
  const groupSingers: string[] = []

  for (const singer of observedSingers) {
    if (tracker.isDuetOrGroup(singer.toLowerCase())) {
      groupSingers.push(singer)
    } else {
      soloSingers.push(singer)
    }
  }

  for (const grp of groupSingers) {
    tracker.registerSinger(grp, 'v3')
  }

  if (soloSingers.length > 0) {
    const mainLower = mainArtist?.toLowerCase().trim()
    const primaryMain = mainLower
      ? mainLower.split(/\s+(?:feat\.?|ft\.?|with|&)\s+/i)[0]?.trim()
      : null

    const leadSinger =
      (primaryMain
        ? soloSingers.find(
            (s) =>
              primaryMain === s.toLowerCase() ||
              primaryMain.includes(s.toLowerCase()) ||
              s.toLowerCase().includes(primaryMain),
          )
        : null) ??
      (mainLower
        ? soloSingers.find(
            (s) => mainLower.includes(s.toLowerCase()) || s.toLowerCase().includes(mainLower),
          )
        : null) ??
      (() => {
        const counts = new Map<string, number>()
        for (const line of lines) {
          const key = line.singer?.trim().toLowerCase()
          if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return (
          soloSingers.reduce((maxS, s) =>
            (counts.get(s.toLowerCase()) ?? 0) > (counts.get(maxS.toLowerCase()) ?? 0) ? s : maxS,
          ) ?? soloSingers[0]
        )
      })()

    if (leadSinger) {
      tracker.registerSinger(leadSinger, 'v1')
      const secondSinger = soloSingers.find((s) => s.toLowerCase() !== leadSinger.toLowerCase())
      if (secondSinger) {
        tracker.registerSinger(secondSinger, 'v2')
      }
    }

    for (const s of soloSingers) {
      tracker.registerSinger(s)
    }
  }

  let currentSoloSinger: string | null = null

  return lines.map((line) => {
    const cleanText = stripTags(line.text)
    const isStandaloneHeader = parseStandaloneSingerHeader(cleanText) != null

    if (isStandaloneHeader) {
      const detected = parseStandaloneSingerHeader(cleanText)
      if (detected) {
        tracker.setSinger(detected)
        if (!tracker.isDuetOrGroup(detected.toLowerCase())) {
          currentSoloSinger = detected
        }
      }
      return {
        ...line,
        text: cleanText,
        singer: tracker.currentSinger ?? line.singer,
        agent: tracker.currentAgent ?? line.agent,
      }
    }

    const inline = matchInlineSingerPrefix(cleanText)
    if (inline) {
      tracker.setSinger(inline.singer)
      if (!tracker.isDuetOrGroup(inline.singer.toLowerCase())) {
        currentSoloSinger = inline.singer
      }

      let words: LyricsWord[] | undefined = line.words
      if (words && words.length > 0) {
        const prefix = `${inline.singer}:`
        const prefixAlt = `${inline.singer}：`
        const prefixBracket = `[${inline.singer}]`
        const prefixParen = `(${inline.singer})`

        words = words.filter((w) => {
          const t = w.text.trim()
          return (
            t !== prefix &&
            t !== prefixAlt &&
            t !== inline.singer &&
            t !== prefixBracket &&
            t !== prefixParen
          )
        })

        const first = words[0]
        if (first && (first.text.startsWith(':') || first.text.startsWith('：'))) {
          words[0] = {
            ...first,
            text: first.text.replace(/^[:：]\s*/, ''),
          }
        }
      }

      const strippedText =
        words && words.length > 0 ? words.map((w) => w.text).join('') : inline.remainingText.trim()

      return {
        ...line,
        text: strippedText,
        words,
        singer: inline.singer,
        agent: tracker.getAgentForSinger(inline.singer) ?? undefined,
      }
    }

    if (line.singer) {
      tracker.setSinger(line.singer)
      if (!tracker.isDuetOrGroup(line.singer.toLowerCase())) {
        currentSoloSinger = line.singer
      }
      return {
        ...line,
        text: cleanText,
        singer: line.singer,
        agent: tracker.getAgentForSinger(line.singer) ?? undefined,
      }
    }

    if (tracker.currentSinger) {
      return {
        ...line,
        text: cleanText,
        singer: tracker.currentSinger,
        agent: tracker.currentAgent ?? undefined,
      }
    }

    if (currentSoloSinger) {
      return {
        ...line,
        text: cleanText,
        singer: currentSoloSinger,
        agent: tracker.getAgentForSinger(currentSoloSinger) ?? undefined,
      }
    }

    return {
      ...line,
      text: cleanText,
    }
  })
}
