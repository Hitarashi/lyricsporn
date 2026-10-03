import { createFileRoute } from '@tanstack/react-router'

import { handleCatalogEntityGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/albums/$appleId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleCatalogEntityGet(request, 'album', params.appleId),
    },
  },
})
