'use strict';
// Somente laboratório; credencial do operador mantida apenas em memória.
const $=id=>document.getElementById(id),elem=(tag,value)=>{const x=document.createElement(tag);if(value!==undefined)x.textContent=value;return x;};
let auth=null,chave=null,paginaMissoes=0,paginaAlertas=0,paginaProdutos=0,edicaoProduto=null,chaveProduto=null,sinalizacaoAtual=null;
const dizer=x=>$('estado').textContent=x;
let cursoresPosicoes=[null],indicePosicoes=0,proximoCursorPosicoes=null;
async function carregarHistoricoPosicoes(){
 const cursor=cursoresPosicoes[indicePosicoes];
 const p=await api('/posicoes-historico'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
 cursoresPosicoes[indicePosicoes]=p.cursorAtual;
 const area=$('historicoPosicoes');area.replaceChildren();
 $('resumoHistoricoPosicoes').textContent='Página '+(indicePosicoes+1)+' · '+p.itens.length+' registro(s). '+p.motivo;
 for(const item of p.itens){
  const row=elem('div');row.className='produto-admin-item';
  row.append(elem('strong',item.estado),elem('small','Pedido '+item.prepedidoId+' · Titular '+item.titularId));
  area.append(row);
 }
 proximoCursorPosicoes=p.proximoCursor;
 $('historicoPosicoesAnterior').disabled=indicePosicoes===0;
 $('historicoPosicoesProximo').disabled=!p.haMais;
}
async function navegarHistoricoPosicoes(destino){
 const botoes=['historicoPosicoesAnterior','historicoPosicoesProximo','historicoPosicoesAtualizar'];
 botoes.forEach(id=>$(id).disabled=true);
 const anterior={indice:indicePosicoes,cursores:[...cursoresPosicoes]};
 try{
  if(destino==='atualizar'){cursoresPosicoes=[null];indicePosicoes=0;}
  else if(destino==='proximo'&&proximoCursorPosicoes){
   cursoresPosicoes[++indicePosicoes]=proximoCursorPosicoes;
  }else if(destino==='anterior')indicePosicoes=Math.max(0,indicePosicoes-1);
  await carregarHistoricoPosicoes();
 }catch(e){
  indicePosicoes=anterior.indice;cursoresPosicoes=anterior.cursores;
  proximoCursorPosicoes=null;
  $('historicoPosicoes').replaceChildren();
  $('resumoHistoricoPosicoes').textContent='Histórico indisponível: '+e.message;
 }finally{
  $('historicoPosicoesAtualizar').disabled=false;
  $('historicoPosicoesAnterior').disabled=indicePosicoes===0;
  $('historicoPosicoesProximo').disabled=!proximoCursorPosicoes;
 }
}
async function api(path,{method='GET',body,idempotencia}={}){
 const r=await fetch('/staging/escritorio-unificado'+path,{
  method,cache:'no-store',credentials:'omit',
  headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'application/json'}:{}),
   ...(idempotencia?{'Idempotency-Key':idempotencia}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const out=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(out.erro||'SERVICO_INDISPONIVEL');
 return out;
}
function linha(rotulo,valor){const a=elem('div');a.className='indicador';a.append(elem('strong',String(valor)),elem('span',rotulo));return a;}

function renderizarPreviaFilas(p){
 const root=$('resumoPreviaFilas');root.replaceChildren();
 const area=$('posicoesPreviaFilas');area.replaceChildren();
 if(p.leituraLimitada===true){
  root.append(elem('p',p.motivo));return;
 }
 const resumo=elem('div');resumo.className='indicadores';
 resumo.append(linha('Fictícias históricas',p.totalHistorico||0),
  linha('Hipótese B sem ativação',p.pendentesConferidas||0),
  linha('Em revisão PSP',p.pendentesExigemRevisao||0),
  linha('Acima do teto de simulação',p.pendentesAcimaCapacidade||0),
  linha('Sem fotografia histórica',p.pendentesSemFotografia||0),
  linha('Oferta histórica não qualificada',p.pendentesSemOfertaQualificada||0));
 root.append(resumo,elem('p',p.motivo));
 for(const item of p.hipoteseFilaB||[]){
  const row=elem('div');row.className='produto-admin-item';
  row.append(elem('strong',item.estado),
   elem('small','Pedido '+item.prepedidoId+' · Titular '+item.titularId+
    ' · Pré-adesão fictícia: '+(item.preAdesaoFicticiaRegistrada?'registrada':'não registrada')));
  area.append(row);
 }
}


function limparProduto(){
 edicaoProduto=null;chaveProduto=null;$('formProduto').reset();
 $('produtoIdAdmin').readOnly=false;$('produtoTipoAdmin').disabled=false;
 $('tituloFormularioProduto').textContent='Cadastrar produto fictício';
 $('salvarProdutoAdmin').textContent='Salvar produto';
}
function preencherProduto(item){
 edicaoProduto={id:item.produto.id,revisao:item.revisao};
 $('produtoIdAdmin').value=item.produto.id;$('produtoIdAdmin').readOnly=true;
 $('produtoTipoAdmin').value=item.produto.tipo;$('produtoTipoAdmin').disabled=true;
 $('produtoEstadoAdmin').value=item.produto.estado;
 $('produtoNomeAdmin').value=item.produto.nome;
 $('produtoDescricaoAdmin').value=item.produto.descricao;
 $('produtoPrecoAdmin').value=item.produto.precoCentavos===null?'':String(
  (item.produto.precoCentavos/100).toFixed(2)
 );
 $('tituloFormularioProduto').textContent='Editar produto · revisão '+item.revisao;
 $('salvarProdutoAdmin').textContent='Atualizar catálogo do laboratório';
 $('formProduto').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderizarProdutos(r){
 const area=$('listaProdutosAdmin');area.replaceChildren();
 if(!r.registros.length)area.append(elem('p','Nenhum produto nesta página.'));
 for(const item of r.registros){
  const card=elem('article');card.className='produto-admin-item';
  const info=elem('div');info.append(elem('strong',item.produto.nome),
   elem('small',item.produto.id+' · '+item.produto.tipo+' · '+item.produto.estado+
    ' · '+(item.produto.precoCentavos===null?'Sem preço':
     new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(
      item.produto.precoCentavos/100))+' · revisão '+item.revisao));
  const editar=elem('button','Editar');editar.type='button';
  editar.addEventListener('click',()=>preencherProduto(item));
  const cor=elem('button','Cor na loja');cor.type='button';
  cor.addEventListener('click',()=>editarCor(item.produto.id).catch(e=>{
   $('resultadoSinalizacaoAdmin').textContent='Sinalização indisponível: '+e.message;
  }));
  const botoes=elem('div');botoes.append(editar,cor);
  card.append(info,botoes);area.append(card);
 }
 $('produtosAnterior').disabled=paginaProdutos===0;
 $('produtosProximo').disabled=!r.haMais;
}
async function atualizarProdutos(){renderizarProdutos(await api('/produtos?pagina='+paginaProdutos));}
let ultimaLeituraCor=0;
async function editarCor(id){
 const chamada=++ultimaLeituraCor;
 const controles=[...$('formSinalizacaoAdmin').querySelectorAll('input,select,button')];
 for(const el of controles)el.disabled=true;
 $('resultadoSinalizacaoAdmin').textContent='Carregando classificação do produto...';
 try{
  const r=await api('/sinalizacao/'+encodeURIComponent(id));
  if(chamada!==ultimaLeituraCor)return;
  sinalizacaoAtual=r;
  $('sinalizacaoProdutoId').value=id;
  $('produtoSimulado').value=id;
  $('sinalizacaoClasse').value=r.classificacao;
  $('sinalizacaoMinimo').value=String(r.quantidadeMinimaLoop);
  $('sinalizacaoPosicoesRoxo').value=String(r.posicoesPorUnidadeRoxo||0);
  $('sinalizacaoPosicoesRoxo').disabled=r.classificacao!=='ROXO';
  $('tituloSinalizacaoAdmin').scrollIntoView({behavior:'smooth',block:'start'});
  $('resultadoSinalizacaoAdmin').textContent='Configuração visual carregada; revisão '+r.revisao+'.';
 }finally{
  if(chamada===ultimaLeituraCor)for(const el of controles)el.disabled=false;
 }
}



function atualizarDepartamentos(departamentos){
 const area=$('quadroDepartamentos');area.replaceChildren();
 const ativo=$('filtrarDepartamento').value;
 for(const d of departamentos){
  const button=elem('button');button.type='button';button.className='departamento-card';
  button.setAttribute('aria-pressed',String(ativo===d.codigo));
  button.append(elem('strong',d.nome),
   elem('span',d.missoesPendentes+' missão(ões) em aberto'),
   elem('small',d.quantidadeDadosLaboratorio===null?
    'Operações comerciais não conectadas':
    d.quantidadeDadosLaboratorio+' · '+d.descricao));
  button.addEventListener('click',()=>{
   const atual=$('filtrarDepartamento').value;
   $('filtrarDepartamento').value=atual===d.codigo?'':d.codigo;
   $('departamento').value=d.codigo;paginaMissoes=0;
   atualizar().catch(e=>dizer(e.message));
  });
  area.append(button);
 }
}
function atualizarAlertas(painel){
 const area=$('alertasOperacionais');area.replaceChildren();
 $('resumoAlertas').textContent='Página '+(painel.pagina+1)+
  ' · '+painel.pedidosExaminados+' pedidos examinados';
 $('alertasAnterior').disabled=paginaAlertas===0;
 $('alertasProximo').disabled=!painel.haMais;
 if(!painel.alertas.length)area.append(elem('p','Nenhuma revisão identificada nesta página.'));
 for(const a of painel.alertas){
  const item=elem('article');item.className='alerta-operacional';
  item.append(elem('strong',a.motivo.replaceAll('_',' ')),
   elem('p','Pedido '+a.prepedidoId+' · '+a.estadoOperacional));
  const botao=elem('button','Abrir missão de revisão');botao.type='button';
  botao.addEventListener('click',async()=>{
   botao.disabled=true;
   try{
    const m=await api('/alertas/'+encodeURIComponent(a.prepedidoId)+'/abrir-missao',
     {method:'POST',body:{}});
    $('filtrarDepartamento').value='PEDIDOS';paginaMissoes=0;
    await atualizar();
    dizer(m.repetida?'Missão de revisão já estava registrada.':
     'Missão de revisão registrada, sem alterar pagamento.');
   }catch(e){dizer('Revisão não aberta: '+e.message);}
   finally{botao.disabled=false;}
  });
  item.append(botao);area.append(item);
 }
}

async function carregarPreviaFilas(){
 try{return await api('/projecao-filas');}
 catch(e){
  // O teto permanece fechado no backend, sem derrubar os outros departamentos
  // nem transformar uma leitura indisponivel em zero posicoes.
  if(e.message!=='MAXIMO_ANALISE_SEGURA_EXCEDIDO')throw e;
  return {leituraLimitada:true,
   motivo:'Prévia global indisponível acima de 1.000 registros. Consulte o histórico paginado abaixo; ele não representa ordem de fila.'};
 }
}
async function atualizar(){
 const q=new URLSearchParams({pagina:String(paginaMissoes)});
 if($('filtrarDepartamento').value)q.set('departamento',$('filtrarDepartamento').value);
 if($('filtrarSituacao').value)q.set('situacao',$('filtrarSituacao').value);
 const [e,m,d,alertas,produtos,previa]=await Promise.all([
  api(''),api('/missoes?'+q.toString()),api('/departamentos'),
  api('/alertas?pagina='+paginaAlertas),api('/produtos?pagina='+paginaProdutos),
  carregarPreviaFilas(),carregarHistoricoPosicoes()
 ]);
 $('indicadores').replaceChildren(
  linha('Contas',e.contasCandidatas),
  linha('Pré-pedidos',e.resumo.prepedidosStaging),
  linha('PSP conciliados',e.resumo.recebimentosPSPConciliados),
  linha('PSP sem posição — revisar',e.vinculosMotorAusentes),
  linha('Estornos sem suspensão — revisar',e.reversoesMotorPendentes),
  linha('Reconsultas PSP em andamento',e.recuperacaoPSP?.processando??0),
  linha('Interrupções PSP em recuperação',e.recuperacaoPSP?.retomaveis??0),
  linha('Reincidências — revisão humana',e.recuperacaoPSP?.segundaFalha??0),
  linha('Posições fictícias',e.posicoesPendentesFicticias),
  linha('Missões no filtro',m.total)
 );
 atualizarDepartamentos(d.departamentos);
 atualizarAlertas(alertas);
 renderizarProdutos(produtos);
 renderizarPreviaFilas(previa);
 $('resumoMissoes').textContent='Página '+(m.pagina+1)+' · '+m.total+' missão(ões) neste filtro.';
 $('missoesAnterior').disabled=paginaMissoes===0;
 $('missoesProximo').disabled=!m.haMais;
 const pedidos=$('pedidos'),escolha=$('pedido'),original=escolha.value;
 pedidos.replaceChildren();escolha.replaceChildren(new Option('Sem pedido',''));
 for(const p of e.pedidos){
  const card=elem('article');card.className='produto-admin-item';
  card.append(elem('p',(p.nick||'Cliente')+' · '+p.prepedidoId+
   ' · '+(p.estadoOperacional||'Pré-pedido de laboratório')));
  const btn=elem('button','Conferir pré-adesão');btn.type='button';
  btn.addEventListener('click',async()=>{
   $('preAdesaoId').value=p.prepedidoId;
   $('formPreAdesao').scrollIntoView({behavior:'smooth',block:'center'});
   btn.disabled=true;
   try{mostrarPreAdesao(await api('/pre-adesao/'+encodeURIComponent(p.prepedidoId)));}
   catch(e){$('preAdesaoStatus').textContent='Revisão pendente: '+e.message;}
   finally{btn.disabled=false;}
  });
  card.append(btn);pedidos.append(card);
  escolha.append(new Option((p.nick||'Cliente')+' · '+p.prepedidoId,p.prepedidoId));
 }
 if(e.pedidos.length===0)pedidos.append(elem('p','Nenhum pré-pedido.'));
 if([...escolha.options].some(x=>x.value===original))escolha.value=original;
 const lista=$('listaMissoes');lista.replaceChildren();
 if(m.missoes.length===0)lista.append(elem('p','Nenhuma missão registrada.'));
 for(const item of m.missoes){
  const card=elem('article');card.className='pedido';
  card.append(elem('h3',item.titulo),elem('p',item.departamento+' · '+item.prioridade+' · '+item.situacao),elem('p',item.descricao));
  if(item.prepedidoId)card.append(elem('p','Pedido: '+item.prepedidoId));
  const proximas=item.situacao==='ABERTA'?['EM_ANDAMENTO','CANCELADA']:
   item.situacao==='EM_ANDAMENTO'?['CONCLUIDA','CANCELADA']:[];
  if(proximas.length){
   const form=elem('form'),situacao=elem('select'),nota=elem('textarea'),msg=elem('textarea');
   nota.required=true;nota.minLength=8;nota.maxLength=400;nota.placeholder='Nota da ação realizada';
   msg.maxLength=320;msg.value=item.mensagemCliente||'';msg.placeholder='Comunicado ao cliente';msg.disabled=!item.prepedidoId;
   for(const status of proximas)situacao.append(new Option(status.replaceAll('_',' '),status));
   const botao=elem('button','Registrar andamento');botao.type='submit';
   form.append(situacao,nota,msg,botao);
   form.addEventListener('submit',async ev=>{
    ev.preventDefault();botao.disabled=true;
    try{
     await api('/missoes/'+encodeURIComponent(item.id),{method:'PATCH',
      body:{revisaoEsperada:item.revisao,situacao:situacao.value,nota:nota.value,mensagemCliente:msg.value}});
     await atualizar();dizer('Andamento salvo no histórico da missão.');
    }catch(err){dizer('Falha: '+err.message);}finally{botao.disabled=false;}
   });
   card.append(form);
  }
  const historico=elem('button','Ver histórico');historico.type='button';
  historico.addEventListener('click',async()=>{
   try{
    const h=await api('/missoes/'+encodeURIComponent(item.id)+'/historico');
    const ol=elem('ol');
    for(const row of h.historico)ol.append(elem('li',row.acao+' · '+row.nota));
    historico.replaceWith(ol);
   }catch(err){dizer('Falha: '+err.message);}
  });
  card.append(historico);lista.append(card);
 }
 dizer('Escritório atualizado a partir do mesmo SQLite dos clientes.');
}
$('formAcesso').addEventListener('submit',async e=>{
 e.preventDefault();auth=$('token').value;$('token').value='';
 try{await atualizar();$('acesso').hidden=true;$('administracao').hidden=false;}
 catch(err){auth=null;dizer('Acesso não autorizado: '+err.message);}
});
$('sair').addEventListener('click',()=>{
 auth=null;$('acesso').hidden=false;$('administracao').hidden=true;
 cursoresPosicoes=[null];indicePosicoes=0;proximoCursorPosicoes=null;
 $('historicoPosicoes').replaceChildren();$('resumoHistoricoPosicoes').textContent='';
 $('listaMissoes').replaceChildren();dizer('Acesso encerrado.');
});
async function conferirCoberturaAkitemm({offset=0}={}){
 const botao=$('consultarCoberturaAkitemm');
 botao.disabled=true;
 const resumo=$('resumoCoberturaAkitemm'),lista=$('listaCoberturaAkitemm');
 lista.replaceChildren();
 try{
  const r=await api('/auditoria-cobertura?limite=50&offset='+offset);
  resumo.textContent='CONTADORES DESTA PÁGINA · Página '+
   (Math.floor(r.paginacao.offset/r.paginacao.limite)+1)+
   ' · Pedidos examinados: '+r.resumo.pedidosNaAmostra+
   ' / '+r.resumo.pedidosTotal+
   ' · Cobertura bruta insuficiente: '+r.resumo.brutoInsuficiente+
   ' · Produtos individuais sem cobertura: '+r.resumo.segmentosInsuficientes+
   ' · Sem custo externo comprovado: '+r.resumo.semComprovacaoDeCustos+
   ' · Lotes sem PSP vigente: '+r.resumo.lotesSemPSPConferido+
   ' · Posições no motor: '+r.resumo.posicoesNoMotorEnsaio+
   ' · Aceites individuais históricos: '+r.resumo.aceitesHistoricosIndividuais+
   ' · Aceites com PSP revertido ou não vigente: '+r.resumo.aceitesSemPSPVigente+
   ' · Fontes financeiras de ensaio ausentes: '+r.livrosFinanceirosLab.fontesAusentes.length+
   ' · Exposição condicional dos lotes (cenário máximo): '+
    new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
     .format(r.resumo.valorCondicionalDosLotesCentavos/100)+
   '. Banco, custos e reservas reais NÃO CONCILIADOS. Marco Zero financeiro: NÃO APROVADO.';
  if(r.amostraParcial)lista.append(elem('p',
   'A auditoria desta página não representa todos os pedidos. Consulte as demais páginas.'));
  const invalidos=r.pedidos.filter(p=>p.alertas.length>0);
  if(!invalidos.length)lista.append(elem('p',
   'Nenhum alerta nesta página; custos e banco continuam pendentes.'));
  for(const p of invalidos.slice(0,20)){
   const card=elem('article');card.className='alerta-operacional';
   card.append(elem('strong','Pedido '+p.prepedidoId),
    elem('p','Posições: '+(p.posicoesPlanejadas??'sem plano')+
     ' · Referência: '+(p.referenciaCentavos===null?'sem dados':
     new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(p.referenciaCentavos/100))+
     ' · '+p.estado),
    elem('small',p.alertas.join(' · ')));
   lista.append(card);
  }
  const pag=r.paginacao;
  const navegacao=elem('div');navegacao.className='linha';
  const anterior=elem('button','Página anterior');anterior.type='button';
  anterior.disabled=pag.paginaAnteriorOffset===null;
  const proximo=elem('button','Próxima página');proximo.type='button';
  proximo.disabled=pag.proximaPaginaOffset===null;
  anterior.addEventListener('click',()=>conferirCoberturaAkitemm({
   offset:pag.paginaAnteriorOffset
  }));
  proximo.addEventListener('click',()=>conferirCoberturaAkitemm({
   offset:pag.proximaPaginaOffset
  }));
  navegacao.append(anterior,elem('small',
   'Exibindo '+(pag.quantidadeNaPagina?
    (pag.offset+1)+'–'+(pag.offset+pag.quantidadeNaPagina):'0')+
   ' de '+pag.totalDePedidos+' pedidos'),proximo);
  lista.append(navegacao);
 }catch(e){resumo.textContent='Auditoria indisponível: '+e.message;}
 finally{botao.disabled=false;}
}
async function conferirBackupOffsite(){
 const el=$('estadoBackupOffsite'),botao=$('conferirBackupOffsite');
 botao.disabled=true;
 try{
  const r=await api('/backup-offsite/estado');
  if(r.backupRailwayComprovado===true&&
     r.backupAtualEmDia===true&&
     r.ultimaConfirmacao?.integridadeCifradaSha256){
   el.textContent='Cópia criptografada enviada, relida e restaurada em isolamento: '+
    new Date(r.ultimaConfirmacao.quando).toLocaleString('pt-BR')+
    '. Banco original preservado. Restauração em outra região ainda não comprovada.';
  }else if(r.backupRailwayComprovado===true){
   el.textContent='Existe cópia externa verificada anteriormente, mas o '+
    'backup atual exige verificação (falha recente ou última cópia antiga). '+
    'Última confirmação: '+
    (r.ultimaConfirmacao?.quando?
     new Date(r.ultimaConfirmacao.quando).toLocaleString('pt-BR'):'indisponível')+
    '. Sem garantia de recuperação comercial.';
  }else{
   el.textContent='Backup externo ainda não comprovado neste serviço. '+
    (r.estado==='BACKUP_OFFSITE_NAO_HABILITADO_NESTE_SERVICO'?
     'A rotina automática não está habilitada.' :
     'Último estado: '+r.ultimoEstado+'.')+
    ' Sem garantia de recuperação comercial.';
  }
 }catch(e){el.textContent='Conferência do backup indisponível: '+e.message;}
 finally{botao.disabled=false;}
}
$('conferirBackupOffsite').addEventListener('click',conferirBackupOffsite);
$('consultarCoberturaAkitemm').addEventListener('click',conferirCoberturaAkitemm);
$('atualizar').addEventListener('click',()=>atualizar().catch(e=>dizer(e.message)));
$('recarregarPreviaFilas').addEventListener('click',()=>atualizar().catch(e=>dizer(e.message)));
for(const [id,destino] of [['historicoPosicoesAtualizar','atualizar'],['historicoPosicoesAnterior','anterior'],['historicoPosicoesProximo','proximo']]){
 $(id).addEventListener('click',()=>navegarHistoricoPosicoes(destino));
}

function mostrarPreAdesao(dados){
 const x=$('preAdesaoStatus');
 const resumo=dados.motivos?.length?
  'Bloqueios: '+dados.motivos.join(', '):
  'Requisitos de ensaio conferidos, sem ativação real';
 x.textContent='Estado: '+dados.estado+' · '+resumo+
  '. CPF verificado externamente: não. Posições reais criadas: 0.';
}
$('conferirPreAdesao').addEventListener('click',async e=>{
 const btn=e.currentTarget;btn.disabled=true;
 try{
  const id=$('preAdesaoId').value;
  if(!/^hom-[a-f0-9-]{36}$/.test(id))throw Error('PREPEDIDO_INVALIDO');
  mostrarPreAdesao(await api('/pre-adesao/'+encodeURIComponent(id)));
 }catch(err){$('preAdesaoStatus').textContent='Consulta bloqueada: '+err.message;}
 finally{btn.disabled=false;}
});
$('conferirGateAtivacao').addEventListener('click',async e=>{
 const botao=e.currentTarget;botao.disabled=true;
 try{
  const id=$('preAdesaoId').value;
  if(!/^hom-[a-f0-9-]{36}$/.test(id))throw Error('PREPEDIDO_INVALIDO');
  const d=await api('/diagnostico-ativacao/'+encodeURIComponent(id));
  $('resultadoGateAtivacao').textContent='Estado: '+d.estado+
   '. Pendências: '+d.bloqueios.join(', ')+'.';
 }catch(err){$('resultadoGateAtivacao').textContent='Consulta indisponível: '+err.message;}
 finally{botao.disabled=false;}
});
$('criarMissaoGateAtivacao').addEventListener('click',async e=>{
 const botao=e.currentTarget;botao.disabled=true;
 try{
  const id=$('preAdesaoId').value;
  if(!/^hom-[a-f0-9-]{36}$/.test(id))throw Error('PREPEDIDO_INVALIDO');
  const gate=await api('/diagnostico-ativacao/'+encodeURIComponent(id));
  if(gate.permitidoAtivar!==false)throw Error('GATE_INCOMPATIVEL');
  const r=await api('/missoes',{method:'POST',
   idempotencia:'regularizacao-ativacao-'+id,
   body:{
    departamento:'SEGURANCA',prioridade:'ALTA',
    titulo:'Regularizar requisitos de ativação',
    descricao:'Conferir identidade externa, pagamento comercial, titularidade, limite de 10 posições ativas, limite de 2 no tabuleiro, conciliação e autorização operacional. Consultar diagnóstico atualizado antes de concluir.',
    prepedidoId:id,mensagemCliente:null
   }});
  $('resultadoGateAtivacao').textContent=r.repetida?
   'Missão de regularização já registrada no departamento Segurança.':
   'Missão de regularização criada no departamento Segurança.';
  paginaMissoes=0;$('filtrarDepartamento').value='SEGURANCA';
  await atualizar();
 }catch(err){$('resultadoGateAtivacao').textContent='Missão não criada: '+err.message;}
 finally{botao.disabled=false;}
});
$('formPreAdesao').addEventListener('submit',async e=>{
 e.preventDefault();
 const btn=e.submitter;btn.disabled=true;
 try{
  const r=await api('/preparar-pre-adesao',{
   method:'POST',body:{prepedidoId:$('preAdesaoId').value}
  });
  mostrarPreAdesao(r);
  await atualizar();
 }catch(err){$('preAdesaoStatus').textContent='Registro bloqueado: '+err.message;}
 finally{btn.disabled=false;}
});


$('recarregarProdutos').addEventListener('click',()=>atualizarProdutos().catch(e=>dizer(e.message)));
$('sinalizacaoClasse').addEventListener('change',()=>{
 const classe=$('sinalizacaoClasse').value;
 if(classe!=='VERDE')$('sinalizacaoMinimo').value='1';
 $('sinalizacaoPosicoesRoxo').disabled=classe!=='ROXO';
});
$('formSinalizacaoAdmin').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;botao.disabled=true;
 try{
  if(!sinalizacaoAtual||sinalizacaoAtual.produtoId!==$('sinalizacaoProdutoId').value)
   throw Error('SELECIONE_PRODUTO');
  const data={
   classificacao:$('sinalizacaoClasse').value,
   quantidadeMinimaLoop:Number($('sinalizacaoMinimo').value),
   revisaoEsperada:sinalizacaoAtual.revisao
  };
  if(data.classificacao==='ROXO')
   data.posicoesPorUnidadeRoxo=Number($('sinalizacaoPosicoesRoxo').value);
  sinalizacaoAtual=await api('/sinalizacao/'+encodeURIComponent(sinalizacaoAtual.produtoId),{
   method:'PATCH',body:data
  });
  $('sinalizacaoPosicoesRoxo').value=String(sinalizacaoAtual.posicoesPorUnidadeRoxo||0);
  $('resultadoSinalizacaoAdmin').textContent='Cor salva no catálogo compartilhado. Atualize a vitrine para conferir.';
 }catch(err){$('resultadoSinalizacaoAdmin').textContent='Não foi possível salvar a cor: '+err.message;}
 finally{botao.disabled=false;}
});

$('formSimularQualificacao').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=e.submitter;button.disabled=true;
 try{
  const dados=await api('/simular-qualificacao',{method:'POST',body:{
   itens:[{produtoId:$('produtoSimulado').value,
    quantidade:Number($('quantidadeSimulada').value)}]
  }});
  const moeda=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
  $('resultadoSimulacao').textContent=dados.mensagem+
   ' Valor verde considerado: '+moeda(dados.valorVerdeConsideradoCentavos)+
   '. Faltam: '+moeda(dados.faltamCentavos)+
   '. Posições criadas: '+dados.posicoesCriadas+'.';
 }catch(err){$('resultadoSimulacao').textContent='Simulação não realizada: '+err.message;}
 finally{button.disabled=false;}
});
$('cancelarEdicaoProduto').addEventListener('click',limparProduto);
$('produtosAnterior').addEventListener('click',()=>{
 paginaProdutos=Math.max(0,paginaProdutos-1);atualizarProdutos().catch(e=>dizer(e.message));
});
$('produtosProximo').addEventListener('click',()=>{
 paginaProdutos++;atualizarProdutos().catch(e=>dizer(e.message));
});
$('formProduto').addEventListener('input',()=>{chaveProduto=null;});
$('formProduto').addEventListener('submit',async event=>{
 event.preventDefault();
 const botao=event.submitter;botao.disabled=true;
 const preco=Number($('produtoPrecoAdmin').value);
 const centavos=Math.round(preco*100);
 if(!Number.isFinite(preco)||centavos<=0||Math.abs(preco*100-centavos)>0.000001){
  $('resultadoProdutoAdmin').textContent='Preço inválido. Use duas casas decimais.';
  botao.disabled=false;return;
 }
 try{
  const id=$('produtoIdAdmin').value,nome=$('produtoNomeAdmin').value;
  const descricao=$('produtoDescricaoAdmin').value,estado=$('produtoEstadoAdmin').value;
  if(edicaoProduto){
   await api('/produtos/'+encodeURIComponent(edicaoProduto.id),{
    method:'PATCH',body:{revisaoEsperada:edicaoProduto.revisao,
     alteracoes:{nome,descricao,estado,precoCentavos:centavos}}
   });
  }else{
   if(!chaveProduto)chaveProduto='produto-ui-'+crypto.randomUUID();
   const tipo=$('produtoTipoAdmin').value;
   await api('/produtos',{method:'POST',idempotencia:chaveProduto,
    body:{produto:{id,nome,descricao,tipo,estado,precoCentavos:centavos,
     entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
     fotos:[],detalhes:[],videoApresentacaoUrl:null}}});
  }
  limparProduto();await atualizar();
  $('resultadoProdutoAdmin').textContent='Produto salvo no mesmo catálogo das novas cotações de teste.';
 }catch(e){$('resultadoProdutoAdmin').textContent='Produto não salvo: '+e.message;}
 finally{botao.disabled=false;}
});

