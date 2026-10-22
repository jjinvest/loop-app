'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
function produto(id,valor){
 return {id,nome:'Curso laboratorio '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'PDF ficticio para teste',precoCentavos:valor,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('escritorio reune pedidos pendentes, somente-loja, azul, vermelho e dourado sem expor outro cliente',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 repo.salvar({produto:produto('pdf-100-loja',10000),revisaoEsperada:0});
 repo.salvar({produto:produto('pdf-250-loop',25000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const senha='senha-ficticia-para-escritorio-2026';
 const contaA=contas.cadastrar({nome:'Cliente Loja Principal',email:'principal@exemplo.invalid',senha});
 const contaB=contas.cadastrar({nome:'Cliente Loja Privado',email:'privado@exemplo.invalid',senha});
 const segredo='admin-privado-escritorio-loja-2026-123456';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo,habilitarConviteLoopCheckout:true}).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const local=base+'/api/laboratorio/participante';
 const cabe={ 'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const auth=async nome=>{
  const r=await fetch(local+'/entrar',{method:'POST',headers:cabe,
   body:JSON.stringify({nome,senha})});
  assert.equal(r.status,200);
  return r.headers.get('set-cookie').split(';')[0];
 };
 const a=await auth(contaA.nome),b=await auth(contaB.nome);
 const obter=async cookie=>{
  const r=await fetch(local+'/minha-conta',{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  return r.json();
 };
 const criar=async(cookie,produtoId)=>{
  const r=await fetch(local+'/loja/pedidos',{
   method:'POST',headers:{...cabe,Cookie:cookie},
   body:JSON.stringify({itens:[{produtoId,quantidade:1}],participarLoop:produtoId==='pdf-250-loop'})
  });
  assert.equal(r.status,201);
  return (await r.json()).pedido.pedidoId;
 };
 const concluir=async(pedidoId,eventoId)=>{
  const r=await fetch(base+'/api/admin/carrinho-loop-demo/'+pedidoId+'/eventos',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+segredo},
   body:JSON.stringify({eventoId,tipo:'CONFIRMAR_FICTICIO'})
  });
  assert.equal(r.status,200);
  return r.json();
 };
 const pendente=await criar(a,'pdf-100-loja');
 const simples=await criar(a,'pdf-100-loja');
 await concluir(simples,'evento-somente-loja');
 const posA=await criar(a,'pdf-250-loop');
 await concluir(posA,'evento-posicao-primeira');
 const outro=await criar(b,'pdf-250-loop');
 await concluir(outro,'evento-outro-titular');
 let visao=await obter(a);
 assert.equal(visao.historicoLoja.contagens.total,3);
 assert.equal(visao.historicoLoja.contagens.aguardandoConfirmacao,1);
 assert.equal(visao.historicoLoja.contagens.aguardandoAtivacao,1);
 assert.equal(visao.historicoLoja.contagens.somenteLoja,1);
 assert.equal(visao.historicoLoja.contagens.comPosicaoAtivada,0);
 const estados=new Map(visao.historicoLoja.pedidos.map(p=>[p.pedidoId,p]));
 assert.equal(estados.get(pendente).estado,'AGUARDANDO_CONFIRMACAO');
 assert.equal(estados.get(simples).estado,'COMPRA_SEM_POSICAO');
 assert.equal(estados.get(posA).estado,'AGUARDANDO_ATIVACAO');
 assert.equal(estados.get(posA).posicaoId,1);
 assert.equal(estados.get(posA).valorCentavos,25000);
 assert.equal(estados.get(pendente).itens[0].nome,'Curso laboratorio pdf-100-loja');
 assert.doesNotMatch(JSON.stringify(visao.historicoLoja),/privado@exemplo.invalid/);
 assert.ok(!JSON.stringify(visao.historicoLoja).includes(outro));
 assert.ok(!JSON.stringify(visao.historicoLoja).includes(contaB.contaId));
 assert.equal((await obter(b)).historicoLoja.contagens.total,1);

 // Apenas o proprio cliente pode confirmar CPF ficticio e termos.
 const ativacao=await fetch(local+'/ativar-posicoes',{method:'POST',
  headers:{...cabe,Cookie:a},
  body:JSON.stringify({posicaoId:visao.posicoes[0].posicaoId,
   cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'})});
 assert.equal(ativacao.status,200);
 visao=await obter(a);
 assert.equal(visao.historicoLoja.contagens.comPosicaoAtivada,1);
 assert.equal(visao.historicoLoja.contagens.aguardandoAtivacao,0);
 assert.equal(visao.historicoLoja.pedidos.find(p=>p.pedidoId===posA).estado,
  'POSICAO_ATIVADA');

 // Nova compra qualificada cria outra posicao AZUL, nao vira vermelha so
 // porque a conta ja ativou a anterior.
 const posB=await criar(a,'pdf-250-loop');
 await concluir(posB,'evento-posicao-segunda');
 visao=await obter(a);
 assert.equal(visao.historicoLoja.contagens.aguardandoAtivacao,1);
 assert.equal(visao.historicoLoja.contagens.comPosicaoAtivada,1);
 const preparo=await fetch(base+'/api/admin/ponte-compras-convites-demo/preparar-tabuleiro',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+segredo},
  body:'{}'
 });
 assert.equal(preparo.status,200);
 visao=await obter(a);
 const segundo=visao.historicoLoja.pedidos.find(p=>p.pedidoId===posB);
 assert.equal(segundo.estado,'POSICAO_DOURADA_LOOP');
 assert.equal(visao.historicoLoja.contagens.aguardandoAtivacao,0);
 assert.equal(visao.historicoLoja.contagens.posicoesDouradas,1);
 assert.equal(visao.historicoLoja.contagens.comPosicaoAtivada,1);
 assert.equal(visao.historicoLoja.contagens.total,4);
 const retornoB=await obter(b);
 assert.equal(retornoB.historicoLoja.contagens.total,1);
 assert.equal(retornoB.historicoLoja.contagens.posicoesDouradas,1);
 assert.doesNotMatch(JSON.stringify(retornoB.historicoLoja),/principal@exemplo.invalid/);
 assert.ok(!JSON.stringify(retornoB.historicoLoja).includes(posA));
 assert.ok(!JSON.stringify(retornoB.historicoLoja).includes(posB));

 const html=await(await fetch(base+'/laboratorio/participante')).text();
 assert.match(html,/id="historicoPedidosLojaParticipante"/);
 assert.match(html,/id="alertaAzulParticipante"/);
 const script=await(await fetch(base+'/laboratorio/participante.js')).text();
 assert.match(script,/mostrarHistorico/);
 assert.match(script,/Ativar minha posição/);
 assert.doesNotMatch(script,/innerHTML|localStorage|sessionStorage/);
});
