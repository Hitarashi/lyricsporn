# Lyricsporn API v1

The interactive reference is available at `/api/docs`. The OpenAPI 3.1 document is available at `/api/openapi.json`.
The API is public and does not require an API key.

Apple Music supplies catalog metadata, still artwork, and optional motion artwork. Lyrics requests use every provider configured in the lyrics repository. Asset responses contain Apple CDN image or video URLs; clients fetch the media bytes from Apple.

Track, artist, album, playlist, and artwork routes accept Apple Music catalog IDs. Free-text Apple catalog search is available through `/api/v1/catalog/search`. The API does not resolve ISRCs or Apple links. Track lyrics are requested through the track detail or queue routes.

## Apple Music catalog search

`GET /api/v1/catalog/search` proxies Apple's free-text catalog search and returns compact normalized results grouped by resource type. The default search type is songs; request `albums`, `artists`, `playlists`, `music-videos`, `stations`, `activities`, `curators`, `apple-curators`, or `record-labels` as needed. Apple ranks the text query; this route does not perform exact title or artist matching. Add `include=motionArtwork` to request motion video URLs on song and album results. The group's `next` URL preserves this option.

```text
GET /api/v1/catalog/search?term=Daft%20Punk%20Discovery&types=songs,albums,artists&storefront=us&limit=5&include=motionArtwork
```

Each result group contains `items` and, when Apple has another page, a proxied `next` URL. Follow that URL to page only the resource type that has more results. `limit` applies per type and ranges from 1 to 25. `artworkSize` controls square Apple CDN artwork URLs from 50 to 3000 pixels; the default is 300.

Use the autocomplete routes while the user types:

```text
GET /api/v1/catalog/search/hints?term=daft
GET /api/v1/catalog/search/suggestions?term=daft&kinds=terms,topResults&types=songs,albums
```

Hints return Apple’s suggested query strings. Suggestions can return query terms, compact top catalog results, or both. The default kinds are `terms,topResults`; `types` filters only the top results and defaults to `songs,albums,artists,playlists` when top results are requested. Suggestion limits range from 1 to 10. Add `include=motionArtwork` to request video URLs for song and album top results.

```json
{
  "term": "Daft Punk Discovery",
  "storefront": "us",
  "results": {
    "songs": {
      "items": [
        {
          "id": "...",
          "type": "song",
          "name": "One More Time",
          "artistName": "Daft Punk",
          "albumName": "Discovery",
          "durationMs": 320000,
          "artwork": { "url": "https://..." }
        }
      ],
          "next": "/api/v1/catalog/search?term=Daft+Punk+Discovery&storefront=us&types=songs&limit=5&offset=5&artworkSize=300&include=motionArtwork"
    }
  }
}
```

## Track detail

`GET /api/v1/tracks/{appleId}` returns normalized track metadata. The requested storefront is tried first; if Apple has no matching track there, the API tries `us`, `gb`, `ca`, `au`, `in`, and `jp`, skipping the storefront already tried. When `storefront` is omitted, `us` is the preferred storefront. The response's top-level `storefront` reports the catalog used. Fallback occurs only when Apple returns no resource; upstream errors are returned without trying another storefront. `include` defaults to `artwork`; add `motionArtwork`, `artists`, `album`, `lyrics`, or `appleCatalog` when a screen needs those sections. Track motion artwork falls back to its album when Apple does not return a song-level video. When requested, `motionArtwork` is `null` if no video is available. `appleCatalog` returns the raw Apple response for that request. Lyrics format defaults to `json`.

```sh
curl 'https://lyricsporn.netlify.app/api/v1/tracks/1082506273?include=artwork,motionArtwork,artists,album,lyrics&formats=json,ttml'
```

The `track` object contains the Apple song ID and type, title, artist, album, album artist, composer, genres, release date, track and disc numbers, duration, ISRC, audio traits, label, copyright, streamability, content rating, UPC, and Apple URL when Apple returns them. `artwork`, `motionArtwork`, linked `artists`, and `albumResource` are optional. Motion artwork includes a preferred `default` video plus square and portrait variants when available. `hasLyrics` reflects Apple’s catalog flag when present. Requested `lyrics` are resolved through the supported lyrics providers.

## Queue hydration

`POST /api/v1/tracks/batch` fetches up to 50 Apple song IDs for a playback queue. Apple metadata is requested in batches; missing items are retried in storefront batches across `us`, `gb`, `ca`, `au`, `in`, and `jp`. Duplicate queue entries and input order are preserved. Each matched track reports its resolved `storefront`. Core queue fields are always returned: title, artist, album, and duration when available. Artwork is included by default. `identifiers`, `release`, and `lyrics` add ISRC, release date, or lyrics.

```json
{
  "include": ["artwork", "identifiers"],
  "artworkSize": 300,
  "items": [
    { "appleId": "1082506273" },
    { "appleId": "1082506273", "include": ["artwork", "motionArtwork", "lyrics"], "lyrics": { "formats": ["json"] } }
  ]
}
```

Item `include`, `storefront`, `artworkSize`, and `lyrics.formats` override their request-wide defaults. Request motion artwork for the currently playing or expanded player item; keep it off for queue-only rows that use still thumbnails. A missing track or failed lookup is reported for that item without dropping the rest of the queue.

## Artist, album, and playlist catalog

Single-resource routes return one normalized entity. The default include is artwork; collections and extended fields are opt-in.

```text
GET /api/v1/artists/{appleId}?include=artwork,editorialNotes,topSongs,latestRelease
GET /api/v1/albums/{appleId}?include=artwork,motionArtwork,artistUrl,audioVariants,tracks,otherVersions
GET /api/v1/playlists/{appleId}?include=artwork,description,trackTypes,curator,tracks,featuredArtists,moreByCurator
```

