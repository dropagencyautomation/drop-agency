import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase/server'
import { processMessage } from '@/lib/openai/agent'
import { sendText, isWithinBusinessHours, notifyHandoff } from '@/lib/uazapi/client'
import type { AiConversation } from '@/types/database'

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

    const rawPhone = msg.sender ?? msg.chatid ?? msg.from ?? body.from ?? ''
    const phone    = String(rawPhone).replace('@s.whatsapp.net', '').replace('@c.us', '')
    const message  = msg.text ?? msg.body ?? msg.content?.text ?? body.text ?? ''

    if (!phone || !message) {
      console.log('[WEBHOOK] ignorado — phone ou message vazio. phone:', phone, 'message:', message)
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

    // Se humano assumiu manualmente pelo CRM, não responde
    if (conversation.human_takeover) return NextResponse.json({ ok: true })

    // Fora do horário comercial: avisa e encerra
    const inHours = await isWithinBusinessHours()
    if (!inHours) {
      await sendText(
        phone,
        'Olá! Nosso atendimento funciona de segunda a sexta, das 8h às 19h. Retorno em breve 😊'
      )
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

    // Atualiza last_interaction_at do lead
    await supabase.from('leads').update({
      last_interaction_at: new Date().toISOString(),
    }).eq('id', conversation.lead_id)

    // Envia resposta
    await sendText(phone, reply)

    // Se handoff: avança lead no kanban + notifica Camila (o bot continua respondendo)
    if (shouldHandoff) {
      // Busca dados do lead para a notificação
      const { data: lead } = await supabase
        .from('leads')
        .select('name, phone, niche, desired_service, revenue_range, urgency')
        .eq('id', conversation.lead_id)
        .single()

      await supabase.from('leads').update({ stage_id: 2 }).eq('id', conversation.lead_id)

      // Monta resumo com dados coletados
      const q = updatedQualification ?? {}
      const lines: string[] = []
      if (q.niche)           lines.push(`• Nicho: ${q.niche}`)
      if (q.desired_service) lines.push(`• Serviço: ${q.desired_service}`)
      if (q.revenue_range)   lines.push(`• Faturamento: ${q.revenue_range}`)
      if (q.urgency)         lines.push(`• Urgência: ${q.urgency}`)
      if (q.main_pains)      lines.push(`• Dores: ${q.main_pains}`)
      if (q.estimated_budget)lines.push(`• Budget estimado: ${q.estimated_budget}`)
      const summary = lines.length > 0 ? lines.join('\n') : 'Sem dados coletados ainda.'

      const leadName = lead?.name ?? phone
      await notifyHandoff(phone, leadName, summary)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
