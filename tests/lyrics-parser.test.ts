import type { LyricsLine } from '@/lib/lyrics/domain/types'

import { describe, expect, it } from 'bun:test'

import { parseLyrics } from '@/lib/lyrics/parser'

describe('LyricsParser', () => {
  it('inserts instrumental break for intro greater than or equal to 5 seconds on line synced lyrics', () => {
    const raw = `
[00:06.00]First line of lyrics
[00:10.00]Second line of lyrics
`
    const parsed = parseLyrics({ format: 'lrc', content: raw }, { durationMs: 30000 })
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
    const parsed = parseLyrics({ format: 'lrc', content: raw }, { durationMs: 30000 })
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

    const parsed = parseLyrics({ format: 'structured', lines }, { durationMs: 20000 })
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

  it('TTML parser extracts x-translation and x-roman roles from spans', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body>
    <div>
      <p begin="00:04.00" end="00:08.00">
        <span begin="0s">আমার</span>
        <span begin="1s">সোনার</span>
        <span begin="2s">বাংলা</span>
        <span ttm:role="x-translation" xml:lang="en">My golden Bengal</span>
        <span ttm:role="x-roman">Amar shonar bangla</span>
      </p>
    </div>
  </body>
</tt>
`
    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines
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
    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines
    expect(lines.length).toBe(1)
    const line = lines[0]
    expect(line?.text).toBe('こんにちは世界')
    expect(line?.romanization).toBe('Konnichiwa sekai')
    expect(line?.translations?.[0]?.language).toBe('en')
    expect(line?.translations?.[0]?.text).toBe('Hello world')
  })

  it('TTML parser resolves nested relative offsets through parallel containers', () => {
    const ttml = `
<media:tt xmlns:media="http://www.w3.org/ns/ttml" xmlns:metadata="http://www.w3.org/ns/ttml#metadata">
  <media:body begin="500ms">
    <media:div begin="0.5s">
      <media:p begin="1s" dur="2s">
        <media:span begin="250ms" dur="500ms">Hello </media:span>
        <media:span begin="1s" dur="500ms">world</media:span>
      </media:p>
    </media:div>
  </media:body>
</media:tt>
`

    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines

    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Hello world')
    expect(lines[0]?.startMs).toBe(2000)
    expect(lines[0]?.endMs).toBe(4000)
    expect(lines[0]?.words?.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }))).toEqual([
      { text: 'Hello ', startMs: 2250, endMs: 2750 },
      { text: 'world', startMs: 3000, endMs: 3500 },
    ])
  })

  it('TTML parser preserves paragraph breaks and paragraph-level background roles', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body>
    <p begin="1s">First<br />second</p>
    <p begin="3s" ttm:role="x-bg"><span begin="500ms" dur="500ms">Background</span></p>
  </body>
</tt>
`

    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines

    expect(lines).toHaveLength(2)
    expect(lines[0]?.text).toBe('First second')
    expect(lines[1]?.text).toBe('')
    expect(lines[1]?.backgroundWords).toEqual([{ text: 'Background', startMs: 3500, endMs: 4000 }])
  })

  it('parses TTML documents with namespace-prefixed roots', () => {
    const ttml = `
<media:tt xmlns:media="http://www.w3.org/ns/ttml">
  <media:body><media:p begin="1s">A namespace-prefixed lyric</media:p></media:body>
</media:tt>
`

    const parsed = parseLyrics({ format: 'ttml', content: ttml })

    expect(parsed.syncLevel).toBe('line')
    expect(parsed.lines[0]?.text).toBe('A namespace-prefixed lyric')
    expect(parsed.lines[0]?.startMs).toBe(1000)
  })

  it('TTML parser advances children in sequence containers', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml">
  <body begin="1s">
    <div timeContainer="seq">
      <p dur="2s">First line</p>
      <p dur="1s">Second line</p>
    </div>
  </body>
</tt>
`

    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines

    expect(lines.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }))).toEqual([
      { text: 'First line', startMs: 1000, endMs: 3000 },
      { text: 'Second line', startMs: 3000, endMs: 4000 },
    ])
  })

  it('TTML parser resolves frame and tick offsets from root timing parameters', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" frameRate="25" frameRateMultiplier="1000 1001" tickRate="50">
  <body>
    <p begin="1f" dur="2f"><span begin="0.5t" dur="1t">Frame timed word</span></p>
  </body>
</tt>
`

    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines

    expect(lines[0]?.startMs).toBe(40)
    expect(lines[0]?.endMs).toBe(120)
    expect(lines[0]?.words?.[0]).toEqual({ text: 'Frame timed word', startMs: 50, endMs: 70 })
  })

  it('TTML parser applies root timing bounds to nested timed spans', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml" begin="1s" dur="4s">
  <body begin="1s">
    <p begin="1s" dur="5s">
      <span begin="3s" dur="1s">Outside active root</span>
      <span begin="0.5s" dur="1s">Inside active root</span>
    </p>
  </body>
</tt>
`

    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines

    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Inside active root')
    expect(lines[0]?.startMs).toBe(3000)
    expect(lines[0]?.endMs).toBe(5000)
    expect(lines[0]?.words).toEqual([{ text: 'Inside active root', startMs: 3500, endMs: 4500 }])
  })

  it('TTML parser rejects malformed XML and document type declarations', () => {
    expect(
      parseLyrics({ format: 'ttml', content: '<tt><body><p begin="1s">unfinished' }).lines,
    ).toEqual([])
    expect(
      parseLyrics({
        format: 'ttml',
        content: '<!DOCTYPE tt [<!ENTITY lyrics "unsafe">]><tt><body /></tt>',
      }).lines,
    ).toEqual([])
  })

  it('LRC parser identifies standalone singer headers and assigns agents', () => {
    const lrc = `
[00:01.00][Sia]
[00:02.00]Party girls don't get hurt
[00:05.00][Sean Paul]
[00:06.00]Up with it girl
`
    const lines = parseLyrics({ format: 'lrc', content: lrc }, { mainArtist: 'Sia' }).lines
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
    const lines = parseLyrics({ format: 'lrc', content: lrc }, { mainArtist: 'Sia' }).lines
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
    const lines = parseLyrics({ format: 'plain', content: plain }, { mainArtist: 'Sia' }).lines
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
    const lines = parseLyrics(
      { format: 'ttml', content: ttml },
      { mainArtist: 'Freddie Mercury' },
    ).lines.filter((line) => !line.isInstrumental)
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
    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines
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
    const lines = parseLyrics({ format: 'ttml', content: ttml }).lines
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
    const lines = parseLyrics(
      { format: 'lrc', content: lrc },
      { mainArtist: 'Sia feat. Sean Paul' },
    ).lines
    const seanLine = lines.find((l) => l.text.includes('Up with it'))
    const siaLine = lines.find((l) => l.text.includes('Come on'))

    expect(siaLine?.agent).toBe('v1')
    expect(seanLine?.agent).toBe('v2')
  })
})