Artist details include name, Apple URL, and genres, plus requested artwork/editorial notes and collections. Supported collections and views are `albums`, `genres`, `musicVideos`, `playlists`, `station`, `topSongs`, `latestRelease`, `featuredAlbums`, `featuredPlaylists`, `featuredMusicVideos`, `topMusicVideos`, `fullAlbums`, `singles`, `liveAlbums`, `appearsOnAlbums`, `compilationAlbums`, and `similarArtists`.

Album details include name, artist name, Apple URL, genres, release date, track count, content rating, copyright, record label, UPC, and single/compilation/completeness/mastering flags, plus requested artwork, motion artwork, editorial notes, or collections. Motion artwork is `null` when Apple has no video for the album. Supported additions are `artistUrl`, `audioVariants`, `artists`, `genres`, `tracks`, `recordLabels`, `appearsOn`, `otherVersions`, `relatedAlbums`, and `relatedVideos`.

Playlist details include name, curator name, Apple URL, chart flag, last-modified date, and playlist type, plus requested artwork, description, track types, curator, tracks, `featuredArtists`, and `moreByCurator`.

Collection values contain compact catalog items with Apple ID, type, name, artist/album/curator names, URL, artwork, genres, release date, duration, track count, ISRC, content rating, and playlist type when Apple provides those fields. Collection items are a page-sized projection, not complete nested artist/album/playlist records.

Use collection routes to paginate a relationship or artist view. Add `include=motionArtwork` when a page contains song or album rows that need video URLs:

```text
GET /api/v1/artists/{appleId}/collections/topSongs?limit=20&offset=0&include=motionArtwork
GET /api/v1/albums/{appleId}/collections/tracks?limit=50&offset=0&include=motionArtwork
GET /api/v1/playlists/{appleId}/collections/tracks?limit=50&offset=0&include=motionArtwork
```

Each response contains `items` and `page` (`limit`, `offset`, and an optional `next` URL). Follow `page.next` for the next page. Requested limits range from 1 to 100. Apple caps some collections more narrowly, so `page.limit` reports the effective limit for that collection.
If the parent exists but Apple has no resources for that collection or view, the route returns an empty `items` array. An unknown parent returns 404.

## Mixed catalog batch

`POST /api/v1/catalog/batch` fetches up to 50 artists, albums, and playlists in one request. The default projection is artwork plus core metadata. Request-wide `include` sets defaults by entity type; an item can override its own include list, storefront, collection limit, and artwork size.

```json
{
  "storefront": "us",
  "include": {
    "artist": ["artwork", "topSongs"],
    "album": ["artwork", "motionArtwork", "tracks"],
    "playlist": ["artwork"]
  },
  "limit": 10,
  "items": [
    { "type": "artist", "appleId": "462006" },
    { "type": "album", "appleId": "310730204", "include": ["artwork", "otherVersions"] },
    { "type": "playlist", "appleId": "pl.f4d106fed2bd41149aaacabb233eb5eb" }
  ]
}
```

Results preserve request order and include `index` plus `matched`, `not_found`, or `error` status. Apple’s typed multi-ID requests are deduplicated and chunked; repeated input entries still receive separate results.

## Artwork assets

`POST /api/v1/assets/batch` returns artwork URLs for up to 50 songs, artists, albums, and playlists. `size` sets square URL dimensions in pixels and can be overridden per item. Add `include: ["motionArtwork"]` globally or on an individual song/album item to also request motion video URLs. The default size is 300 pixels; supported sizes are 50–3000.

```json
{
  "size": 600,
  "include": ["motionArtwork"],
  "items": [
    { "type": "song", "appleId": "1082506273" },
    { "type": "artist", "appleId": "462006", "size": 1200 },
    { "type": "album", "appleId": "310730204" },
    { "type": "playlist", "appleId": "pl.f4d106fed2bd41149aaacabb233eb5eb" }
  ]
}
```

Each item reports `matched`, `not_found`, `unavailable` (the resource exists but has no returned still artwork or requested motion video), or `error`. A matched asset contains the fields available for that resource. Motion video URLs are only included for songs and albums, and a song uses its album's video when Apple has no song-level video. Clients fetch image or video bytes directly from Apple.

## Motion artwork

Motion artwork is opt-in on track detail, queue, album detail, catalog search and top suggestions, song/album collection pages, catalog album batches, and artwork batches. Without the option, responses do not contain a `motionArtwork` field. When requested, an unavailable video is represented as `motionArtwork: null` on an otherwise available track, album, or catalog item.

The shape is `provider: "appleMusic"` with `variants.default` as the preferred video URL. Apple square video is exposed as `variants.square`; its tall video is exposed as `variants.portrait`. A variant may include `format: "hls"` or `"mp4"` when the source URL identifies the format. The API returns URLs only; the client chooses whether to preload or play the video. For a player, request motion artwork when opening the maximized player and use still artwork for queue rows to avoid fetching video metadata for every queued track.

## Response handling

Invalid query parameters, JSON, identifiers, or options return HTTP 400 with an `error` object. A valid single-resource request that cannot find its Apple catalog item returns HTTP 404. Batch endpoints return HTTP 200 with a status for each item, so one missing item does not erase successful results. Unexpected request-level failures return HTTP 500.

## OpenAPI and Scalar

The `/api/openapi.json` document is generated from the Zod schemas used to validate request and response data. `/api/docs` renders that document with Scalar and includes every v1 route.
