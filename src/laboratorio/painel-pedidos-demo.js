'use strict';

// Interface somente demonstrativa. Nenhum pedido, pagamento ou
// reembolso e criado a partir de clientes reais.
let pedidoSelecionadoDemo = null;
let pedidoDemoOcupado = false;

const LABELS_ESTADO = {
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação fictícia',
  CONFIRMADO_SIMULADO: 'Confirmação fictícia registrada',
  ENVIADO_FORNECEDOR: 'Encaminhado ao distribuidor fictício',
  EM_SEPARACAO: 'Produto em separação',
  EM_TRANSPORTE: 'Em transporte fictício',
  ENTREGUE: 'Entrega fictícia registrada',
  OCORRENCIA: 'Ocorrência no transporte',
  CANCELAMENTO_SOLICITADO: 'Cancelamento solicitado',
  CANCELADO: 'Cancelado no laboratório',
  DEVOLUCAO_SOLICITADA: 'Devolução solicitada',
  DEVOLVIDO: 'Produto devolvido (fictício)'
};
const ACOES_DEMO = [
  {tipo:'CONFIRMAR_PAGAMENTO_SIMULADO',nome:'Confirmar pagamento fictício',de:['AGUARDANDO_CONFIRMACAO']},
  {tipo:'REPASSAR_PEDIDO_SIMULADO',nome:'Repassar ao fornecedor fictício',de:['CONFIRMADO_SIMULADO']},
  {tipo:'INICIAR_SEPARACAO',nome:'Iniciar separação fictícia',de:['ENVIADO_FORNECEDOR']},
  {tipo:'REGISTRAR_TRANSPORTE',nome:'Registrar transporte fictício',de:['EM_SEPARACAO']},
  {tipo:'REGISTRAR_ENTREGA',nome:'Registrar entrega fictícia',de:['EM_TRANSPORTE']},
  {tipo:'REGISTRAR_OCORRENCIA',nome:'Registrar extravio ou ocorrência fictícia',de:['ENVIADO_FORNECEDOR','EM_SEPARACAO','EM_TRANSPORTE']},
  {tipo:'RETOMAR_TRANSPORTE',nome:'Retomar transporte fictício',de:['OCORRENCIA']},
  {tipo:'SOLICITAR_CANCELAMENTO',nome:'Solicitar cancelamento fictício',de:['AGUARDANDO_CONFIRMACAO','CONFIRMADO_SIMULADO','ENVIADO_FORNECEDOR','EM_SEPARACAO','EM_TRANSPORTE','OCORRENCIA']},
  {tipo:'REGISTRAR_CANCELAMENTO',nome:'Concluir cancelamento fictício',de:['CANCELAMENTO_SOLICITADO']},
  {tipo:'SOLICITAR_DEVOLUCAO',nome:'Solicitar devolução após entrega fictícia',de:['ENTREGUE']},
  {tipo:'CONFIRMAR_DEVOLUCAO',nome:'Confirmar devolução fictícia',de:['DEVOLUCAO_SOLICITADA']},
  {tipo:'SOLICITAR_REEMBOLSO_SIMULADO',nome:'Registrar solicitação de reembolso fictícia',de:['OCORRENCIA','CANCELAMENTO_SOLICITADO','CANCELADO','DEVOLUCAO_SOLICITADA','DEVOLVIDO'],reembolso:'NAO_SOLICITADO'},
  {tipo:'REGISTRAR_REEMBOLSO_SIMULADO',nome:'Registrar reembolso fictício (sem valores)',de:['CANCELADO','DEVOLVIDO'],reembolso:'SOLICITADO_SIMULADO'}
];

function mensagemPedidoDemo(texto) {
  $('mensagemPedidosDemo').textContent = texto;
}

function limparPedidosDemo() {
  pedidoSelecionadoDemo = null;
  $('listaPedidosDemo').replaceChildren();
  $('historicoPedidoDemo').replaceChildren();
  $('eventoPedidoDemo').replaceChildren();
  $('eventoPedidoDemo').disabled = true;
  $('aplicarEventoDemo').disabled = true;
  $('detalhePedidoDemo').textContent = 'Selecione um pedido fictício.';
  mensagemPedidoDemo('');
}