for(const id of ['filtrarDepartamento','filtrarSituacao']){
 $(id).addEventListener('change',()=>{
  paginaMissoes=0;atualizar().catch(e=>dizer(e.message));
 });
}
$('missoesAnterior').addEventListener('click',()=>{
 paginaMissoes=Math.max(0,paginaMissoes-1);atualizar().catch(e=>dizer(e.message));
});
$('missoesProximo').addEventListener('click',()=>{
 paginaMissoes++;atualizar().catch(e=>dizer(e.message));
});
$('alertasAnterior').addEventListener('click',()=>{
 paginaAlertas=Math.max(0,paginaAlertas-1);atualizar().catch(e=>dizer(e.message));
});
$('alertasProximo').addEventListener('click',()=>{
 paginaAlertas++;atualizar().catch(e=>dizer(e.message));
});
$('criarMissao').addEventListener('input',()=>{chave=null;});
$('criarMissao').addEventListener('submit',async e=>{
 e.preventDefault();if(!chave)chave='ui-'+crypto.randomUUID();
 const botao=e.submitter;botao.disabled=true;
 try{
  await api('/missoes',{method:'POST',idempotencia:chave,body:{
   departamento:$('departamento').value,prioridade:$('prioridade').value,
   titulo:$('titulo').value,descricao:$('descricao').value,
   prepedidoId:$('pedido').value||null,mensagemCliente:$('mensagem').value
  }});
  chave=null;$('criarMissao').reset();await atualizar();
  dizer('Missão criada e auditada, aguardando trabalho humano.');
 }catch(err){dizer('Missão não registrada: '+err.message);}
 finally{botao.disabled=false;}
});
$('reconciliarPendentesPsp').addEventListener('click',async()=>{
 const botao=$('reconciliarPendentesPsp'),status=$('resultadoConciliacaoPsp');
 botao.disabled=true;
 status.textContent='Conferindo os avisos novos no Sandbox e vinculando ao mesmo motor de ensaio...';
 try{
  const r=await api('/reconciliar-pendentes-sandbox',{
   method:'POST',body:{limite:20}
  });
  status.textContent='Conciliação do lote: '+r.consultados+' avisos conferidos, '+
   r.lotesPendentesCriados+' lotes de posições pendentes, '+
   r.lotesSuspensos+' lotes suspensos por reversão, '+
   r.pendentesRestantes+' avisos aguardando, '+
   r.vinculosMotorAusentes+' eventos de pagamento sandbox sem vínculo no motor, '+
   r.reversoesMotorPendentes+' reversões PSP aguardando suspensão do motor, '+
   r.revisaoNecessaria+' casos desta rodada exigindo revisão, '+
   (r.interrupcoesDetectadas??0)+' interrupções antigas detectadas, '+
   (r.retomadasComProvaPSP??0)+' retomadas com PSP reconsultado, '+
   (r.interrupcoesReinterrompidas??0)+' interrupções repetidas bloqueadas. '+
   'Nenhum saque ou pagamento real liberado.';
  await atualizar();
  await atualizarMotorContaEnsaio();
 }catch(e){
  status.textContent='Conciliação bloqueada: '+e.message;
 }finally{
  await conferirPixUnificado();
 }
});
$('reconsultar').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{await api('/reconsultar-psp',{method:'POST',body:{eventoId:$('eventoId').value}});
  await atualizar();dizer('Reconsulta Sandbox concluída. Confira o estado no painel.');
 }catch(err){dizer('Reconsulta bloqueada: '+err.message);}finally{b.disabled=false;}
});
$('prepararEntrega').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{await api('/preparar-entrega',{method:'POST',body:{prepedidoId:$('prepedidoId').value}});
  await atualizar();dizer('Entrega de teste registrada; não houve entrega comercial.');
 }catch(err){dizer('Operação bloqueada: '+err.message);}finally{b.disabled=false;}
});

