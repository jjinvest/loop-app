# LOOP V6 — Livro de provisões e conciliação de teste

**Somente laboratório local. Este livro NÃO contabiliza dinheiro recebido, não confirma liquidação bancária, não cria saldos disponíveis, não concede direito automático de saque e não valida a legalidade do modelo.**

## O que foi integrado

- Livro imutável em SQLite para cada giro concluído da **ponte de contas cadastradas**.
- Cada ciclo válido V6 documenta exatamente seis compras diferentes, com seus pedidos internos e referências de valor congeladas. Uma compra gerando seis posições ainda constitui apenas UM evento de venda.
- A decisão de giro, o estado do Circuit Break, a trilha de auditoria, os seis eventos e as provisões entram na MESMA transação SQLite. Divergência ou erro cancela o lote inteiro.
- Três parcelas previstas do centro são vinculadas por número de giro e ordem (1, 3, 5) à conta titular, quando ativa. Posições da empresa, desistências e posições vencidas não recebem provisões pessoais.
- A origem do valor previsto para o titular é a referência da sua posição quando comprada, enquanto cada evento documenta também o próprio valor de referência. Se o somatório do centro divergir dos eventos que o financiariam, o painel alerta; não corrige o valor nem libera pagamento.
- Na inicialização, o laboratório confere ciclos V6 existentes e registra os ainda ausentes sem duplicar os já documentados. Histórico V5 de cinco eventos não gera crédito V6.
- Endpoints locais GET /api/admin/circuit-break-v6-demo/ponte/provisoes (admin) e GET /api/laboratorio/participante/minha-conta (sessão do titular) são apenas leitura.
- A tela /admin/circuit-break-v6 mostra a projeção registrada, diferença entre referências, zero comprovantes bancários e zero disponível para saque. O Escritório Vilela mostra somente as parcelas do próprio titular e se coincidem com a projeção.

## Garantias de integridade deste protótipo

1. Comando duplicado não gera novos giros nem duplica provisões.
2. IDs de compra distintos por evento, ciclo e ordem; um mesmo pedido não pode financiar duas provisões.
3. Registros imutáveis protegidos por triggers SQL contra UPDATE e DELETE.
4. Toda gravação usa BEGIN IMMEDIATE e ROLLBACK em falha; os relatórios são obtidos do banco, não de valores informados pelo navegador.
5. Rotas financeiras de produção continuam fechadas. Saldo liquidado, pagamentos reais e saldo de contemplação sacável permanecem R$ 0,00.

## Limites e pendências antes de operação real

- O motor dos 300 giros de 1.800 participantes totalmente artificiais continua segregado do motor de contas cadastradas; o livro registra somente a segunda fonte.
- Os comprovantes de compra aqui são confirmações internas do laboratório, NÃO liquidação de PSP. Não há compensações, recebíveis reais, tratamento completo de chargeback, impostos nem reservas regulatórias.
- É necessária análise jurídica independente da estrutura de bonificações e remuneração ligada a compras/indicações, incluindo eventual risco de pirâmide financeira e proteção ao consumidor. A operação real deve permanecer desabilitada até essa verificação e até evidências de caixa suficiente para as obrigações.
- Qualquer fluxo futuro de saldo ou saque exige reconciliação certificada e uma decisão de arquitetura e compliance separada. Nenhum dos botões deste laboratório pode mudar zero para sacável.

Branch: fix/teste-escrita-catraca-20261014. Pull request #1 continua em rascunho. Não mesclar, publicar ou movimentar dinheiro sem autorização expressa.