function listarAcoesDemo(pedido) {
  const select = $('eventoPedidoDemo');
  select.replaceChildren();
  const escolha = document.createElement('option');
  escolha.value = '';
  escolha.textContent = 'Selecione um evento fictício';
  select.appendChild(escolha);
  for (const acao of ACOES_DEMO) {
    if (!acao.de.includes(pedido.status) ||
        (acao.reembolso && acao.reembolso !== pedido.reembolso)) continue;
    const opt = document.createElement('option');
    opt.value = acao.tipo;
    opt.textContent = acao.nome;
    select.appendChild(opt);
  }
  select.disabled = select.options.length <= 1;
  $('aplicarEventoDemo').disabled = true;
}

async function selecionarPedidoDemo(pedido) {
  pedidoSelecionadoDemo = { ...pedido };
  $('detalhePedidoDemo').textContent =
    'Pedido: ' + pedido.pedidoId +
    ' | Produto: ' + pedido.produtoId +
    ' | Fornecedor: ' + pedido.fornecedorId +
    ' | SKU: ' + pedido.sku +
    ' | Situação: ' + (LABELS_ESTADO[pedido.status] || pedido.status) +
    ' | Reembolso: ' + pedido.reembolso +
    ' | Revisão: ' + pedido.revisao;
  listarAcoesDemo(pedido);
  const resultado = await requisitar(
    '/pedidos-demo/' + encodeURIComponent(pedido.pedidoId) + '/historico'
  );
  const historico = $('historicoPedidoDemo');
  historico.replaceChildren();
  for(const evento of resultado.eventos) {
    const li = document.createElement('li');
    li.textContent = 'Revisão ' + evento.revisao + ' — ' + evento.tipo +
      ' — ' + evento.ocorridoEm;
    historico.appendChild(li);
  }
}

async function carregarPedidosDemo() {
  const resposta = await requisitar('/pedidos-demo');
  const lista = $('listaPedidosDemo');
  lista.replaceChildren();
  for(const pedido of resposta.pedidos) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = pedido.pedidoId + ' — ' +
      (LABELS_ESTADO[pedido.status] || pedido.status);
    botao.addEventListener('click', async () => {
      try { await selecionarPedidoDemo(pedido); }
      catch(erro) { mensagemPedidoDemo(erro.message); }
    });
    lista.appendChild(botao);
  }
  if(pedidoSelecionadoDemo) {
    const atual = resposta.pedidos.find(p=>p.pedidoId===pedidoSelecionadoDemo.pedidoId);
    if(atual) await selecionarPedidoDemo(atual);
    else limparPedidosDemo();
  }
}

async function aplicarEventoPedidoDemo() {
  if(pedidoDemoOcupado || !pedidoSelecionadoDemo) return;
  const tipo=$('eventoPedidoDemo').value;
  const acao=ACOES_DEMO.find(a=>a.tipo===tipo);
  if(!acao || !acao.de.includes(pedidoSelecionadoDemo.status)) return;
  const pedido = { ...pedidoSelecionadoDemo };
  pedidoDemoOcupado=true;
  $('aplicarEventoDemo').disabled=true;
  try {
    await requisitar('/pedidos-demo/' + encodeURIComponent(pedido.pedidoId) + '/eventos', {
      method:'POST',
      body:JSON.stringify({tipo, revisaoEsperada:pedido.revisao})
    });
    await carregarPedidosDemo();
    mensagemPedidoDemo('Evento registrado SOMENTE no simulador. Nenhuma compra, entrega ou transferência real ocorreu.');
  } catch(erro) {
    await carregarPedidosDemo().catch(()=>{});
    mensagemPedidoDemo('Não foi possível registrar o evento. ' + erro.message);
  } finally {
    pedidoDemoOcupado=false;
  }
}

$('atualizarPedidosDemo').addEventListener('click',async()=>{
  try { await carregarPedidosDemo(); mensagemPedidoDemo('Situações atualizadas.'); }
  catch(erro) { mensagemPedidoDemo(erro.message); }
});
$('eventoPedidoDemo').addEventListener('change',()=>{
  $('aplicarEventoDemo').disabled = !pedidoSelecionadoDemo || !$('eventoPedidoDemo').value || pedidoDemoOcupado;
});
$('aplicarEventoDemo').addEventListener('click', aplicarEventoPedidoDemo);
