import type { LyricsSource } from './types'

import { AmllTtmlDbSource } from './amll'
import { BetterLyricsSource } from './betterlyrics'
import { BinimumLyricsSource } from './binimum'
import { KugouLyricsSource } from './kugou'
import { LrclibLyricsSource } from './lrclib'
import { MusixmatchLyricsSource } from './musixmatch'
import { NetEaseLyricsSource } from './netease'
import { PaxsenixLyricsSource } from './paxsenix'
import { QqMusicLyricsSource } from './qq'
import { UnisonLyricsSource } from './unison'
import { YouTubeMusicLyricsSource } from './youtube'

export * from './amll'
export * from './betterlyrics'
export * from './binimum'
export * from './kugou'
export * from './lrclib'
export * from './musixmatch'
export * from './netease'
export * from './paxsenix'
export * from './qq'
export * from './types'
export * from './unison'
export * from './youtube'

export function createDefaultProviders(): LyricsSource[] {
  return [
    new PaxsenixLyricsSource(),
    new BetterLyricsSource(),
    new UnisonLyricsSource(),
    new BinimumLyricsSource(),
    new AmllTtmlDbSource(),
    new KugouLyricsSource(),
    new NetEaseLyricsSource(),
    new MusixmatchLyricsSource(),
    new QqMusicLyricsSource(),
    new YouTubeMusicLyricsSource(),
    new LrclibLyricsSource(),
  ]
}
