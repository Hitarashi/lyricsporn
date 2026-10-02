import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/query')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        if (request.method !== 'QUERY') {
          return new Response(null, {
            status: 405,
            headers: { Allow: 'QUERY' },
          })
        }

        const contentType = request.headers
          .get('content-type')
          ?.split(';', 1)[0]
          .trim()
          .toLowerCase()

        if (contentType !== 'application/json') {
          return Response.json(
            { error: 'Content-Type must be application/json' },
            { status: 415, headers: { 'Accept-Query': '"application/json"' } },
          )
        }

        try {
          const body: unknown = await request.json()

          return Response.json(
            { ok: true, method: request.method, body },
            { headers: { 'Accept-Query': '"application/json"' } },
          )
        } catch {
          return Response.json(
            { error: 'Request body must be valid JSON' },
            { status: 400, headers: { 'Accept-Query': '"application/json"' } },
          )
        }
      },
    },
  },
})
