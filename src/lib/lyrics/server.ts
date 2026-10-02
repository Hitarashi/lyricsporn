import type { DetailedLyricsResult, LyricsLookup, LyricsLookupOptions, LyricsResult } from './types'

import { createServerFn } from '@tanstack/react-start'

import { defaultLyricsRepository } from './repository'

export interface FetchLyricsInput {
  lookup: LyricsLookup
  options?: LyricsLookupOptions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string`)
  return value.trim() || undefined
}

function validateFetchLyricsInput(input: unknown): FetchLyricsInput {
  if (!isRecord(input) || !isRecord(input.lookup)) {
    throw new Error('lookup is required')
  }

  const lookupInput = input.lookup
  const title = optionalString(lookupInput, 'title')
  const artistString = optionalString(lookupInput, 'artistString')
  if (!title || !artistString) {
    throw new Error('title and artistString must be non-empty')
  }

  const durationValue = lookupInput.durationSeconds
  if (
    durationValue !== undefined &&
    (typeof durationValue !== 'number' || !Number.isFinite(durationValue) || durationValue < 0)
  ) {
    throw new Error('durationSeconds must be a non-negative finite number')
  }

  const lookup: LyricsLookup = {
    title,
    artistString,
    album: optionalString(lookupInput, 'album'),
    durationSeconds: durationValue as number | undefined,
    appleTrackId: optionalString(lookupInput, 'appleTrackId'),
    youtubeVideoId: optionalString(lookupInput, 'youtubeVideoId'),
  }

  let options: LyricsLookupOptions | undefined
  if (input.options !== undefined) {
    if (!isRecord(input.options)) throw new Error('options must be an object')
    const timeoutValue = input.options.timeoutMs
    if (
      timeoutValue !== undefined &&
      (typeof timeoutValue !== 'number' ||
        !Number.isFinite(timeoutValue) ||
        timeoutValue <= 0 ||
        timeoutValue > 30_000)
    ) {
      throw new Error('timeoutMs must be between 1 and 30000')
    }

    const bypassCache = input.options.bypassCache
    if (bypassCache !== undefined && typeof bypassCache !== 'boolean') {
      throw new Error('bypassCache must be a boolean')
    }

    const translateTo = optionalString(input.options, 'translateTo')
    if (translateTo && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(translateTo)) {
      throw new Error('translateTo must be a language tag')
    }

    options = {
      timeoutMs: timeoutValue as number | undefined,
      bypassCache: bypassCache as boolean | undefined,
      translateTo,
    }
  }

  return { lookup, options }
}

export const fetchLyricsServerFn = createServerFn({
  method: 'GET',
})
  .validator(validateFetchLyricsInput)
  .handler(async ({ data }): Promise<LyricsResult> => {
    return await defaultLyricsRepository.lookup(data.lookup, data.options)
  })

export const fetchDetailedLyricsServerFn = createServerFn({
  method: 'GET',
})
  .validator(validateFetchLyricsInput)
  .handler(async ({ data }): Promise<DetailedLyricsResult> => {
    return await defaultLyricsRepository.lookupDetailed(data.lookup, data.options)
  })
