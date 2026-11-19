# LOOP 3.0 / AKITEMM — Segurança da BASE REAL (19/11/2026)

## Fonte da verdade, sem misturar com o ORIGINAL
Existem apenas duas referências: (1) ORIGINAL aspiracional (antigas fotos, a preservar como história), e (2) REAL que já serve os escritórios e a loja, base única desta trava. A antiga relação de 24 HTML/CSS NÃO corresponde a 24 imagens aprovadas e NÃO determina o visual correto do REAL. Nenhuma tela foi reconstruída ou modificada por esta implantação de controle.

## Identificação objetiva do REAL capturado
- Repositório GitHub: jjinvest/loop-app
- Branch ativa dos serviços: feature/unificar-escritorio-real-20261105.
- Serviço Railway loop-identidade-real: commit bd1cd75f6f52cc0aa0d19436e03b8e533564595d; deploy 8e3ca92f-c9fb-493f-b102-ed5ce18bc858 confirmado SUCCESS em 19/11/2026.
- Serviço público Railway akitemm-escritorio-preview (nome legado, mas Dockerfile.public-real e gateway real): commit 1bc26e9a1a6765ed5a4ce44bce7d149d20ae358c; deploy b5bfbcf0-583a-4e90-b077-63083bf5051e SUCCESS. Os três arquivos da imagem Docker pública são idênticos (Git blob SHA) nos dois commits.
- **Fonte de verdade de baseline do REAL:** docs/TRAVA_BASE_REAL_ATUAL_20261119.json, criado a partir da árvore integral do commit do serviço de identidade real. Não usar os 24 arquivos históricos como versão a restaurar.

## Funcionamento da trava
- Verificador: scripts/trava-base-real.js.
- Testes que provam falha fechada: test/trava-base-real.test.js.
- GitHub Actions: .github/workflows/trava-base-real.yml.
- Protege toda a listagem de src/, scripts/, public/, test/, .github/workflows/ e entradas de build package.json, package-lock.json, Dockerfile.preview, Dockerfile.public-real, .gitignore e .dockerignore.
- Divergência de conteúdo, arquivo novo, excluído ou symlink causa erro TRAVA_REAL_ALTERACAO_NAO_AUTORIZADA e falha o CI.
- O verificador e o manifesto devem ter fingerprints fixas FORA do GitHub em cada preDeployCommand Railway; alterações simultâneas do código e do manifesto não podem passar alterando apenas o repositório.
- Deixar os três arquivos de guarda novos fora do próprio inventário inicial evita ciclo de hash; sua integridade depende da âncora externa e do controle de acesso à configuração.
- Banco SQLite, dados de posições e filas, pedidos, fotos enviadas por operador, saldo e mídias variam legitimamente durante o uso; proteção por hash do código NÃO substitui autenticação, registros contábeis idempotentes, trilha de auditoria, backups e testes de invariantes.

## Atualizações legítimas sem perder as áreas já aprovadas
1. Proprietário autoriza expressamente alteração de trecho e comportamento específico.
2. Corrigir SOMENTE arquivos autorizados; conferir diffs e testes de regressão REAL (PC/celular, catraca, fila, posição, caixa, operador, identidade e loja), com provas da funcionalidade afetada.
3. Se aprovado, atualizar SOMENTE as entradas impactadas no manifesto, preservando todas as demais entradas e contexto. Em mudança de arquivo novo/removido, exigir aprovação explícita.
4. Gerar fingerprint da nova versão do manifesto e, sob controle do proprietário, atualizar a âncora externa Railway antes de ativar a nova revisão. Exigir status verde de GitHub Actions e garantir rollback do código. Nunca atualizar hashes automaticamente para mascarar alterações.
5. Não alterar configuração de PSP, credenciais, saques, dados de clientes ou interface por causa da trava.

## Auditoria independente para outra IA
Primeiro validar SHA de cada fonte e os dois deployments indicados. Em um checkout Node 24, executar:
- node scripts/trava-base-real.js
- node --test test/trava-base-real.test.js
- node --test --test-concurrency=4
Auditar se os preDeployCommands dos dois serviços Railway possuem e executam as âncoras fixas do verificador e manifesto. Conferir os status checks e regras reais da branch GitHub, e revisão humana obrigatória. Auditar interface em navegador PC e celular a partir do conteúdo realmente servido, não de CSS antigo. Confirmar que fila 3A:1B, limite 10/2, catraca 6 luzes/centro, caixa segregado, idempotência, operador e PSP correspondem aos requisitos mais recentes.
Revisar também endpoints públicos, origem de dados, papel do operador, imagens, reintentos, logs auditáveis, jobs periódicos e comportamento de fail-closed com recursos externos indisponíveis.

## Limitações explícitas
Snapshot hash assegura identidade de código, não comprova a aparência desejada nem correção funcional intrínseca. GitHub Actions sozinho não impede push direto sem proteção real de branch. O predeploy Railway deve falhar ao detectar qualquer mudança indevida; a conta que pode alterar a configuração Railway deve ser protegida por permissões/MFA. A proteção do repositório, do runtime e do banco exige controles em camadas e auditoria independente; jamais afirmar risco zero.

## Ajuste operacional pontual identificado pelo gate (19/11/2026)
A sonda privada do gateway ainda pressupunha HTTP 401 para /loja, apesar de o REAL já publicar a vitrine HTTP 200 (sem autenticar pedido ou financeiro). Corrigida SOMENTE a sonda e adicionadas confirmações de que pedidos, estado privado e financeiro continuam HTTP 401 sem sessão. Código real da loja/operador não foi alterado. Esse desvio é capturado por teste de integração do gateway no workflow de proteção. O snapshot foi atualizado somente para o arquivo da sonda, antes/depois documentados no manifesto. A correção só pode ir ao Railway depois da revisão das provas da nova branch.

## Continuidade — mensagens de erro no REAL (19/11/2026)
Toda acao que falhar deve informar a causa e orientar a proxima tentativa, junto ao controle acionado. A regra integra o contrato permanente em docs/CONTRATO_ERROS_REAL_20261119.md. O ajuste pontual tratou foto de perfil e mensagens de login/cadastro, preservando molduras, catraca, filas e financas. O inventario agora possui 835 entradas e os testes de foto e mensagens passam a integrar a verificacao de seguranca. As demais rotas devem seguir o mesmo contrato quando forem revisadas.
