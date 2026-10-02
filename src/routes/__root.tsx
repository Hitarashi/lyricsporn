import type { QueryClient } from '@tanstack/react-query'

import { TanStackDevtools } from '@tanstack/react-devtools'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { ThemeProvider } from '@/components/theme-provider'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'

const pageTitle = 'Find Lyrics by ISRC or Apple Music | Lyricsporn'
const pageDescription =
  'Start a lyrics lookup with an ISRC, Apple Music track ID or link, or search by song title and artist. Add an album to refine your search.'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        title: pageTitle,
      },
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        name: 'description',
        content: pageDescription,
      },
      {
        property: 'og:title',
        content: pageTitle,
      },
      {
        property: 'og:description',
        content: pageDescription,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: 'Lyricsporn',
      },
      {
        name: 'twitter:card',
        content: 'summary',
      },
      {
        name: 'twitter:title',
        content: pageTitle,
      },
      {
        name: 'twitter:description',
        content: pageDescription,
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme='system' storageKey='theme'>
          {children}
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
