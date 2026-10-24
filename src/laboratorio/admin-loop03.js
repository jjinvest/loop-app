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
 let clientesDiretorio=[];
 function fichaCliente(c){
  const detalhe=$('detalheClienteAdmin');detalhe.replaceChildren();
  const titulo=document.createElement('h3');titulo.textContent=c.nick||c.nome;
  const linha=document.createElement('p');linha.textContent='Nome cadastral: '+c.nome;
  const registro=document.createElement('p');registro.textContent='Cadastro: '+c.criadoEm;
  const aviso=document.createElement('p');aviso.textContent='Compras, produtos, posições e contemplações: vínculos individuais ainda não conciliados nesta fonte. Nenhum valor foi presumido.';
  detalhe.append(titulo,linha,registro,aviso);
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
  clientesDiretorio=d.clientes;
  $('clientesTotalDepartamento').textContent=String(d.total);
  $('statusClientesAdmin').textContent='Exibindo até '+d.limite+' cadastros recentes de '+d.total+'. Dados fictícios do SQLite.';
  renderizarClientes();
 }
 $('filtrarClientesAdmin').addEventListener('input',renderizarClientes);
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
  try{await carregarClientes();}
  catch(err){$('statusClientesAdmin').textContent='Consulta indisponível: '+err.message;}
  try{await carregarAuditoria();}
  catch(err){$('auditoriaStatusAdmin').textContent='Consulta indisponível: '+err.message;
   for(const id of ['resumoClientesDirecaoAdmin','resumoPedidosDirecaoAdmin','resumoPosicoesDirecaoAdmin'])$(id).textContent='Indisponível';
   $('statusResumoDirecaoAdmin').textContent='Não foi possível consultar os registros: '+err.message;}
  try{await carregarFinanceiro();}
  catch(err){$('finStatusAdmin').textContent='Consulta indisponível: '+err.message;}
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
  catch(err){token='';config=null;configRelogio=null;$('dadosAdminLoop03').hidden=true;
   $('situacaoPainel').textContent='SEM AUTENTICAÇÃO';
   $('mensagemAcessoAdminLoop03').textContent='Acesso recusado: '+err.message;}
 });
 $('sairAdminLoop03').addEventListener('click',()=>{
  token='';config=null;configRelogio=null;$('chaveAdminLoop03').value='';
  clientesDiretorio=[];$('listaClientesAdmin').replaceChildren();
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