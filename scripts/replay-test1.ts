// Reexecuta o agente real (lib/openai/agent.ts) contra as falas da lead
// no "Teste 1" (transcrição de 29/06/2026, médica de nutrologia), turno a turno,
// para comparar a resposta do agente retreinado com a resposta original do teste.
//
// Uso: npx tsx scripts/replay-test1.ts
// Requer OPENAI_API_KEY em drop-agency/.env.local

import 'dotenv/config'
import { processMessage, computeLeadScore } from '../lib/openai/agent'
import type { AiConversation } from '../types/database'

const LEAD_MESSAGES = [
  'Oiii\ntudo bem?',
  'Sou médica e tenho uma clínica de nutrologia\ntenho interesse em saber como funciona a parte de social media e anúncios',
  'quero captar mais pacientes e melhorar a conversão no whatsapp, pq minhas campanhas atuais estão trazendo somente leads desqualificados',
  'invisto há 5 meses… mas quero saber os valores dos serviços de vocês e como funciona...\nme explica melhor?',
  'quais são os valores para eu criar uma landing page também?',
  'qual seria o passo a passo e condições de pagamento?',
  'quais são os meios de pagamento?',
  'e se eu não gostar do resultado da entrega?',
  'e como podemos fazer para agendar uma reunião?',
  'me passe 3 opções de dias e horários',
  'e vocês já tiveram clientes insatisfeitos?',
  'e vocês poderiam me enviar referências e depoimentos de clientes?',
]

async function main() {
  let conversation: AiConversation = {
    id: 'replay-test1',
    lead_id: 'replay-test1-lead',
    whatsapp_number: '000000000',
    conversation_history: [],
    qualification_data: {},
    current_step: 'greeting',
    is_active: true,
    human_takeover: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  for (const [i, userMessage] of LEAD_MESSAGES.entries()) {
    const { reply, replyChunks, updatedQualification, shouldHandoff } = await processMessage(
      conversation,
      userMessage
    )

    console.log(`\n=== Turno ${i + 1} ===`)
    console.log(`LEAD: ${userMessage}`)
    console.log(`AGENTE (${replyChunks.length} bloco(s)):`)
    for (const chunk of replyChunks) console.log(`  > ${chunk}`)
    if (shouldHandoff) console.log('  [HANDOFF acionado]')

    conversation = {
      ...conversation,
      conversation_history: [
        ...conversation.conversation_history,
        { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ],
      qualification_data: updatedQualification,
      human_takeover: shouldHandoff,
    }

    if (shouldHandoff) {
      const { score, profile } = computeLeadScore(updatedQualification)
      console.log('\n--- Resumo final de qualificação ---')
      console.log(JSON.stringify(updatedQualification, null, 2))
      console.log(`score: ${score} | profile: ${profile}`)
      break
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
