'use strict';
// Acoes acionadas pelo toque nas molduras JA APROVADAS da loja.
// Este script nao muda layout, CSS, cores ou cadastro de clientes.
// Mesmo cookie de operador da central real; CSRF em cada escrita.
(()=>{
 const ID=/^[a-z0-9-]{3,80}$/;
 let operador=false,dialogo=null,aberto=false;
 const fetchJson=async(rota,opcoes={})=>{
  const res=await fetch(rota,{
   credentials:'same-origin',cache:'no-store',...opcoes
  });
  const dados=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(dados.erro||'SERVICO_INDISPONIVEL');
  return dados;
 };
 async function verificarOperador(){
  try{
   const r=await fetchJson('/api/operador/estado');
   operador=r.operador===true;
  }catch{operador=false;}
 }
 function modal(titulo){
  if(!dialogo){
   dialogo=document.createElement('dialog');
   dialogo.className='akitemm-modal';
   dialogo.id='akitemmOperadorFotosReal';
   document.body.append(dialogo);
  }
  dialogo.replaceChildren();
  const fechar=document.createElement('button');
  fechar.type='button';fechar.className='akitemm-modal-fechar';
  fechar.textContent='×';fechar.setAttribute('aria-label','Fechar');
  fechar.addEventListener('click',()=>dialogo.close());
  const h=document.createElement('h2');h.textContent=titulo;
  const corpo=document.createElement('div');
  const estado=document.createElement('p');
  estado.setAttribute('role','status');
  dialogo.append(fechar,h,corpo,estado);
  dialogo.showModal();return {corpo,estado};
 }
 const linha=texto=>{
  const p=document.createElement('p');p.textContent=texto;return p;
 };
 const admin=()=>{
  const a=document.createElement('a');a.href='/administrador';
  a.textContent='Abrir cadastro de produtos na central do operador';
  return a;
 };
 const select=(nome,opcoes)=>{
  const label=document.createElement('label');
  label.textContent=nome;
  const s=document.createElement('select');
  for(const [valor,texto] of opcoes){
   const op=document.createElement('option');op.value=valor;
   op.textContent=texto;s.append(op);
  }
  label.append(s);return {label,s};
 };
 async function escolherProduto(indice){
  const {corpo,estado}=modal('Espaço '+indice+' da AKITEMM');
  corpo.append(linha('Toque no produto que deseja fotografar. '+
   'Seu cadastro fica na central única; nenhuma venda é criada.'));
  corpo.append(admin());
  try{
   const r=await fetchJson('/api/admin/catalogo-midia/produtos');
   if(!Array.isArray(r.produtos)||r.checkoutReal!==false)
    throw Error('CATALOGO_ADMIN_INCONSISTENTE');
   const itens=r.produtos.filter(p=>ID.test(p.produtoId));
   if(!itens.length){
    estado.textContent='Nenhum produto apto para foto. Cadastre pela central.';
    return;
   }
   const escolha=select('Produto existente',itens.map(p=>[
    p.produtoId,p.nome+' ('+p.produtoId+')'
   ]));
   const botao=document.createElement('button');
   botao.type='button';botao.textContent='Editar fotos do produto';
   botao.addEventListener('click',()=>{dialogo.close();void abrirProduto(escolha.s.value);});
   corpo.append(escolha.label,botao);
   corpo.append(linha('Os produtos publicados aparecem na primeira posição '+
    'livre. O vínculo a um quadrinho específico ainda está em integração.'));
  }catch(e){estado.textContent='Não foi possível listar produtos: '+e.message;}
 }
 async function abrirProduto(id){
  if(!ID.test(id)){
   const {corpo,estado}=modal('Produto da AKITEMM');
   corpo.append(admin());
   estado.textContent='Este código de produto precisa de normalização '+
    'auditada para aceitar fotos, sem alterar o cadastro antigo.';
   return;
  }
  const {corpo,estado}=modal('Editar fotos · '+id);
  const campo=select('Posição da foto (1 a 10)',Array.from({length:10},(_,i)=>[
   String(i+1),'Foto '+(i+1)
  ]));
  const label=document.createElement('label');
  label.textContent='Escolher imagem JPEG, PNG ou WebP (até 3 MB)';
  const arquivo=document.createElement('input');arquivo.type='file';
  arquivo.accept='image/jpeg,image/png,image/webp';
  label.append(arquivo);
  const lista=document.createElement('p');
  const botao=document.createElement('button');
  botao.type='button';botao.textContent='Salvar foto do produto';
  botao.disabled=true;
  corpo.append(campo.label,label,lista,botao);
  try{
   const [sessao,galeria]=await Promise.all([
    fetchJson('/api/admin/comercial/sessao'),
    fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/fotos')
   ]);
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<24||
      !Array.isArray(galeria.fotos))throw Error('OPERADOR_SESSAO_INVALIDA');
   lista.textContent=galeria.fotos.length+' foto(s) gravada(s). '+
    'Escolha a posição para acrescentar ou substituir com revisão segura.';
   botao.disabled=false;
   botao.addEventListener('click',async()=>{
    if(aberto)return;
    const file=arquivo.files?.[0],pos=Number(campo.s.value);
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||
       file.size<40||file.size>3*1024*1024||
       !Number.isSafeInteger(pos)||pos<1||pos>10){
     estado.textContent='Selecione JPEG, PNG ou WebP com até 3 MB.';
     return;
    }
    aberto=true;botao.disabled=true;estado.textContent='Gravando foto no catálogo real...';
    try{
     const versao=galeria.fotos.find(f=>f.posicao===pos)?.versao||0;
     const res=await fetch(
      '/api/admin/catalogo-midia/produtos/'+id+'/fotos/'+pos,{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':file.type,
        'X-Loop-Admin-Csrf':sessao.csrfToken,
        'X-Foto-Versao-Esperada':String(versao)},body:file
      });
     const d=await res.json().catch(()=>({}));
     if(!res.ok)throw Error(d.erro||'FOTO_NAO_GRAVADA');
     estado.textContent='Foto '+pos+' salva. O produto foi preservado.';
     dialogo.close();
     document.getElementById('atualizarCatalogoLoja')?.click();
    }catch(e){
     estado.textContent='Não foi possível salvar: '+e.message+
      '. Atualize a galeria antes de tentar novamente.';
    }finally{aberto=false;botao.disabled=false;}
   });
  }catch(e){
   botao.disabled=true;
   estado.textContent='Edição indisponível: '+e.message;
  }
 }
 // Não captura os controles de filtros nem o botão de detalhes.
 // O cliente normal continua com o comportamento aprovado.
 document.addEventListener('click',ev=>{
  if(!operador||dialogo?.contains(ev.target))return;
  const card=ev.target.closest(
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id],'+
   '#catalogoLojaLoop .akitemm-slot-vazio[data-akitemm-slot]'
  );
  if(!card||ev.target.closest('button,a'))return;
  ev.preventDefault();ev.stopImmediatePropagation();
  if(card.dataset.produtoId)void abrirProduto(card.dataset.produtoId);
  else void escolherProduto(Number(card.dataset.akitemmSlot));
 },true);
 document.addEventListener('keydown',ev=>{
  if(!operador||!['Enter',' '].includes(ev.key))return;
  const card=ev.target.closest(
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id],'+
   '#catalogoLojaLoop .akitemm-slot-vazio[data-akitemm-slot]'
  );
  if(!card||ev.target!==card)return;
  ev.preventDefault();
  if(card.dataset.produtoId)void abrirProduto(card.dataset.produtoId);
  else void escolherProduto(Number(card.dataset.akitemmSlot));
 },true);
 void verificarOperador();
 addEventListener('pageshow',()=>void verificarOperador());
 addEventListener('focus',()=>void verificarOperador());
 addEventListener('loop:operador-entrou',()=>void verificarOperador());
 addEventListener('loop:operador-saiu',()=>{
  operador=false;if(dialogo?.open)dialogo.close();
 });
})();
