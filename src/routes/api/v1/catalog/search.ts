import { createFileRoute } from '@tanstack/react-router'

import { handleCatalogSearchGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/catalog/search')({
  server: {
    handlers: {
      GET: async ({ request }) => handleCatalogSearchGet(request),
    },
  },
})
