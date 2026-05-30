const BASE_URL = process.env.UAZAPI_BASE_URL!
const TOKEN = process.env.UAZAPI_TOKEN!
const INSTANCE = process.env.UAZAPI_INSTANCE!

async function request(path: string, body?: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Uazapi error: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function sendText(phone: string, text: string) {
  return request(`/message/sendText/${INSTANCE}`, {
    number: phone,
    text,
  })
}

export async function isWithinBusinessHours(): Promise<boolean> {
  const start = Number(process.env.BUSINESS_HOURS_START ?? 8)
  const end   = Number(process.env.BUSINESS_HOURS_END   ?? 19)
  const now   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hour  = now.getHours()
  return hour >= start && hour < end
}
