# Cadastro e publicação AKITEMM — 28/11/2026

Base: `4b677a94d7b9666d1dae3675ca081a049660d449`, branch oficial feature/unificar-escritorio-real-20261105. Correção limitada ao cadastro/edição/publicação existentes, conforme missão do proprietário.

## Causas e correções

1. `configurar` lia as chaves comerciais, mas as retornava apenas em chavesRecuperacao. A inicialização consultava `config.chavePedidos`, que era undefined; a composição comercial e a classificação não eram montadas. As mesmas chaves existentes passam também à composição, sem criar substitutas nem liberar PSP. Teste executa a função real e comprova a igualdade das referências usadas pela composição e backup.
2. A leitura de regras apresentava CINZA por padrão e o cliente tratava essa leitura como classificação já gravada. `salvarCor` só dispensa a gravação quando existe regra explícita na mesma cor. A escolha inicial exige seleção do operador. Nenhuma classificação é atribuída para contornar o erro.
3. O guia removia o destaque em qualquer tecla, sem validar. Agora revalida os critérios existentes, mantém amarelo e pulsação até o campo estar correto, abre todas as seções ancestrais e direciona ao próximo pendente. Evita reconstruir o atalho durante blur/change se as pendências não mudaram. Reduced motion mantém borda e desativa animação. Sem alteração da grade, molduras ou demais telas.
4. A API de publicação também exige classificação explicitamente gravada, capa no slot1 e preço válido. As respostas identificam os campos para o mesmo guia. Categoria, marca, descrição, quantidade, promoção e vídeo permanecem opcionais. Importações futuras não escapam desses critérios por chamarem a API diretamente.
5. O rascunho passa a guardar explicitamente o ID do produto criado numa conclusão parcial. Retomada recupera o mesmo registro, fotos e vídeo já enviados, sem inferir propriedade por coincidência de código ou criar novamente. Rascunhos antigos permanecem legíveis. Seleções locais ainda não enviadas ao servidor não são declaradas armazenadas.
6. O botão de salvar dados da edição não enviava o vídeo selecionado. Agora envia o arquivo opcional e valida suas pendências. A reprodução administrativa aceita Range/206 e rejeita intervalos inválidos. Limites existentes mantidos: MP4,30 segundos,20MiB; validação real do MP4 no servidor.

## Provas de navegador em ambiente isolado

Script existente `scripts/validar-operador-primeiro-produto-navegador.js` ampliado, com Chromium Headless Shell instalado da distribuição oficial Playwright. Testes do formulário executados em perfil Android/toque (390px) e contexto de computador (formulário 1280px), usando a interface e APIs reais com SQLite descartável. Não são cadastros de produção.

- Obrigatórios ausentes e classificação vazia apontam campos exatos; nome de um caractere continua inválido; nome válido remove destaque.
- Borda amarela verificada por estilo computado após mover o mouse; redução de movimento desativa animação e conserva contorno.
- Rascunho salvo, recarga e recuperação dos campos; duas publicações com classificação escolhida; a segunda com opcionais vazios e sem vídeo.
- MP4 real de1s gerado por FFmpeg (codec VP9 em contêiner MP4), selecionado pelo input, prévia reproduzida, enviado, confirmado no SQLite, lido com Range206 e reproduzido na visão do cliente.
- Nenhum erro JavaScript nos dois perfis. Ordenação, fotos, sessão e isolamento do cliente regressados no mesmo script.

O lançador Chromium do sistema estava incompleto (`/usr/lib/chromium/chromium: not found`). Chromium completo instalado não pôde criar seu socket no executor (`Operation not permitted`); a alternativa oficial Headless Shell executou os testes sem contornar políticas de segurança.

## Limites da prova

Nenhum produto existente foi editado ou cadastrado na produção para testar. A validação dos arquivos e da reprodução usou o arquivo real de teste descrito acima; isso não certifica todos os codecs que possam ser enviados dentro de MP4. As mesmas restrições de formato/tamanho/duração do servidor permanecem obrigatórias. Relógio, START, porteira, mil posições, contas e financeiro não foram modificados.

SHA256 produtos-browser-mobile-comprovado.log: `9c33bdf8955d5ad07edebd00a1d6b92ca733da8c4619a4be4e712a45af5413b6`.

SHA256 produtos-browser-pc-comprovado.log: `9c33bdf8955d5ad07edebd00a1d6b92ca733da8c4619a4be4e712a45af5413b6`.

## Regressão final

`node --test --test-concurrency=4`: 1.783 testes aprovados; zero falhas, cancelamentos ou testes ignorados. SHA256 do relatório: `b0840d2397d9b0c3717b91e57c554d2f5109955655d40774ef2844e330032ef5`.
