export interface LyricsHttpOptions {
  timeoutMs?: number
  defaultHeaders?: Record<string, string>
  fetch?: typeof fetch
}

export interface LyricsHttpPort {
  get(url: string, headers?: Record<string, string>, signal?: AbortSignal): Promise<string | null>
  postJson(
    url: string,
    body: string,
    headers?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string | null>
}

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'LyricsPorn/1.0',
  Accept: '*/*',
}

export class LyricsHttp implements LyricsHttpPort {
  private timeoutMs: number
  private defaultHeaders: Record<string, string>
  private fetcher: typeof fetch

  constructor(options: LyricsHttpOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 12_000
    this.defaultHeaders = {
      ...DEFAULT_HEADERS,
      ...(options.defaultHeaders ?? {}),
    }
    this.fetcher = options.fetch ?? globalThis.fetch
  }

  async get(
    url: string,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<string | null> {
    const controller = new AbortController()
    const abortFromParent = () => controller.abort(signal?.reason)
    if (signal?.aborted) abortFromParent()
    else signal?.addEventListener('abort', abortFromParent, { once: true })
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers: {
          ...this.defaultHeaders,
          ...headers,
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        return null
      }

      return await response.text()
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromParent)
    }
  }

  async postJson(
    url: string,
    body: string,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<string | null> {
    const controller = new AbortController()
    const abortFromParent = () => controller.abort(signal?.reason)
    if (signal?.aborted) abortFromParent()
    else signal?.addEventListener('abort', abortFromParent, { once: true })
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetcher(url, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        signal: controller.signal,
      })

      if (!response.ok) {
        return null
      }

      return await response.text()
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromParent)
    }
  }
}
