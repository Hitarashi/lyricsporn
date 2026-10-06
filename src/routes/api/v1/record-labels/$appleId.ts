import { createFileRoute } from '@tanstack/react-router'

import { handleRecordLabelEntityGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/record-labels/$appleId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleRecordLabelEntityGet(request, params.appleId),
    },
  },
})
