import { createFileRoute } from '@tanstack/react-router'

import { handleTrackDetailGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/tracks/$appleId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleTrackDetailGet(request, params.appleId),
    },
  },
})
