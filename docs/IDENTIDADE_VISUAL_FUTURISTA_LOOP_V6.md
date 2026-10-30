# LOOP V6 · Identidade visual oficial (primeira versão editável)

Data da proposta: 16/10/2026. O fundador autorizou uma primeira composição criativa completa, com revisão estética posterior. **Futurístico, metálico, chamativo, imersivo, com bordas arredondadas e elementos esféricos.**

## Linguagem visual

- Base da marca: grafite profundo e dourado cromado; contraste alto e reflexos suaves.
- Ações importantes: verde metálico brilhante, bordas arredondadas (pílula), foco visível e área de toque mínima de 44 px.
- Centro: **esfera verde metálica** com halo e reflexo.
- Vagas: orbes douradas com numeração, sendo a **vaga 6** marcada com anel verde, sem alterar a ordem.
- Marcadores do ciclo: exatamente **seis** orbes alternados **roxo metálico → preto metálico → roxo → preto → roxo → preto**. O roxo identifica a parcela normalmente destinada ao participante, o preto representa a parcela da empresa.
- Exceção de titularidade: se o centro pertencer ao LOOP (posição dourada, assumida ou desistente), as parcelas das etapas 1/3/5 seguem ao **caixa das douradas**; a representação de 3 roxas e 3 pretas não altera o roteamento financeiro.
- Posições ativas do próprio usuário: vermelho metálico. Posições pendentes: azul metálico. Posições do LOOP: dourado metálico. Outros participantes: grafite metalizado, sem expor identidade alheia.
- Fila A: amarelo metalizado; Fila B: branco perolado metalizado. A regra 3A/1B não muda.
- Tipografia: sistema operacional, sem fontes externas; títulos em dourado e alto contraste.
- Movimento: interações discretas de foco/hover. O CSS respeita `prefers-reduced-motion` e não depende de JavaScript para renderizar estilos.
- Sem imagens, fontes, analytics ou bibliotecas baixadas da internet; reflexos e cores são gradientes CSS leves.

## Arquitetura da implementação

`public/css/loop-futurista-v6.css` define tokens de metalizados e controles reutilizáveis. O tema está carregado por último, após CSS da página, nos nove pontos de entrada:

1. `public/index.html` — hero, esfera do centro, seis orbes e indicadores do ciclo.
2. `public/produto.html` — produto individual.
3. `src/laboratorio/participante-demo.html` — escritório pessoal com tabuleiro dinâmico de centro + seis vagas, indicadores 3/3 e fila.
4. `src/laboratorio/loja-cliente-demo.html` — vitrine, carrinho e links.
5. `src/laboratorio/financeiro-admin-demo.html` — cofres, cenários, painel douradas.
6. `src/laboratorio/painel-catalogo.html` — produtos/administrador.
7. `src/laboratorio/escritorio-demo.html` — vista do escritório administrativo.
8. `src/laboratorio/cadastro-participantes-demo.html` — cadastros fictícios.
9. `src/laboratorio/convite-cliente-demo.html` — convite/loja/escritório.

A disposição do tabuleiro é 3×3 com centro verde, seis vagas, e duas células de respiro; **o número de assentos não muda com a largura**. Os orbes têm formato circular e usam CSS `aspect-ratio`.

## Testes e prévias visuais

- `test/identidade-visual-futurista-loop-v6.test.js` protege a presença do tema, seis marcadores, cores distintas e `prefers-reduced-motion`.
- `scripts/testar-loja-mobile-browser.js` verifica os principais fluxos do navegador em celular (320, 360, 390, 412), tablet (768) e computador (1024, 1366), gera capturas e verifica limites da tela.
- Fluxos financeiros, geração manual de douradas e posições desistentes continuam exclusivamente em laboratório.
- Capturas de tela ficam nos **artifacts** dos testes do navegador em GitHub Actions, sem dados reais. A página pública poderá ser vista em `/` quando o laboratório for executado localmente.

## Próximas decisões estéticas do idealizador

Esta é uma primeira proposta de aparência. Alterar paleta, profundidade de brilho, tipo das bordas, disposição dos painéis, tamanho das bolas, animações, iconografia e proporção das telas é esperado e deve ocorrer preferencialmente editando os tokens e CSS de `loop-futurista-v6.css`. Mudanças visuais não devem alterar regras monetárias, fila/catraca, autenticação ou direitos das posições.

A plataforma **não está implantada publicamente**. Os fluxos e contas ainda são fictícios; a aparência não valida a operação financeira real nem constitui garantia de ganhos.
