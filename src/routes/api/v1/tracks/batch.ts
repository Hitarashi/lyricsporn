import { createFileRoute } from '@tanstack/react-router'

import { handleTrackBatchPost } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/tracks/batch')({
  server: {
    handlers: {
      POST: async ({ request }) => handleTrackBatchPost(request),
    },
  },
})
