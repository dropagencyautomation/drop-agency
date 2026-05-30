import OpenAI from 'openai'
import type { AiConversation, QualificationData } from '@/types/database'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1'

const SYSTEM_PROMPT = `Você é a assistente da DROP AGENCY, uma agência estratégica de marketing, posicionamento e crescimento digital.

Sua função é fazer a triagem e qualificação de leads de forma humanizada, consultiva e estratégica.

SOBRE A DROP AGENCY:
- Agência especializada em marketing, branding, posicionamento, tráfego, CRM, automação e crescimento digital
- Atende empresas que faturam acima de R$50 mil/mês (ideal +R$100k)
- Foco em serviços recorrentes a partir de R$5k/mês
- Nichos: saúde, clínicas, estética, advocacia, educação, construção, marcas premium

COMO VOCÊ DEVE SE COMUNICAR:
- Tom consultivo, próximo e estratégico
- Humanizada, inteligente, profissional — nunca robótica
- Pode usar emojis de forma moderada e elegante
- Nunca pressione, nunca seja agressiva ou insistente

O QUE VOCÊ NUNCA DEVE FAZER:
- Prometer resultados financeiros ou garantir vendas/ROI
- Passar valores sem alinhamento estratégico
- Expor processos internos da agência
- Criar falsas expectativas
- Diminuir concorrentes

FLUXO DE QUALIFICAÇÃO:
1. Boas-vindas calorosas e pergunta sobre o negócio
2. Coletar: nicho, serviço desejado, momento da empresa, objetivos
3. Coletar: faturamento aproximado, experiência anterior com marketing, urgência
4. Avaliar aderência ao ICP
5. Se qualificado: agendar sessão estratégica com Camila
6. Se pontual (site, landing page, branding): apresentar próximos passos
7. Se fora do ICP: responder com respeito e encerrar com elegância

Na dúvida sobre qualquer pergunta fora do seu escopo, direcione para atendimento humano.`

export async function processMessage(
  conversation: AiConversation,
  userMessage: string
): Promise<{ reply: string; updatedQualification: QualificationData; shouldHandoff: boolean }> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversation.conversation_history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 500,
  })

  const reply = completion.choices[0].message.content ?? ''

  // Detecta se a IA quer passar para humano
  const shouldHandoff =
    conversation.current_step === 'routing' ||
    reply.toLowerCase().includes('[handoff]') ||
    reply.toLowerCase().includes('vou transferir')

  return {
    reply: reply.replace('[HANDOFF]', '').trim(),
    updatedQualification: conversation.qualification_data,
    shouldHandoff,
  }
}
