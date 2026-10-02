import type { LyricsLine } from '@/lib/lyrics/types'

import { describe, expect, it } from 'bun:test'

import { fromText, parseTextLines, parseTtml } from '@/lib/lyrics/parser/lyrics-parser'
import { needsRomanization } from '@/lib/lyrics/parser/romanizer'

describe('LyricsParser', () => {
  it('inserts instrumental break for intro greater than or equal to 5 seconds on line synced lyrics', () => {
    const raw = `
[00:06.00]First line of lyrics
[00:10.00]Second line of lyrics
`
    const parsed = fromText(raw, 30000)
    expect(parsed.lines.length).toBe(3)

    const intro = parsed.lines[0]
    expect(intro?.isInstrumental).toBe(true)
    expect(intro?.startMs).toBe(0)
    expect(intro?.endMs).toBe(6000)

    const firstVocal = parsed.lines[1]
    expect(firstVocal?.isInstrumental).toBeUndefined()
    expect(firstVocal?.text).toBe('First line of lyrics')
  })

  it('inserts instrumental break for gap greater than or equal to 5 seconds between lines', () => {
    const raw = `
[00:01.00]Line one
[00:03.00]Line two
[00:15.00]Line three after big guitar solo
`
    const parsed = fromText(raw, 30000)
    const instrumental = parsed.lines.find((l) => l.isInstrumental)
    expect(instrumental).toBeDefined()
    expect(instrumental?.startMs).toBe(6500)
    expect(instrumental?.endMs).toBe(15000)
  })

  it('word synced lyrics retain agent tags', () => {
    const lines: LyricsLine[] = [
      {
        text: 'Singer One',
        startMs: 6000,
        endMs: 10000,
        words: [
          { text: 'Singer', startMs: 6000, endMs: 7500 },
          { text: 'One', startMs: 7500, endMs: 10000 },
        ],
        agent: 'v1',
      },
      {
        text: 'Singer Two',
        startMs: 12000,
        endMs: 16000,
        words: [
          { text: 'Singer', startMs: 12000, endMs: 13500 },
          { text: 'Two', startMs: 13500, endMs: 16000 },
        ],
        agent: 'v2',
      },
    ]

    const parsed = fromText('', 20000, { structuredLines: lines })
    expect(parsed.syncLevel).toBe('word')

    const vocalLines = parsed.lines.filter((l) => !l.isInstrumental)
    expect(vocalLines.length).toBe(2)
    expect(vocalLines[0]?.agent).toBe('v1')
    expect(vocalLines[1]?.agent).toBe('v2')

    const firstLine = parsed.lines[0]
    expect(firstLine?.isInstrumental).toBe(true)
    expect(firstLine?.startMs).toBe(0)
    expect(firstLine?.endMs).toBe(6000)
  })

  it('Romanizer detects non-Latin scripts correctly', () => {
    expect(needsRomanization('আমি বাংলায় গান গাই')).toBe(true)
    expect(needsRomanization('नमस्ते दुनिया')).toBe(true)
    expect(needsRomanization('こんにちは')).toBe(true)
    expect(needsRomanization('東京')).toBe(true)
    expect(needsRomanization('안녕하세요')).toBe(true)
    expect(needsRomanization('Привет мир')).toBe(true)
    expect(needsRomanization('مرحبا بالعالم')).toBe(true)

    expect(needsRomanization('Hello World')).toBe(false)
    expect(needsRomanization('La vie en rose 123!')).toBe(false)
    expect(needsRomanization('')).toBe(false)
  })

  it('TTML parser extracts x-translation and x-roman roles from spans', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body>
    <div>
      <p begin="00:04.00" end="00:08.00">
        <span begin="00:04.00">আমার</span>
        <span begin="00:05.00">সোনার</span>
        <span begin="00:06.00">বাংলা</span>
        <span ttm:role="x-translation" xml:lang="en">My golden Bengal</span>
        <span ttm:role="x-roman">Amar shonar bangla</span>
      </p>
    </div>
  </body>
</tt>
`
    const lines = parseTtml(ttml)
    expect(lines.length).toBe(1)
    const line = lines[0]
    expect(line?.text).toBe('আমারসোনারবাংলা')
    expect(line?.romanization).toBe('Amar shonar bangla')
    expect(line?.translations?.[0]?.language).toBe('en')
    expect(line?.translations?.[0]?.text).toBe('My golden Bengal')
  })

  it('TTML parser extracts x-translation and x-roman roles from paragraphs', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body>
    <div>
      <p begin="00:01.00" end="00:04.00">こんにちは世界</p>
      <p begin="00:01.00" end="00:04.00" ttm:role="x-roman">Konnichiwa sekai</p>
      <p begin="00:01.00" end="00:04.00" ttm:role="x-translation" xml:lang="en">Hello world</p>
    </div>
  </body>
</tt>
`
    const lines = parseTtml(ttml)
    expect(lines.length).toBe(1)
    const line = lines[0]
    expect(line?.text).toBe('こんにちは世界')
    expect(line?.romanization).toBe('Konnichiwa sekai')
    expect(line?.translations?.[0]?.language).toBe('en')
    expect(line?.translations?.[0]?.text).toBe('Hello world')
  })

  it('LRC parser identifies standalone singer headers and assigns agents', () => {
    const lrc = `
[00:01.00][Sia]
[00:02.00]Party girls don't get hurt
[00:05.00][Sean Paul]
[00:06.00]Up with it girl
`
    const lines = parseTextLines(lrc, { mainArtist: 'Sia' })
    const vocalLines = lines.filter((l) => !l.text.startsWith('['))
    expect(vocalLines.length).toBe(2)

    expect(vocalLines[0]?.singer).toBe('Sia')
    expect(vocalLines[0]?.agent).toBe('v1')

    expect(vocalLines[1]?.singer).toBe('Sean Paul')
    expect(vocalLines[1]?.agent).toBe('v2')
  })

  it('LRC parser extracts inline singer prefixes and strips them from lyric text', () => {
    const lrc = `
[00:01.00]Sia: Party girls don't get hurt
[00:05.00]Sean Paul: Up with it girl
`
    const lines = parseTextLines(lrc, { mainArtist: 'Sia' })
    expect(lines.length).toBe(2)

    expect(lines[0]?.text).toBe("Party girls don't get hurt")
    expect(lines[0]?.singer).toBe('Sia')
    expect(lines[0]?.agent).toBe('v1')

    expect(lines[1]?.text).toBe('Up with it girl')
    expect(lines[1]?.singer).toBe('Sean Paul')
    expect(lines[1]?.agent).toBe('v2')
  })

  it('plain lyrics parser extracts singer headers and prefixes', () => {
    const plain = `
Sia:
I'm gonna swing from the chandelier

Sean Paul:
Blow them away!
`
    const lines = parseTextLines(plain, { mainArtist: 'Sia' })
    const active = lines.filter((l) => l.text.length > 0)
    expect(active.length).toBe(2)
    expect(active[0]?.singer).toBe('Sia')
    expect(active[0]?.agent).toBe('v1')
    expect(active[1]?.singer).toBe('Sean Paul')
    expect(active[1]?.agent).toBe('v2')
  })

  it('TTML parser extracts agent metadata and assigns singer names', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <head>
    <metadata>
      <ttm:agent xml:id="v1" type="person">
        <ttm:name type="full">Freddie Mercury</ttm:name>
      </ttm:agent>
      <ttm:agent xml:id="v2" type="person">
        <ttm:name type="full">David Bowie</ttm:name>
      </ttm:agent>
    </metadata>
  </head>
  <body>
    <div>
      <p begin="00:05.00" end="00:08.00" ttm:agent="v1">Pressure pushing down on me</p>
      <p begin="00:08.50" end="00:12.00" ttm:agent="v2">Pressing down on you</p>
    </div>
  </body>
</tt>
`
    const lines = parseTtml(ttml, { mainArtist: 'Freddie Mercury' })
    expect(lines.length).toBe(2)

    expect(lines[0]?.singer).toBe('Freddie Mercury')
    expect(lines[0]?.agent).toBe('v1')

    expect(lines[1]?.singer).toBe('David Bowie')
    expect(lines[1]?.agent).toBe('v2')
  })

  it('TTML parser preserves syllable and word whitespace correctly', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body>
    <div>
      <p begin="00:01.00" end="00:04.00">
        <span begin="00:01.00" end="00:01.50">Hello </span>
        <span begin="00:01.50" end="00:02.00">world!</span>
      </p>
    </div>
  </body>
</tt>
`
    const lines = parseTtml(ttml)
    expect(lines.length).toBe(1)
    expect(lines[0]?.text).toBe('Hello world!')
  })

  it('TTML parser attaches inline spaces outside spans to previous word', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:01.00" end="00:04.00"><span begin="00:01.00" end="00:01.50">Hello</span> <span begin="00:01.50" end="00:02.00">world</span></p>
    </div>
  </body>
</tt>
`
    const lines = parseTtml(ttml)
    expect(lines.length).toBe(1)
    expect(lines[0]?.text).toBe('Hello world')
    expect(lines[0]?.words?.[0]?.text).toBe('Hello ')
    expect(lines[0]?.words?.[1]?.text).toBe('world')
  })

  it('cheap thrills assigns lead singer to v1 and featured singer to v2 with featured artist string', () => {
    const lrc = `
[00:01.00][Sean Paul]
[00:02.00]Up with it girl
[00:05.00][Sia]
[00:06.00]Come on, come on, turn the radio on
`
    const lines = parseTextLines(lrc, { mainArtist: 'Sia feat. Sean Paul' })
    const seanLine = lines.find((l) => l.text.includes('Up with it'))
    const siaLine = lines.find((l) => l.text.includes('Come on'))

    expect(siaLine?.agent).toBe('v1')
    expect(seanLine?.agent).toBe('v2')
  })
})
