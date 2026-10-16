'use strict';

// Apenas laboratorio local. Chave na memoria da pagina; sem conta ou saldo real.
// Nomes e cores nao alteram o destino dos valores nem a arquitetura dos cofres.
(() => {
  const el=id=>document.getElementById(id);
  const money=centavos=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(centavos/100);
  const tokenInput=el('chaveFinanceiroDemo');
  const status=el('statusFinanceiroDemo');
  const statusEdicao=el('statusAparenciaCofreDemo');
  const dados=el('dadosFinanceiroDemo');
  const modo=el('repasseFinanceiroDemo');
  const selecionar=el('cofreEditarFinanceiroDemo');
  const nome=el('nomeCofreFinanceiroDemo');
  const cor=el('corCofreFinanceiroDemo');
  let token='';
  let versao=0;
  let versaoHistorico=0;
  let versaoConciliacao=0;
  let versaoLivro=0;
  let versaoRecebimentos=0;
  let versaoPonte=0;
  let versaoComercial=0;
  let versaoPlanejamentoFisico=0;
  let versaoPagamentoFisico=0;
  let versaoAuditoriaFisica=0;
  let versaoHistoricoPagamentoFisico=0;
  let pagamentosFisicos=[];
  let salvandoPagamentoFisico=false;
  let analisesFisicas=[];
  let salvandoCustoFisico=false;
  let salvandoPrePedidoFisico=false;
  let versaoPDF=0;
  let versaoHistoricoPDF=0;
  let salvandoPDF=false;
  let salvandoEventoPDF=false;
  let salvandoVinculoPDF=false;
  let sincronizandoPDF=false;
  let pedidosPDF=[];
  let opcoesCarrinho=[];
  let regrasProdutosLoop=[];
  let pedidosCarrinho=[];
  let versaoCarrinho=0;
  let salvandoCarrinho=false;
  let salvandoEventoCarrinho=false;
  let salvandoPedidoComercial=false;
  let versaoHistoricoPonte=0;
  let pedidosAssociados=[];
  let salvandoEventoPSP=false;
  let recebimentos=[];
  let configuracoes=[];
  let salvando=false;
  let valorLoopAtual=null;
  let salvandoValorLoop=false;

  function limpar(){
    ++versaoConciliacao;
    ++versaoLivro;
    ++versaoRecebimentos;
    ++versaoPonte;
    ++versaoComercial;
    ++versaoPlanejamentoFisico;
    ++versaoPagamentoFisico;
    ++versaoAuditoriaFisica;
    ++versaoHistoricoPagamentoFisico;
    pagamentosFisicos=[];
    el('pedidoPagamentoFisicoDemo').replaceChildren();
    el('listaPagamentosPrePedidosFisicosDemo').replaceChildren();
    el('historicoPagamentoPrePedidoFisicoDemo').replaceChildren();
    el('statusPagamentoPrePedidoFisicoDemo').textContent='';
    el('resumoAuditoriaFisicosDemo').textContent='Aguardando conferência local.';
    el('listaAuditoriaFisicosDemo').replaceChildren();
    el('resumoFornecedorAuditoriaFisicosDemo').replaceChildren();
    analisesFisicas=[];
    for(const id of ['listaPlanejamentoFisicoDemo','listaPrePedidosFisicosDemo',
      'produtoCustoFisicoDemo','produtoPrePedidoFisicoDemo'])el(id).replaceChildren();
    el('statusPlanejamentoFisicoDemo').textContent='';
    el('statusPrePedidoFisicoDemo').textContent='';
    ++versaoPDF;
    ++versaoHistoricoPDF;
    pedidosPDF=[];
    ++versaoCarrinho;
    pedidosCarrinho=[];
    opcoesCarrinho=[];
    regrasProdutosLoop=[];
    el('produtoElegibilidadeLoopDemo').replaceChildren();
    el('statusElegibilidadeLoopDemo').textContent='';
    el('itensCarrinhoLoopDemo').replaceChildren();
    el('contaCarrinhoLoopDemo').replaceChildren();
    el('pedidoEventoCarrinhoLoopDemo').replaceChildren();
    el('listaCarrinhosLoopDemo').replaceChildren();
    el('statusCarrinhoLoopDemo').textContent='';
    el('statusEventoCarrinhoLoopDemo').textContent='';
    el('totalCarrinhoLoopDemo').textContent='Total do carrinho: '+money(0);
    for(const id of ['listaPedidosPDFDemo','historicoEventoPDFDemo',
      'produtoPedidoPDFDemo','pedidoEventoPDFDemo','titularPedidoPDFLoopDemo',
      'pedidoVinculoPDFLoopDemo'])el(id).replaceChildren();
    el('statusPedidosPDFDemo').textContent='';
    el('statusEventoPDFDemo').textContent='';
    el('estadoVinculoPDFLoopDemo').textContent='';
    el('estadoSincronizacaoPDFLoopDemo').textContent='';
    el('statusMaterialPDFDemo').textContent='';
    el('auditoriaMaterialPDFDemo').textContent='Solicitações de download fictício: 0';
    el('baixarMaterialPDFDemo').disabled=true;
    el('listaPedidosComerciaisDemo').replaceChildren();
    el('listaCotacoesFisicasDemo').replaceChildren();
    el('produtoPedidoComercialDemo').replaceChildren();
    el('pagamentoPedidoComercialDemo').replaceChildren();
    el('statusPedidosComerciaisDemo').textContent='';
    ++versaoHistoricoPonte;
    pedidosAssociados=[];
    el('listaPontePedidoPagamentoDemo').replaceChildren();
    el('historicoPontePedidoPagamentoDemo').replaceChildren();
    el('pedidoHistoricoPonteDemo').replaceChildren();
    el('statusPontePedidoPagamentoDemo').textContent='';
    recebimentos=[];
    el('pagamentoSelecionadoPSPDemo').replaceChildren();
    el('historicoRecebimentoPSPDemo').replaceChildren();
    el('detalhePagamentoPSPDemo').textContent='Abra a demonstração para consultar os exemplos.';
    el('statusEventoPSPDemo').textContent='';
    dados.hidden=true;
    el('caixasLivroPersistenteDemo').replaceChildren();
    el('historicoLivroPersistenteDemo').replaceChildren();
    el('statusLivroPersistenteDemo').textContent='';
    el('linhasConciliacaoDemo').replaceChildren();
    el('historicoConciliacaoDemo').replaceChildren();
    el('statusConciliacaoDemo').textContent='';
    configuracoes=[];
    valorLoopAtual=null;
    el('referenciaAtualLoopDemo').textContent='Referência de laboratório indisponível.';
    el('historicoValorLoopDemo').replaceChildren();
    el('statusValorLoopDemo').textContent='';
    el('statusImpactoValorLoopDemo').textContent='';
    el('listaImpactoValorLoopDemo').replaceChildren();
    selecionar.replaceChildren();
    statusEdicao.textContent='';
    el('historicoAparenciaCofreDemo').replaceChildren();
    for(const id of ['cofresLoopFinanceiroDemo','cofresLojaFinanceiroDemo','historicoFinanceiroDemo']){
      el(id).replaceChildren();
    }
    for(const id of ['vendasBrutasFinanceiroDemo','distribuidorFinanceiroDemo','parcelaFinanceiroDemo','sobraFinanceiroDemo']){
      el(id).textContent='—';
    }
  }
  async function carregarValorLoop(){
    if(!token)return;
    const res=await requisitar('valor-loop-demo');
    valorLoopAtual=res.atual;
    el('referenciaAtualLoopDemo').textContent='Referência vigente: '+
      money(res.atual.valorCentavos)+' — revisão '+res.atual.revisao+
      ' — desde '+res.atual.vigenteDesde+'.';
    const historico=el('historicoValorLoopDemo');
    historico.replaceChildren();
    for(const marco of res.historico){
      const li=document.createElement('li');
      li.textContent='Revisão '+marco.revisao+
        ': '+money(marco.valorCentavos)+' — início '+marco.vigenteDesde;
      historico.append(li);
    }
    el('novoValorLoopDemo').value=(res.atual.valorCentavos/100).toFixed(2);
  }
  async function simularImpactoValorLoop(){
    const statusImpacto=el('statusImpactoValorLoopDemo');
    const itens=el('listaImpactoValorLoopDemo');
    itens.replaceChildren();
    if(!token){statusImpacto.textContent='Informe a chave do laboratório.';return;}
    const bruto=el('novoValorLoopDemo').value;
    if(!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(bruto)){
      statusImpacto.textContent='Informe reais com até duas casas decimais.';return;
    }
    const centavos=Math.round(Number(bruto)*100);
    if(!Number.isSafeInteger(centavos)||centavos<100||centavos>100000000){
      statusImpacto.textContent='Valor de teste fora do intervalo.';return;
    }
    try{
      const preview=await requisitar(
       'valor-loop-demo/impacto?novoValorCentavos='+encodeURIComponent(String(centavos)));
      statusImpacto.textContent='Simulação: '+money(preview.valorAtualCentavos)+
        ' → '+money(preview.valorNovoCentavos)+'. '+
        preview.totalPosicoesRegistradas+' posições já registradas; nenhuma alterada.';
      if(preview.grupos.length===0){
        const li=document.createElement('li');
        li.textContent='Ainda não existem posições fictícias para comparar.';
        itens.append(li);
      }
      for(const grupo of preview.grupos){
        const li=document.createElement('li');
        const c=grupo.comparacaoEventoParticipante;
        li.textContent=grupo.posicoesRegistradas+' posições da revisão '+grupo.revisaoValor+
          ' ('+money(grupo.referenciaOriginalCentavos)+'). Cenário de evento do participante: '+
          money(c.valorParticipanteCentavos)+' em referência ao participante; '+
          money(c.valorEmpresaPropostoCentavos)+' excedente hipotético para empresa'+
          (c.exigeAnaliseDeCobertura?' — atenção: falta '+money(c.deficitDeCoberturaCentavos)+' na referência antiga':'')+
          '. Nenhum repasse calculado foi executado.';
        itens.append(li);
      }
    }catch(err){statusImpacto.textContent='Falha ao simular: '+err.message;}
  }
  async function salvarValorLoop(evento){
    evento.preventDefault();
    if(!token||!valorLoopAtual||salvandoValorLoop)return;
    const campo=el('novoValorLoopDemo');
    const bruto=campo.value;
    const estado=el('statusValorLoopDemo');
    if(!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(bruto)){
      estado.textContent='Digite um valor em reais com até duas casas decimais.';
      return;
    }
    const centavos=Math.round(Number(bruto)*100);
    if(!Number.isSafeInteger(centavos)||centavos<100||centavos>100000000){
      estado.textContent='O valor está fora do intervalo de teste permitido.';
      return;
    }
    salvandoValorLoop=true;
    el('salvarValorLoopDemo').disabled=true;
    try{
      const retorno=await requisitar('valor-loop-demo',{
        method:'PATCH',
        body:JSON.stringify({valorCentavos:centavos,
          revisaoEsperada:valorLoopAtual.revisao})
      });
      await carregarValorLoop();
      if(retorno.alterado){
        const financeiro=await requisitar('financeiro-demo?modo='+encodeURIComponent(modo.value));
        mostrar(financeiro);
        el('statusImpactoValorLoopDemo').textContent=
          'Reajuste registrado no laboratório. Faça outra prévia para comparar o novo marco.';
        el('listaImpactoValorLoopDemo').replaceChildren();
      }
      estado.textContent=retorno.alterado?
       'Nova referência registrada no histórico para compras posteriores. Posições anteriores preservadas.':
       'Referência já estava nesse valor; nenhuma alteração histórica.';
    }catch(e){
      estado.textContent=e.message;
      try{await carregarValorLoop();}catch{}
    }finally{
      salvandoValorLoop=false;
      el('salvarValorLoopDemo').disabled=false;
    }
  }
  async function requisitar(recurso,opcoes={}){
    if(!token)throw new Error('Informe a chave do laboratório.');
    const resposta=await fetch('/api/admin/'+recurso,{
      ...opcoes,
      cache:'no-store',
      credentials:'omit',
      headers:{
        Authorization:'Bearer '+token,
        ...(opcoes.body?{'Content-Type':'application/json'}:{})
      }
    });
    if(!resposta.ok){
      if(resposta.status===409)throw new Error('Identificador já usado com dados diferentes ou revisão alterada. Confira e recarregue.');
      if(resposta.status===401 || resposta.status===403)throw new Error('Chave inválida ou acesso local não permitido.');
      throw new Error('Operação não concluída ('+resposta.status+').');
    }
    return resposta.json();
  }
  function caixa(c){
    const artigo=document.createElement('div');
    artigo.className='financeiro-caixa';
    if(typeof c.corExibicao==='string' && /^#[0-9a-fA-F]{6}$/.test(c.corExibicao)){
      artigo.style.borderColor=c.corExibicao;
    }
    const titulo=document.createElement('strong');
    titulo.textContent=c.nomeExibicao||c.nomeProvisorio;
    const valor=document.createElement('span');
    valor.textContent=money(c.entradasAcumuladasCentavos);
    const nota=document.createElement('small');
    nota.textContent='Entradas fictícias acumuladas — NÃO é saldo bancário';
    artigo.append(titulo,valor,nota);
    return artigo;
  }
  function mostrar(res){
    el('vendasBrutasFinanceiroDemo').textContent=money(res.totalVendasCentavos);
    el('distribuidorFinanceiroDemo').textContent=money(res.totalFornecedorCentavos);
    el('parcelaFinanceiroDemo').textContent=money(res.totalLoopCentavos);
    el('sobraFinanceiroDemo').textContent=money(res.totalSobraBrutaCentavos);
    const loop=el('cofresLoopFinanceiroDemo');
    const loja=el('cofresLojaFinanceiroDemo');
    loop.replaceChildren();
    loja.replaceChildren();
    for(const c of res.caixas){
      (c.id.startsWith('LOOP_')?loop:loja).append(caixa(c));
    }
    const lista=el('historicoFinanceiroDemo');
    lista.replaceChildren();
    for(const lancamento of res.historico){
      const item=document.createElement('li');
      item.textContent='Lançamento '+lancamento.sequencia+' — '+lancamento.vendaId+
        ' — '+lancamento.tipo+' — '+lancamento.cofreId+
        ' — '+money(lancamento.valorCentavos);
      lista.append(item);
    }
    dados.hidden=false;
    status.textContent='Demonstração carregada. Nenhuma transação real foi executada.';
  }
  async function carregarConciliacao(){
    const atual=++versaoConciliacao;
    const destino=el('linhasConciliacaoDemo');
    const historico=el('historicoConciliacaoDemo');
    const situacao=el('statusConciliacaoDemo');
    destino.replaceChildren();
    historico.replaceChildren();
    if(!token){situacao.textContent='Informe a chave do laboratório.';return;}
    situacao.textContent='Conferindo dois conjuntos de valores FICTÍCIOS...';
    const parametros=new URLSearchParams({
      modo:modo.value,
      fluxo:el('fluxoConciliacaoDemo').value,
      extrato:el('extratoConciliacaoDemo').value
    });
    try{
      const res=await requisitar('conciliacao-cofres-demo?'+parametros.toString());
      if(atual!==versaoConciliacao)return;
      for(const linha of res.conciliacao.linhas){
        const artigo=document.createElement('div');
        artigo.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=linha.nomeExibicao;
        const descricao=document.createElement('span');
        descricao.className='financeiro-linha-saldos';
        descricao.textContent='Projetado: '+money(linha.saldoProjetadoCentavos)+
          ' | Reserva FICTÍCIA: '+(linha.saldoReservaFicticiaCentavos===null?'indisponível':money(linha.saldoReservaFicticiaCentavos));
        const detalhe=document.createElement('small');
        detalhe.textContent=linha.status==='CONFERIDO_NO_TESTE'?'Conferido SOMENTE no teste':
          linha.status==='DIVERGENCIA_FICTICIA'?'DIVERGÊNCIA fictícia: '+money(linha.diferencaCentavos):
          'Sem extrato de demonstração';
        artigo.append(titulo,descricao,detalhe);
        destino.append(artigo);
      }
      situacao.textContent=res.conciliacao.todasConferidasNoTeste?
        'Contas do exemplo coincidem. NÃO é uma confirmação bancária.':
        'Existe diferença no extrato fictício. Nenhum dinheiro foi movimentado.';
      // Manter tela enxuta. O livro completo esta na API do admin local.
      const ultimos=res.razao.historico.slice(-10);
      for(const lancamento of ultimos){
        const item=document.createElement('li');
        item.textContent=lancamento.tipo+' — '+lancamento.cofreId+
          ' — '+money(lancamento.valorCentavos)+' — '+lancamento.referencia;
        historico.append(item);
      }
    }catch(e){
      if(atual===versaoConciliacao) situacao.textContent=e.message;
    }
  }

  // Curso PDF de teste: pagamento de valor variavel e elegibilidade ficticia
  // para entrega. Nenhum PDF REAL nem transferencia de valores.
  // Faz o download por fetch com a chave administrativa em cabecalho,
  // nunca em parametros de URL ou links publicos.
  async function baixarMaterialPDF(){
    const pedidoId=el('pedidoEventoPDFDemo').value;
    const pedido=pedidosPDF.find(p=>p.pedidoId===pedidoId);
    const aviso=el('statusMaterialPDFDemo');
    if(!token||!pedido?.materialTesteBaixavel){
      aviso.textContent='Escolha um pedido PDF com pagamento fictício confirmado.';
      return;
    }
    const botao=el('baixarMaterialPDFDemo');
    botao.disabled=true;
    aviso.textContent='Solicitando PDF fictício autorizado ao laboratório...';
    try{
      const resposta=await fetch('/api/admin/pedidos-pdf-demo/'+encodeURIComponent(pedidoId)+'/material-teste.pdf',{
        headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'
      });
      if(!resposta.ok)throw new Error('Material de teste não autorizado ('+resposta.status+').');
      if(!String(resposta.headers.get('content-type')).startsWith('application/pdf')){
        throw new Error('Arquivo de laboratório inesperado.');
      }
      const arquivo=await resposta.blob();
      const url=URL.createObjectURL(arquivo);
      try{
        const link=document.createElement('a');
        link.href=url;
        link.download='loop-material-de-teste.pdf';
        document.body.append(link);
        link.click();
        link.remove();
      }finally{
        setTimeout(()=>URL.revokeObjectURL(url),3000);
      }
      aviso.textContent='Material PDF fictício solicitado. Nenhum curso real foi entregue.';
      await carregarHistoricoPDF();
    }catch(e){aviso.textContent=e.message;}
    finally{
      const atual=pedidosPDF.find(p=>p.pedidoId===el('pedidoEventoPDFDemo').value);
      botao.disabled=!atual?.materialTesteBaixavel;
    }
  }
  async function carregarHistoricoPDF(){
    const atual=++versaoHistoricoPDF;
    const id=el('pedidoEventoPDFDemo').value;
    const lista=el('historicoEventoPDFDemo');
    lista.replaceChildren();
    const pedidoAtual=pedidosPDF.find(p=>p.pedidoId===id);
    el('baixarMaterialPDFDemo').disabled=!pedidoAtual?.materialTesteBaixavel;
    el('auditoriaMaterialPDFDemo').textContent='Consultando solicitações de material fictício...';
    if(!id||!token)return;
    try{
      const [dados,auditoria]=await Promise.all([
        requisitar('pedidos-pdf-demo/'+encodeURIComponent(id)+'/historico'),
        requisitar('pedidos-pdf-demo/'+encodeURIComponent(id)+'/solicitacoes-material-teste')
      ]);
      if(atual!==versaoHistoricoPDF || id!==el('pedidoEventoPDFDemo').value)return;
      el('auditoriaMaterialPDFDemo').textContent=
        'Solicitações autorizadas de PDF fictício: '+auditoria.solicitacoes.length;
      for(const evento of dados.eventos){
        const li=document.createElement('li');
        li.textContent=evento.tipo+' — '+evento.eventoId+' — '+evento.registradoEm;
        lista.append(li);
      }
      if(!dados.eventos.length){
        const li=document.createElement('li');
        li.textContent='Nenhum pagamento fictício confirmado.';
        lista.append(li);
      }
    }catch(erro){if(atual===versaoHistoricoPDF)el('statusEventoPDFDemo').textContent=erro.message;}
  }
  async function carregarPedidosPDF(){
    const atual=++versaoPDF;
    const status=el('statusPedidosPDFDemo');
    if(!token){status.textContent='Abra o laboratório com a chave administrativa.';return;}
    try{
      const [dados,opcoes,contas]=await Promise.all([
        requisitar('pedidos-pdf-demo'),requisitar('pedidos-pdf-demo/opcoes'),
        requisitar('contas-participantes-demo')
      ]);
      if(atual!==versaoPDF)return;
      pedidosPDF=dados.pedidos;
      const cursoSelect=el('produtoPedidoPDFDemo');
      const cursoAntigo=cursoSelect.value;
      cursoSelect.replaceChildren();
      for(const curso of opcoes.produtos){
        const opt=document.createElement('option');
        opt.value=curso.produtoId;
        opt.textContent=curso.nome+' — '+money(curso.precoCentavos);
        cursoSelect.append(opt);
      }
      if(opcoes.produtos.some(c=>c.produtoId===cursoAntigo))cursoSelect.value=cursoAntigo;
      const titularSelect=el('titularPedidoPDFLoopDemo');
      const titularAnterior=titularSelect.value;
      titularSelect.replaceChildren();
      for(const conta of contas.contas){
        const opt=document.createElement('option');
        opt.value=conta.contaId;
        opt.textContent=conta.nome+' — '+conta.login;
        titularSelect.append(opt);
      }
      if(contas.contas.some(c=>c.contaId===titularAnterior))titularSelect.value=titularAnterior;
      const pedidoVinculo=el('pedidoVinculoPDFLoopDemo');
      const pedidoVinculoAnterior=pedidoVinculo.value;
      pedidoVinculo.replaceChildren();
      const pedidoSelect=el('pedidoEventoPDFDemo');
      const pedidoAntigo=pedidoSelect.value;
      pedidoSelect.replaceChildren();
      const lista=el('listaPedidosPDFDemo');
      lista.replaceChildren();
      for(const pedido of pedidosPDF){
        const opt=document.createElement('option');
        opt.value=pedido.pedidoId;
        opt.textContent=pedido.pedidoId+' — '+money(pedido.precoBrutoCentavos);
        pedidoSelect.append(opt);
        const outra=document.createElement('option');
        outra.value=pedido.pedidoId;
        outra.textContent=pedido.pedidoId+' — '+money(pedido.precoBrutoCentavos);
        pedidoVinculo.append(outra);
        const item=document.createElement('div');
        item.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=pedido.nomeProduto;
        const info=document.createElement('span');
        info.className='financeiro-linha-saldos';
        info.textContent='Pedido '+pedido.pedidoId+' | '+money(pedido.precoBrutoCentavos)+
          ' | '+pedido.situacaoPagamentoFicticio;
        const legenda=document.createElement('small');
        legenda.textContent='Fatura fictícia '+pedido.pagamentoId+
          ' — '+(pedido.habilitacaoDownloadFicticia?'Elegibilidade de download SIMULADA':
          'Download não habilitado na simulação')+
          '. Nenhum PDF real foi entregue.'+
          (pedido.integracaoLoop?.posicaoCriada?' Posição LOOP #'+
            pedido.integracaoLoop.posicaoId+' criada.':
           pedido.integracaoLoop?.lojaSemPosicao?' Venda somente da loja.':
           pedido.integracaoLoop?.vinculado?' Comprador vinculado: aguardando confirmação.':
           ' Ainda sem comprador vinculado ao LOOP.');
        item.append(titulo,info,legenda);
        lista.append(item);
      }
      if(pedidosPDF.some(p=>p.pedidoId===pedidoAntigo))pedidoSelect.value=pedidoAntigo;
      if(pedidosPDF.some(p=>p.pedidoId===pedidoVinculoAnterior))pedidoVinculo.value=pedidoVinculoAnterior;
      status.textContent=pedidosPDF.length+' pedido(s) PDF de teste. '+
        opcoes.produtos.length+' curso(s) PDF publicado(s) no catálogo.';
      await carregarHistoricoPDF();
    }catch(erro){if(atual===versaoPDF)status.textContent=erro.message;}
  }
  function atualizarTotalCarrinho(){
    const linhas=el('itensCarrinhoLoopDemo').querySelectorAll('.item-carrinho-lab');
    let total=0,totalElegivel=0;
    for(const linha of linhas){
      const produto=opcoesCarrinho.find(p=>p.produtoId===
        linha.querySelector('.produto-carrinho-lab').value);
      const qtd=Number(linha.querySelector('.quantidade-carrinho-lab').value);
      if(produto&&Number.isSafeInteger(qtd)&&qtd>0&&qtd<=100){
        const subtotal=produto.precoCentavos*qtd;
        total+=subtotal;
        if(produto.elegivelLoop)totalElegivel+=subtotal;
      }
    }
    el('totalCarrinhoLoopDemo').textContent='Total da compra: '+money(total)+
      ' · Conta para o LOOP: '+money(totalElegivel)+
      ' (uma posição no máximo por pedido; regra congelada ao registrar).';
  }
  function adicionarLinhaCarrinho(){
    const container=el('itensCarrinhoLoopDemo');
    if(container.children.length>=20 || !opcoesCarrinho.length)return;
    const linha=document.createElement('div');
    linha.className='financeiro-caixa item-carrinho-lab';
    const labelProduto=document.createElement('label');
    labelProduto.textContent='Produto do catálogo';
    const select=document.createElement('select');
    select.className='produto-carrinho-lab';
    select.required=true;
    for(const produto of opcoesCarrinho){
      const option=document.createElement('option');
      option.value=produto.produtoId;
      option.textContent=produto.nome+' — '+money(produto.precoCentavos)+
        (produto.elegivelLoop?' · válido LOOP':' · somente loja');
      select.append(option);
    }
    const labelQuantidade=document.createElement('label');
    labelQuantidade.textContent='Quantidade (1 a 100)';
    const quantidade=document.createElement('input');
    quantidade.type='number';
    quantidade.min='1';quantidade.max='100';quantidade.step='1';
    quantidade.value='1';quantidade.required=true;
    quantidade.className='quantidade-carrinho-lab';
    const remover=document.createElement('button');
    remover.type='button';remover.className='secundario';
    remover.textContent='Remover item';
    remover.addEventListener('click',()=>{linha.remove();atualizarTotalCarrinho();});
    select.addEventListener('change',atualizarTotalCarrinho);
    quantidade.addEventListener('input',atualizarTotalCarrinho);
    labelProduto.append(select);labelQuantidade.append(quantidade);
    linha.append(labelProduto,labelQuantidade,remover);
    container.append(linha);
    atualizarTotalCarrinho();
  }
  function mostrarRegraProdutoLoop(){
    const p=regrasProdutosLoop.find(x=>x.produtoId===el('produtoElegibilidadeLoopDemo').value);
    if(!p)return;
    el('valorElegibilidadeLoopDemo').value=p.elegivelLoop?'sim':'nao';
    el('statusElegibilidadeLoopDemo').textContent=
      p.nome+': '+(p.elegivelLoop?'valor autorizado para a fila.':
       'continua à venda, mas não conta para a fila.')+
       ' Revisão '+p.revisaoElegibilidade+'.';
  }
  async function salvarRegraProdutoLoop(ev){
    ev.preventDefault();
    if(!token)return;
    const p=regrasProdutosLoop.find(x=>x.produtoId===el('produtoElegibilidadeLoopDemo').value);
    if(!p)return;
    const botao=el('salvarElegibilidadeLoopDemo');
    botao.disabled=true;
    try{
      const r=await requisitar('carrinho-loop-demo/elegibilidade',{
        method:'POST',
        body:JSON.stringify({
          produtoId:p.produtoId,revisaoEsperada:p.revisaoElegibilidade,
          elegivelLoop:el('valorElegibilidadeLoopDemo').value==='sim'
        })
      });
      await carregarCarrinhosLoop();
      el('statusElegibilidadeLoopDemo').textContent=
        'Regra salva: '+(r.regra.elegivelLoop?'válido para LOOP':'somente loja')+
        '. Vale para novos pedidos; os anteriores estão protegidos.';
    }catch(e){el('statusElegibilidadeLoopDemo').textContent=e.message;}
    finally{botao.disabled=false;}
  }
  async function carregarCarrinhosLoop(){
    const atual=++versaoCarrinho;
    const lista=el('listaCarrinhosLoopDemo');
    if(!token)return;
    try{
      const [opcoes,carrinhos,contas,regras]=await Promise.all([
        requisitar('carrinho-loop-demo/opcoes'),
        requisitar('carrinho-loop-demo'),
        requisitar('contas-participantes-demo'),
        requisitar('carrinho-loop-demo/elegibilidade')
      ]);
      if(atual!==versaoCarrinho)return;
      opcoesCarrinho=opcoes.produtos;
      pedidosCarrinho=carrinhos.pedidos;
      regrasProdutosLoop=regras.produtos;
      const seletorRegra=el('produtoElegibilidadeLoopDemo');
      const anteriorRegra=seletorRegra.value;
      seletorRegra.replaceChildren();
      for(const p of regrasProdutosLoop){
        const opt=document.createElement('option');
        opt.value=p.produtoId;
        opt.textContent=p.nome+' · '+(p.elegivelLoop?'conta para LOOP':'somente loja');
        seletorRegra.append(opt);
      }
      if(regrasProdutosLoop.some(p=>p.produtoId===anteriorRegra))
        seletorRegra.value=anteriorRegra;
      mostrarRegraProdutoLoop();
      const escolhaConta=el('contaCarrinhoLoopDemo');
      const antigaConta=escolhaConta.value;
      escolhaConta.replaceChildren();
      for(const conta of contas.contas){
        const opt=document.createElement('option');
        opt.value=conta.contaId;opt.textContent=conta.nome;
        escolhaConta.append(opt);
      }
      if(contas.contas.some(c=>c.contaId===antigaConta))escolhaConta.value=antigaConta;
      const linhas=[...el('itensCarrinhoLoopDemo').children].map(l=>({
        produtoId:l.querySelector('.produto-carrinho-lab').value,
        quantidade:l.querySelector('.quantidade-carrinho-lab').value
      }));
      el('itensCarrinhoLoopDemo').replaceChildren();
      for(const antigo of linhas){
        adicionarLinhaCarrinho();
        const linha=el('itensCarrinhoLoopDemo').lastElementChild;
        if(!linha)break;
        const produto=linha.querySelector('.produto-carrinho-lab');
        if(opcoesCarrinho.some(p=>p.produtoId===antigo.produtoId))produto.value=antigo.produtoId;
        linha.querySelector('.quantidade-carrinho-lab').value=antigo.quantidade;
      }
      if(!linhas.length)adicionarLinhaCarrinho();
      atualizarTotalCarrinho();
      const selectPedido=el('pedidoEventoCarrinhoLoopDemo');
      const anterior=selectPedido.value;
      selectPedido.replaceChildren();lista.replaceChildren();
      for(const pedido of pedidosCarrinho){
        const opt=document.createElement('option');
        opt.value=pedido.pedidoId;
        opt.textContent=pedido.pedidoId+' — '+money(pedido.totalCentavos);
        selectPedido.append(opt);
        const item=document.createElement('div');item.className='financeiro-caixa';
        const nome=document.createElement('strong');nome.textContent='Carrinho '+pedido.pedidoId;
        const detalhes=document.createElement('span');
        detalhes.textContent=pedido.itens.map(i=>i.quantidade+' × '+i.nome).join(' + ')+
          ' = '+money(pedido.totalCentavos)+
          ' · válido LOOP '+money(pedido.totalElegivelLoopCentavos);
        const situacao=document.createElement('small');
        situacao.textContent=pedido.situacaoPagamentoFicticio+' · '+
          (pedido.posicaoCriada?'Posição azul LOOP #'+pedido.posicaoId:
           pedido.vendaSomenteLoja?'Venda apenas da loja, sem posição':
           'Ainda sem posição (aguardando pagamento fictício)')+
          ' · Nenhuma entrega real.';
        item.append(nome,detalhes,situacao);lista.append(item);
      }
      if(pedidosCarrinho.some(p=>p.pedidoId===anterior))selectPedido.value=anterior;
      el('statusCarrinhoLoopDemo').textContent=pedidosCarrinho.length+
        ' carrinho(s) fictícios registrados.';
    }catch(e){
      if(atual===versaoCarrinho)el('statusCarrinhoLoopDemo').textContent=e.message;
    }
  }
  async function salvarCarrinhoLoop(evento){
    evento.preventDefault();
    if(!token||salvandoCarrinho)return;
    const itens=[...el('itensCarrinhoLoopDemo').children].map(l=>({
      produtoId:l.querySelector('.produto-carrinho-lab').value,
      quantidade:Number(l.querySelector('.quantidade-carrinho-lab').value)
    }));
    const status=el('statusCarrinhoLoopDemo');
    if(!itens.length){status.textContent='Adicione pelo menos um produto.';return;}
    salvandoCarrinho=true;
    const botao=el('salvarCarrinhoLoopDemo');botao.disabled=true;
    try{
      const r=await requisitar('carrinho-loop-demo',{
        method:'POST',body:JSON.stringify({
          pedidoId:el('pedidoCarrinhoLoopDemo').value.trim(),
          contaId:el('contaCarrinhoLoopDemo').value,itens
        })
      });
      await carregarCarrinhosLoop();
      status.textContent=(r.pedido.repetido?'Carrinho já registrado. ':
        'Carrinho criado. ')+'Total: '+money(r.pedido.totalCentavos)+
        ' · válido LOOP: '+money(r.pedido.totalElegivelLoopCentavos)+
        '. Confirme o evento fictício para gerar posição se qualificar.';
    }catch(e){status.textContent=e.message;}
    finally{salvandoCarrinho=false;botao.disabled=false;}
  }
  async function eventoCarrinhoLoop(evento){
    evento.preventDefault();
    if(!token||salvandoEventoCarrinho)return;
    salvandoEventoCarrinho=true;
    const botao=el('registrarEventoCarrinhoLoopDemo');botao.disabled=true;
    const status=el('statusEventoCarrinhoLoopDemo');
    try{
      const id=el('pedidoEventoCarrinhoLoopDemo').value;
      const r=await requisitar('carrinho-loop-demo/'+encodeURIComponent(id)+'/eventos',{
        method:'POST',body:JSON.stringify({
          eventoId:el('idEventoCarrinhoLoopDemo').value.trim(),
          tipo:el('tipoEventoCarrinhoLoopDemo').value
        })
      });
      await carregarCarrinhosLoop();
      status.textContent=(r.repetido?'Evento repetido. ':'Evento registrado. ')+
        'LOOP: '+r.integracao.situacao+
        (r.integracao.posicaoId?' · Posição '+r.integracao.posicaoId:'')+
        '. Apenas simulação.';
    }catch(e){status.textContent=e.message;}
    finally{salvandoEventoCarrinho=false;botao.disabled=false;}
  }
  async function sincronizarCarrinhoLoop(){
    const id=el('pedidoEventoCarrinhoLoopDemo').value;
    const status=el('statusEventoCarrinhoLoopDemo');
    if(!token||!id)return;
    try{
      const r=await requisitar('carrinho-loop-demo/'+encodeURIComponent(id)+'/sincronizar',{
        method:'POST',body:'{}'
      });
      await carregarCarrinhosLoop();
      status.textContent='Conferência do carrinho: '+r.situacao+
        (r.posicaoId?' · Posição '+r.posicaoId:'')+'.';
    }catch(e){status.textContent=e.message;}
  }
  async function consultarVinculoPDF(){
    const id=el('pedidoVinculoPDFLoopDemo').value;
    if(!id||!token)return;
    const estado=await requisitar('pedidos-pdf-demo/'+encodeURIComponent(id)+'/estado-loop');
    const aviso=el('estadoSincronizacaoPDFLoopDemo');
    if(!estado.vinculado)aviso.textContent='Pedido '+id+': ainda sem comprador identificado.';
    else aviso.textContent='Pedido '+id+' vinculado. '+
      (estado.posicaoCriada?'Posição '+estado.posicaoId+' criada no LOOP.':
      estado.lojaSemPosicao?'Venda somente da loja, sem posição.':
      'Aguardando confirmação do pagamento ou conferência.')+
      ' Status: '+estado.situacaoPagamento+'.';
  }
  async function vincularCompradorPDF(evento){
    evento.preventDefault();
    if(!token||salvandoVinculoPDF)return;
    const id=el('pedidoVinculoPDFLoopDemo').value;
    const contaId=el('titularPedidoPDFLoopDemo').value;
    const aviso=el('estadoVinculoPDFLoopDemo');
    if(!id||!contaId){aviso.textContent='Escolha um pedido e uma conta fictícia.';return;}
    salvandoVinculoPDF=true;
    const botao=el('confirmarVinculoPDFLoopDemo');botao.disabled=true;
    try{
      const dado=await requisitar('pedidos-pdf-demo/'+encodeURIComponent(id)+'/vincular-loop',{
        method:'POST',body:JSON.stringify({contaId})
      });
      aviso.textContent=dado.repetido?
        'Comprador já vinculado ao mesmo pedido; nenhum dado duplicado.':
        'Comprador identificado e fixado antes da confirmação fictícia.';
      await consultarVinculoPDF();
    }catch(e){aviso.textContent=e.message;}
    finally{salvandoVinculoPDF=false;botao.disabled=false;}
  }
  async function conferirSincronizacaoPDF(){
    const id=el('pedidoVinculoPDFLoopDemo').value;
    const aviso=el('estadoSincronizacaoPDFLoopDemo');
    if(!id||!token)return;
    if(sincronizandoPDF)return;
    sincronizandoPDF=true;const botao=el('sincronizarPDFLoopDemo');botao.disabled=true;
    try{
      const r=await requisitar('pedidos-pdf-demo/'+encodeURIComponent(id)+'/sincronizar-loop',{
        method:'POST',body:'{}'
      });
      aviso.textContent='Conferência: '+r.situacao+
        (r.posicaoId?' — posição '+r.posicaoId:'')+'.';
      await carregarPedidosPDF();
    }catch(e){aviso.textContent=e.message;}
    finally{sincronizandoPDF=false;botao.disabled=false;}
  }
  async function registrarPedidoPDF(evento){
    evento.preventDefault();
    if(!token||salvandoPDF)return;
    salvandoPDF=true;
    const botao=el('registrarPedidoPDFDemo');
    botao.disabled=true;
    const aviso=el('statusPedidosPDFDemo');
    try{
      const produtoId=el('produtoPedidoPDFDemo').value;
      if(!produtoId)throw new Error('Cadastre e publique um curso PDF com preço de demonstração.');
      const resposta=await requisitar('pedidos-pdf-demo',{
        method:'POST',body:JSON.stringify({
          pedidoId:el('idPedidoPDFDemo').value.trim(),produtoId
        })
      });
      await carregarPedidosPDF();
      aviso.textContent=resposta.repetido?'Pedido fictício já registrado; sem duplicação.':
        'Pedido PDF fictício salvo com preço do catálogo e fatura de teste. Nenhuma cobrança.';
    }catch(erro){aviso.textContent=erro.message;}
    finally{salvandoPDF=false;botao.disabled=false;}
  }
  async function registrarEventoPDF(evento){
    evento.preventDefault();
    if(!token||salvandoEventoPDF)return;
    salvandoEventoPDF=true;
    const botao=el('registrarEventoPDFDemo');
    botao.disabled=true;
    const aviso=el('statusEventoPDFDemo');
    try{
      const pedidoId=el('pedidoEventoPDFDemo').value;
      if(!pedidoId)throw new Error('Selecione um pedido de curso PDF fictício.');
      const resposta=await requisitar('pedidos-pdf-demo/'+encodeURIComponent(pedidoId)+'/eventos',{
        method:'POST',body:JSON.stringify({
          eventoId:el('idEventoPDFDemo').value.trim(),
          tipo:el('tipoEventoPDFDemo').value
        })
      });
      await carregarPedidosPDF();
      const integracao=resposta.integracaoLoop;
      aviso.textContent=(resposta.repetido?'Evento fictício repetido. ':'Evento PDF registrado. ')+
        (integracao?.situacao==='POSICAO_LOOP_CRIADA_OU_EXISTENTE'?
        'Compra qualificada: posição azul registrada no LOOP.':
        integracao?.situacao==='SOMENTE_LOJA'?
        'Compra de loja sem posição LOOP.':
        integracao?.situacao==='SINCRONIZACAO_PENDENTE'?
        'Conferência do LOOP pendente; use o botão de sincronização.':
        integracao?.situacao==='SEM_TITULAR_PREDEFINIDO'?
        'Sem posição: pedido não foi vinculado antes da confirmação.':
        'Nenhuma posição criada neste evento.')+
        ' Nenhum dinheiro real movimentado.';
    }catch(erro){aviso.textContent=erro.message;}
    finally{salvandoEventoPDF=false;botao.disabled=false;}
  }

  async function carregarHistoricoPagamentoFisico(){
    const atual=++versaoHistoricoPagamentoFisico;
    const pedidoId=el('pedidoPagamentoFisicoDemo').value;
    const alvo=el('historicoPagamentoPrePedidoFisicoDemo');
    alvo.replaceChildren();
    if(!token||!pedidoId)return;
    try{
      const resultado=await requisitar('pagamentos-pre-pedidos-fisicos-demo/'+
        encodeURIComponent(pedidoId)+'/historico');
      if(atual!==versaoHistoricoPagamentoFisico ||
         pedidoId!==el('pedidoPagamentoFisicoDemo').value)return;
      for(const evento of resultado.eventos){
        const linha=document.createElement('li');
        linha.textContent=evento.tipo+' — '+money(evento.valorCentavos)+
          ' — '+evento.eventoId+' — '+evento.registradoEm;
        alvo.append(linha);
      }
      if(!resultado.eventos.length){
        const linha=document.createElement('li');
        linha.textContent='Ainda não existem eventos para este pré-pedido fictício.';
        alvo.append(linha);
      }
    }catch(e){
      if(atual===versaoHistoricoPagamentoFisico){
        el('statusPagamentoPrePedidoFisicoDemo').textContent=e.message;
      }
    }
  }
  async function carregarAuditoriaPagamentosFisicos(){
    const atual=++versaoAuditoriaFisica;
    const resumo=el('resumoAuditoriaFisicosDemo');
    const lista=el('listaAuditoriaFisicosDemo');
    const painelFornecedores=el('resumoFornecedorAuditoriaFisicosDemo');
    lista.replaceChildren();
    painelFornecedores.replaceChildren();
    if(!token){resumo.textContent='Aguardando autenticação local.';return;}
    try{
      const dados=await requisitar('pagamentos-pre-pedidos-fisicos-demo/auditoria');
      if(atual!==versaoAuditoriaFisica)return;
      const t=dados.totais;
      resumo.textContent='Pré-pedidos: '+t.quantidadePrePedidos+
        ' · Aguardando: '+t.aguardando+
        ' · Confirmados fictícios: '+t.confirmados+
        ' ('+money(t.valorConfirmadoFicticioCentavos)+')'+
        ' · Estornados fictícios: '+t.estornados+
        ' ('+money(t.valorEstornadoFicticioCentavos)+')'+
        ' · Divergências: '+t.divergentes+
        ' · Situação: '+dados.integridade+
        '. Nenhum valor bancário confirmado.';
      for(const pedido of dados.conferencias){
        if(pedido.problemas.length===0)continue;
        const linha=document.createElement('li');
        linha.textContent=pedido.pedidoId+' — '+pedido.problemas.join(', ')+
          ' — valor original '+money(pedido.precoSnapshotCentavos)+
          '. Fornecedor permanece bloqueado.';
        lista.append(linha);
      }
      for(const evento of dados.eventosOrfaos){
        const linha=document.createElement('li');
        linha.textContent='Evento órfão '+evento.eventoId+' — '+evento.problema;
        lista.append(linha);
      }
      if(!lista.childNodes.length){
        const linha=document.createElement('li');
        linha.textContent='Nenhuma divergência encontrada nos registros de teste.';
        lista.append(linha);
      }
      for(const fornecedor of dados.resumoPorFornecedor){
        const quadro=document.createElement('div');
        quadro.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=fornecedor.fornecedorId;
        const linha=document.createElement('span');
        linha.className='financeiro-linha-saldos';
        linha.textContent=fornecedor.prePedidos+' pré-pedido(s) fictício(s), '+
          fornecedor.confirmados+' confirmado(s), '+
          fornecedor.estornados+' estornado(s), '+
          fornecedor.divergentes+' divergente(s).';
        const detalhe=document.createElement('small');
        detalhe.textContent='Compras fictícias: '+money(fornecedor.valorPrePedidosFicticiosCentavos)+
          '; valor confirmado no teste: '+money(fornecedor.valorConfirmadoFicticioCentavos)+
          '; custo HIPOTÉTICO desses confirmados: '+money(fornecedor.custoTesteConfirmadoCentavos)+
          '. Sem repasse real ou envio de pedido.';
        quadro.append(titulo,linha,detalhe);
        painelFornecedores.append(quadro);
      }
    }catch(e){
      if(atual===versaoAuditoriaFisica){
        resumo.textContent='Não foi possível conferir o laboratório: '+e.message;
      }
    }
  }
  async function carregarPagamentosFisicos(){
    const atual=++versaoPagamentoFisico;
    const aviso=el('statusPagamentoPrePedidoFisicoDemo');
    if(!token){aviso.textContent='Abra o laboratório com a chave local.';return;}
    // Rota independente: exibe anomalías mesmo se o endpoint de listagem recusar dados corrompidos.
    void carregarAuditoriaPagamentosFisicos();
    try{
      const dados=await requisitar('pagamentos-pre-pedidos-fisicos-demo');
      if(atual!==versaoPagamentoFisico)return;
      pagamentosFisicos=dados.pedidos;
      const select=el('pedidoPagamentoFisicoDemo');
      const anterior=select.value;
      select.replaceChildren();
      const lista=el('listaPagamentosPrePedidosFisicosDemo');
      lista.replaceChildren();
      for(const p of pagamentosFisicos){
        const opcao=document.createElement('option');
        opcao.value=p.pedidoId;
        opcao.textContent=p.pedidoId+' — '+money(p.precoCatalogoCentavos);
        select.append(opcao);
        const linha=document.createElement('div');
        linha.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=p.pedidoId+' — '+p.nomeProduto;
        const status=document.createElement('span');
        status.className='financeiro-linha-saldos';
        status.textContent='Valor da compra fictícia: '+money(p.valorVinculadoPagamentoFicticioCentavos)+
          ' | '+p.situacaoPagamentoFicticio;
        const detalhe=document.createElement('small');
        detalhe.textContent='Intenção '+p.pagamentoIntentoTesteId+
          ' | eventos: '+p.quantidadeEventosPagamentoFicticio+
          ' | logística '+p.situacaoLogistica+
          ' | fornecedor BLOQUEADO. Sem PSP, dinheiro, cofre ou catraca real.';
        linha.append(titulo,status,detalhe);
        lista.append(linha);
      }
      if(pagamentosFisicos.some(p=>p.pedidoId===anterior))select.value=anterior;
      aviso.textContent=pagamentosFisicos.length+
        ' pré-pedido(s) físicos com conferência de pagamento fictício.';
      await carregarHistoricoPagamentoFisico();
    }catch(e){
      if(atual===versaoPagamentoFisico)aviso.textContent=e.message;
    }
  }
  async function registrarEventoPagamentoFisico(evento){
    evento.preventDefault();
    if(!token||salvandoPagamentoFisico)return;
    salvandoPagamentoFisico=true;
    const botao=el('registrarEventoPagamentoFisicoDemo');
    botao.disabled=true;
    const aviso=el('statusPagamentoPrePedidoFisicoDemo');
    try{
      const pedidoId=el('pedidoPagamentoFisicoDemo').value;
      const pedido=pagamentosFisicos.find(x=>x.pedidoId===pedidoId);
      if(!pedido)throw new Error('Primeiro registre um pré-pedido físico de teste.');
      const resultado=await requisitar('pagamentos-pre-pedidos-fisicos-demo/'+
        encodeURIComponent(pedidoId)+'/eventos',{
        method:'POST',body:JSON.stringify({
          pagamentoIntentoTesteId:pedido.pagamentoIntentoTesteId,
          eventoId:el('idEventoPagamentoFisicoDemo').value.trim(),
          tipo:el('tipoPagamentoFisicoDemo').value
        })
      });
      await carregarPagamentosFisicos();
      aviso.textContent=resultado.repetido?
        'Evento fictício repetido; nenhum novo lançamento.':
        'Pagamento fictício conferido. Fornecedor, cofres e fila continuam bloqueados.';
    }catch(e){aviso.textContent=e.message;}
    finally{salvandoPagamentoFisico=false;botao.disabled=false;}
  }

  async function carregarPlanejamentoFisico(){
    const atual=++versaoPlanejamentoFisico;
    const aviso=el('statusPlanejamentoFisicoDemo');
    if(!token){aviso.textContent='Abra a demonstração com a chave local.';return;}
    try{
      const [dados,prePedidos]=await Promise.all([
        requisitar('planejamento-fisico-demo'),
        requisitar('planejamento-fisico-demo/pre-pedidos')
      ]);
      if(atual!==versaoPlanejamentoFisico)return;
      analisesFisicas=dados.produtos;
      const cotacoes=el('listaPlanejamentoFisicoDemo');
      cotacoes.replaceChildren();
      const selecionado=el('produtoCustoFisicoDemo');
      const anterior=selecionado.value;
      selecionado.replaceChildren();
      const elegiveis=el('produtoPrePedidoFisicoDemo');
      const antigoElegivel=elegiveis.value;
      elegiveis.replaceChildren();
      for(const d of analisesFisicas){
        const quadro=document.createElement('div');
        quadro.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=d.nomeProduto+' — '+d.produtoId;
        const financeiro=document.createElement('span');
        financeiro.className='financeiro-linha-saldos';
        financeiro.textContent='Vitrine '+(d.precoCatalogoCentavos===null?'sem preço':
          money(d.precoCatalogoCentavos))+
          ' | fornecedor '+(d.custoFornecedorTesteCentavos===null?'não informado':
          money(d.custoFornecedorTesteCentavos))+
          ' | referência LOOP '+money(d.reservaReferencialLoopCentavos);
        const avisoEstado=document.createElement('small');
        avisoEstado.textContent='Situação: '+d.situacao+
          (d.margemBrutaPreliminarCentavos===null?'':
          ' | margem bruta ANTES de impostos e taxas '+money(d.margemBrutaPreliminarCentavos));
        quadro.append(titulo,financeiro,avisoEstado);
        cotacoes.append(quadro);
        if(d.fornecedorId){
          const opt=document.createElement('option');
          opt.value=d.produtoId;
          opt.textContent=d.nomeProduto;
          selecionado.append(opt);
        }
        if(d.situacao==='PRE_PEDIDO_FICTICIO_POSSIVEL'){
          const opt=document.createElement('option');
          opt.value=d.produtoId;
          opt.textContent=d.nomeProduto+' — '+money(d.precoCatalogoCentavos);
          elegiveis.append(opt);
        }
      }
      if(analisesFisicas.some(x=>x.produtoId===anterior&&x.fornecedorId))selecionado.value=anterior;
      if(analisesFisicas.some(x=>x.produtoId===antigoElegivel&&
        x.situacao==='PRE_PEDIDO_FICTICIO_POSSIVEL'))elegiveis.value=antigoElegivel;
      const destino=el('listaPrePedidosFisicosDemo');
      destino.replaceChildren();
      for(const p of prePedidos.pedidos){
        const quadro=document.createElement('div');
        quadro.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=p.pedidoId+' — '+p.nomeProduto;
        const corpo=document.createElement('small');
        corpo.textContent='Preço '+money(p.precoCatalogoCentavos)+
          ' | custo de teste '+money(p.custoFornecedorTesteCentavos)+
          ' | referência LOOP '+money(p.reservaReferencialLoopCentavos)+
          ' | margem bruta preliminar '+money(p.margemBrutaPreliminarCentavos)+
          ' | ID de intenção sem cobrança '+p.pagamentoIntentoTesteId;
        quadro.append(titulo,corpo);
        destino.append(quadro);
      }
      aviso.textContent=analisesFisicas.length+' produto(s) físicos no catálogo, '+
        prePedidos.pedidos.length+' pré-pedido(s) fictício(s). Nenhum pagamento ou posição criado.';
    }catch(e){if(atual===versaoPlanejamentoFisico)aviso.textContent=e.message;}
  }
  async function registrarCustoFisico(evento){
    evento.preventDefault();
    if(!token||salvandoCustoFisico)return;
    salvandoCustoFisico=true;
    const botao=el('salvarCustoFisicoDemo');
    botao.disabled=true;
    const aviso=el('statusPlanejamentoFisicoDemo');
    try{
      const produtoId=el('produtoCustoFisicoDemo').value;
      const valor=el('valorCustoFisicoDemo').value.trim();
      if(!/^[0-9]+(?:[.,][0-9]{1,2})?$/.test(valor))throw new Error('Informe um valor em reais, por exemplo 250,00.');
      const [inteira,fracao='']=valor.replace(',','.').split('.');
      const custo=Number(inteira)*100+Number(fracao.padEnd(2,'0'));
      if(!Number.isSafeInteger(custo)||custo<=0)throw new Error('Custo de teste inválido.');
      const d=analisesFisicas.find(p=>p.produtoId===produtoId);
      if(!d)throw new Error('Selecione um produto físico com fornecedor.');
      const resposta=await requisitar('planejamento-fisico-demo/custos',{
        method:'POST',body:JSON.stringify({
          produtoId,custoCentavos:custo,revisaoEsperada:d.revisaoCustoTeste
        })
      });
      await carregarPlanejamentoFisico();
      aviso.textContent=resposta.alterado?
        'Custo hipotético registrado. Isso não é contrato com fornecedor nem cobrança.':
        'Custo de teste já registrado; nenhuma alteração.';
    }catch(e){aviso.textContent=e.message;}
    finally{salvandoCustoFisico=false;botao.disabled=false;}
  }
  async function registrarPrePedidoFisico(evento){
    evento.preventDefault();
    if(!token||salvandoPrePedidoFisico)return;
    salvandoPrePedidoFisico=true;
    const botao=el('salvarPrePedidoFisicoDemo');
    botao.disabled=true;
    const aviso=el('statusPrePedidoFisicoDemo');
    try{
      const produtoId=el('produtoPrePedidoFisicoDemo').value;
      const d=analisesFisicas.find(x=>x.produtoId===produtoId);
      if(!d||d.situacao!=='PRE_PEDIDO_FICTICIO_POSSIVEL'){
        throw new Error('Falta preço, custo atualizado ou margem preliminar positiva.');
      }
      const resposta=await requisitar('planejamento-fisico-demo/pre-pedidos',{
        method:'POST',body:JSON.stringify({
          pedidoId:el('idPrePedidoFisicoDemo').value.trim(),
          produtoId,revisaoProduto:d.revisaoProduto,
          revisaoCustoTeste:d.revisaoCustoTeste
        })
      });
      await Promise.all([carregarPlanejamentoFisico(),carregarPagamentosFisicos()]);
      aviso.textContent=resposta.repetido?
        'Pré-pedido já existia; sem registro duplicado.':
        'Pré-pedido fictício guardado. Nenhum pagamento, envio ou posição ocorreu.';
    }catch(e){aviso.textContent=e.message;}
    finally{salvandoPrePedidoFisico=false;botao.disabled=false;}
  }

  async function carregarPedidosComerciais(){
    const atual=++versaoComercial;
    const aviso=el('statusPedidosComerciaisDemo');
    if(!token){aviso.textContent='Abra a demonstração com a chave local.';return;}
    try{
      const [lista,opcoes,cotacoes]=await Promise.all([
        requisitar('pedidos-comerciais-demo'),
        requisitar('pedidos-comerciais-demo/opcoes'),
        requisitar('pedidos-comerciais-demo/cotacoes-teste')
      ]);
      if(atual!==versaoComercial)return;
      function popular(id,items,getId,getText){
        const select=el(id),anterior=select.value;
        select.replaceChildren();
        for(const item of items){
          const opt=document.createElement('option');
          opt.value=getId(item);
          opt.textContent=getText(item);
          select.append(opt);
        }
        if(items.some(item=>getId(item)===anterior))select.value=anterior;
      }
      popular('produtoPedidoComercialDemo',opcoes.produtos,
        p=>p.produtoId,p=>p.nome+' — '+money(p.precoCentavos));
      popular('pagamentoPedidoComercialDemo',opcoes.pagamentos,
        p=>p.pagamentoId,p=>p.pagamentoId+' — '+money(p.valorCentavos));
      const destino=el('listaPedidosComerciaisDemo');
      destino.replaceChildren();
      for(const p of lista.pedidos){
        const artigo=document.createElement('div');
        artigo.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=p.pedidoId+' — '+p.nomeProduto;
        const linha=document.createElement('span');
        linha.className='financeiro-linha-saldos';
        linha.textContent='Preço do pedido: '+money(p.precoBrutoCentavos)+
          ' | Pagamento '+p.pagamentoId+' — '+p.situacaoPagamentoFicticio;
        const legenda=document.createElement('small');
        legenda.textContent='Fornecedor de teste '+p.fornecedorId+' / SKU '+p.sku+
          ' | Parcela LOOP '+money(p.parcelaLoopExemploCentavos)+
          ' | Sobra bruta '+money(p.sobraComercialBrutaExemploCentavos)+
          '. Fotografia imutável da compra fictícia.';
        artigo.append(titulo,linha,legenda);
        destino.append(artigo);
      }
      const cotacoesAlvo=el('listaCotacoesFisicasDemo');
      cotacoesAlvo.replaceChildren();
      for(const cotacao of cotacoes.produtos){
        const artigo=document.createElement('div');
        artigo.className='financeiro-caixa';
        const nomeProduto=document.createElement('strong');
        nomeProduto.textContent=cotacao.nomeProduto;
        const preco=document.createElement('span');
        preco.className='financeiro-linha-saldos';
        preco.textContent=money(cotacao.precoCatalogoCentavos);
        const nota=document.createElement('small');
        nota.textContent='Fornecedor de teste: '+cotacao.fornecedorId+
          ' — sem cotação de custo, divisão financeira ou cobrança.';
        artigo.append(nomeProduto,preco,nota);
        cotacoesAlvo.append(artigo);
      }
      aviso.textContent=lista.pedidos.length+' pedido(s) comercial(is) fictício(s) registrado(s). '+
        opcoes.produtos.length+' produto(s) físico(s) publicado(s) com fornecedor e '+
        opcoes.pagamentos.length+' fatura(s) de teste pendente(s).';
    }catch(e){if(atual===versaoComercial)aviso.textContent=e.message;}
  }
  async function criarPedidoComercial(e){
    e.preventDefault();
    if(!token||salvandoPedidoComercial)return;
    const aviso=el('statusPedidosComerciaisDemo');
    const botao=el('registrarPedidoComercialDemo');
    salvandoPedidoComercial=true;
    botao.disabled=true;
    try{
      const produtoId=el('produtoPedidoComercialDemo').value;
      const pagamentoId=el('pagamentoPedidoComercialDemo').value;
      if(!produtoId||!pagamentoId)throw new Error('Escolha produto e pagamento fictícios disponíveis.');
      const resultado=await requisitar('pedidos-comerciais-demo',{
        method:'POST',
        body:JSON.stringify({
          pedidoId:el('idPedidoComercialDemo').value.trim(),
          produtoId,pagamentoId
        })
      });
      await carregarPedidosComerciais();
      aviso.textContent=resultado.repetido?
        'Pedido fictício já estava registrado; nada foi duplicado.':
        'Pedido comercial fictício salvo com preço, fornecedor e pagamento vinculados. Nenhuma venda real.';
    }catch(e){aviso.textContent=e.message;}
    finally{salvandoPedidoComercial=false;botao.disabled=false;}
  }

  // Correlacao somente LEITURA; intencionalmente nao altera pedidos,
  // nao cria posicoes e nao simula cobranca de cliente real.
  async function carregarHistoricoPonte(){
    const atual=++versaoHistoricoPonte;
    const pedidoId=el('pedidoHistoricoPonteDemo').value;
    const lista=el('historicoPontePedidoPagamentoDemo');
    lista.replaceChildren();
    if(!token||!pedidoId)return;
    try{
      const ret=await requisitar('pedidos-pagamentos-demo/'+encodeURIComponent(pedidoId)+'/historico');
      if(atual!==versaoHistoricoPonte||pedidoId!==el('pedidoHistoricoPonteDemo').value)return;
      const blocos=[
        {nome:'Logística fictícia',eventos:ret.eventosLogistica},
        {nome:'Pagamento fictício',eventos:ret.eventosFinanceiros}
      ];
      for(const bloco of blocos){
        for(const evento of bloco.eventos){
          const li=document.createElement('li');
          li.textContent=bloco.nome+' — '+evento.tipo+
            ' — '+evento.eventoId+' — '+
            (evento.ocorridoEm||evento.registradoEm||'');
          lista.append(li);
        }
      }
      if(!lista.childNodes.length){
        const li=document.createElement('li');
        li.textContent='Nenhum evento neste exemplo.';
        lista.append(li);
      }
    }catch(e){
      if(atual===versaoHistoricoPonte){
        el('statusPontePedidoPagamentoDemo').textContent=e.message;
      }
    }
  }
  async function carregarPontePedidoPagamento(){
    const atual=++versaoPonte;
    const alvo=el('listaPontePedidoPagamentoDemo');
    const statusPonte=el('statusPontePedidoPagamentoDemo');
    alvo.replaceChildren();
    if(!token){statusPonte.textContent='Informe a chave administrativa de teste.';return;}
    try{
      const dados=await requisitar('pedidos-pagamentos-demo');
      if(atual!==versaoPonte)return;
      pedidosAssociados=dados.pedidos;
      const selecionar=el('pedidoHistoricoPonteDemo');
      const anterior=selecionar.value;
      selecionar.replaceChildren();
      for(const p of pedidosAssociados){
        const artigo=document.createElement('div');
        artigo.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=p.pedidoId+' ↔ '+p.pagamentoId;
        const estado=document.createElement('span');
        estado.className='financeiro-linha-saldos';
        estado.textContent='Logística: '+p.statusLogisticoSimulado+
          ' | Pagamento: '+p.statusPSPSimulado;
        const alerta=document.createElement('small');
        alerta.textContent='Conferência: '+p.integridade+
          ' | Venda fictícia '+money(p.precoBrutoCentavos)+
          ', fornecedor '+money(p.fornecedorCentavos)+
          ', parcela LOOP '+money(p.parcelaLoopCentavos)+
          ', sobra bruta '+money(p.sobraBrutaCentavos)+
          '. Não movimenta fila, catraca ou recursos.';
        artigo.append(titulo,estado,alerta);
        alvo.append(artigo);
        const option=document.createElement('option');
        option.value=p.pedidoId;
        option.textContent=p.pedidoId+' → '+p.pagamentoId;
        selecionar.append(option);
      }
      if(pedidosAssociados.some(p=>p.pedidoId===anterior))selecionar.value=anterior;
      statusPonte.textContent='Relação fictícia de pedidos e pagamentos conferida. Nenhum pedido real foi enviado.';
      await carregarHistoricoPonte();
    }catch(e){
      if(atual===versaoPonte)statusPonte.textContent=e.message;
    }
  }

  // Estes pagamentos nao existem fora do ambiente administrativo local.
  // Confirmar/estornar aciona somente o livro SQLite de simulacao.
  async function carregarHistoricoPSP(){
    const valor=el('pagamentoSelecionadoPSPDemo').value;
    const pagamento=recebimentos.find(p=>p.pagamentoId===valor);
    const lista=el('historicoRecebimentoPSPDemo');
    lista.replaceChildren();
    if(!pagamento)return;
    el('detalhePagamentoPSPDemo').textContent=
      pagamento.pagamentoId+' — '+pagamento.situacao+
      ' — '+money(pagamento.valorCentavos)+' (Fornecedor '+money(pagamento.fornecedorCentavos)+
      ', LOOP '+money(pagamento.parcelaLoopCentavos)+
      ', sobra bruta '+money(pagamento.sobraBrutaCentavos)+') — evento '+
      pagamento.ordemCiclo+'/5, cenário '+pagamento.cicloDemo+'. Tudo fictício.';
    try{
      const ret=await requisitar('recebimentos-psp-demo/'+encodeURIComponent(valor)+'/historico');
      if(el('pagamentoSelecionadoPSPDemo').value!==valor)return;
      for(const e of ret.eventos){
        const li=document.createElement('li');
        li.textContent=e.tipo+' — '+e.eventoId+' — '+e.registradoEm;
        lista.append(li);
      }
      if(!ret.eventos.length){
        const li=document.createElement('li');
        li.textContent='Nenhum evento fictício registrado.';
        lista.append(li);
      }
    }catch(e){el('statusEventoPSPDemo').textContent=e.message;}
  }
  async function carregarRecebimentos(){
    const atual=++versaoRecebimentos;
    const dados=await requisitar('recebimentos-psp-demo');
    if(atual!==versaoRecebimentos)return;
    recebimentos=dados.pagamentos;
    const escolha=el('pagamentoSelecionadoPSPDemo');
    const anterior=escolha.value;
    escolha.replaceChildren();
    for(const p of recebimentos){
      const option=document.createElement('option');
      option.value=p.pagamentoId;
      option.textContent=p.pagamentoId+' — '+p.situacao;
      escolha.append(option);
    }
    if(recebimentos.some(p=>p.pagamentoId===anterior))escolha.value=anterior;
    await carregarHistoricoPSP();
  }
  async function registrarEventoPSP(e){
    e.preventDefault();
    if(salvandoEventoPSP || !token)return;
    salvandoEventoPSP=true;
    const botao=el('registrarEventoPSPDemo');
    botao.disabled=true;
    const aviso=el('statusEventoPSPDemo');
    try{
      const pagamentoId=el('pagamentoSelecionadoPSPDemo').value;
      const corpo={
        eventoId:el('idEventoPSPDemo').value.trim(),
        tipo:el('tipoEventoPSPDemo').value
      };
      const ret=await requisitar('recebimentos-psp-demo/'+encodeURIComponent(pagamentoId)+'/eventos',{
        method:'POST',body:JSON.stringify(corpo)
      });
      await Promise.all([carregarRecebimentos(),carregarLivro(),carregarPontePedidoPagamento(),carregarPedidosComerciais()]);
      aviso.textContent=ret.resultado.repetido?
        'Evento fictício repetido: nenhum lançamento adicional.':
        'Evento fictício confirmado no livro de teste; nenhuma cobrança ou movimentação real.';
    }catch(erro){aviso.textContent='Não foi possível simular: '+erro.message;}
    finally{salvandoEventoPSP=false;botao.disabled=false;}
  }

  // Livro independente do ciclo aritmetico anterior: seu historico so muda
  // quando uma operacao de teste foi explicitamente registrada pelo admin.
  async function carregarLivro(){
    const atual=++versaoLivro;
    const aviso=el('statusLivroPersistenteDemo');
    aviso.textContent='Consultando livro persistente do laboratório...';
    try{
      const livro=await requisitar('livro-financeiro-demo');
      if(atual!==versaoLivro)return;
      const caixas=el('caixasLivroPersistenteDemo');
      const historico=el('historicoLivroPersistenteDemo');
      caixas.replaceChildren();
      historico.replaceChildren();
      for(const c of livro.caixas){
        const artigo=document.createElement('div');
        artigo.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=configuracoes.find(cfg=>cfg.id===c.id)?.nome||c.id;
        const linha=document.createElement('span');
        linha.className='financeiro-linha-saldos';
        linha.textContent='Entradas: '+money(c.entradasAcumuladasCentavos)+
          ' · Saídas: '+money(c.saidasAcumuladasCentavos)+
          ' · Retornos: '+money(c.retornosAcumuladosCentavos);
        const resumo=document.createElement('small');
        resumo.textContent='Saldo PROJETADO fictício: '+money(c.saldoProjetadoCentavos)+
          ' — não representa saldo bancário';
        artigo.append(titulo,linha,resumo);
        caixas.append(artigo);
      }
      for(const e of livro.historicoRecente){
        const item=document.createElement('li');
        item.textContent='#'+e.sequencia+' — '+e.eventoId+' — '+e.cofreId+
          ' — '+e.natureza+' '+money(e.valorCentavos)+
          ' — '+e.referencia+' — '+e.criadoEm;
        historico.append(item);
      }
      aviso.textContent='Livro local: '+livro.lotesRegistrados+' lotes, '+
        livro.lancamentosRegistrados+' lançamentos fictícios. Sem banco conectado.';
    }catch(e){
      if(atual===versaoLivro)aviso.textContent=e.message;
    }
  }
  function centavosDoFormulario(){
    const valor=el('valorMovimentoPersistenteDemo').value.trim();
    const n=Number(valor);
    if(!valor||!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n*100))||
       Math.abs(n*100-Math.round(n*100))>0.00001){
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    return Math.round(n*100);
  }
  async function registrarLivro(e,tipo){
    e.preventDefault();
    if(!token){el('statusLivroPersistenteDemo').textContent='Abra a demonstração com a chave local.';return;}
    const botao=e.submitter;
    if(botao)botao.disabled=true;
    const aviso=el('statusLivroPersistenteDemo');
    try{
      let rota,corpo;
      if(tipo==='ciclo'){
        rota='livro-financeiro-demo/ciclos';
        corpo={cicloId:el('idCicloPersistenteDemo').value.trim(),modo:modo.value};
      }else{
        rota='livro-financeiro-demo/'+el('tipoLancamentoPersistenteDemo').value;
        corpo={
          eventoId:el('idMovimentoPersistenteDemo').value.trim(),
          cofreId:el('cofreMovimentoPersistenteDemo').value,
          natureza:el('naturezaMovimentoPersistenteDemo').value,
          valorCentavos:centavosDoFormulario(),
          referencia:el('referenciaMovimentoPersistenteDemo').value.trim()
        };
      }
      const r=await requisitar(rota,{method:'POST',body:JSON.stringify(corpo)});
      await carregarLivro();
      aviso.textContent=r.resultado.repetido?
        'Operação fictícia já constava no livro. Nada foi duplicado.':
        'Operação fictícia registrada permanentemente no laboratório. Nenhum dinheiro transferido.';
    }catch(erro){
      aviso.textContent='Falha no registro fictício: '+erro.message;
    }finally{
      if(botao)botao.disabled=false;
    }
  }

  function selecionado(){
    return configuracoes.find(c=>c.id===selecionar.value)||null;
  }
  function preencherFormulario(){
    const c=selecionado();
    if(!c)return;
    nome.value=c.nome;
    cor.value=c.cor.toLowerCase();
    el('finalidadeCofreFinanceiroDemo').textContent=
      'Grupo: '+c.grupo+' — posição fixa: '+c.posicao+
      ' — finalidade fixa: '+c.finalidade+
      ' — revisão visual: '+c.revisao+
      '. Nenhuma conta bancária vinculada.';
  }
  function preencherConfiguracoes(lista){
    const idAntes=selecionar.value;
    configuracoes=lista;
    selecionar.replaceChildren();
    for(const c of configuracoes){
      const option=document.createElement('option');
      option.value=c.id;
      option.textContent=c.grupo+' · '+c.posicao+' · '+c.nome;
      selecionar.append(option);
    }
    if(configuracoes.some(c=>c.id===idAntes))selecionar.value=idAntes;
    preencherFormulario();
    const selecaoMovimento=el('cofreMovimentoPersistenteDemo');
    const antes=selecaoMovimento.value;
    selecaoMovimento.replaceChildren();
    for(const c of configuracoes){
      const option=document.createElement('option');
      option.value=c.id;
      option.textContent=c.nome+' ('+c.posicao+')';
      selecaoMovimento.append(option);
    }
    if(configuracoes.some(c=>c.id===antes))selecaoMovimento.value=antes;
  }
  async function carregarHistorico(){
    const atual=++versaoHistorico;
    const c=selecionado();
    const lista=el('historicoAparenciaCofreDemo');
    lista.replaceChildren();
    if(!c || !token)return;
    try{
      const res=await requisitar('cofres-demo/'+encodeURIComponent(c.id)+'/historico');
      if(atual!==versaoHistorico || selecionar.value!==c.id)return;
      if(!res.eventos.length){
        const li=document.createElement('li');
        li.textContent='Nenhuma alteração realizada neste cofre.';
        lista.append(li);
      }
      for(const evento of res.eventos){
        const li=document.createElement('li');
        li.textContent='Revisão '+evento.revisao+' — '+evento.alteradoEm+
          ' — '+evento.antesNome+' ('+evento.antesCor+') → '+
          evento.depoisNome+' ('+evento.depoisCor+')';
        lista.append(li);
      }
    }catch(e){
      if(atual===versaoHistorico)statusEdicao.textContent=e.message;
    }
  }
  async function buscar(){
    const atual=++versao;
    if(!token){status.textContent='Informe a chave do laboratório.';return;}
    ++versaoConciliacao;
    dados.hidden=true;
    status.textContent='Consultando cenários fictícios e aparência...';
    try{
      const [visao,config]=await Promise.all([
        requisitar('financeiro-demo?modo='+encodeURIComponent(modo.value)),
        requisitar('cofres-demo/configuracoes')
      ]);
      if(atual!==versao)return;
      preencherConfiguracoes(config.cofres);
      mostrar(visao);
      await Promise.all([carregarValorLoop(),carregarHistorico(),carregarConciliacao(),carregarLivro(),carregarRecebimentos(),carregarPontePedidoPagamento(),carregarPedidosComerciais(),carregarPedidosPDF(),carregarCarrinhosLoop(),carregarPlanejamentoFisico(),carregarPagamentosFisicos()]);
    }catch(e){
      if(atual===versao){limpar();status.textContent=e.message;}
    }
  }
  async function salvar(evento){
    evento.preventDefault();
    const c=selecionado();
    if(salvando || !token || !c)return;
    salvando=true;
    el('salvarAparenciaCofreDemo').disabled=true;
    statusEdicao.textContent='Salvando apenas o nome e a cor...';
    try{
      await requisitar('cofres-demo/'+encodeURIComponent(c.id),{
        method:'PATCH',
        body:JSON.stringify({nome:nome.value,cor:cor.value,revisaoEsperada:c.revisao})
      });
      await buscar();
      statusEdicao.textContent='Nome e cor salvos no laboratório. Finalidade e valores preservados.';
    }catch(e){
      statusEdicao.textContent=e.message;
    }finally{
      salvando=false;
      el('salvarAparenciaCofreDemo').disabled=false;
    }
  }
  el('abrirFinanceiroDemo').addEventListener('click',()=>{
    token=tokenInput.value;
    tokenInput.value='';
    buscar();
  });
  modo.addEventListener('change',buscar);
  selecionar.addEventListener('change',()=>{
    ++versaoHistorico;
    statusEdicao.textContent='';
    preencherFormulario();
    carregarHistorico();
  });
  el('formAparenciaCofreDemo').addEventListener('submit',salvar);
  el('formValorLoopDemo').addEventListener('submit',salvarValorLoop);
  el('simularImpactoValorLoopDemo').addEventListener('click',simularImpactoValorLoop);
  el('formPedidosPDFDemo').addEventListener('submit',registrarPedidoPDF);
  el('formCarrinhoLoopDemo').addEventListener('submit',salvarCarrinhoLoop);
  el('formElegibilidadeLoopDemo').addEventListener('submit',salvarRegraProdutoLoop);
  el('produtoElegibilidadeLoopDemo').addEventListener('change',mostrarRegraProdutoLoop);
  el('formEventoCarrinhoLoopDemo').addEventListener('submit',eventoCarrinhoLoop);
  el('adicionarItemCarrinhoLoopDemo').addEventListener('click',adicionarLinhaCarrinho);
  el('atualizarCarrinhosLoopDemo').addEventListener('click',carregarCarrinhosLoop);
  el('sincronizarCarrinhoLoopDemo').addEventListener('click',sincronizarCarrinhoLoop);
  el('formEventoPDFDemo').addEventListener('submit',registrarEventoPDF);
  el('formVincularPDFLoopDemo').addEventListener('submit',vincularCompradorPDF);
  el('sincronizarPDFLoopDemo').addEventListener('click',conferirSincronizacaoPDF);
  el('pedidoVinculoPDFLoopDemo').addEventListener('change',()=>{
    consultarVinculoPDF().catch(e=>{el('estadoSincronizacaoPDFLoopDemo').textContent=e.message;});
  });
  el('atualizarPedidosPDFDemo').addEventListener('click',carregarPedidosPDF);
  el('pedidoEventoPDFDemo').addEventListener('change',carregarHistoricoPDF);
  el('baixarMaterialPDFDemo').addEventListener('click',baixarMaterialPDF);
  el('formPedidosComerciaisDemo').addEventListener('submit',criarPedidoComercial);
  el('formCustoFisicoDemo').addEventListener('submit',registrarCustoFisico);
  el('formPrePedidoFisicoDemo').addEventListener('submit',registrarPrePedidoFisico);
  el('formEventoPagPrePedidoFisicoDemo').addEventListener('submit',registrarEventoPagamentoFisico);
  el('atualizarPagamentosFisicosDemo').addEventListener('click',carregarPagamentosFisicos);
  el('pedidoPagamentoFisicoDemo').addEventListener('change',carregarHistoricoPagamentoFisico);
  el('atualizarPlanejamentoFisicoDemo').addEventListener('click',carregarPlanejamentoFisico);
  el('atualizarPedidosComerciaisDemo').addEventListener('click',carregarPedidosComerciais);
  el('atualizarPontePedidoPagamentoDemo').addEventListener('click',carregarPontePedidoPagamento);
  el('pedidoHistoricoPonteDemo').addEventListener('change',carregarHistoricoPonte);
  el('atualizarRecebimentosPSPDemo').addEventListener('click',async()=>{
    try{await carregarRecebimentos();}
    catch(e){el('statusEventoPSPDemo').textContent=e.message;}
  });
  el('pagamentoSelecionadoPSPDemo').addEventListener('change',carregarHistoricoPSP);
  el('formEventoPSPDemo').addEventListener('submit',registrarEventoPSP);
  el('formCicloPersistenteDemo').addEventListener('submit',e=>registrarLivro(e,'ciclo'));
  el('formMovimentoPersistenteDemo').addEventListener('submit',e=>registrarLivro(e,'movimento'));
  el('atualizarLivroPersistenteDemo').addEventListener('click',carregarLivro);
  el('verConciliacaoDemo').addEventListener('click',carregarConciliacao);
  el('limparFinanceiroDemo').addEventListener('click',()=>{
    ++versao;
    ++versaoHistorico;
    token='';
    tokenInput.value='';
    limpar();
    status.textContent='Chave descartada da página. Nenhuma operação financeira.';
  });
})();
