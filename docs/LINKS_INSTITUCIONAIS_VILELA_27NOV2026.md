# Links VILELA — correção de 27/11/2026

## Causa e autorização

O proprietário solicitou explicitamente que os links de indicação do Escritório e da loja VILELA funcionem. A conta existente estava sendo submetida somente ao gate de compra comercial habilitadora, retornando HTTP403. Não foi criada compra para contornar o bloqueio.

## Implementação

- `LOOP_REAL_DIVULGADOR_INSTITUCIONAL=VILELA`, configuração exclusiva do servidor, resolve o ID da conta existente na inicialização. Nick inválido ou inexistente impede a inicialização; sem configuração, o comportamento anterior é preservado.
- A fonte `CANAL_INSTITUCIONAL_AUTORIZADO` libera somente os links desse ID. Não simula pagamento/compra, não concede sessão administrativa, não cria posição, não gera bônus ou crédito.
- Links curtos `/loja/VILELA` e `/escritorio/VILELA`, rota histórica `/convite/loja?ref=VILELA`, endpoint autenticado de divulgação, validação do indicador no cadastro e Meus Links usam a mesma autorização.
- O redirecionamento preserva `ref=vilela`; a rota histórica mantém a capitalização já utilizada. O cadastro resolve o indicador real e conserva o vínculo imutável existente.
- Demais titulares continuam sujeitos às regras comerciais vigentes. Cadastro público, CAPTCHA, CPF/termos, confirmações comerciais/financeiras e START não são liberados por esta configuração.

## Provas

Testes HTTP e SQLite isolados em `test/indicacoes-cadastro-real.test.js`: os dois links e a rota histórica redirecionam, os destinos abrem HTTP200, outro titular sem habilitação continua HTTP403, nick inexistente HTTP404, e cadastro por referência fica vinculado ao titular institucional. Motor permanece sem posições e sem giros.

`test/direitos-divulgacao-loop-sqlite.test.js`: habilitação exclusiva do ID autorizado, compraHabilitadoraConfirmada=false, nenhuma comissão ou saldo liberado e Meus Links copia os dois endereços. Fonte desconhecida permanece bloqueada. Nenhuma conta de teste foi criada no ambiente publicado.

Visual, relógio, lote de mil posições, bancos e livros financeiros preservados. Publicação segue a autorização do proprietário de testar, aprovar e publicar nesta conversa. Conferir resultados do CI e deployment antes de declarar entrega.
