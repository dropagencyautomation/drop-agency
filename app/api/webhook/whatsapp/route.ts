import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase/server'
import { processMessage, computeLeadScore, generateLeadSummary, generateHandoffGuidance } from '@/lib/openai/agent'
import { sendSplitText, sendText, notifyQualifiedLead, splitIntoBlocks } from '@/lib/uazapi/client'
import { getRedis } from '@/lib/redis/client'
import { loadAgentConfig } from '@/lib/agent/settings'
import { isAllowedChat, phoneFromJid } from '@/lib/inbox/whitelist'
import { latestMsgTtlSeconds, MEDIA_DEBOUNCE_MS } from '@/lib/agent/debounce'
import { resolveMediaText } from '@/lib/openai/media'
import { touchHumanLock, isAgentPaused } from '@/lib/inbox/agentLock'
import { botSendingKey, latestMsgKey, processingKey } from '@/lib/agent/keys'
import { leadSaidName } from '@/lib/agent/nameGuard'
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

type HistoryRow = { role: 'user' | 'assistant'; content: string; timestamp: string }

// Trava de resposta: TTL cobre UMA rodada (OpenAI + envio em blocos ≈ 60-110s) e
// é renovado a cada rodada. Renovação e liberação são compare-and-set em Lua para
// nunca mexer na trava de outra invocação (GET+DEL separados não são atômicos).
const LOCK_TTL_SECONDS = 180
const RENEW_IF_OWNER = "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('expire',KEYS[1],ARGV[2]) end return 0"
const RELEASE_IF_OWNER = "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0"

async function getRecentHistory(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  leadId: string,
  limit = 200
): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('interactions')
    .select('direction, content, created_at')
    .eq('lead_id', leadId)
    .eq('channel', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      role: row.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: row.content as string,
      timestamp: row.created_at as string,
    }))
}

