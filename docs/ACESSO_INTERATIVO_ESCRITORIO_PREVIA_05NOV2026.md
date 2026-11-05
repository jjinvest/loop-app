# AKITEMM — Primeiro acesso interativo ao Escritório online (05/11/2026)

## Ambiente de visita do proprietário
- Endereço: https://akitemm-escritorio-preview-homologacao.up.railway.app/escritorio
- Cliente / cadastro fictício: https://akitemm-escritorio-preview-homologacao.up.railway.app/minha-conta
- Vitrine de ensaio: https://akitemm-escritorio-preview-homologacao.up.railway.app/loja
- Railway: projeto `loop-asaas-homologacao`, ambiente `homologacao`, serviço **`akitemm-escritorio-preview`**.
- Banco SQLite **separado e persistente** em volume próprio `/dados-preview`, capacidade inicial 1 GB. Recursos do serviço limitados a 0,25 vCPU e 0,5 GB memória.
- Serviço anterior `asaas-webhook-staging` não foi alterado; armazenamento offsite `loop-backup-offsite` continua separado.
- Fonte pinada no commit de preview `eda1500f57adf228c94638a8836d92ede1bafa24` da branch `feature/escritorio-preview-protegido-20261105`. PR #1 original permanece DRAFT, sem merge.

## Acesso e salvaguardas
- Gateway HTTPS com senha de visita privada, cookie assinado HttpOnly/Secure/SameSite=Strict e fechamento de origem. **Não colocar senha no GitHub nem em arquivos públicos.**
- Acesso ao Administrador é de proprietário/testador; a credencial real de operador só existe no serviço, nunca no JavaScript do navegador.
- Página do Cliente permite cadastrar conta com **dados fictícios** e testar login, pré-pedido, Meus Pedidos e navegação. Não colocar dados pessoais reais nesta fase.
- Backend candidato permanece **em 127.0.0.1**, protegido por proxy com Host de loopback; no domínio público só o gateway é exposto.
- Endpoints de pagamento, saque e ativação comercial permanecem fechados (HTTP 503). **Nenhuma compra real, PSP comercial, giro de tabuleiro ou pagamento é permitido.** Não apresentar a tela como sistema comercial homologado.
- A mudança de `credentials:'omit'` para `same-origin` aplica-se somente ao JavaScript servido no domínio de preview, para autenticação via cookie do gateway.
- Testes do gateway, cadastro e bloqueios: [GitHub Actions aprovado](https://github.com/jjinvest/loop-app/actions/runs/41943760507), antes da configuração de engine/volume; estado operacional do serviço confirmado online no Railway em 05/11.
- Não há prova de navegação externa real do proprietário; requer abrir em celular/PC e confirmar. Backups offsite **reais do novo volume de preview** ainda não foram executados.

## Próximo corte de produção
- Criar autenticação própria e papéis de Administrador/Cliente, com identidade, consentimento, gestão de sessões, HTTPS e política LGPD de produção.
- Integrar o Escritório definitivo a catálogo/pagamentos/estoque/posição/fila/tabuleiro/contabilidade, mantendo simulação segregada. Prova de PSP real só com autorização e homologação.
- Exigir backup real do banco definitivo e recuperação; revisar modelo comercial, fluxo de caixa, direitos do consumidor e conformidade jurídica antes de aceitar clientes ou pagamentos.
- Não confundir **Escritório online interativo em homologação** com o Marco Zero comercial.
