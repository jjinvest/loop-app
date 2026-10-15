'use strict';

// Interface do laboratorio apenas. A chave do administrador permanece
// em memoria, senhas sao descartadas dos campos apos cada requisicao.
(()=>{
 const el=id=>document.getElementById(id);
 const chave=el('chaveCadastroDemo');
 const status=el('estadoCadastroDemo');
 const area=el('areaCadastroDemo');
 const lista=el('listaContasDemo');
 let token='';
 let versao=0;
 let enviandoCadastro=false,enviandoLogin=false;
 const conviteLink=new URLSearchParams(location.search).get('convite');
 if(conviteLink && /^lp-[a-f0-9]{20}$/.test(conviteLink)){
  el('conviteContaDemo').value=conviteLink;
 }
 async function api(caminho,opcoes={}){
  const r=await fetch('/api/admin/contas-participantes-demo'+caminho,{
   ...opcoes,credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+token,
    ...(opcoes.body?{'Content-Type':'application/json'}:{})}
  });
  const d=await r.json();
  if(!r.ok)throw new Error(r.status===401?'Chave ou senha de teste inválida.':
    d.erro||'Falha na operação de teste ('+r.status+').');
  return d;
 }
 async function lerPonte(){
  const resposta=await fetch('/api/admin/ponte-compras-convites-demo',{
   headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'
  });
  if(!resposta.ok)throw new Error('Não foi possível consultar compras e convites do teste.');
  return resposta.json();
 }
 async function lerAuditoria(){
  const resposta=await fetch('/api/admin/auditoria-acessos-participante-demo',{
   headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'
  });
  if(!resposta.ok)throw new Error('Não foi possível consultar a auditoria local.');
  return resposta.json();
 }
 function limpar(){
  ++versao;
  token='';
  chave.value='';
  area.hidden=true;
  lista.replaceChildren();
  el('senhaContaDemo').value='';
  el('senhaLoginContaDemo').value='';
  el('resultadoContaDemo').textContent='';
  el('resultadoLoginContaDemo').textContent='';
 }
 async function atualizar(){
  if(!token)return;
  const atual=++versao;
  const [dados,ponte,auditoria]=await Promise.all([api(''),lerPonte(),lerAuditoria()]);
  if(atual!==versao)return;
  const ac=auditoria.quantidades;
  el('resumoAuditoriaDemo').textContent='Entradas fictícias: '+ac.LOGIN_SUCESSO+
   ' · Senhas incorretas: '+ac.LOGIN_INVALIDO+
   ' · Bloqueios de acesso: '+ac.LOGIN_BLOQUEADO+
   ' · Sessões encerradas: '+ac.SESSAO_ENCERRADA+
   ' · Sessões substituídas: '+ac.SESSAO_REVOGADA+'.';
  el('resumoPonteDemo').textContent='Compras fictícias confirmadas pelo verificador: '+
   ponte.compras.length+' · Pedidos vinculados ao titular: '+
   ponte.vinculosIdentificados+' · Convites validados no teste: '+
   ponte.convites.length+' · Fila A: '+ponte.filas.A.quantidade+
   ' · Fila B: '+ponte.filas.B.quantidade+
   '. Nenhuma movimentação financeira ou catraca real.';
  lista.replaceChildren();
  for(const conta of dados.contas){
   const item=document.createElement('article');
   item.className='cadastro-conta';
   const titulo=document.createElement('strong');
   titulo.textContent=conta.nome+' — acesso: '+conta.login;
   const referencia=document.createElement('p');
   const convitesValidados=ponte.convites.filter(v=>v.indicadorId===conta.contaId);
   const comprasConta=ponte.compras.filter(c=>c.contaId===conta.contaId);
   const posicoes=[...ponte.filas.A.pessoas,...ponte.filas.B.pessoas,
    ponte.tabuleiro.centro,...ponte.tabuleiro.vagas]
    .filter(p=>p&&p.participanteId===conta.contaId);
   const prioridades=ponte.filas.A.pessoas.filter(p=>p.participanteId===conta.contaId).length;
   referencia.textContent='Código: '+conta.codigoConvite+
    ' · Cadastros por convite pendentes de compra: '+
    Math.max(0,conta.convitesPendentes-convitesValidados.length)+
    ' · Convites validados no teste: '+convitesValidados.length+
    ' · Compras fictícias: '+comprasConta.length+
    ' · Posições ativas: '+posicoes.length+
    ' · Na fila A: '+prioridades;
   const link=document.createElement('small');
   link.textContent='Endereço para simular um convite neste computador: '+
    location.origin+'/admin/cadastro-participantes-demo?convite='+
    encodeURIComponent(conta.codigoConvite);
   item.append(titulo,referencia,link);
   lista.append(item);
  }
  if(!dados.contas.length){
   const p=document.createElement('p');
   p.textContent='Nenhuma conta de teste cadastrada.';
   lista.append(p);
  }
 }
 el('abrirCadastroDemo').addEventListener('click',async()=>{
  token=chave.value;
  chave.value='';
  try{
   await atualizar();
   area.hidden=false;
   status.textContent='Laboratório local aberto. Nenhuma sessão de cliente real.';
  }catch(e){
   limpar();status.textContent=e.message;
  }
 });
 el('sairCadastroDemo').addEventListener('click',()=>{
  limpar();status.textContent='Credencial local descartada desta página.';
 });
 el('formContaDemo').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!token||enviandoCadastro)return;
  enviandoCadastro=true;
  const botao=el('criarContaDemo');
  botao.disabled=true;
  const aviso=el('resultadoContaDemo');
  const senha=el('senhaContaDemo').value;
  const body={
   nome:el('nomeContaDemo').value,
   email:el('emailContaDemo').value,
   senha
  };
  const codigo=el('conviteContaDemo').value.trim();
  if(codigo)body.codigoIndicador=codigo;
  try{
   const r=await api('/cadastrar',{method:'POST',body:JSON.stringify(body)});
   aviso.textContent='Conta '+r.conta.nome+' cadastrada no teste. Código individual: '+
    r.conta.codigoConvite+'. Convites pendentes; nenhuma posição criada.';
   el('emailContaDemo').value='';
   await atualizar();
  }catch(err){aviso.textContent=err.message;}
  finally{
   el('senhaContaDemo').value='';
   enviandoCadastro=false;botao.disabled=false;
  }
 });
 el('formLoginContaDemo').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!token||enviandoLogin)return;
  enviandoLogin=true;
  const botao=el('conferirSenhaContaDemo');
  botao.disabled=true;
  const aviso=el('resultadoLoginContaDemo');
  try{
   const retorno=await api('/login-teste',{method:'POST',body:JSON.stringify({
    nome:el('nomeLoginContaDemo').value,senha:el('senhaLoginContaDemo').value
   })});
   aviso.textContent='Senha de '+retorno.conta.nome+
    ' conferida neste laboratório; nenhuma sessão pública criada.';
  }catch(err){aviso.textContent=err.message;}
  finally{
   el('senhaLoginContaDemo').value='';
   enviandoLogin=false;botao.disabled=false;
  }
 });
 el('atualizarContasDemo').addEventListener('click',async()=>{
  try{await atualizar();status.textContent='Contas fictícias atualizadas.';}
  catch(e){status.textContent=e.message;}
 });
})();