export async function POST(req: NextRequest) {
  // Marca a chegada para medir o ciclo real até a primeira resposta ao lead.
  const receivedAt = Date.now()
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

    // Identificador do chat. Preferimos chatid (é sempre o telefone do outro lado,
    // tanto inbound quanto outbound) e nunca sender, que a Uazapi entrega como LID
    // (NUMERO@lid) — LID é identidade do WhatsApp e não se converte em telefone.
    // sender_pn é o telefone do remetente e só existe no formato novo de payload.
    const rawChatId = body.wa_chatid ?? msg.wa_chatid ?? msg.chatid ?? msg.sender_pn ?? msg.from ?? body.from ?? ''
    // phoneFromJid devolve o telefone REAL (a forma que este assinante usa no
    // WhatsApp) e null para tudo que não é telefone: @lid, @g.us, malformado.
    // A identidade no banco, no Redis e no envio continua sendo essa forma real;
    // só a comparação da whitelist é normalizada (ver isAllowedChat).
    const phone     = phoneFromJid(rawChatId)
    let message     = msg.text ?? msg.body ?? msg.content?.text ?? body.text ?? ''
    const isFromMe  = Boolean(msg.fromMe ?? body.fromMe)

    if (!phone) {
      // Loga o identificador exato recebido: é com ele que diagnosticamos.
      console.log('[WEBHOOK] ignorado — identificador nao e telefone:', JSON.stringify(String(rawChatId)))
      return NextResponse.json({ ok: true })
    }

    if (!isAllowedChat(rawChatId)) {
      console.log('[WEBHOOK] ignorado — numero nao permitido:', JSON.stringify(String(rawChatId)))
      return NextResponse.json({ ok: true })
    }

    const supabase = await createServiceClient()
    const agentConfig = await loadAgentConfig(supabase)
    const personaName = agentConfig.settings.persona_name

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
      // Redis fora: não temos como saber se é eco do bot. Assumir humano é o
      // lado seguro (só grava a mensagem e tenta pausar); nunca devolver 500.
      let isBotEcho = 0
      try {
        isBotEcho = await getRedis().exists(botSendingKey(phone))
      } catch (e) {
        console.error('[WEBHOOK] redis indisponivel ao checar eco do bot — tratando como humano:', e)
      }

      if (!isBotEcho) {
        // Humano de verdade assumiu a conversa pelo celular: silencia a IA.
        // Nunca encurta a pausa manual feita pelo CRM (ver touchHumanLock).
        await touchHumanLock(phone, agentConfig.settings.human_lock_minutes * 60)

        if (message) {
          // Grava em interactions (fonte de verdade do chat no CRM e da
          // memória da IA), não mais em conversation_history.
          await supabase.from('interactions').insert({
            lead_id: conversation.lead_id,
            channel: 'whatsapp',
            direction: 'outbound',
            content: message,
            ai_generated: false,
          })
        }
      }

      return NextResponse.json({ ok: true })
    }

    // ── Marcador de chegada ANTES de qualquer conversão de mídia ──
    // A conversão de áudio é lenta (download + whisper). Se o marcador só fosse
    // gravado depois dela, essa invocação ficaria invisível ao agrupamento: uma
    // mensagem de texto do lead responderia no meio e o áudio responderia de
    // novo depois, duplicando a resposta. Com o marcador aqui, a mensagem mais
    // nova invalida a invocação lenta na comparação lá embaixo.
    const arrivalTs = new Date().toISOString()
    const redis = getRedis()
    const debounceMs = agentConfig.settings.debounce_ms
    // ponytail: TTL soma o teto da etapa de mídia (downloadMedia + download do
    // arquivo + whisper, 20s cada). Se a mídia ficar mais lenta que isso, o
    // marcador expira e a resposta é descartada — aumentar o somatório.
    try {
      await redis.set(latestMsgKey(phone), arrivalTs, 'EX', latestMsgTtlSeconds(debounceMs) + 60)
    } catch (e) {
      // Redis fora: responde sem agrupamento em vez de calar (500).
      console.error('[WEBHOOK] marcador de agrupamento indisponivel — seguindo sem agrupamento:', e)
    }

    // Sem texto: áudio e imagem viram texto antes de seguir o fluxo normal.
    // Vídeo, documento, figurinha e falhas de conversão encerram sem responder.
    let fromMedia = false
    if (!message) {
      const derived = await resolveMediaText(msg)
      if (derived) {
        message = derived
        fromMedia = true
      }
    }

    if (!message) {
      console.log('[WEBHOOK] ignorado — message vazio. phone:', phone)
      return NextResponse.json({ ok: true })
    }

    // ── Registra a mensagem do lead imediatamente (fonte única: interactions) ──
    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'inbound',
      content: message,
    })

    // ── Se um humano assumiu a conversa manualmente, a IA não responde ──
    // enquanto o lock estiver ativo (15 minutos, renovado a cada mensagem humana).
    const isHumanLocked = await isAgentPaused(phone)
    if (isHumanLocked) {
      console.log('[WEBHOOK] conversa travada por atendimento humano manual — IA nao responde:', phone)
      return NextResponse.json({ ok: true })
    }

    // ── Agrupamento: espera a janela de AGENT_DEBOUNCE_MS. Se chegar mensagem
    //    mais nova (marcador no Redis muda), esta invocação sai e deixa a
    //    invocação da última mensagem responder a tudo de uma vez. ──
    // Quem manda áudio ou imagem não está digitando em rajada, e a conversão já
    // consumiu parte do orçamento de 10s: a janela encolhe para não estourar o ciclo.
    const effectiveDebounceMs = fromMedia ? Math.min(debounceMs, MEDIA_DEBOUNCE_MS) : debounceMs
    await new Promise((r) => setTimeout(r, effectiveDebounceMs))

    let latestMarker: string | null = arrivalTs
    try {
      latestMarker = await redis.get(latestMsgKey(phone))
    } catch (e) {
      console.error('[WEBHOOK] marcador de agrupamento indisponivel — respondendo sem agrupamento:', e)
    }
    if (latestMarker !== arrivalTs) {
      console.log('[WEBHOOK] mensagem mais recente chegou — esta invocação aguarda a próxima responder')
      return NextResponse.json({ ok: true })
    }

    // A pausa pode ter sido acionada durante a janela (botão no CRM ou resposta
    // pelo celular). Checar de novo aqui evita gastar OpenAI e responder à toa.
    if (await isAgentPaused(phone)) {
      console.log('[WEBHOOK] pausa acionada durante a janela — IA nao responde:', phone)
      return NextResponse.json({ ok: true })
    }

    // ── Trava de resposta por telefone ──
    // Duas invocações do mesmo lead chegaram a responder ao mesmo tempo e os
    // blocos se intercalaram no WhatsApp do lead (uma resposta longa leva ~1 min
    // para sair; latest_msg só protege a janela de agrupamento, não o envio).
    // Quem não pega a trava sai: a mensagem já está em interactions e a
    // invocação dona da trava a encontra na drenagem lá embaixo.
    const lockKey = processingKey(phone)
    try {
      const acquired = await redis.set(lockKey, arrivalTs, 'EX', LOCK_TTL_SECONDS, 'NX')
      if (!acquired) {
        console.log('[WEBHOOK] outra invocacao esta respondendo %s — esta mensagem sera drenada por ela', phone)
        return NextResponse.json({ ok: true })
      }
    } catch (e) {
      // Redis fora: segue sem trava, como sempre foi. A trava nunca cala a IA.
      console.error('[WEBHOOK] trava de resposta indisponivel — seguindo sem ela:', e)
    }

    try {
      // Sem teto de rodadas: quem bateu na trava já saiu, então tudo que chegar
      // enquanto respondemos só será respondido por esta invocação.
      // answeredUpTo = created_at da última mensagem do lead já respondida.
      let answeredUpTo: string | undefined
      let failures = 0
      for (let round = 1; ; round++) {
        if (round > 1) {
          // Renova a trava só se ainda for nossa: o TTL cobre UMA rodada, não todas.
          try {
            await redis.eval(RENEW_IF_OWNER, 1, lockKey, arrivalTs, LOCK_TTL_SECONDS)
          } catch (e) {
            console.error('[WEBHOOK] falha ao renovar trava de resposta:', e)
          }
        }

        try {
          const freshHistory = await getRecentHistory(supabase, conversation.lead_id)

          // ── Junta todas as mensagens do lead ainda não respondidas ──
          // Rodada 1: tudo depois da última resposta. Rodadas seguintes: tudo mais
          // novo que answeredUpTo (mesmo critério da drenagem lá embaixo) — a
          // resposta que acabamos de gravar é mais nova que mensagens que chegaram
          // durante o processMessage, e o corte pelo último assistant as perderia.
          let pendingMsgs: HistoryRow[]
          let priorHistory: HistoryRow[]
          if (answeredUpTo) {
            const cut = answeredUpTo
            const isPending = (m: HistoryRow) => m.role === 'user' && m.timestamp > cut
            pendingMsgs = freshHistory.filter(isPending)
            priorHistory = freshHistory.filter((m) => !isPending(m))
          } else {
            let lastAssistantIdx = -1
            for (let i = freshHistory.length - 1; i >= 0; i--) {
              if (freshHistory[i].role === 'assistant') { lastAssistantIdx = i; break }
            }
            priorHistory = freshHistory.slice(0, lastAssistantIdx + 1)
            pendingMsgs = freshHistory.slice(lastAssistantIdx + 1).filter((m) => m.role === 'user')
          }
          const combinedMessage = pendingMsgs.map((m) => m.content).join('\n')
          if (!combinedMessage) {
            console.log('[WEBHOOK] nenhuma mensagem do lead pendente nesta rodada — phone:', phone)
            break
          }
          if (round > 1) console.log(`[WEBHOOK] drenagem: rodada ${round} respondendo ${pendingMsgs.length} mensagens acumuladas`)
          // Marca até onde esta rodada leu: mensagem inbound mais nova que isso
          // chegou enquanto respondíamos e precisa de outra rodada.
          const lastUserTs = pendingMsgs[pendingMsgs.length - 1].timestamp

          // Processa com IA (histórico anterior + bloco de mensagens novas combinadas)
          const { reply, updatedQualification, shouldHandoff } = await processMessage(
            { ...conversation, conversation_history: priorHistory } as AiConversation,
            combinedMessage,
            agentConfig
          )

          // Nome só vale se o lead o escreveu: o extrator já pegou o nome de uma
          // mensagem manual da atendente (que chega ao modelo como assistant).
          const prevName = (conversation.qualification_data as QualificationData | null)?.name
          if (updatedQualification.name && updatedQualification.name !== prevName) {
            const leadTexts = [...freshHistory.filter((m) => m.role === 'user').map((m) => m.content), combinedMessage]
            if (!leadSaidName(updatedQualification.name, leadTexts)) {
              console.log('[WEBHOOK] nome extraido descartado: %s nao foi dito pelo lead', updatedQualification.name)
              updatedQualification.name = prevName
            }
          }

          // Registra resposta da IA (guardamos o id: se o envio for interrompido pelo
          // atendimento humano, o histórico precisa refletir só o que o lead recebeu)
          const { data: aiRow } = await supabase.from('interactions').insert({
            lead_id: conversation.lead_id,
            channel: 'whatsapp',
            direction: 'outbound',
            content: reply,
            ai_generated: true,
          }).select('id').single()
          // A partir daqui as mensagens desta rodada contam como respondidas.
          answeredUpTo = lastUserTs

          await supabase.from('ai_conversations').update({
            qualification_data: updatedQualification,
            updated_at: new Date().toISOString(),
          }).eq('id', conversation.id)
          // A próxima rodada (e a guarda de nome) partem da memória já atualizada.
          conversation = { ...conversation, qualification_data: updatedQualification }

          // Histórico completo (janela + resposta desta rodada), usado pelo resumo/orientações
          const finalHistory: HistoryRow[] = [
            ...freshHistory,
            { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
          ]

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

          // Envia resposta em blocos separados. O resumo (ida extra à OpenAI, não usada
          // na resposta ao lead) fica para depois do envio, fora do ciclo medido.
          if (round === 1) console.log(`[WEBHOOK] ciclo ate a primeira resposta: ${Date.now() - receivedAt}ms (debounce ${effectiveDebounceMs}ms) — phone: ${phone}`)
          // Antes de cada bloco, confere se um humano assumiu (botão no CRM ou resposta
          // pelo celular). Se sim, a IA para de falar no bloco seguinte, em vez de
          // despejar os ~40s de resposta que já estavam na fila.
          const { sent, total } = await sendSplitText(phone, reply, () => isAgentPaused(phone))
          const interrupted = sent < total
          if (interrupted && aiRow?.id) {
            if (sent === 0) {
              // Nada chegou ao lead: a resposta não existiu para ele, então some do histórico.
              await supabase.from('interactions').delete().eq('id', aiRow.id)
            } else {
              // Chegou parte: o histórico (e a memória da IA) fica só com o que foi entregue.
              const delivered = splitIntoBlocks(reply).slice(0, sent).join('\n')
              await supabase.from('interactions').update({
                content: `${delivered}\n[resposta interrompida: atendimento humano assumiu]`,
              }).eq('id', aiRow.id)
            }
            console.log(`[WEBHOOK] resposta interrompida por atendimento humano (${sent}/${total} blocos) — ${phone}`)
          }

          // A cada 2 mensagens do lead, recalcula o resumo de uma linha.
          // Conta o total de mensagens inbound do lead (não a janela de getRecentHistory,
          // que satura e travaria a paridade sempre no mesmo valor).
          const { count: userMessageCount } = await supabase
            .from('interactions')
            .select('*', { count: 'exact', head: true })
            .eq('lead_id', conversation.lead_id)
            .eq('channel', 'whatsapp')
            .eq('direction', 'inbound')

          let latestSummary: string | undefined
          if (userMessageCount !== null && userMessageCount % 2 === 0) {
            const generated = await generateLeadSummary(finalHistory, updatedQualification, personaName)
            if (generated) {
              latestSummary = generated
              leadUpdate.summary = generated
            }
          }

          await supabase.from('leads').update(leadUpdate).eq('id', conversation.lead_id)

          // Se handoff: mensagem fixa de encerramento + notifica a Camila.
          // Se um humano já assumiu no meio da resposta, nada disso faz sentido.
          if (shouldHandoff && !interrupted) {
            await sendText(phone, 'Obrigado pelo contato, em breve vamos falar com você')

            await supabase.from('leads').update({ stage_id: 2 }).eq('id', conversation.lead_id)

            const summary = latestSummary ?? (await generateLeadSummary(finalHistory, updatedQualification, personaName))
            const guidance = await generateHandoffGuidance(finalHistory, updatedQualification, personaName)

            await notifyQualifiedLead(phone, summary, guidance, personaName)
          }
          failures = 0
        } catch (e) {
          // A invocação da mensagem que chegou durante a rodada já saiu na trava:
          // se desistirmos aqui, ninguém responde. Uma nova rodada re-busca o
          // histórico (a mensagem continua pendente porque nada foi gravado).
          if (++failures >= 2) throw e
          console.error(`[WEBHOOK] rodada ${round} falhou — tentando de novo:`, e)
          continue
        }

        // ── Drenagem: o lead escreveu enquanto respondíamos? ──
        // A invocação dessa mensagem bateu na trava e saiu; quem responde é esta.
        const { count: newer, error: newerErr } = await supabase
          .from('interactions')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', conversation.lead_id)
          .eq('channel', 'whatsapp')
          .eq('direction', 'inbound')
          .gt('created_at', answeredUpTo)
        if (newerErr) {
          // Não dá para saber se há pendência: mais uma rodada decide (ela mesma
          // sai em "nenhuma mensagem pendente" se não houver nada). Soltar a trava
          // agora deixaria órfã uma mensagem cuja invocação já saiu.
          console.error('[WEBHOOK] falha ao checar drenagem — fazendo mais uma rodada:', newerErr.message)
          if (++failures >= 2) break
          continue
        }
        if (!newer) break
        if (await isAgentPaused(phone)) {
          console.log('[WEBHOOK] drenagem interrompida: IA pausada — %d mensagens ficam sem resposta da IA', newer)
          break
        }
      }
    } finally {
      // Solta só a própria trava, de forma atômica: se a nossa expirou e outra
      // invocação assumiu, o valor é o arrivalTs dela e não pode ser apagado por nós.
      try {
        await redis.eval(RELEASE_IF_OWNER, 1, lockKey, arrivalTs)
      } catch (e) {
        console.error('[WEBHOOK] falha ao soltar trava de resposta:', e)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
