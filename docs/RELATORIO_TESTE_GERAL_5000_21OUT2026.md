# LOOP 3.0 — Teste de 5.000 compradores e jornada do cliente
Data: 21/10/2026 · Ambiente: laboratório, sem produção ou dinheiro real

## Objetivo
Verificar, em simulação isolada do motor V6, desde ZERO clientes:
- Fundador colocado na posição central de forma especial, não como compra.
- Exatamente 5.000 compradores novos, cada um comprando UMA unidade: 2.500 PDF R$250 e 2.500 produto físico R$190, em alternância. Compra física simples NÃO gera posição pela regra vigente de R$250.
- Evolução 3A:1B com posições em fila A (amarela) e B (branca), primeira entrada pela A ou pela B, indicações válidas individualmente ligadas à posição própria.
- Vinte posições inicialmente azuis sem aceite, convertidas em douradas apenas na passagem da vaga 6, sem posicionamento artificial no tabuleiro.
- Motor interrompe ao 5.000º comprador; não gera compradores ou posições adicionais.
- Verificar conservação de posições, ausência de IDs duplicados, ciclo de seis eventos, rotação, catraca pausada, eventos restantes e roteamento referencial dos cofres.

## Status confirmado do stress de motor
**PASSOU**: testes automatizados com as quatro variações, CI “Testes do LOOP” do commit de código e testes com parâmetros de 5 mil (verificar novamente CI corrente se houver alterações subsequentes).

| Cenário | Fila A | Fila B | Convites validados | Chamadas da A para vaga 6 | Chamadas da B |
|---|---:|---:|---:|---:|---:|
| A primeiro, indicações altas | 265 | 1.813 | 1.238 | 309 | 107 |
| A primeiro, indicações moderadas | 4 | 2.074 | 489 | 305 | 111 |
| B primeiro, indicações altas | 265 | 1.813 | 1.237 | 309 | 107 |
| B primeiro, indicações moderadas | 4 | 2.074 | 488 | 305 | 111 |

Em todos: 2.500 posições PDF + 1 fundador = 2.501 posições. 416 ciclos concluídos (fundador 1 + clientes 395 + douradas 20), 7 no tabuleiro, 2.078 nas filas, total 416 + 7 + 2.078 = 2.501 posições conservadas. Quatro vendas/eventos PDF já registrados no próximo ciclo, faltam dois. Há 20 conversões históricas azul→dourada, todas mediante entrada na vaga 6; 0 douradas remanescentes no tabuleiro na parada da simulação porque completaram o ciclo. Não confundir vinte eventos históricos com vinte ocupantes simultâneos.

## Financeiro REFERENCIAL, jamais caixa real

| Item | Montante hipotético |
|---|---:|
| 2.500 PDFs × R$250 | R$625.000 |
| 2.500 produtos físicos × R$190 | R$475.000 |
| Receita bruta TOTAL dos 5.000 pedidos | **R$1.100.000** |
| 416×6=2.496 eventos PDF roteados em ciclos completos | R$624.000 |
| Cofre LOOP_CENTRO (centros de clientes + fundador) | R$297.000 |
| Cofre LOOP_DOURADAS (20 centros dourados × 3 etapas × R$250) | R$15.000 |
| Cofre LOOP_ESQUERDA | R$208.000 |
| Cofre LOOP_DIREITA | R$104.000 |
| 4 eventos PDF ainda em ciclo parcial | R$1.000 |

Os cofres totalizam R$624.000 nos ciclos completos; 4 eventos ficam pendentes em referência, somando R$625.000 relativos a PDFs. Os R$475.000 dos produtos físicos **NÃO** são alocados ao motor. Custos de produtos, fornecedor, logística, taxas, tributos, chargebacks/estornos e margens **não foram informados**, portanto margem/lucro/caixa líquido **não podem ser inferidos**. Bônus de indicação opcionais projetados a 10% do PDF indicado variam por intensidade (hipótese, não pagamento): A alta R$30.950; B alta R$30.925; A moderada R$12.225; B moderada R$12.200. É necessário definir origem econômica/contábil dessas bonificações sem dupla contagem.

## Testes de telas/clientes (camada distinta, não cinco mil navegadores)
O stress de 5.000 é executado no motor; **as jornadas de navegador são cenários representativos**, não o acesso simultâneo de 5.000 dispositivos. Código de testes de navegador existente: \`scripts/testar-loja-mobile-browser.js\` (Playwright/Chromium) e workflow \`.github/workflows/mobile-loop.yml\`.

São exercitados: navegação Escritório Virtual, Tabuleiro, Minhas Posições, Minha Rede, Financeiro, Meu Perfil, barra lateral e links para AKITEMM; zero posições / 0/6, compra qualificada / 1/6 e trocas na régua 1 a 6, login, alterar senha apenas no Perfil, anúncios da loja, carrinho, pedidos, confirmação simulada de compra, CPF/termos individuais, indicação e atribuição à posição, consulta do histórico, notificações, avaliação/moderação, responsividade mobile/desktop. A suíte inclui teste extra de compra unitária de físico R$190 sem posição e PDF R$250 com posição, repetição de mudança de abas e saque **bloqueado** se não existe saldo liquidado.

Saques positivos simulados, taxas mínimas, verificação de saldo individual, idempotência/isolamento e reserva única são cobertos por testes HTTP/domínio: \`test/saques-v6-http-sessao-privacidade-integridade.test.js\`, \`test/solicitacoes-saque-ficticio-idempotente.test.js\`, \`test/saque-25-taxa-3-por-cento-loop.test.js\`. Esses não constituem prova de pagamento bancário real.

**RESULTADO FINAL DE NAVEGADOR: APROVADO.** A suíte Playwright/Chromium passou no workflow **39660816834** (job **119433005839**). A medição responsiva passou após esperar a transição do seletor terminar, sem alterar o layout; os nicks de teste foram corrigidos para respeitar letras 1–9; o checkout físico passou após cadastrar endereço de entrega de teste (obrigatório por regra); e o teste corrigiu a leitura duplicada da resposta HTTP sem modificar o aplicativo. Fluxos adicionados e validados: compra unitária física de R$190 → **0 posições**; PDF de R$250 → **1 posição**; **10 acessos de abas por conta**, perfil/alteração de senha visíveis somente onde previstos, saque de posições bloqueado sem saldo liquidado. Responsividade validada em **320, 360, 390, 412, 768, 1024, 1366 pixels**. Resultado registrado no log com marcador \`LOOP_JORNADAS_CLIENTES\` e \`MOBILE_LOOP_RESULTADO.status=APROVADO\`. A bateria completa de testes de API/domínio passou no workflow **39660816955**. A aprovação do laboratório **não** equivale a produção ou 5.000 navegadores simultâneos.

## Código e segurança
- Fonte dos 4 cenários: \`scripts/simular-1000-compradores-loop-v6.js\` parametrizado para \`totalCompradores: 5000\`; regressão em \`test/loop-v6-cinco-mil-jornadas.test.js\`. Teste de mil continua vigente.
- Sem banco/PSP ou saque real na simulação; nenhuma alteração de regra de motor, migração, tela aprovada ou dados de clientes. GitHub branch \`fix/teste-escrita-catraca-20261014\`, PR rascunho; sem deploy/merge.
- Próximo passo: conferir workflow visual, tratar eventual erro de UI e, mais adiante, repetir stress conjunto em SQLite/API autenticada para volumes grandes. A simulação de motor sozinha não certifica produção, antifraude, PSP, concorrência de milhares de sessões ou disponibilidade de infraestrutura.
