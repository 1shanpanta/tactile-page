/**
 * The only module that talks to a network, and only when the teacher types a
 * key and asks. It proposes label text and which labels matter most. Nothing
 * it returns is applied until the teacher accepts it.
 */

export interface LabelSuggestion {
  id: string
  /** The word the model reads at this label. */
  text: string
  /** False when the model thinks the label can be left off the tactile graphic. */
  essential: boolean
  reason: string
}

export type SuggestError = 'bad_key' | 'refused' | 'failed'

export type SuggestResult =
  | { ok: true; suggestions: LabelSuggestion[] }
  | { ok: false; error: SuggestError }

export interface LabelSpot {
  id: string
  text: string
  /** Position of the label as fractions of the picture, from the top left. */
  x: number
  y: number
}

const MODEL = 'claude-opus-5-5'
const MAX_SIDE_PX = 1400

const INSTRUCTIONS = `You are helping a teacher of blind students turn this print diagram into a tactile graphic. A tactile graphic must be simpler than print.
Below is a list of label spots on the picture. Each has an id, the text read by a program ("?" means it could not be read) and its position as fractions of the picture width and height from the top left.
For each spot, read the word printed there and say whether a student needs that label to understand the diagram.
Reply with one JSON object and nothing else, in this shape:
{"labels":[{"id":string,"text":string,"essential":boolean,"reason":string}]}
"text" is the label exactly as printed. "reason" is one short plain sentence. Do not add labels that are not in the list.`

function toPngBase64(image: HTMLImageElement): string {
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png').split(',')[1] ?? ''
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image did not load'))
    image.src = url
  })
}

function parseSuggestions(text: string, known: ReadonlySet<string>): LabelSuggestion[] | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const labels = (parsed as { labels?: unknown }).labels
  if (!Array.isArray(labels)) return null
  const suggestions: LabelSuggestion[] = []
  for (const item of labels as Record<string, unknown>[]) {
    // The reply is untrusted: keep only well formed entries for labels that exist.
    if (typeof item?.id !== 'string' || !known.has(item.id) || typeof item.text !== 'string') continue
    suggestions.push({
      id: item.id,
      text: item.text.trim().slice(0, 60),
      essential: item.essential !== false,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : '',
    })
  }
  return suggestions
}

export async function suggestLabels(
  apiKey: string,
  pictureUrl: string,
  spots: readonly LabelSpot[],
): Promise<SuggestResult> {
  // Loaded on demand so the API client is not downloaded by people who never use this step.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  try {
    const data = toPngBase64(await loadImage(pictureUrl))
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data } },
            { type: 'text', text: `${INSTRUCTIONS}\n\nLabel spots:\n${JSON.stringify(spots)}` },
          ],
        },
      ],
    })
    if (response.stop_reason === 'refusal') return { ok: false, error: 'refused' }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
    const suggestions = parseSuggestions(text, new Set(spots.map((spot) => spot.id)))
    return suggestions ? { ok: true, suggestions } : { ok: false, error: 'failed' }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: 'bad_key' }
    return { ok: false, error: 'failed' }
  }
}
