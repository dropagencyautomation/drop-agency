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

    // Ignora mensagens enviadas pelo próprio número (fromMe)
    if (body.fromMe) return NextResponse.json({ ok: true })

    const rawPhone = body.from ?? body.sender ?? body.chatid ?? ''
    const phone    = rawPhone.replace('@s.whatsapp.net', '').replace('@c.us', '')
    const message  = body.body ?? body.message ?? body.text ?? ''

    if (!phone || !message) return NextResponse.json({ ok: true })

    const supabase = await createServiceClient()

    // Busca ou cria conversa
    let { data: conversation } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('whatsapp_number', phone)
      .single()

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

    // Se humano assumiu, não responde
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

    // Registra mensagem do lead
    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'inbound',
      content: message,
    })

    // Processa com IA
    const { reply, updatedQualification, shouldHandoff } = await processMessage(
      conversation as AiConversation,
      message
    )

    // Atualiza histórico
    const updatedHistory = [
      ...(conversation.conversation_history ?? []),
      { role: 'user',      content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply,   timestamp: new Date().toISOString() },
    ]

    await supabase.from('ai_conversations').update({
      conversation_history: updatedHistory,
      qualification_data: updatedQualification,
      human_takeover: shouldHandoff,
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

    // Se handoff: avança lead no kanban + notifica Camila
    if (shouldHandoff) {
      // Busca dados do lead para a notificação
      const { data: lead } = await supabase
        .from('leads')
        .select('name, phone, niche, desired_service, revenue_range, urgency')
        .eq('id', conversation.lead_id)
        .single()

      await supabase.from('leads').update({ stage_id: 2 }).eq('id', conversation.lead_id)

      // Monta resumo com dados coletados
      const q = conversation.qualification_data ?? {}
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