let agendaHojeLocal=null;
async function atualizarMotorContaEnsaio(){
 const r=await api('/motor/estado');
 const area=$('motorEnsaioResumo');area.replaceChildren();
 area.append(linha('Fila A de ensaio',r.filaA.length),
  linha('Fila B de ensaio',r.filaB.length),
  linha('Ocupantes no tabuleiro',Number(Boolean(r.tabuleiro.centro))+
   r.tabuleiro.vagas.filter(Boolean).length),
  linha('Eventos de ensaio no ciclo',r.tabuleiro.eventosNoCiclo+'/6'),
  linha('Luzes roxas contabilizadas',r.agenda.luzesRoxasAcesas+'/3'),
  linha('Luzes pretas contabilizadas',r.agenda.luzesPretasAcesas+'/3'),
  linha('Compras confirmadas aguardando luz',r.agenda.aguardandoContabilizacao),
  linha('Giros de ensaio',r.catraca.giros),
  linha('Catraca',r.catraca.estado),
  linha('Modo da catraca',r.agenda.modoExecucao||'MANUAL'));
 $('agendaMotorEstado').textContent='Horário '+r.agenda.abertura+'–'+
  r.agenda.fechamentoAplicado+' ('+r.agenda.fuso+') · '+
  'Modo '+(r.agenda.modoExecucao||'MANUAL')+' · '+
  (r.agenda.modoExecucao==='AGENDADA'?
   (r.agenda.dentroDoHorario?'dentro do horário':'fora do horário'):
   r.agenda.modoExecucao==='NATURAL'?'sem limite de horário':
   r.agenda.modoExecucao==='STOP'?'movimento bloqueado pelo STOP':
   'somente comandos manuais')+
  (r.agenda.pausaManual?' · PAUSA MANUAL':'')+
  ' · '+r.agenda.aguardandoContabilizacao+
  ' compra(s) Sandbox confirmada(s) aguardando contabilização. '+
  'As vendas e as filas continuam mesmo com a catraca pausada.';
 $('agendaMotorInicio').value=r.agenda.abertura;
 $('agendaMotorFim').value=r.agenda.fechamento;
 $('agendaMotorIntervalo').value=String(r.agenda.intervaloMinutos);
 $('agendaMotorExcecaoData').value=r.agenda.excecaoData||'';
 $('agendaMotorExcecaoFim').value=r.agenda.excecaoFechamento||'';
 $('agendaMotorModo').value=r.agenda.modoExecucao||'MANUAL';
 agendaHojeLocal=r.agenda.dia;
 return r;
}
async function operacaoMotorContaEnsaio(rota,body,mensagem){
 const alvo=$('motorEnsaioStatus');
 alvo.textContent='Conferindo operação de ensaio...';
 try{
  const r=await api('/motor/'+rota,{method:'POST',body});
  await atualizarMotorContaEnsaio();
  alvo.textContent=mensagem+' · '+(r.motivo||(
   r.posicaoId?'#'+r.posicaoId:'Motor atualizado'))+
   ' · Nenhuma movimentação financeira real.';
 }catch(e){
  alvo.textContent='Operação não executada: '+e.message;
 }
}
$('agendaMotorHoje21').addEventListener('click',()=>{
 if(!agendaHojeLocal){
  $('agendaMotorEstado').textContent='Atualize o motor antes de escolher o dia.';
  return;
 }
 $('agendaMotorExcecaoData').value=agendaHojeLocal;
 if(!$('agendaMotorExcecaoFim').value)
  $('agendaMotorExcecaoFim').value=$('agendaMotorFim').value||'18:00';
 $('agendaMotorEstado').textContent='Data de hoje selecionada. Escolha livremente o horário de encerramento, inclusive 00:00, e salve.';
});
$('formAgendaMotor').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;if(botao)botao.disabled=true;
 const data=$('agendaMotorExcecaoData').value||null;
 const hora=$('agendaMotorExcecaoFim').value||null;
 const estado=$('agendaMotorEstado');
 estado.textContent='Salvando horário e intervalo no SQLite...';
 try{
  if(Boolean(data)!==Boolean(hora))
   throw Error('A exceção precisa ter data e horário.');
  const r=await api('/motor/agenda',{method:'POST',body:{
   ativo:$('agendaMotorModo').value==='AGENDADA',
   modoExecucao:$('agendaMotorModo').value,
   abertura:$('agendaMotorInicio').value,
   fechamento:$('agendaMotorFim').value,
   intervaloMinutos:Number($('agendaMotorIntervalo').value),
   excecaoData:data,excecaoFechamento:hora
  }});
  if(!r.configurada)throw Error('AGENDA_NAO_GRAVADA');
  await atualizarMotorContaEnsaio();
  estado.textContent='Agenda salva no SQLite. Primeira luz somente no próximo intervalo válido; nenhuma compra ou transferência criada.';
 }catch(err){
  estado.textContent='Agenda não alterada: '+err.message;
 }finally{if(botao)botao.disabled=false;}
});
$('formLiberarLoteMotor').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;if(botao)botao.disabled=true;
 const estado=$('motorLoteResultado');
 const quantidade=Number($('motorLoteQuantidade').value);
 estado.textContent='Conferindo compras PSP e posições antes de liberar o lote...';
 try{
  if(!Number.isSafeInteger(quantidade)||quantidade<1)
   throw Error('Informe um número positivo de pessoas.');
  const r=await api('/motor/liberar-lote',{
   method:'POST',body:{quantidade}
  });
  estado.textContent='Solicitados '+r.solicitados+
   ' ciclos; '+r.liberados+' concluídos, '+r.restantes+
   ' aguardando. '+r.eventosUsados+' compras conciliadas contabilizadas. '+
   'Motivo: '+r.motivo+'. Nenhum valor real transferido.';
  await atualizarMotorContaEnsaio();
 }catch(err){estado.textContent='Lote não liberado: '+err.message;}
 finally{if(botao)botao.disabled=false;}
});
$('motorEnsaioAtualizar').addEventListener('click',()=>{
 atualizarMotorContaEnsaio().then(()=>
  $('motorEnsaioStatus').textContent='Leitura do motor no SQLite concluída.')
  .catch(e=>$('motorEnsaioStatus').textContent='Consulta indisponível: '+e.message);
});
$('formMotorEnsaioPedido').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;botao.disabled=true;
 try{
  await operacaoMotorContaEnsaio('vincular-pedido',{
   prepedidoId:$('motorEnsaioPrepedido').value,
   aceiteEnsaio:$('motorEnsaioCiencia').checked
  },'Pedido vinculado ao motor de ensaio');
 }finally{botao.disabled=false;}
});
$('motorEnsaioRegistrarEvento').addEventListener('click',async e=>{
 const botao=e.currentTarget;botao.disabled=true;
 try{
  await operacaoMotorContaEnsaio('evento',{
   prepedidoId:$('motorEnsaioPrepedido').value
  },'Evento de ensaio conferido');
 }finally{botao.disabled=false;}
});
$('motorEnsaioPreparar').addEventListener('click',()=>operacaoMotorContaEnsaio(
 'preparar',{},'Tabuleiro de ensaio preparado'));
