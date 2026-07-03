// Testa splitIntoBlocks e stripTrailingPeriod, incluindo a remocao do ponto
// final de cada bloco (sem remover "!", "?", "...", "…").
//
// Uso: npx tsx scripts/test-split-blocks.ts

import assert from 'node:assert/strict'
import { splitIntoBlocks, stripTrailingPeriod } from '../lib/uazapi/client'

assert.equal(stripTrailingPeriod('Entendi.'), 'Entendi')
assert.equal(stripTrailingPeriod('Vocês já usam algum sistema?'), 'Vocês já usam algum sistema?')
assert.equal(stripTrailingPeriod('Isso é ótimo!'), 'Isso é ótimo!')
assert.equal(stripTrailingPeriod('Vamos ver...'), 'Vamos ver...')
assert.equal(stripTrailingPeriod('Vamos ver…'), 'Vamos ver…')
assert.equal(stripTrailingPeriod('Sem pontuação'), 'Sem pontuação')

const blocks = splitIntoBlocks(
  'Entendi.\n\nHoje vocês perdem muitos leads por demora no atendimento.'
)
assert.deepEqual(blocks, [
  'Entendi',
  'Hoje vocês perdem muitos leads por demora no atendimento',
])

console.log('OK - todos os testes de splitIntoBlocks/stripTrailingPeriod passaram')
