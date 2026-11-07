# Padrão de imagem da plataforma LOOP e loja AKITEMM — 07/11/2026

## Objetivo
Preservar o esqueleto de todas as telas aprovadas, mantendo fotos nítidas em telas de alta densidade de pixels (celular e PC), sem esticar nem cortar produto para preencher espaços. AKITEMM é a loja do LOOP; não se cria frontend paralelo.

## Resoluções de referência na produção de material
- **Foto de produto físico ou capa de curso/PDF:** preferir **1200 × 1200 pixels** ou mais, enquadramento limpo, sem texto minúsculo nem marca d'água, JPG/WebP; PNG para arte com transparência.
- **Novidades / chamada editorial:** preferir pelo menos **1200 pixels no lado maior** e pelo menos ~**675 pixels no menor**. Fotos verticais, horizontais ou quadradas são permitidas e devem preservar sua proporção, sem esticamento.
- **Banners amplos:** criar a arte-mestre em **1600 × 900** ou **1920 × 1080 pixels**, com margens seguras para PC e celular. Não posicionar informações essenciais só nas extremidades.
- **Avatar:** mestre quadrada de **512 × 512 pixels** ou superior.
- **Capturas de referência:** usar as capturas verdadeiras do PC/celular sem ampliar screenshots de baixa resolução para simular maior qualidade.
- **Compressão:** priorizar WebP/JPEG bem exportados (qualidade de referência ~85%, adaptável), PNG para marcas transparentes. Resolução em pixels e fidelidade da fonte importam mais que o tamanho do arquivo isoladamente.

## Implementado na homologação
1. Na área de **Novidades** do próprio administrador, imagens aceitas até **4 MB**, formatos PNG/JPEG/WebP. O servidor examina metadados de resolução e rejeita dimensões incoerentes (maior lado >12.000 pixels ou mais de 40 MP); a interface analisa os pixels ao selecionar o arquivo e exibe a dimensão e o aviso de qualidade **antes de enviar**.
2. Não há aumento artificial de pixels nem perda por recompressão no servidor: os bytes recebidos são conservados. A lista administrativa registra dimensões e aviso quando estiver abaixo do recomendado. Publicações anteriores pequenas são preservadas para não quebrar conteúdo aprovado: **aviso não é garantia de qualidade**. Substituir a foto de origem quando desfocada.
3. Imagens de produtos, carrinho, detalhe e Novidades usam CSS para **não ampliar** miniaturas pequenas nem cortar a imagem. As imagens novas usam decodificação assíncrona e, em Novidades, as dimensões do arquivo ajudam a evitar saltos do layout.
4. A mudança é limitada à imagem e sua validação; não altera botões, estrutura do catálogo, identidade visual, motor de posições ou contas. API de imagem é operador exclusivo, não abre pagamentos.
5. Outros campos do sistema (banners, fotos de avaliação, galeria de fornecedores, avatars) mantêm suas validações próprias. Este bloco **não instalou CDN, não criou automaticamente versões WebP/srcset nem substituiu fotos de baixa resolução pré-existentes**; esses recursos exigem originais adequados e política de armazenamento/derivados por tipo de mídia.

## Validação
Testes do módulo `test/novidades-loja-candidato.test.js`, navegação real PC/celular do workflow de prévia e pre-deploy da homologação. Anexar o URL do CI e do Railway concluídos no HUB antes de declarar rollout validado.
