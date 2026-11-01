'use strict';
// Central do proprietario: UI apenas sobre APIs autenticadas do LABORATORIO.
(()=>{
 const $=id=>document.getElementById(id);
 let token='',config=null,configRelogio=null;
 async function api(caminho){
  const r=await fetch('/api/admin/circuit-break-v6-demo'+caminho,{
   cache:'no-store',headers:{Authorization:'Bearer '+token}});
  const d=await r.json();
  if(!r.ok)throw Error(d.erro||'Acesso recusado');
  return d;
 }
 async function post(caminho,body){
  const r=await fetch('/api/admin/circuit-break-v6-demo'+caminho,{
   method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify(body)});
  const d=await r.json();
  if(!r.ok)throw Error(d.erro||'Alteração recusada');
  return d;
 }
 function renderizarTrava(d){
  config=d.configuracao;
  $('numeroVagaAdmin').textContent=String(config.vagaLiberacao);
  $('vagaAdminLoop03').value=String(config.vagaLiberacao);
  const lista=$('listaHistoricoAdminLoop03');lista.replaceChildren();
  if(!d.historico.length){
   const li=document.createElement('li');li.textContent='Nenhuma mudança registrada; padrão inicial na vaga 6.';lista.append(li);
  }
  for(const h of d.historico){
   const li=document.createElement('li');
   li.textContent='Revisão '+h.revisao+' · Vaga '+h.anterior+' → '+h.nova+
     ' · '+h.motivo+' · '+h.registradoEm;lista.append(li);
  }
 }
 let cenarioConectado=null,abaConectada='clientes';
 function renderizarConexoes(){
  if(!cenarioConectado)return;
  const d=cenarioConectado,lista=$('listaConexoesDemoAdmin');lista.replaceChildren();
  const detalhes=$('detalheConexoesDemoAdmin');
  const texto=(pai,tag,valor)=>{const el=document.createElement(tag);el.textContent=valor;pai.append(el);};
  const cliente=id=>d.clientes.find(c=>c.id===id);
  const produto=id=>d.produtos.find(p=>p.id===id);
  function abrir(tipo,id){
   detalhes.replaceChildren();
   if(tipo==='clientes'){
    const c=cliente(id),pedidos=d.pedidos.filter(p=>p.clienteId===id);
    const posicoes=d.posicoes.filter(p=>p.clienteId===id);
    const ciclos=d.ciclos.filter(x=>x.clienteId===id);
    texto(detalhes,'h3',c.nick+' · '+c.nome);
    texto(detalhes,'p','Pedidos fictícios: '+pedidos.length+' · Posições fictícias: '+posicoes.length+' · Ciclos fictícios: '+ciclos.length);
    for(const p of pedidos)texto(detalhes,'p',p.id+' · '+produto(p.produtoId).nome+' · quantidade '+p.quantidade+' · '+p.data);
    for(const p of posicoes)texto(detalhes,'p','Posição '+p.id+' · fila '+p.fila+' · pedido '+p.pedidoId);
    for(const x of ciclos)texto(detalhes,'p','Ciclo '+x.id+' · '+x.estado+' · contemplações SIMULADAS: '+x.contemplacoesSimuladas);
   }else{
    const p=produto(id),pedidos=d.pedidos.filter(v=>v.produtoId===id);
    texto(detalhes,'h3',p.nome+' · '+p.tipo);
    texto(detalhes,'p','Pedidos fictícios: '+pedidos.length+' · unidades: '+pedidos.reduce((n,v)=>n+v.quantidade,0));
    for(const v of pedidos)texto(detalhes,'p',v.data+' · '+v.quantidade+' unidade(s) · cliente '+cliente(v.clienteId).nick+' · '+v.id);
   }
  }
  const itens=d[abaConectada];
  for(const item of itens){
   const b=document.createElement('button');b.type='button';b.className='cliente-item-admin';
   b.textContent=abaConectada==='clientes'?item.nick+' · '+item.nome:item.nome+' · '+item.tipo;
   b.addEventListener('click',()=>abrir(abaConectada,item.id));lista.append(b);
  }
  $('abaClientesDemoAdmin').setAttribute('aria-pressed',String(abaConectada==='clientes'));
  $('abaProdutosDemoAdmin').setAttribute('aria-pressed',String(abaConectada==='produtos'));
  detalhes.replaceChildren();texto(detalhes,'p','Selecione um registro para consultar as relações simuladas.');
 }
 async function carregarConexoes(){
  const r=await fetch('/api/admin/escritorio-demo/cenario-conectado',{
   cache:'no-store',headers:{Authorization:'Bearer '+token}});
  const d=await r.json();
  if(!r.ok||d.modo!=='SIMULACAO_ISOLADA')throw Error(d.erro||'Cenário indisponível');
  const clientes=new Set(d.clientes.map(x=>x.id));
  const produtos=new Set(d.produtos.map(x=>x.id));
  const pedidos=new Map(d.pedidos.map(x=>[x.id,x]));
  const posicoes=new Map(d.posicoes.map(x=>[x.id,x]));
  if(d.pedidos.some(p=>!clientes.has(p.clienteId)||!produtos.has(p.produtoId))||
     d.posicoes.some(p=>!pedidos.has(p.pedidoId)||pedidos.get(p.pedidoId).clienteId!==p.clienteId||
       !pedidos.get(p.pedidoId).posicaoAtivavel)||
     d.ciclos.some(x=>!posicoes.has(x.posicaoId)||posicoes.get(x.posicaoId).clienteId!==x.clienteId))
   throw Error('Inconsistência entre clientes, pedidos, posições e ciclos');
  cenarioConectado=d;renderizarConexoes();
  $('statusConexoesDemoAdmin').textContent='SIMULAÇÃO: '+d.clientes.length+' clientes · '+d.pedidos.length+' pedidos · '+d.produtos.length+' produtos · '+d.posicoes.length+' posições · '+d.ciclos.length+' ciclos. Nenhum pagamento real.';
 }
 $('abaClientesDemoAdmin').addEventListener('click',()=>{abaConectada='clientes';renderizarConexoes();});
 $('abaProdutosDemoAdmin').addEventListener('click',()=>{abaConectada='produtos';renderizarConexoes();});
 let clientesDiretorio=[],versaoFichaCliente=0;
 // A ficha do administrador usa SOMENTE a operacao persistida por titular.
 // Nao cruzar pedidos de clientes diferentes nem confundir venda com ciclo.
 function linhaFicha(pai,tag,valor){
  const el=document.createElement(tag);
  el.textContent=String(valor);
  pai.append(el);
  return el;
 }
 function dinheiroSimulado(centavos){
  if(!Number.isSafeInteger(centavos)||centavos<0)return 'não informado';
  return (centavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 }
 function secoesFicha(detalhe,titulo,pagina,descrever){
  const secao=document.createElement('section');
  linhaFicha(secao,'h4',titulo);
  if(pagina.total===null)linhaFicha(secao,'p','Fonte SQLite indisponível nesta categoria.');
  else{
   linhaFicha(secao,'p','Registros documentados: '+pagina.total+
    ' · exibindo '+pagina.itens.length+' nesta página.');
   if(!pagina.itens.length)linhaFicha(secao,'p','Nenhum registro nesta página.');
   for(const registro of pagina.itens)linhaFicha(secao,'p',descrever(registro));
  }
  detalhe.append(secao);
 }
 async function fichaCliente(c,offset=0){
  const versao=++versaoFichaCliente,credencial=token;
  const detalhe=$('detalheClienteAdmin');detalhe.replaceChildren();
  linhaFicha(detalhe,'h3',c.nick||c.nome);
  linhaFicha(detalhe,'p','Nome cadastral: '+c.nome+' · Cadastro: '+c.criadoEm);
  linhaFicha(detalhe,'p','Carregando histórico individual do SQLite…');
  try{
   const resposta=await fetch('/api/admin/escritorio-demo/clientes/'+encodeURIComponent(c.id)+
    '/operacao?limite=20&offset='+offset,{
    cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+credencial}
   });
   if(versao!==versaoFichaCliente||token!==credencial)return;
   if(!resposta.ok)throw Error('Operação individual indisponível ('+resposta.status+').');
   const d=await resposta.json();
   if(versao!==versaoFichaCliente||token!==credencial)return;
   if(d.modo!=='OPERACAO_CLIENTE_SQLITE_LAB'||d.somenteLeitura!==true||
      d.previsoesNaoLiquidadas!==true||d.disponivelParaSaqueRealCentavos!==0||
      d.cliente?.id!==c.id)throw Error('Fonte individual não verificada');
   for(const categoria of ['pedidos','ciclosCentro','saquesBonus','saquesCentro']){
    const p=d[categoria];
    if(!p||!Array.isArray(p.itens)||
       (p.total!==null&&(!Number.isSafeInteger(p.total)||p.total<0))||
       p.limite!==20||p.offset!==offset)throw Error('Paginação individual inválida');
   }
   detalhe.replaceChildren();
   linhaFicha(detalhe,'h3',(c.nick||d.cliente.nome)+' · Histórico individual');
   linhaFicha(detalhe,'p','Cadastro: '+d.cliente.nome+
    ' · Consulta autenticada · Somente registros de laboratório.');
   secoesFicha(detalhe,'Compras AKITEMM e posições vinculadas',d.pedidos,p=>{
    const ids=Array.isArray(p.posicoes)&&p.posicoes.length?
     p.posicoes.join(', '):'nenhuma posição comprovada';
    const pagamento=p.pagamentoSandbox?.status||'sem confirmação Sandbox';
    const evento=p.eventoQueFinanciouCiclo;
    return 'Pedido '+p.pedidoId+' · Valor fictício '+dinheiroSimulado(p.valorCentavos)+
     ' · Asaas: '+pagamento+' · Posições: '+ids+
     (evento?' · Evento que financiou giro '+evento.giro+
      ' / ordem '+evento.ordem+' (não é a contemplação deste pedido)':'');
   });
   secoesFicha(detalhe,'Ciclos do centro (valores previstos)',d.ciclosCentro,ciclo=>
    'Giro '+ciclo.giro+' · Posição '+ciclo.posicaoId+
    ' · Projeção '+dinheiroSimulado(ciclo.previstoCentavos)+
    ' · Não representa valor liquidado.');
   secoesFicha(detalhe,'Solicitações de bônus (laboratório)',d.saquesBonus,saque=>
    'Solicitação '+saque.solicitacaoId+' · Tipo '+saque.tipo+
    ' · Bruto '+dinheiroSimulado(saque.brutoCentavos)+
    ' · Taxa '+dinheiroSimulado(saque.taxaCentavos)+
    ' · Líquido fictício '+dinheiroSimulado(saque.liquidoCentavos));
   secoesFicha(detalhe,'Solicitações do centro (laboratório)',d.saquesCentro,saque=>
    'Solicitação '+saque.solicitacaoId+' · Valor fictício '+
    dinheiroSimulado(saque.valorCentavos)+' · Evento mais recente: '+
    (saque.ultimoEvento?.tipo||'não disponível'));
   if(d.fontesAusentes?.length)
    linhaFicha(detalhe,'p','Fontes ainda não disponíveis: '+d.fontesAusentes.join(', '));
   linhaFicha(detalhe,'p','Nenhuma liquidação bancária nem saque real comprovado nesta consulta.');
   if(Object.values({pedidos:d.pedidos,ciclos:d.ciclosCentro,
     bonus:d.saquesBonus,centro:d.saquesCentro}).some(p=>p.total>offset+20)){
    const proximo=document.createElement('button');
    proximo.type='button';proximo.className='secundario';
    proximo.textContent='Próximos registros';
    proximo.addEventListener('click',()=>fichaCliente(c,offset+20));
    detalhe.append(proximo);
   }
   if(offset>0){
    const anterior=document.createElement('button');
    anterior.type='button';anterior.className='secundario';
    anterior.textContent='Registros anteriores';
    anterior.addEventListener('click',()=>fichaCliente(c,Math.max(0,offset-20)));
    detalhe.append(anterior);
   }
  }catch(err){
   if(versao!==versaoFichaCliente||token!==credencial)return;
   detalhe.replaceChildren();
   linhaFicha(detalhe,'h3',c.nick||c.nome);
   linhaFicha(detalhe,'p','Não foi possível carregar a operação deste cliente: '+err.message);
  }
 }
 function renderizarClientes(){
  const termo=$('filtrarClientesAdmin').value.trim().toLocaleLowerCase('pt-BR');
  const lista=$('listaClientesAdmin');lista.replaceChildren();
  const filtrados=clientesDiretorio.filter(c=>(c.nome+' '+(c.nick||'')).toLocaleLowerCase('pt-BR').includes(termo));
  for(const c of filtrados){
   const b=document.createElement('button');b.type='button';
   b.className='cliente-item-admin';b.textContent=(c.nick||c.nome)+' · '+c.nome;
   b.addEventListener('click',()=>fichaCliente(c));lista.append(b);
  }
  if(!filtrados.length){const p=document.createElement('p');p.textContent='Nenhum cliente encontrado nesta página.';lista.append(p);}
 }
 async function carregarClientes(){
  const r=await fetch('/api/admin/escritorio-demo/clientes',{cache:'no-store',
   headers:{Authorization:'Bearer '+token}});
  const d=await r.json();
  if(!r.ok||!Array.isArray(d.clientes))throw Error(d.erro||'Diretório indisponível');
  if(d.modo!=='LABORATORIO_LOCAL'||d.semPagamentosReais!==true||
     d.fonteIndicadores!=='COMPRAS_E_VENDAS_CONFIRMADAS_SQLITE'||
     !Number.isSafeInteger(d.total)||d.total<0)
   throw Error('Fonte de clientes não conciliada');
  clientesDiretorio=d.clientes;
  $('clientesTotalDepartamento').textContent=String(d.total);
  for(const [id,chave] of [
   ['clientesLoopDepartamento','clientesComPosicoesCriadas'],
   ['clientesLojaDepartamento','clientesSomenteLoja']
  ]){
   if(d[chave]!==null&&(!Number.isSafeInteger(d[chave])||d[chave]<0))
    throw Error('Indicador de cliente inválido');
   $(id).textContent=d[chave]===null?'Sem fonte conciliada':String(d[chave]);
  }
  const categorias=d.clientesPorTipoProduto;
  if(categorias&&Number.isSafeInteger(categorias.PDF)&&categorias.PDF>=0&&
     Number.isSafeInteger(categorias.FISICO)&&categorias.FISICO>=0)
   $('clientesTiposDepartamento').textContent='PDF: '+categorias.PDF+
    ' · Físicos: '+categorias.FISICO;
  else $('clientesTiposDepartamento').textContent='Por categoria: ainda não conciliado';
  $('statusClientesAdmin').textContent='Exibindo até '+d.limite+
   ' cadastros recentes de '+d.total+
   '. Participação e vendas: somente registros documentados do SQLite.';
  renderizarClientes();
 }
 $('filtrarClientesAdmin').addEventListener('input',renderizarClientes);
 async function carregarConvergenciaAsaas(){
  const ids=['asaasCobrancasAdmin','asaasRecebimentosAdmin','asaasPedidosComPosicaoAdmin',
   'asaasSomenteLojaAdmin','asaasAguardandoPonteAdmin','asaasReversoesAdmin',
   'asaasCallbacksRevisaoAdmin','asaasAnomaliasAdmin','asaasIndeterminadasAdmin',
   'asaasIdsReutilizadosAdmin','asaasFilaCallbacksAdmin','asaasRevisaoGeralAdmin',
   'asaasStatusDesconhecidoAdmin','asaasReversoesComPosicaoAdmin',
   'asaasReconsultasDivergentesAdmin'];
  const limpar=()=>{for(const id of ids)$(id).textContent='—';};
  limpar();
  $('asaasBancoRealAdmin').textContent='Não homologada';
  const resposta=await fetch('/api/admin/asaas-conciliacao-lab',{
   cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+token}
  });
  if(resposta.status===501){
   $('asaasStatusConvergenciaAdmin').textContent=
    'Asaas Sandbox não configurado neste laboratório. Não há conciliação a apresentar.';
   return;
  }
  if(!resposta.ok)throw Error('Monitor de pagamentos indisponível ('+resposta.status+').');
  const d=await resposta.json();
  if(d.modo!=='CONVERGENCIA_SQLITE_SOMENTE_LEITURA'||
     d.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||d.somenteLeitura!==true||
     d.pagamentosReais!==false||d.caixaBancarioConciliado!==false||
     d.saquesLiberados!==0)throw Error('Fonte de conciliação não é laboratório seguro');
  const campos={
   asaasCobrancasAdmin:'cobrancas',asaasRecebimentosAdmin:'recebimentosInformados',
   asaasPedidosComPosicaoAdmin:'pedidosComPosicao',asaasSomenteLojaAdmin:'pedidosSomenteLoja',
   asaasAguardandoPonteAdmin:'recebidosAguardandoPonte',
   asaasReversoesAdmin:'reversoesInformadas',
   asaasCallbacksRevisaoAdmin:'callbacksExigemRevisao',
   asaasAnomaliasAdmin:'anomaliasContadasPorCriterio',
   asaasIndeterminadasAdmin:'criacoesIndeterminadas',
   asaasStatusDesconhecidoAdmin:'estadosAsaasDesconhecidos',
   asaasReconsultasDivergentesAdmin:'reconsultasSemRecebimento',
   asaasReversoesComPosicaoAdmin:'reversoesComPosicaoPreservada',
   asaasIdsReutilizadosAdmin:'idReutilizadoEmPosicaoAdicional'
  };
  for(const [id,campo] of Object.entries(campos)){
   if(!Number.isSafeInteger(d[campo])||d[campo]<0)
    throw Error('Contador de conciliação inválido');
   $(id).textContent=String(d[campo]);
  }
  for(const campo of ['callbacksSemJob','callbacksPendentesProntos','callbacksLeasesExpirados']){
   if(!Number.isSafeInteger(d[campo])||d[campo]<0)
    throw Error('Fila de callbacks inválida');
  }
  $('asaasFilaCallbacksAdmin').textContent=d.callbacksHabilitados===true?
   d.callbacksSemJob+' / '+d.callbacksPendentesProntos+' / '+d.callbacksLeasesExpirados:
   'Não habilitada';
  $('asaasRevisaoGeralAdmin').textContent=d.revisaoManualIndicada===true?
   'SIM · verificar pendências':'Não indicada neste registro';
  $('asaasStatusConvergenciaAdmin').textContent=
   'Fonte: SQLite local + Asaas Sandbox · Somente leitura · Sem dinheiro real, PIX liquidado ou saques habilitados.';
 }
 async function carregarAuditoria(){
  const r=await fetch('/api/admin/escritorio-demo/auditoria-operacional',{
   cache:'no-store',headers:{Authorization:'Bearer '+token}});
  const d=await r.json();
  if(!r.ok)throw Error(d.erro||'Auditoria indisponível');
  const campo=(id,valor)=>{$(id).textContent=valor===null?'Indisponível':String(valor);};
  campo('auditoriaClientesAdmin',d.clientes);
  campo('resumoClientesDirecaoAdmin',d.clientes);
  campo('resumoPedidosDirecaoAdmin',d.pedidosCarrinho);
  campo('resumoPosicoesDirecaoAdmin',d.posicoesOriginadasDeCompras);
  $('statusResumoDirecaoAdmin').textContent='Fonte: '+d.fonte+' · Registros fictícios persistidos; sem conciliação bancária.';
  campo('auditoriaPedidosAdmin',d.pedidosCarrinho);
  campo('auditoriaPosicoesAdmin',d.posicoesOriginadasDeCompras);
  campo('auditoriaSemLoopAdmin',d.comprasSomenteLoja);
  campo('auditoriaAdicionaisAdmin',d.posicoesAdicionais);
  campo('auditoriaEventosAdmin',d.eventosDePagamentoFicticio);
  $('auditoriaStatusAdmin').textContent='Fonte: '+d.fonte+' · '+d.modo+' · Nenhum pagamento real.';
 }
 async function carregarFinanceiro(){
  const r=await fetch('/api/admin/livro-financeiro-demo',{
   cache:'no-store',headers:{Authorization:'Bearer '+token}});
  const d=await r.json();
  if(!r.ok)throw Error(d.erro||'Livro financeiro indisponível');
  if(d.pagamentosReais!==false||d.saldosReais!==false||!Array.isArray(d.caixas))
   throw Error('Fonte não identificada como simulação');
  const moeda=centavos=>(centavos/100).toLocaleString('pt-BR',{
   style:'currency',currency:'BRL'});
  const soma=d.caixas.reduce((total,c)=>{
   if(!Number.isSafeInteger(c.saldoProjetadoCentavos))
    throw Error('Saldo inválido na fonte');
   return total+c.saldoProjetadoCentavos;
  },0);
  if(!Number.isSafeInteger(soma))throw Error('Soma fora do limite seguro');
  $('finLotesAdmin').textContent=String(d.lotesRegistrados);
  $('finLancamentosAdmin').textContent=String(d.lancamentosRegistrados);
  $('finSaldoAdmin').textContent=moeda(soma);
  $('finConciliacaoAdmin').textContent='Não conciliada';
  const lista=$('finCofresAdmin');lista.replaceChildren();
  for(const cofre of d.caixas){
   const linha=document.createElement('div');linha.className='status-linha';
   const nome=document.createElement('span');nome.textContent=cofre.id;
   const valor=document.createElement('strong');
   valor.textContent=moeda(cofre.saldoProjetadoCentavos);
   linha.append(nome,valor);lista.append(linha);
  }
  $('finStatusAdmin').textContent='Fonte: '+d.modo+
   ' · Sem integração bancária · Nenhum pagamento real.';
 }
 async function carregarFinanceiroOperacional(){
  const ids=['finOpCiclosAdmin','finOpEventosAdmin','finOpParcelasAdmin',
   'finOpPrevistoAdmin','finOpBonusAdmin','finOpSaquesCentroAdmin',
   'finOpGestaoAdmin','finOpDouradasAdmin','finOpFalhasSaqueAdmin',
   'finOpTaxasHistoricasAdmin'];
  for(const id of ids)$(id).textContent='—';
  $('finOpCofresAdmin').replaceChildren();
  $('finOpBancarioAdmin').textContent='Não homologado · R$ 0,00 liberado';
  const r=await fetch('/api/admin/financeiro-operacional-lab',{
   cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+token}
  });
  if(r.status===501){
   $('finOpStatusAdmin').textContent='Fonte SQLite operacional indisponível neste laboratório.';
   return;
  }
  if(!r.ok)throw Error('Resumo operacional indisponível ('+r.status+').');
  const d=await r.json();
  if(d.modo!=='FINANCEIRO_OPERACIONAL_SQLITE_SOMENTE_LEITURA'||
     d.somenteLeitura!==true||d.provisoesNaoLiquidadas!==true||
     d.livrosFinanceirosSeparados!==true||d.bancoConciliado!==false||
     d.pagamentosReais!==false||d.saquesReais!==false||
     d.saldosSacaveisReaisCentavos!==0||d.movimentosExecutados!==0)
   throw Error('Fonte financeira não comprovadamente simulada');
  const inteiro=n=>Number.isSafeInteger(n)&&n>=0;
  const moeda=n=>inteiro(n)?(n/100).toLocaleString('pt-BR',{
   style:'currency',currency:'BRL'}):'Dado inválido';
  const quant=(nome,valor)=>{
   if(valor!==null&&!inteiro(valor))throw Error('Contador operacional inválido');
   $(nome).textContent=valor===null?'Fonte indisponível':String(valor);
  };
  const valor=(nome,centavos)=>{
   if(centavos!==null&&!inteiro(centavos))throw Error('Valor operacional inválido');
   $(nome).textContent=centavos===null?'Fonte indisponível':moeda(centavos);
  };
  quant('finOpCiclosAdmin',d.ciclos?.quantidade??null);
  quant('finOpEventosAdmin',d.eventos?.quantidade??null);
  quant('finOpParcelasAdmin',d.parcelas?.quantidade??null);
  valor('finOpPrevistoAdmin',d.ciclos?.previstoCentavos??null);
  quant('finOpBonusAdmin',d.bonus?.quantidade??null);
  quant('finOpSaquesCentroAdmin',d.centro?.quantidade??null);
  quant('finOpGestaoAdmin',d.gestao?.quantidade??null);
  quant('finOpDouradasAdmin',d.douradas?.quantidade??null);
  quant('finOpFalhasSaqueAdmin',d.falhasCentro?.quantidade??null);
  quant('finOpTaxasHistoricasAdmin',d.bonus?.historicosTaxaTres??null);
  const lista=$('finOpCofresAdmin');
  const nomes={LOOP_CENTRO:'Centro',LOOP_ESQUERDA:'Investimento',
   LOOP_DIREITA:'Reserva / bonificações',LOOP_DOURADAS:'Douradas'};
  for(const [id,nome] of Object.entries(nomes)){
   const linha=document.createElement('div');linha.className='status-linha';
   const titulo=document.createElement('span');titulo.textContent=nome+' · '+id;
   const total=document.createElement('strong');
   const centavos=d.destinosPrevistosPorCofre?.[id]??null;
   if(centavos!==null&&!inteiro(centavos))throw Error('Cofre operacional inválido');
   total.textContent=centavos===null?'Fonte indisponível':moeda(centavos);
   linha.append(titulo,total);lista.append(linha);
  }
  if(!Array.isArray(d.fontesAusentes)||!inteiro(d.destinosDesconhecidos))
   throw Error('Fontes financeiras incompletas ou inválidas');
  $('finOpStatusAdmin').textContent=
   (d.alertasOperacionais?'ALERTA: destino de cofre desconhecido. · ':'')+
   'Fontes ausentes: '+d.fontesAusentes.length+
   '. Dados de laboratório em livros separados; nenhum saldo ou saque real habilitado.';
 }
 async function carregarMarcoZero(){
  // O gate e informativo, NAO possui acao de aprovacao ou publicacao.
  $('marcoZeroEstadoAdmin').textContent='NÃO LIBERADO';
  $('marcoZeroExternosAdmin').textContent='—';
  $('marcoZeroAlertasAdmin').textContent='—';
  $('marcoZeroTecnicosAdmin').replaceChildren();
  $('marcoZeroGatesExternosAdmin').replaceChildren();
  const response=await fetch('/api/admin/escritorio-demo/marco-zero',{
    cache:'no-store',credentials:'omit',
    headers:{Authorization:'Bearer '+token}
  });
  if(response.status===501){
    $('marcoZeroStatusAdmin').textContent=
      'SQLite não disponível; o Marco Zero continua bloqueado.';
    return;
  }
  if(!response.ok)throw Error('Consulta de prontidão recusada ('+response.status+').');
  const d=await response.json();
  if(d.modo!=='MARCO_ZERO_GATE_SQLITE_LAB'||
     d.estado!=='NAO_LIBERADO_PARA_DIVULGACAO'||
     d.marcoZeroLiberado!==false||d.aptoParaReceberClientesReais!==false||
     d.aptoParaPagamentosReais!==false||d.somenteLeitura!==true||
     d.percentualAutomatico!==null||
     !Array.isArray(d.tecnicos)||!Array.isArray(d.externos)||
     !Number.isSafeInteger(d.resumo?.bloqueiosExternosNaoComprovados)||
     d.externos.some(x=>x.estado!=='NAO_COMPROVADO_NESTA_FONTE'))
    throw Error('Gate não comprovadamente fechado');
  const alerta=d.resumo.alertasLocaisPorCriterio;
  if(alerta!==null&&(!Number.isSafeInteger(alerta)||alerta<0))
    throw Error('Contador de anomalias inválido');
  $('marcoZeroExternosAdmin').textContent=
    String(d.resumo.bloqueiosExternosNaoComprovados);
  $('marcoZeroAlertasAdmin').textContent=
    alerta===null?'Fonte indisponível':String(alerta);
  function preencher(id,lista){
    const pai=$(id);
    for(const item of lista){
      if(typeof item.descricao!=='string'||typeof item.estado!=='string')
        throw Error('Gate incompleto');
      const linha=document.createElement('div');
      linha.className='status-linha';
      const nome=document.createElement('span');nome.textContent=item.descricao;
      const estado=document.createElement('strong');estado.textContent=item.estado;
      linha.append(nome,estado);pai.append(linha);
    }
  }
  preencher('marcoZeroTecnicosAdmin',d.tecnicos);
  preencher('marcoZeroGatesExternosAdmin',d.externos);
  $('marcoZeroStatusAdmin').textContent=
    'Dados locais conferidos apenas em laboratório. Lançamento e divulgação NÃO autorizados.';
 }
 async function carregar(){
  const [controle,trava,ponte,indicacoes,relogio]=await Promise.all([api(''),api('/trava-fila-a'),api('/ponte'),api('/indicacoes'),api('/intervalo-relogio')]);
  configRelogio=relogio.configuracao;
  $('intervaloAtualRelogioAdmin').textContent=configRelogio.intervaloMinutos===null?'Não configurado':configRelogio.intervaloMinutos+' min';
  $('intervaloRelogioAdmin').value=configRelogio.intervaloMinutos??'';
  const registro=$('historicoRelogioAdminLoop03');registro.replaceChildren();
  for(const h of relogio.historico){
   const li=document.createElement('li');
   li.textContent='Revisão '+h.revisao+' · '+(h.anterior??'sem intervalo')+' → '+h.novo+' min · '+h.justificativa;
   registro.append(li);
  }
  $('numeroFilaAAdmin').textContent=String(ponte.filaA);
  $('numeroFilaBAdmin').textContent=String(ponte.filaB);
  $('numeroGirosAdmin').textContent=String(ponte.girosConcluidos);
  $('catracaAdmin').textContent=controle.status;
  $('girosHojeAdmin').textContent=String(controle.girosHoje);
  $('limiteAdmin').textContent=String(controle.limiteDiario);
  $('filaTotalAdmin').textContent=String(ponte.filaA+ponte.filaB);
  $('resumoFilasDirecaoAdmin').textContent=String(ponte.filaA+ponte.filaB);
  $('indicacoesConfirmadasAdmin').textContent=String(indicacoes.confirmadas);
  $('indicacoesDisponiveisAdmin').textContent=String(indicacoes.disponiveis);
  $('indicacoesVinculadasAdmin').textContent=String(indicacoes.vinculadas);
  $('indicacoesAguardandoAdmin').textContent=String(indicacoes.aguardandoAtivacao);
  renderizarTrava(trava);
  try{await carregarConexoes();}
  catch(err){$('statusConexoesDemoAdmin').textContent='Cenário indisponível: '+err.message;}
  try{await carregarClientes();}
  catch(err){$('statusClientesAdmin').textContent='Consulta indisponível: '+err.message;}
  try{await carregarConvergenciaAsaas();}
  catch(err){$('asaasStatusConvergenciaAdmin').textContent='Conciliação indisponível: '+err.message;}
  try{await carregarMarcoZero();}
  catch(err){$('marcoZeroEstadoAdmin').textContent='NÃO LIBERADO';
   $('marcoZeroStatusAdmin').textContent='Gate indisponível: '+err.message;}
  try{await carregarAuditoria();}
  catch(err){$('auditoriaStatusAdmin').textContent='Consulta indisponível: '+err.message;
   for(const id of ['resumoClientesDirecaoAdmin','resumoPedidosDirecaoAdmin','resumoPosicoesDirecaoAdmin'])$(id).textContent='Indisponível';
   $('statusResumoDirecaoAdmin').textContent='Não foi possível consultar os registros: '+err.message;}
  try{await carregarFinanceiro();}
  catch(err){$('finStatusAdmin').textContent='Consulta indisponível: '+err.message;}
  try{await carregarFinanceiroOperacional();}
  catch(err){$('finOpStatusAdmin').textContent='Consulta operacional indisponível: '+err.message;}
  $('dadosAdminLoop03').hidden=false;
  $('situacaoPainel').textContent='CONTROLE AUTENTICADO';
 }
 // Destaca o departamento aberto sem alterar as rotas ou os dados.
 const linksMenu=[...document.querySelectorAll('.barra nav a')];
 function atualizarMenuAtivo(){
  const hash=window.location.hash||'#visaoGeral';
  for(const link of linksMenu){
   const ativo=link.getAttribute('href')===hash;
   link.classList.toggle('ativo',ativo);
   if(ativo)link.setAttribute('aria-current','location');
   else link.removeAttribute('aria-current');
  }
 }
 window.addEventListener('hashchange',atualizarMenuAtivo);
 atualizarMenuAtivo();
 const buscaComandos=$('buscarComandoAdmin');
 buscaComandos.addEventListener('input',()=>{
  const termo=buscaComandos.value.trim().toLocaleLowerCase('pt-BR');
  let visiveis=0;
  for(const item of $('listaComandosAdmin').children){
   const nome=item.textContent.toLocaleLowerCase('pt-BR');
   item.hidden=Boolean(termo)&&!nome.includes(termo);
   if(!item.hidden)visiveis++;
  }
  $('resultadoBuscaComandoAdmin').textContent=visiveis===0
   ?'Nenhuma função encontrada. Tente outro termo.'
   :visiveis+' função(ões) disponível(is).';
 });
 $('formAcessoAdminLoop03').addEventListener('submit',async ev=>{
  ev.preventDefault();token=$('chaveAdminLoop03').value;$('chaveAdminLoop03').value='';
  try{await carregar();$('mensagemAcessoAdminLoop03').textContent='Acesso administrativo ao laboratório autorizado.';}
  catch(err){versaoFichaCliente++;token='';config=null;configRelogio=null;$('dadosAdminLoop03').hidden=true;
   $('situacaoPainel').textContent='SEM AUTENTICAÇÃO';
   $('mensagemAcessoAdminLoop03').textContent='Acesso recusado: '+err.message;}
 });
 $('sairAdminLoop03').addEventListener('click',()=>{
  token='';config=null;configRelogio=null;$('chaveAdminLoop03').value='';
  versaoFichaCliente++;clientesDiretorio=[];$('listaClientesAdmin').replaceChildren();
  $('detalheClienteAdmin').replaceChildren();
  $('dadosAdminLoop03').hidden=true;$('situacaoPainel').textContent='SEM AUTENTICAÇÃO';
  $('mensagemAcessoAdminLoop03').textContent='Chave descartada desta página.';
 });
 $('formRegraAdminLoop03').addEventListener('submit',async ev=>{
  ev.preventDefault();
  if(!token||!config)return;
  const vagaLiberacao=Number($('vagaAdminLoop03').value);
  const motivo=$('motivoAdminLoop03').value.trim();
  if(!window.confirm('Registrar mudança para a vaga '+vagaLiberacao+
   '? Esta regra valerá para futuras liberações, sem realocar posições existentes.'))return;
  const b=ev.target.querySelector('button[type=submit]');b.disabled=true;
  try{
   await post('/trava-fila-a',{vagaLiberacao,revisaoEsperada:config.revisao,motivo});
   $('motivoAdminLoop03').value='';await carregar();
   $('statusRegrasAdminLoop03').textContent='Regra salva, com histórico imutável.';
  }catch(err){
   $('statusRegrasAdminLoop03').textContent='Alteração recusada: '+err.message;
   await carregar().catch(()=>{});
  }finally{b.disabled=false;}
 });
 $('formRelogioAdminLoop03').addEventListener('submit',async ev=>{
  ev.preventDefault();
  if(!token||!configRelogio)return;
  const intervaloMinutos=Number($('intervaloRelogioAdmin').value);
  const justificativa=$('justificativaRelogioAdmin').value.trim();
  if(!window.confirm('Registrar '+intervaloMinutos+' minutos como referência do relógio? Nenhum giro será liberado.'))return;
  const botao=ev.target.querySelector('button[type=submit]');botao.disabled=true;
  try{
   await post('/intervalo-relogio',{intervaloMinutos,revisaoEsperada:configRelogio.revisao,justificativa});
   $('justificativaRelogioAdmin').value='';
   await carregar();
   $('statusRelogioAdminLoop03').textContent='Intervalo visual salvo; nenhum giro foi executado.';
  }catch(err){
   $('statusRelogioAdminLoop03').textContent='Alteração recusada: '+err.message;
   await carregar().catch(()=>{});
  }finally{botao.disabled=false;}
 });
 $('atualizarResumoDirecaoAdmin').addEventListener('click',async ev=>{
  const botao=ev.currentTarget;botao.disabled=true;
  $('statusResumoDirecaoAdmin').textContent='Atualizando dados autenticados…';
  try{await carregar();}catch(err){$('statusResumoDirecaoAdmin').textContent='Atualização indisponível: '+err.message;}
  finally{botao.disabled=false;}
 });
 $('atualizarAdminLoop03').addEventListener('click',async()=>{
  try{await carregar();$('statusRegrasAdminLoop03').textContent='Painel atualizado.';}
  catch(err){$('statusRegrasAdminLoop03').textContent=err.message;}
 });
})();