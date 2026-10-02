import { createFileRoute } from '@tanstack/react-router'

import { openApiDocument } from '@/lib/api/v1/openapi'

export const Route = createFileRoute('/api/openapi.json')({
  server: {
    handlers: {
      GET: async () =>
        Response.json(openApiDocument, {
          headers: {
            'Cache-Control': 'public, max-age=300',
          },
        }),
    },
  },
})
