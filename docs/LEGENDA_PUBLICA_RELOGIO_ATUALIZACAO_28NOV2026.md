# Legenda pública do relógio e atualização estável — 28/11/2026

Base oficial conferida antes da alteração: `a77b24dc0366d6ffc89e5741a7bf1a702c6d2be6`, branch `feature/unificar-escritorio-real-20261105`.

## Pedido e causa

A atualização periódica de Posições chamava a consulta de indicadores comerciais, que removia os dois cartões para exibir uma frase de carregamento e logo os reconstruía. Esse texto transitório causava a piscada e o salto de layout observados pelo proprietário. A consulta agora conserva os cartões durante HTTP pendente, evita requisições sobrepostas e não recria os nós quando os dados são os mesmos. Novos valores continuam sendo atualizados; erros concretos continuam reportados.

A legenda do visor usava o total de recebimentos do lote como denominador (`/1000`) e anexava janela de horário, centros e detalhes internos. Agora o componente compartilhado mostra somente eventos do ciclo, progresso sobre a meta de luzes salva e data.

## Formatos aprovados

- 15 centros: `Eventos: 0/6 luzes · 0/90 luzes · 2026-11-28`.
- 3 centros, 8 eventos diários, 2 no ciclo: `Eventos: 2/6 luzes · 8/18 luzes · 2026-11-28`.
- Sem meta: `Eventos: 2/6 luzes · 2026-11-28`; sem fração diária ou valor tomado das filas.

A janela de horário permanece na configuração administrativa e governa a execução exatamente como antes; é retirada apenas da legenda. Data e contagem regressiva são preservadas. Não zerar livros, metas, saldos ou históricos para mudar o texto. Nenhum START foi acionado.

## Testes

- Consulta artificialmente atrasada: cartões continuam presentes durante a espera, a segunda chamada simultânea não cria outro HTTP, resposta com os mesmos dados preserva os mesmos nós e uma alteração real de contador é representada.
- Casos 15/3/0 centros com lote de mil e total histórico diferente: legenda usa somente meta salva e eventos do dia, sem janela horária.
- Provas de persistência, madrugada e reinício continuam verificando horários na configuração e previsão no visor; apenas as expectativas do texto público foram alinhadas ao pedido.
- Navegador PC/celular: atraso HTTP de 400ms sobre a consulta administrativa e comparação da identidade dos cartões antes/durante/depois da resposta, além do fluxo completo de navegação existente.

## Escopo preservado

Não houve alteração do motor, APIs, permissões, fontes dos contadores, registros financeiros, dados de contas/produtos ou programação publicada. O mesmo componente de legenda atende os dois perfis. O desenho e as molduras permanecem iguais.
