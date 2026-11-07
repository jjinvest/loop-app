# Convergência PSP → banco → fornecedores (leitura) — 07/11/2026

## O que foi implementado

O módulo `src/producao/conciliacao-financeira-externa-readonly.js` recebe dados normalizados de três fontes *separadas* (registro PSP, crédito na conta bancária e comprovantes por fornecedor) e compara cada linha com os pedidos e custos **congelados no mesmo SQLite** do comercial.

O comparador não recebe nem solicita chaves, não faz HTTP, POST, pagamento, estorno, movimentação de cofres ou alterações SQL. Só consulta tabelas existentes; se faltarem tabelas, interrompe. O mecanismo **não foi ligado a provedores externos**: os extratos recebidos são declarados pelo chamador e ainda não têm autenticidade criptográfica nem proveniência comprovadas.

### Regras de conferência

- Pedido aprovado precisa ter pagamento PSP do **mesmo pedido e mesmo valor**, não apenas aviso webhook. PSP reverso, estornado, ausente ou duplicado gera divergência.
- Desconta **taxa informada pelo PSP** do bruto, agrupando os líquidos por `liquidacaoId`, comparando com a soma dos créditos reais declarados no extrato bancário para aquele lote. Isso impede exigir erroneamente um crédito bancário separado por pedido ou somar o mesmo crédito duas vezes. Identificadores duplicados ou créditos órfãos geram alerta.
- Para cada distribuidor do pedido, confere custo e quantidade congelados e verifica se há remessa na outbox. `INDETERMINADO` exige revisão manual, sem reenvio.
- Documento fiscal e comprovante de pagamento ao fornecedor são **fontes distintas** do valor cobrado ao cliente. Cada `pedidoId + fornecedorId` admite somente um comprovante declarado neste modelo; duplicações, custos pagos divergentes e notas ausentes precisam de revisão.
- Nenhum preço de custo congelado representa despesa paga. Vários distribuidores podem aparecer na mesma venda, mas o Pix é único; a outbox de cada distribuidor **não** significa outro Pix.
- Faz leitura de **todos** os pedidos pela iteração SQLite, sem LIMIT 50/500/5000. A lista demonstrativa de diferenças exibe até 60 registros mas mantém a contagem completa por código; a amostra nunca é tratada como cobertura total.

### Fronteira obrigatória

Mesmo com *zero divergências aritméticas*, a função retorna `fonteExternaAutenticada=false`, `extratoBancarioVerificadoComBanco=false`, `notasFiscaisVerificadas=false`, `conciliacaoRealCertificada=false`, `creditoPosicoesPermitido=false` e `saquePermitido=false`. Dados passados por memória ou CSV são **insuficientes** para provar origem externa, liquidação, tributos ou solvência.

Testes: `test/conciliacao-financeira-externa-readonly.test.js` valida lote único de PSP com dois pedidos, três remessas, identidade de pedidos, inversão/reverso PSP, extratos duplicados, custos declarados diferentes, estado de remessa desconhecido e leitura não mutável. O workflow de identidade real recebe esta suíte.

## Falta para conciliação comercial real

1. Conectar **provedor PSP autorizado** (Asaas PRODUÇÃO separado de Sandbox) e obter sua prova autenticada de recebimento, estorno, taxa e lote/repasse. O Sandbox pode validar integração, nunca dinheiro.
2. Conectar extrato da **conta bancária titular da empresa** por canal autorizado/read-only, verificar titularidade, identificar repasses e correlacionar lotes, devoluções, taxas e ajustes. Não assumir que qualquer crédito equivale a pagamento do LOOP.
3. Integrar comprovantes verdadeiros dos distribuidores, fretes, documentos fiscais e obrigações com contabilista. Resolver status INDETERMINADO da outbox sem reenvio automático.
4. Acrescentar captura de proveniência externa, auditoria HMAC e snapshot de fechamento imutável, conciliação de saques, impostos, reservas, despesas, chargebacks e regras de caixa aprovadas por revisão jurídica/contábil. Nada disso é certificado pelos testes atuais.

**Sem aprovação de lançamento comercial, saque, benefício, posição ou dinheiro real; PR #1 continua DRAFT; telas aprovadas intactas.** Próximo bloco útil é conectar os adapters de leitura aos provedores reais quando houver credenciais, contratos e autorização, preservando a trava financeira.


## Continuidade 257 — conferir remessas fora do caminho feliz (07/11/2026)

Lacuna corrigida: a auditoria financeira anterior verificava custo e pagamento dos pedidos aprovados, mas podia omitir remessa de fornecedor adicional sem custo congelado, remessa iniciada para pedido nao aprovado, pagamento_id/valor incorretos na outbox, remessa marcada ENVIADO sem ID do parceiro e comprovante PAGO mesmo com outbox ainda PENDENTE. O comparador read-only agora verifica a outbox de TODOS os pedidos e confronta status, referencia PSP, valor congelado e fornecedor, alem de distinguir PAGO no extrato de ENVIADO no parceiro. Falha de esquema minimo do SQLite impede tratar leitura parcial como extrato limpo. A amostra de alertas segue limitada, mas totais continuam sem limite de linhas. Validacao dedicada testa essas divergencias sem HTTP nem SQL de escrita.

Este bloco fecha somente falsos negativos no auditor declarativo. Nenhuma origem PSP/bancaria/fornecedor foi autenticada, nenhum dinheiro foi conciliado e conciliacaoRealCertificada segue FALSE. Nova evidencia de CI deve ser conferida antes de marcar a implementacao como comprovada.
