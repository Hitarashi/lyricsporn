import { createFileRoute } from '@tanstack/react-router'

import { handleCatalogCollectionGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/playlists/$appleId/collections/$collection')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleCatalogCollectionGet(request, 'playlist', params.appleId, params.collection),
    },
  },
})
