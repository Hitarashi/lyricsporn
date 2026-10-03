import { createFileRoute } from '@tanstack/react-router'

import { handleCatalogSearchHintsGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/catalog/search/hints')({
  server: {
    handlers: {
      GET: async ({ request }) => handleCatalogSearchHintsGet(request),
    },
  },
})
