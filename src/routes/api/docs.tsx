import apiReferenceCss from '@scalar/api-reference-react/style.css?url'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type ApiReferenceComponent = typeof import('@scalar/api-reference-react').ApiReferenceReact

export const Route = createFileRoute('/api/docs')({
  head: () => ({
    meta: [
      { title: 'API Reference | Lyricsporn' },
      { name: 'description', content: 'OpenAPI reference for the Lyricsporn lyrics lookup API.' },
    ],
    links: [{ rel: 'stylesheet', href: apiReferenceCss }],
  }),
  component: ApiDocsPage,
})

function ApiDocsPage() {
  const [ApiReference, setApiReference] = useState<ApiReferenceComponent | null>(null)

  useEffect(() => {
    let mounted = true
    void import('@scalar/api-reference-react').then(({ ApiReferenceReact }) => {
      if (mounted) setApiReference(() => ApiReferenceReact)
    })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <main className='min-h-screen bg-background text-foreground'>
      {ApiReference ? (
        <ApiReference configuration={{ url: '/api/openapi.json' }} />
      ) : (
        <div className='p-8 text-sm text-muted-foreground'>Loading API reference…</div>
      )}
    </main>
  )
}
