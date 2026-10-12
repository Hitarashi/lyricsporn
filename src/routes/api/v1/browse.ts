import { createFileRoute } from '@tanstack/react-router'

import { handleEditorialGroupingGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/browse')({
  server: {
    handlers: {
      GET: async ({ request }) => handleEditorialGroupingGet(request),
    },
  },
})
