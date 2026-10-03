export const originalFetch = globalThis.fetch

type Route = {
  options?: {
    server?: {
      handlers?: unknown
    }
  }
}

export type RouteHandler = (input: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

export type AppleResponder = (url: URL) => Response | Promise<Response>

export function createAppleCatalogFetch() {
  const requests: URL[] = []
  let respondApple: AppleResponder = () => Response.json({ data: [] })
  let respondExternal: AppleResponder = () => new Response(null, { status: 404 })

  const fetcher: typeof fetch = (async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))

    if (url.href === 'https://music.apple.com/us/browse') {
      return new Response('<script src="/assets/index~mock.js"></script>')
    }

    if (url.href === 'https://music.apple.com/assets/index~mock.js') {
      return new Response('window.state={developerToken:token};const token = "mock-token";')
    }

    if (url.origin === 'https://amp-api.music.apple.com') {
      requests.push(url)
      return respondApple(url)
    }

    return respondExternal(url)
  }) as typeof fetch

  return {
    fetcher,
    requests,
    setResponders(apple: AppleResponder, external?: AppleResponder) {
      requests.length = 0
      respondApple = apple
      respondExternal = external ?? (() => new Response(null, { status: 404 }))
    },
  }
}

export function mockAppleCatalog(respond: AppleResponder, external?: AppleResponder): URL[] {
  const mock = createAppleCatalogFetch()
  mock.setResponders(respond, external)
  globalThis.fetch = mock.fetcher
  return mock.requests
}

export function routeHandler(route: unknown, method: string): RouteHandler {
  const handlers = (route as Route).options?.server?.handlers
  const handler =
    typeof handlers === 'object' && handlers !== null
      ? (handlers as Record<string, unknown>)[method]
      : undefined
  if (typeof handler !== 'function') throw new Error(`Route has no ${method} handler`)
  return handler as RouteHandler
}

export function restoreFetch(): void {
  globalThis.fetch = originalFetch
}
