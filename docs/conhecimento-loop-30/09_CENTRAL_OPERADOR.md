# 09 — Central do Operador

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

Operador administra catálogo, Minha Equipe, parâmetros e consultas financeiras com sessão/papel próprios. A visão Cliente/Operador não concede autorização por esconder/mostrar elementos: verificar no servidor.

Salvar agenda percorre interface-admin-comercial-client → API/OperacaoCatracaAdminSQLite → persistência → projeção/visor. Rascunho não pode ser sobrescrito por polling; sucesso só depois de confirmar a gravação. Próxima luz e horário salvo são compartilhados; previsão não executa evento.

START/Pausar comanda a Distribuição; nunca governa a existência das filas, que respondem às vendas qualificadas. Não pressionar START nem abrir porteira para conferir um painel. A bancada de 1000 usa banco separado e rota GET/POST /api/admin/loop/testes-modulos, escrita com CSRF; o nome da rota não autoriza criar conta fictícia comercial.

Cofres, Financeiro e Distribuição leem a mesma projeção do livro conforme procedência. Comissões de bônus mostra devido/pago/a pagar; total pago exclui pendências e transferências internas. Releitura não é liquidação. Controles de douradas manuais dependem do operador, cobertura e trilha; não criar automaticamente nesta missão.

Nesta preservação nenhum comando funcional foi alterado. Inventário conserva nomes de variáveis e comandos de inicialização, sem segredos; para nova publicação será necessária autorização explícita e revalidação do estado.

## Fontes integrais preservadas

- [INTEGRACAO_INTERNA_START_VENDAS_RELOGIO_26 NOV2026.md](../INTEGRACAO_INTERNA_START_VENDAS_RELOGIO_26NOV2026.md)
- [BONUS_CONFIRMACAO_RESERVA_26 NOV2026.md](../BONUS_CONFIRMACAO_RESERVA_26NOV2026.md)
- [Código: src/producao/interface-admin-comercial-client.js](../../src/producao/interface-admin-comercial-client.js)
- [Código: src/producao/gateway-admin-comercial.js](../../src/producao/gateway-admin-comercial.js)
- [Código: src/producao/operacao-catraca-admin-sqlite.js](../../src/producao/operacao-catraca-admin-sqlite.js)
- [Código: src/producao/interface-aprovada-contas.js](../../src/producao/interface-aprovada-contas.js)

[Voltar ao índice geral](README.md).
