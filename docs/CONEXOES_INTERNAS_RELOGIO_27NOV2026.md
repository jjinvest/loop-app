# Conexões internas — correção e validação de 27/11/2026

Base conferida no GitHub: `feature/unificar-escritorio-real-20261105`, `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Trabalho isolado em `fix/conexoes-internas-relogio-20261127`. A branch de preservação não foi modificada nesta missão.

## Falhas corrigidas

1. `OperacaoCatracaAdminSQLite.consultar` suprimia a próxima luz antes da abertura e para datas futuras, mesmo com programação persistida. O cálculo do intervalo também recebia quantidade zero para uma meta em outra data. Agora a consulta conserva a meta salva e prevê o primeiro marco da janela cadastrada sem dar START.
2. A previsão administrativa tinha cálculo distinto da cadência usada pela Distribuição. As duas agora usam `preverProximaLuzDistribuicao`, na política existente. Janela noturna, data, pausa e fechamento são tratados sem emitir eventos.
3. O visor compartilhado recalculava sempre a próxima luz localmente. Agora prioriza o marco recebido da fonte oficial; a interpolação entre consultas permanece uma previsão, sem alterar o motor, livro ou contadores persistidos.
4. Após salvar, o diálogo atualizava horário/meta/revisão, mas esquecia `limiteDiario` no estado confirmado. A leitura de confirmação passa a atualizar esse campo também.

## Fontes e caminhos conferidos

| Conexão | Verificação e limite |
|---|---|
| Salvar → API → SQLite → Operador/Cliente | Mesma `OperacaoCatracaAdminSQLite`, projeção `projetarAgendaTabuleiroCompartilhada`, visor compartilhado; teste novo em SQLite físico reaberto e execução do JS dos dois perfis |
| Compra → classificação → pedido → posição → filas | Testes existentes de pedidos, promoção, integração do motor e HTTP; nenhum adaptador externo liberado |
| CPF/termos/titular → indicação/link/equipe/posições | Regressões existentes de identidade, direitos de divulgação, vínculos, limite e isolamento de contas |
| Filas → porteira → Distribuição | Testes de prioridade 3A:1B, dez posições ativas, duas no tabuleiro, seis eventos, pausa/reinício/replay; execução apenas isolada |
| Caixa/reserva/investimento/douradas/bônus/participação | Livros existentes preservados; devidos, pendentes e pagos separados; teste de bônus exige reserva, mantém conservação e idempotência |
| Eventos/ciclos/dia/24h/histórico | Testes existentes distinguem agenda visual, eventos do motor e livros; pausa e reprogramação não recuperam marcos vencidos |
| Proteção visual | Nenhum HTML/CSS/imagem alterado; manifesto atualizado apenas nos quatro JS autorizados e teste novo, mantendo verificador e âncoras Railway |

## Provas novas

`test/conexoes-internas-relogio-persistido.test.js`:
- Salvar às 08h janela 09–12, cinco centros: próxima luz 09h06, intervalo 360s.
- Fechar e reabrir o SQLite físico preserva todos os campos de leitura e revisão.
- Ambos os perfis recebem a mesma programação e cronômetro.
- Data futura conserva 30 luzes e intervalo; pausa retira previsão; livre não inventa intervalo.
- Previsão e execução compartilham grade noturna; não há próxima luz após o encerramento.
- Nenhum giro ou autorização financeira foi produzido.

## Limites e pendências

- A programação é comum aos perfis; o lote de mil é conferência isolada do operador em `testes-modulos.sqlite`. O cliente comercial lê seus próprios registros em `clientes.sqlite`. Não copiar posições ou saldos desse lote para contas comerciais para aparentar integração.
- Não foi realizada uma varredura manual de cada botão em navegador PC/Android nem uma conferência das alterações no domínio publicado. Os visores novos foram executados em testes JS; não apresentar isso como aceite visual/manual do proprietário.
- A suíte comprova os contratos exercitados, não a inexistência de toda falha em todas as abas. Rastreabilidade produtiva completa continua condicionada às fontes de confirmação já protegidas; integrações externas não foram implementadas nesta missão.
- Merge, publicação, atualização das âncoras Railway e conferência da nova versão no domínio dependem de autorização específica. Não houve START, porteira, movimentação financeira, limpeza de registros ou modificação do lote publicado.

## Resultado efetivamente executado

- `node --test --test-concurrency=4`: **1.777 testes, 1.777 aprovados, zero falhas/cancelamentos/skips**, duração 66.666ms.
- SHA256 do log integral desta execução: `04010610ddf942bd7184aaaa7b9c5ce0baa62ddaf18516d2e6164e1c5292f6ec`. O log local não integra o pacote de preservação anterior.
- `node scripts/trava-base-real.js`: `TRAVA_REAL_BASE_INTEGRA=929`. Verificador não alterado, âncoras externas não modificadas.
- `git diff --check`: sem erro.
- A primeira regressão acusou a diferença entre meta salva futura e luzes aplicáveis hoje; corrigida sem remover a asserção original. Reteste completo aprovado.
- Evidência de renderização nova: execução do JavaScript dos dois perfis em VM com o mesmo DTO; não equivale a teste manual de navegador.

Correção funcional implementada e testada; missão de auditoria manual integral de todas as abas permanece parcialmente concluída. A versão pública ainda não contém estas alterações.

## Atualização após autorização de publicação do proprietário

O proprietário autorizou expressamente merge e publicação nesta conversa depois da validação. PR #147 integrado com código funcional `86a3aeefffabc0975c9018ee32f5ffbf483a77a4`.

- Os seis workflows GitHub do PR terminaram com `success`, incluindo navegação PC/celular, auditoria interna, testes totais, movimentos e proteção visual. Essas provas usam ambientes de CI, não são sessão do proprietário no domínio.
- Railway serviço loop-identidade-real, ambiente homologacao: deployment `b0783800-a0c5-49fa-8011-4efc7e587877`, **SUCCESS em 27/11/2026 às 15:37:52 (Brasília)**. Fonte permanece fixada no código funcional aprovado.
- Âncora externa do manifesto atualizada para `3882bcf8ccc95d19c894942f02d28d6c81c7fc1d`, mantendo a âncora do verificador `1293533137895ef600c5d6847b58beac08e8665a`, todos os testes anteriores e incluindo o teste novo.
- Domínio akitemmloop.com.br: GET /identidade/assets/catraca-visor.js e /identidade/assets/cliente.js HTTP200. Bytes recebidos idênticos aos arquivos locais testados. SHA256 respectivos `62b3c39d92b452bbf6cb9601143f973624b472b65170ea1e60ce7270c3d59532` e `d20b313d50fb7584fd6ffea7d7d834653192073fcdd5e557d4b17f39e759af22`.
- Log pós-reinício comprovou 1.000 posições (100 amarelas,100 douradas,50 azuis,750 brancas),100 indicadores,750 indicações, caixa R$250.000, bônus pendentes R$18.750, bônus pagos e participação zero, eventos/giros zero, catracaAtiva=false, porteiraAberta=false.

Limite da verificação pública: antes da publicação, o endereço personalizado /escritorio/VILELA respondeu HTTP403, `Link ainda não habilitado`, também observado no navegador. /readyz respondeu HTTP503 `CADASTRO_REAL_INATIVO`; /healthz HTTP200. A fonte de inicialização existente permite operação interna com cadastro público fechado. Nenhuma trava de cadastro ou elegibilidade foi removida para contornar esses resultados. Acesso autenticado do proprietário e representação dos seus dados nos painéis publicados ainda não foram exercitados nesta sessão. Não afirmar auditoria manual integral concluída.

Esta atualização documental é posterior ao código implantado; não é nova alteração funcional nem novo deployment.

A gravação documental direta na branch ativa foi recusada pelo GitHub HTTP409: Changes must be made through a pull request; required check impedir-desvio-da-base-real is expected. Evidências finais conservadas nesta branch de revisão, sem contornar as regras do repositório.
