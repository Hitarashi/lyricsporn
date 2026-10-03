export const appleEditorialVideo = {
  motionDetailRaw: { video: 'https://video.test/raw.m3u8' },
  motionDetailSquare: { videoUrl: 'https://video.test/square.mp4' },
  motionDetailTall: { hlsUrl: 'https://video.test/portrait.m3u8' },
}

export const expectedMotionArtwork = {
  provider: 'appleMusic',
  variants: {
    default: { url: 'https://video.test/raw.m3u8', format: 'hls' },
    square: { url: 'https://video.test/square.mp4', format: 'mp4' },
    portrait: { url: 'https://video.test/portrait.m3u8', format: 'hls' },
  },
}