for(const [id,acao] of [['motorEnsaioAbrir','ABRIR'],
 ['motorEnsaioPausar','PAUSAR'],['motorEnsaioGirar','GIRAR']]){
 $(id).addEventListener('click',()=>operacaoMotorContaEnsaio(
  'catraca',{acao},'Catraca de ensaio: '+acao));
}

async function conferirPixUnificado(){
 const estado=$('estadoPixUnificado'),enviar=$('pixUnificadoEnviar');
 enviar.disabled=true;
 try{
  const r=await api('/sandbox-pix/estado');
  if(r.status==='INTEGRADO_SANDBOX_NO_MESMO_SQLITE'&&
     r.usaSQLiteDaLoja&&r.webhookIngressAtivo&&r.consultarPSPDisponivel){
   estado.textContent='Banco e motor de homologação configurados. Conferindo acesso externo do Asaas Sandbox sem criar Pix...';
   try{
    const prova=await api('/sandbox-pix/provar-acesso-remoto');
    if(prova.pspRemotoVerificado!==true)throw Error('PROVA_REMOTA_INCONCLUSIVA');
    estado.textContent='Asaas Sandbox: acesso remoto por GET comprovado, integrado ao MESMO banco da loja e motor. '+
     'Entrega externa do webhook ainda precisa ser comprovada. '+
     (r.conciliacaoAutomaticaConfigurada?'Conciliação periódica configurada. ':'Conciliação automática não habilitada. ')+
     'Nenhum saque real habilitado.';
    enviar.disabled=false;
    $('reconciliarPendentesPsp').disabled=false;
   }catch(e){
    $('reconciliarPendentesPsp').disabled=true;
    estado.textContent='Ligação interna configurada, mas acesso REMOTO ao Asaas Sandbox ainda NÃO comprovado: '+
     e.message+'. Pix de ensaio bloqueado nesta tela.';
   }
  }else{
   $('reconciliarPendentesPsp').disabled=true;
   estado.textContent='Ainda não ativado nesta prévia: faltam credenciais específicas do Asaas Sandbox. Banco e volume já estão disponíveis.';
  }
 }catch(e){estado.textContent='Não foi possível conferir: '+e.message;}
}
$('consultarPixUnificado').addEventListener('click',conferirPixUnificado);
$('formPixUnificado').addEventListener('submit',async ev=>{
 ev.preventDefault();
 const botao=$('pixUnificadoEnviar'),estado=$('estadoPixUnificado');
 if(botao.disabled||!$('pixUnificadoCiencia').checked)return;
 botao.disabled=true;
 try{
  const r=await api('/sandbox-pix/preparar',{method:'POST',body:{
   prepedidoId:$('pixUnificadoPedido').value.trim(),
   clienteAsaasId:$('pixUnificadoCliente').value.trim(),
   aceiteEnsaio:true
  }});
  estado.textContent='Pix SANDBOX '+(r.repetido?'já registrado':'preparado')+
   ' para o pré-pedido '+r.prepedidoId+'. Aguardar webhook e reconsulta do PSP. Nenhuma posição comercial criada.';
  await atualizar();
 }catch(e){estado.textContent='Cobrança não preparada: '+e.message;}
 finally{await conferirPixUnificado();}
});
