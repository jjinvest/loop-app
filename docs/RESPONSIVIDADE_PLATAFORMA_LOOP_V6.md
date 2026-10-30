# LOOP V6 — Responsividade da plataforma

## Premissa de produto

O LOOP é **uma plataforma web responsiva**: os módulos acessados no computador e no celular compartilham o mesmo back-end, controle de sessões de laboratório e regras de filas e cofres. Não mantemos uma plataforma móvel com regras distintas do computador.

## Superfícies adaptadas

| Superfície | Celular | Computador | Regra importante |
|---|---|---|---|
| Apresentação pública `/` | Tabuleiro escalável 3×3, centro + seis | Tabuleiro maior, mesmo conteúdo | Vaga 6 e seis eventos |
| Vitrine e carrinho `/laboratorio/loja` | Cartões fluidos, ações largas, carrinho em duas colunas | Catálogo em múltiplas colunas | Mesmos produtos, preços e termos |
| Escritório `/laboratorio/participante` | Resumo 2 colunas, tabuleiro 3×3, filtros touch | Resumo 4 colunas e filas lado a lado | Mesma conta e posições |
| Administração financeira | Formulários e cofres em 1 coluna, botão douradas largo | Cofres e indicadores em múltiplas colunas | Mesmas permissões e lançamentos |
| Catálogo administrativo | Formulários e ações empilhados | Formulário e itens lado a lado | Mesma edição de preços |
| Outros painéis admin | Cartões adaptáveis | Colunas múltiplas | Sem atalhos de privilégios |
| Página de produto | Imagem e dados empilhados | Imagem e dados lado a lado | Não há checkout real |

CSS localizado em `public/css/style.css`, `src/laboratorio/participante-demo.css`, `loja-cliente-demo.css`, `financeiro-admin-demo.css`, `painel-catalogo.css` e `escritorio-demo.css`.

## Teste real de navegador

`scripts/testar-loja-mobile-browser.js` agora valida um conjunto único de jornadas para celular e computador:

- Device com touch em 320, 360, 390, 412 e tablet em 768 pixels.
- Contexto desktop sem emulação de touch em 768, 1024 e 1366 pixels.
- Inexistência de rolagem horizontal e de controles interativos parcialmente fora da viewport.
- Seis vagas + centro na página pública e no Escritório Virtual.
- Entrada na conta fictícia, compra de laboratório de R$ 250, ativação e atualização de cores azul/vermelho.
- Interface administrativa financeira, botão de criação dourada e histórico, em ambos formatos.
- Páginas pública, produto, catálogo administrativo, contas demo e escritório administrativo.
- Capturas de tela armazenadas como artefatos da CI por período limitado. **Não são capturas de usuários reais.**

A integração roda em GitHub Actions na configuração `.github/workflows/mobile-loop.yml`, cujo nome de exibição é **LOOP - Navegador celular e computador**.

## Limitações

Os testes verificam Chromium e dimensões de viewport, não equivalem a homologação em todos os modelos de Android/iPhone, todos os navegadores, recursos de acessibilidade, conexões lentas ou compatibilidade de produção. Antes de lançamento público devem ser executados ensaios em dispositivos reais e navegadores Safari, Chrome, Firefox e Edge, testes de teclado/leitor de tela e avaliações legais, de segurança e de carga.

A experiência de interface é comum aos dispositivos, mas o ambiente administrativo atual é **apenas local em 127.0.0.1**: outros aparelhos da rede não acessam esse servidor como se fosse a plataforma publicada. Publicar uma aplicação real exige infraestrutura e controles de produção próprios.
