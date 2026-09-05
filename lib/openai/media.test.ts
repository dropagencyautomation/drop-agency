import { describe, it, expect, vi } from 'vitest'
// As fixtures usam fileURL em https://uaz/...; só é aceita se for o host da Uazapi.
process.env.UAZAPI_BASE_URL = 'https://uaz'
import { resolveMediaText, AUDIO_TEXT_PREFIX, IMAGE_TEXT_PREFIX, type MediaDeps } from './media'

const base = { id: '5511:AB1', messageid: 'AB1', chatid: '554187490574@s.whatsapp.net', fromMe: false, messageTimestamp: 1787928964000 }
const rawAudio = { ...base, messageType: 'AudioMessage', text: '', fileURL: 'https://uaz/a.ogg', content: { mimetype: 'audio/ogg' } }
const rawImage = { ...base, messageType: 'ImageMessage', text: '', fileURL: 'https://uaz/a.jpg', content: { mimetype: 'image/jpeg' } }
const rawVideo = { ...base, messageType: 'VideoMessage', text: '', fileURL: 'https://uaz/a.mp4', content: { mimetype: 'video/mp4' } }

// Nenhum teste faz rede: tudo injetado.
function fakes(over: Partial<MediaDeps> = {}) {
  return {
    downloadMedia: vi.fn(async () => ({ fileURL: 'https://uaz/baixado.ogg', mimetype: 'audio/ogg' })),
    transcribe: vi.fn(async () => 'quero um site novo'),
    describe: vi.fn(async () => 'Print de um anuncio com o texto "50% off".'),
    fetch: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as MediaDeps['fetch'],
    ...over,
  }
}

describe('resolveMediaText', () => {
  it('audio vira texto com prefixo', async () => {
    const d = fakes()
    expect(await resolveMediaText(rawAudio, d)).toBe(`${AUDIO_TEXT_PREFIX} quero um site novo`)
    expect(d.transcribe).toHaveBeenCalledOnce()
    expect(d.describe).not.toHaveBeenCalled()
  })

  it('imagem vira descricao com prefixo', async () => {
    const d = fakes()
    expect(await resolveMediaText(rawImage, d)).toBe(`${IMAGE_TEXT_PREFIX} Print de um anuncio com o texto "50% off".`)
    expect(d.describe).toHaveBeenCalledWith('https://uaz/a.jpg', expect.any(Number))
    expect(d.transcribe).not.toHaveBeenCalled()
  })

  it('sem fileURL usa downloadMedia', async () => {
    const d = fakes()
    await resolveMediaText({ ...rawAudio, fileURL: '' }, d)
    expect(d.downloadMedia).toHaveBeenCalledWith('5511:AB1', expect.any(Number))
    expect(d.transcribe).toHaveBeenCalledOnce()
  })

  it('download falhando retorna null e nao chama OpenAI', async () => {
    const d = fakes({ downloadMedia: vi.fn(async () => null) })
    expect(await resolveMediaText({ ...rawAudio, fileURL: '' }, d)).toBeNull()
    expect(d.transcribe).not.toHaveBeenCalled()
  })

  it('transcricao falhando retorna null sem quebrar', async () => {
    const d = fakes({ transcribe: vi.fn(async () => { throw new Error('timeout') }) })
    expect(await resolveMediaText(rawAudio, d)).toBeNull()
  })

  it('video e ignorado sem chamar OpenAI', async () => {
    const d = fakes()
    expect(await resolveMediaText(rawVideo, d)).toBeNull()
    expect(d.transcribe).not.toHaveBeenCalled()
    expect(d.describe).not.toHaveBeenCalled()
    expect(d.downloadMedia).not.toHaveBeenCalled()
  })

  it('documento e figurinha sao ignorados', async () => {
    const d = fakes()
    expect(await resolveMediaText({ ...rawVideo, messageType: 'DocumentMessage' }, d)).toBeNull()
    expect(await resolveMediaText({ ...rawVideo, messageType: 'StickerMessage' }, d)).toBeNull()
    expect(d.describe).not.toHaveBeenCalled()
  })

  it('midia com legenda usa o texto do lead e nao chama OpenAI', async () => {
    const d = fakes()
    expect(await resolveMediaText({ ...rawImage, text: 'olha esse print' }, d)).toBe('olha esse print')
    expect(d.describe).not.toHaveBeenCalled()
    expect(d.transcribe).not.toHaveBeenCalled()
  })

  it('texto puro nao aciona conversao', async () => {
    const d = fakes()
    expect(await resolveMediaText({ ...base, messageType: 'ExtendedTextMessage', text: '' }, d)).toBeNull()
    expect(d.describe).not.toHaveBeenCalled()
  })
})

describe('isTrustedMediaUrl / audioFileName', () => {
  it('aceita só https no host da Uazapi', async () => {
    const { isTrustedMediaUrl } = await import('./media')
    const base = 'https://dropagency.uazapi.com'
    expect(isTrustedMediaUrl('https://dropagency.uazapi.com/files/a.jpg', base)).toBe(true)
    expect(isTrustedMediaUrl('http://dropagency.uazapi.com/files/a.jpg', base)).toBe(false)
    expect(isTrustedMediaUrl('https://10.0.0.5/admin', base)).toBe(false)
    expect(isTrustedMediaUrl('https://evil.com/files/a.jpg', base)).toBe(false)
    expect(isTrustedMediaUrl('not a url', base)).toBe(false)
  })
  it('extensão do áudio segue o mime', async () => {
    const { audioFileName } = await import('./media')
    expect(audioFileName('audio/ogg; codecs=opus')).toBe('audio.ogg')
    expect(audioFileName('audio/mp4')).toBe('audio.m4a')
    expect(audioFileName('audio/mpeg')).toBe('audio.mp3')
    expect(audioFileName('audio/webm')).toBe('audio.webm')
    expect(audioFileName(null)).toBe('audio.ogg')
  })
})

describe('fileURL fora do host da Uazapi', () => {
  it('ignora a URL do payload e cai no downloadMedia oficial', async () => {
    const d = {
      downloadMedia: vi.fn(async () => ({ fileURL: 'https://uaz/files/ok.jpg', mimetype: 'image/jpeg' })),
      transcribe: vi.fn(async () => ''),
      describe: vi.fn(async () => 'Descricao segura.'),
      fetch: vi.fn() as unknown as typeof fetch,
    } satisfies MediaDeps
    const raw = { id: '5511:IMG9', messageid: 'IMG9', chatid: '5511@s.whatsapp.net', fromMe: false, messageType: 'ImageMessage', text: '', fileURL: 'https://10.0.0.5/internal', content: { mimetype: 'image/jpeg' }, messageTimestamp: 1, senderName: 'x', status: '' }
    await resolveMediaText(raw, d)
    expect(d.downloadMedia).toHaveBeenCalledWith('5511:IMG9', expect.any(Number))
    expect(d.describe).toHaveBeenCalledWith('https://uaz/files/ok.jpg', expect.any(Number))
  })
})
