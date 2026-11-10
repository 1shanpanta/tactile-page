/** Hands a generated file to the browser as a download. */
export function download(name: string, type: string, content: string | Uint8Array): void {
  const part = typeof content === 'string' ? content : new Uint8Array(content)
  const url = URL.createObjectURL(new Blob([part], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // The click starts the download at once, so the URL can go on the next tick.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug === '' ? 'diagram' : slug
}
