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
  let versaoPDF=0;
  let versaoHistoricoPDF=0;
  let salvandoPDF=false;
  let salvandoEventoPDF=false;
  let pedidosPDF=[];
  let salvandoPedidoComercial=false;
  let versaoHistoricoPonte=0;
  let pedidosAssociados=[];
  let salvandoEventoPSP=false;
  let recebimentos=[];
  let configuracoes=[];
  let salvando=false;

  function limpar(){
    ++versaoConciliacao;
    ++versaoLivro;
    ++versaoRecebimentos;
    ++versaoPonte;
    ++versaoComercial;
    ++versaoPDF;
    ++versaoHistoricoPDF;
    pedidosPDF=[];
    for(const id of ['listaPedidosPDFDemo','historicoEventoPDFDemo',
      'produtoPedidoPDFDemo','pedidoEventoPDFDemo'])el(id).replaceChildren();
    el('statusPedidosPDFDemo').textContent='';
    el('statusEventoPDFDemo').textContent='';
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
      const [dados,opcoes]=await Promise.all([
        requisitar('pedidos-pdf-demo'),requisitar('pedidos-pdf-demo/opcoes')
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
          '. Nenhum PDF real foi entregue.';
        item.append(titulo,info,legenda);
        lista.append(item);
      }
      if(pedidosPDF.some(p=>p.pedidoId===pedidoAntigo))pedidoSelect.value=pedidoAntigo;
      status.textContent=pedidosPDF.length+' pedido(s) PDF de teste. '+
        opcoes.produtos.length+' curso(s) PDF publicado(s) no catálogo.';
      await carregarHistoricoPDF();
    }catch(erro){if(atual===versaoPDF)status.textContent=erro.message;}
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
      aviso.textContent=resposta.repetido?'Evento fictício repetido: nada foi duplicado.':
        'Pagamento PDF fictício registrado. Nenhum arquivo real ou valor transferido.';
    }catch(erro){aviso.textContent=erro.message;}
    finally{salvandoEventoPDF=false;botao.disabled=false;}
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
      await Promise.all([carregarHistorico(),carregarConciliacao(),carregarLivro(),carregarRecebimentos(),carregarPontePedidoPagamento(),carregarPedidosComerciais(),carregarPedidosPDF()]);
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
  el('formPedidosPDFDemo').addEventListener('submit',registrarPedidoPDF);
  el('formEventoPDFDemo').addEventListener('submit',registrarEventoPDF);
  el('atualizarPedidosPDFDemo').addEventListener('click',carregarPedidosPDF);
  el('pedidoEventoPDFDemo').addEventListener('change',carregarHistoricoPDF);
  el('baixarMaterialPDFDemo').addEventListener('click',baixarMaterialPDF);
  el('formPedidosComerciaisDemo').addEventListener('submit',criarPedidoComercial);
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
