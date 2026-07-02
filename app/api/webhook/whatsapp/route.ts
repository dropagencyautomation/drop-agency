import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase/server'
import { processMessage, computeLeadScore } from '@/lib/openai/agent'
import { sendSplitText, notifyHandoff } from '@/lib/uazapi/client'
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

function buildHandoffSummary(
  leadName: string,
  q: QualificationData,
  score: number,
  nextStep: string
): string {
  const na = 'não informado'
  return [
    `• Nome: ${leadName}`,
    `• Nicho: ${q.niche ?? na}`,
    `• Serviço de interesse: ${q.desired_service ?? q.service_type ?? na}`,
    `• Faturamento: ${q.revenue_range ?? na}`,
    `• Dor principal: ${q.main_pains ?? na}`,
    `• Urgência: ${q.urgency ?? na}`,
    `• Próximo passo: ${nextStep}`,
    `• Score: ${score}`,
  ].join('\n')
}

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

    // Ignora mensagens enviadas pelo próprio número (fromMe)
    if (msg.fromMe ?? body.fromMe) return NextResponse.json({ ok: true })

    // wa_chatid é o identificador do chat no formato NUMERO@s.whatsapp.net
    const rawChatId = body.wa_chatid ?? msg.wa_chatid ?? msg.chatid ?? msg.sender ?? msg.from ?? body.from ?? ''
    const phone     = String(rawChatId).replace('@s.whatsapp.net', '').replace('@c.us', '')
    const waChatId  = phone ? `${phone}@s.whatsapp.net` : ''
    const message   = msg.text ?? msg.body ?? msg.content?.text ?? body.text ?? ''

    if (!phone || !message) {
      console.log('[WEBHOOK] ignorado — phone ou message vazio. phone:', phone, 'message:', message)
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

    // NOTA: durante esta fase o bot responde a TODAS as mensagens.
    // A trava de human_takeover foi desativada de propósito. Para reativar o
    // handoff manual pelo CRM no futuro, basta descomentar a linha abaixo:
    // if (conversation.human_takeover) return NextResponse.json({ ok: true })
    if (conversation.human_takeover) {
      // Lead voltou a falar: reativa o bot para garantir continuidade
      await supabase.from('ai_conversations')
        .update({ human_takeover: false })
        .eq('id', conversation.id)
      conversation.human_takeover = false
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

    // ── Debounce: espera 5s. Se chegar mensagem mais nova, esta invocação sai
    //    e deixa a invocação da última mensagem responder a tudo de uma vez. ──
    await new Promise((r) => setTimeout(r, 5000))

    const { data: freshRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', conversation.id)
      .limit(1)
    const fresh = freshRows?.[0] ?? conversation
    const freshHistory: Array<{ role: string; content: string; timestamp?: string }> =
      fresh.conversation_history ?? []

    const lastUser = [...freshHistory].reverse().find((m) => m.role === 'user')
    if (lastUser && lastUser.timestamp !== arrivalTs) {
      console.log('[WEBHOOK] mensagem mais recente chegou — esta invocação aguarda a próxima responder')
      return NextResponse.json({ ok: true })
    }

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

    await supabase.from('leads').update(leadUpdate).eq('id', conversation.lead_id)

    // Envia resposta em blocos separados
    await sendSplitText(phone, reply)

    // Se handoff: avança lead no kanban + notifica Camila com resumo completo
    if (shouldHandoff) {
      const { data: lead } = await supabase
        .from('leads')
        .select('name, phone')
        .eq('id', conversation.lead_id)
        .single()

      await supabase.from('leads').update({ stage_id: 2 }).eq('id', conversation.lead_id)

      const leadName = updatedQualification.name ?? lead?.name ?? phone
      const nextStep =
        updatedQualification.service_type === 'recorrente'
          ? 'sessão estratégica com a Camila'
          : 'continuar atendimento humano'
      const summary = buildHandoffSummary(leadName, updatedQualification, score, nextStep)

      await notifyHandoff(phone, leadName, summary)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
