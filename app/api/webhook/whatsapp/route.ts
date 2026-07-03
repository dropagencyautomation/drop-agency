import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase/server'
import { processMessage, computeLeadScore, generateLeadSummary, generateHandoffGuidance } from '@/lib/openai/agent'
import { sendSplitText, sendText, notifyQualifiedLead } from '@/lib/uazapi/client'
import { getRedis } from '@/lib/redis/client'
import type { AiConversation, QualificationData } from '@/types/database'

const LEAD_FIELD_KEYS: Array<keyof QualificationData> = [
  'niche',
  'service_type',
  'desired_service',
  'main_objective',
  'urgency',
  'revenue_range',
  'team_size',
  'digital_maturity',
  'has_marketing',
  'main_pains',
  'growth_goals',
  'estimated_budget',
]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('[WEBHOOK] payload recebido:', JSON.stringify(body))

    // Recebe todos os eventos, mas a IA só responde a mensagens novas.
    // Ignora eventos que não sejam de mensagem (connection, presence, history, etc).
    const eventType = body.EventType ?? body.event ?? body.type
    if (eventType && String(eventType).toLowerCase() !== 'messages') {
      console.log('[WEBHOOK] evento ignorado (nao e mensagem):', eventType)
      return NextResponse.json({ ok: true })
    }

    // uazapi v2 aninha a mensagem em body.message; aceita também payload achatado
    const msg = body.message ?? body.data ?? body

    // wa_chatid é o identificador do chat no formato NUMERO@s.whatsapp.net
    const rawChatId = body.wa_chatid ?? msg.wa_chatid ?? msg.chatid ?? msg.sender ?? msg.from ?? body.from ?? ''
    const phone     = String(rawChatId).replace('@s.whatsapp.net', '').replace('@c.us', '')
    const waChatId  = phone ? `${phone}@s.whatsapp.net` : ''
    const message   = msg.text ?? msg.body ?? msg.content?.text ?? body.text ?? ''
    const isFromMe  = Boolean(msg.fromMe ?? body.fromMe)

    if (!phone) {
      console.log('[WEBHOOK] ignorado — phone vazio')
      return NextResponse.json({ ok: true })
    }

    // Whitelist de números permitidos, no formato NUMERO@s.whatsapp.net
    const ALLOWED_CHATIDS = [
      '5511994800080@s.whatsapp.net',
      '554187490574@s.whatsapp.net',
      '5511989869931@s.whatsapp.net',
    ]
    if (!ALLOWED_CHATIDS.includes(waChatId)) {
      console.log('[WEBHOOK] ignorado — wa_chatid nao permitido:', waChatId)
      return NextResponse.json({ ok: true })
    }

    const supabase = await createServiceClient()

    // Busca ou cria conversa (limit(1) evita erro de múltiplas linhas)
    const { data: convRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('whatsapp_number', phone)
      .order('created_at', { ascending: true })
      .limit(1)

    let conversation = convRows?.[0] ?? null

    if (!conversation) {
      // Novo lead
      const { data: newLead } = await supabase
        .from('leads')
        .insert({ name: phone, phone, source: 'whatsapp', stage_id: 1 })
        .select()
        .single()

      if (!newLead) return NextResponse.json({ ok: true })

      const { data: newConv } = await supabase
        .from('ai_conversations')
        .insert({
          lead_id: newLead.id,
          whatsapp_number: phone,
          conversation_history: [],
          qualification_data: {},
          current_step: 'greeting',
        })
        .select()
        .single()

      conversation = newConv
    }

    if (!conversation) return NextResponse.json({ ok: true })

    // ── fromMe: pode ser eco do próprio bot ou um humano respondendo manual ──
    if (isFromMe) {
      const redis = getRedis()
      const isBotEcho = await redis.exists(`bot:sending:${phone}`)

      if (!isBotEcho) {
        // Humano de verdade assumiu a conversa: trava a IA por 15 minutos,
        // renovado a cada nova mensagem humana (não por mensagens do lead).
        await redis.set(`human_lock:${phone}`, '1', 'EX', 900)

        if (message) {
          const ts = new Date().toISOString()
          await supabase.from('ai_conversations').update({
            conversation_history: [
              ...(conversation.conversation_history ?? []),
              { role: 'assistant', content: message, timestamp: ts },
            ],
            updated_at: ts,
          }).eq('id', conversation.id)
        }
      }

      return NextResponse.json({ ok: true })
    }

    if (!message) {
      console.log('[WEBHOOK] ignorado — message vazio. phone:', phone)
      return NextResponse.json({ ok: true })
    }

    // ── Registra a mensagem do lead no histórico imediatamente ──
    const arrivalTs = new Date().toISOString()
    const historyWithUser = [
      ...(conversation.conversation_history ?? []),
      { role: 'user', content: message, timestamp: arrivalTs },
    ]
    await supabase.from('ai_conversations').update({
      conversation_history: historyWithUser,
      updated_at: arrivalTs,
    }).eq('id', conversation.id)

    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'inbound',
      content: message,
    })

    // ── Se um humano assumiu a conversa manualmente, a IA não responde ──
    // enquanto o lock estiver ativo (15 minutos, renovado a cada mensagem humana).
    const redis = getRedis()
    const isHumanLocked = await redis.exists(`human_lock:${phone}`)
    if (isHumanLocked) {
      console.log('[WEBHOOK] conversa travada por atendimento humano manual — IA nao responde:', phone)
      return NextResponse.json({ ok: true })
    }

    // ── Agrupamento: espera 30s. Se chegar mensagem mais nova (marcador no
    //    Redis muda), esta invocação sai e deixa a invocação da última
    //    mensagem responder a tudo de uma vez. ──
    await redis.set(`latest_msg:${phone}`, arrivalTs, 'EX', 60)
    await new Promise((r) => setTimeout(r, 30000))

    const latestMarker = await redis.get(`latest_msg:${phone}`)
    if (latestMarker !== arrivalTs) {
      console.log('[WEBHOOK] mensagem mais recente chegou — esta invocação aguarda a próxima responder')
      return NextResponse.json({ ok: true })
    }

    const { data: freshRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', conversation.id)
      .limit(1)
    const fresh = freshRows?.[0] ?? conversation
    const freshHistory: Array<{ role: string; content: string; timestamp?: string }> =
      fresh.conversation_history ?? []

    // ── Junta todas as mensagens do lead ainda não respondidas ──
    let lastAssistantIdx = -1
    for (let i = freshHistory.length - 1; i >= 0; i--) {
      if (freshHistory[i].role === 'assistant') { lastAssistantIdx = i; break }
    }
    const priorHistory = freshHistory.slice(0, lastAssistantIdx + 1)
    const combinedMessage = freshHistory
      .slice(lastAssistantIdx + 1)
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n')

    // Processa com IA (histórico anterior + bloco de mensagens novas combinadas)
    const { reply, updatedQualification, shouldHandoff } = await processMessage(
      { ...fresh, conversation_history: priorHistory } as AiConversation,
      combinedMessage
    )

    // Atualiza histórico com a resposta
    const finalHistory = [
      ...freshHistory,
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    ]

    await supabase.from('ai_conversations').update({
      conversation_history: finalHistory,
      qualification_data: updatedQualification,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id)

    // Registra resposta da IA
    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'outbound',
      content: reply,
      ai_generated: true,
    })

    // Persiste os dados qualificados direto no lead, conforme a conversa avança
    const { score, profile } = computeLeadScore(updatedQualification)
    const leadUpdate: Record<string, unknown> = {
      last_interaction_at: new Date().toISOString(),
      score,
      profile,
    }
    if (updatedQualification.name) leadUpdate.name = updatedQualification.name
    for (const key of LEAD_FIELD_KEYS) {
      if (updatedQualification[key] !== undefined) leadUpdate[key] = updatedQualification[key]
    }

    // A cada 2 mensagens do lead, recalcula o resumo de uma linha
    const userMessageCount = finalHistory.filter((m) => m.role === 'user').length
    let latestSummary: string | undefined
    if (userMessageCount % 2 === 0) {
      const generated = await generateLeadSummary(finalHistory, updatedQualification)
      if (generated) {
        latestSummary = generated
        leadUpdate.summary = generated
      }
    }

    await supabase.from('leads').update(leadUpdate).eq('id', conversation.lead_id)

    // Envia resposta em blocos separados
    await sendSplitText(phone, reply)

    // Se handoff: mensagem fixa de encerramento + notifica a Camila
    if (shouldHandoff) {
      await sendText(phone, 'Obrigado pelo contato, em breve vamos falar com você')

      await supabase.from('leads').update({ stage_id: 2 }).eq('id', conversation.lead_id)

      const summary = latestSummary ?? (await generateLeadSummary(finalHistory, updatedQualification))
      const guidance = await generateHandoffGuidance(finalHistory, updatedQualification)

      await notifyQualifiedLead(phone, summary, guidance)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
