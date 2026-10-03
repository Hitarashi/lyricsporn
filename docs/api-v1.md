# Lyricsporn API v1

The interactive reference is available at `/api/docs`. The OpenAPI 3.1 document is available at `/api/openapi.json`.
The API is public and does not require an API key.

Apple Music supplies catalog metadata and artwork. Lyrics requests use every provider configured in the lyrics repository. Artwork responses contain Apple CDN URLs; clients fetch the image bytes from Apple.

## Lyrics lookup

`GET /api/v1/lookup` accepts one lookup. `POST /api/v1/lookup` accepts up to 10 independent lookups and returns one ordered result group for each input.

Choose one identifier (`isrc`, `appleId`, or `appleLink`), or provide both `title` and `artist`. Search accepts an optional `album`. Identifier lookups accept optional title, artist, and album hints.

```sh
curl 'https://lyricsporn.netlify.app/api/v1/lookup?isrc=USRC17607839&include=track,artwork,lyrics&formats=json,ttml'
```

```sh
curl 'https://lyricsporn.netlify.app/api/v1/lookup' \
  -H 'Content-Type: application/json' \
  -d '{
    "include": ["track", "artwork", "lyrics"],
    "lyrics": { "formats": ["json", "ttml", "elrc"] },
    "lookups": [
      { "lookup": { "isrc": "USRC17607839" } },
      { "lookup": { "title": "Dreams", "artist": "Fleetwood Mac", "album": "Rumours" }, "limit": 2 }
    ]
  }'
```

Search returns 5 Apple Music matches by default and accepts 1–10. Request-wide `include`, `lyrics`, and `limit` values are defaults; each item can override them. Each result reports `matched`, `not_found`, or `error` independently.

Include sections are `track`, `artwork`, `lyrics`, and `appleCatalog`. Lyrics output can include normalized `json`, generated `ttml`, and generated `elrc`. Each requested format reports whether it is available; eLRC needs word-level timing.

## Track detail

`GET /api/v1/tracks/{appleId}` returns normalized track metadata. `include` defaults to `artwork`; add `artists`, `album`, `lyrics`, or `appleCatalog` when a screen needs those sections. `appleCatalog` returns the raw Apple response for that request. Lyrics format defaults to `json`.

```sh
curl 'https://lyricsporn.netlify.app/api/v1/tracks/1082506273?include=artwork,artists,album,lyrics&formats=json,ttml'
```

The `track` object contains the Apple song ID and type, title, artist, album, album artist, composer, genres, release date, track and disc numbers, duration, ISRC, audio traits, label, copyright, streamability, content rating, UPC, and Apple URL when Apple returns them. `artwork`, linked `artists`, and `albumResource` are optional. `hasLyrics` reflects Apple’s catalog flag when present. Requested `lyrics` are resolved through the supported lyrics providers.

## Queue hydration

`POST /api/v1/tracks/batch` fetches up to 50 Apple song IDs for a playback queue. Apple metadata is requested in batches; duplicate queue entries and input order are preserved. Core queue fields are always returned: title, artist, album, and duration when available. Artwork is included by default. `identifiers`, `release`, and `lyrics` add ISRC, release date, or lyrics.

```json
{
  "include": ["artwork", "identifiers"],
  "artworkSize": 300,
  "items": [
    { "appleId": "1082506273" },
    { "appleId": "1082506273", "include": ["artwork", "lyrics"], "lyrics": { "formats": ["json"] } }
  ]
}
```

Item `include`, `storefront`, `artworkSize`, and `lyrics.formats` override their request-wide defaults. A missing track or failed lookup is reported for that item without dropping the rest of the queue.

## Artist, album, and playlist catalog

Single-resource routes return one normalized entity. The default include is artwork; collections and extended fields are opt-in.

```text
GET /api/v1/artists/{appleId}?include=artwork,editorialNotes,topSongs,latestRelease
GET /api/v1/albums/{appleId}?include=artwork,artistUrl,audioVariants,tracks,otherVersions
GET /api/v1/playlists/{appleId}?include=artwork,description,trackTypes,curator,tracks,featuredArtists,moreByCurator
```

Artist details include name, Apple URL, and genres, plus requested artwork/editorial notes and collections. Supported collections and views are `albums`, `genres`, `musicVideos`, `playlists`, `station`, `topSongs`, `latestRelease`, `featuredAlbums`, `featuredPlaylists`, `featuredMusicVideos`, `topMusicVideos`, `fullAlbums`, `singles`, `liveAlbums`, `appearsOnAlbums`, `compilationAlbums`, and `similarArtists`.

Album details include name, artist name, Apple URL, genres, release date, track count, content rating, copyright, record label, UPC, and single/compilation/completeness/mastering flags, plus requested artwork, editorial notes, or collections. Supported additions are `artistUrl`, `audioVariants`, `artists`, `genres`, `tracks`, `recordLabels`, `appearsOn`, `otherVersions`, `relatedAlbums`, and `relatedVideos`.

Playlist details include name, curator name, Apple URL, chart flag, last-modified date, and playlist type, plus requested artwork, description, track types, curator, tracks, `featuredArtists`, and `moreByCurator`.

Collection values contain compact catalog items with Apple ID, type, name, artist/album/curator names, URL, artwork, genres, release date, duration, track count, ISRC, content rating, and playlist type when Apple provides those fields. Collection items are a page-sized projection, not complete nested artist/album/playlist records.

Use collection routes to paginate a relationship or artist view:

```text
GET /api/v1/artists/{appleId}/collections/topSongs?limit=20&offset=0
GET /api/v1/albums/{appleId}/collections/tracks?limit=50&offset=0
GET /api/v1/playlists/{appleId}/collections/tracks?limit=50&offset=0
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
    "album": ["artwork", "tracks"],
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

`POST /api/v1/assets/batch` returns artwork URLs for up to 50 songs, artists, albums, and playlists. `size` sets square URL dimensions in pixels and can be overridden per item. The default is 300 pixels; supported sizes are 50–3000.

```json
{
  "size": 600,
  "items": [
    { "type": "song", "appleId": "1082506273" },
    { "type": "artist", "appleId": "462006", "size": 1200 },
    { "type": "album", "appleId": "310730204" },
    { "type": "playlist", "appleId": "pl.f4d106fed2bd41149aaacabb233eb5eb" }
  ]
}
```

Each item reports `matched`, `not_found`, `unavailable` (the catalog resource exists but has no artwork), or `error`. A matched item contains artwork attributes and an Apple CDN URL; the API does not proxy image bytes.

## Response handling

Invalid query parameters, JSON, identifiers, or options return HTTP 400 with an `error` object. A valid single-resource request that cannot find its Apple catalog item returns HTTP 404. Batch endpoints return HTTP 200 with a status for each item, so one missing item does not erase successful results. Unexpected request-level failures return HTTP 500.

## OpenAPI and Scalar

The `/api/openapi.json` document is generated from the Zod schemas used to validate request and response data. `/api/docs` renders that document with Scalar and includes every v1 route.
