export function formEncode(value: string): string {
  return encodeURIComponent(value)
}

export function uriComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '%20')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/~/g, '%7E')
}
