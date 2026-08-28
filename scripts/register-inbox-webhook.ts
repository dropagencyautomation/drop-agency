// Registra o webhook do espelho de inbox na Uazapi (idempotente: não duplica pela URL).
//
// Uso: set -a; source .env.local; set +a; npx tsx scripts/register-inbox-webhook.ts
// Requer UAZAPI_BASE_URL, UAZAPI_TOKEN, NEXT_PUBLIC_APP_URL e WEBHOOK_SECRET no ambiente.

for (const k of ['UAZAPI_BASE_URL', 'UAZAPI_TOKEN', 'NEXT_PUBLIC_APP_URL', 'WEBHOOK_SECRET']) {
  if (!process.env[k]) { console.error(`faltou ${k}`); process.exit(1) }
}

const base = process.env.UAZAPI_BASE_URL!, token = process.env.UAZAPI_TOKEN!
const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/inbox?secret=${process.env.WEBHOOK_SECRET}`
const h = { 'Content-Type': 'application/json', token }

async function main() {
  const list = await fetch(`${base}/webhook`, { headers: h }).then(r => r.json())
  if (Array.isArray(list) && list.some((w: { url?: string }) => w.url === url)) { console.log('já registrado'); return }
  const r = await fetch(`${base}/webhook`, { method: 'POST', headers: h, body: JSON.stringify({ action: 'add', url, events: ['messages', 'messages_update'], excludeMessages: [], enabled: true }) // action:'add' obrigatório — sem ele a Uazapi SUBSTITUI o webhook existente (o da Carol) })
  console.log(r.status, await r.text())
}
main()
