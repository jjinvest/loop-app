'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('um convidado confirmado atribuido a uma posicao ativa promove somente ela e nao permite troca',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-atribuicao-unica-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const repo=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'lab.sqlite')});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,atribuicaoManualPorPosicao:true,
  relogio:()=> '2026-10-18T05:00:00.000Z',
  consultarPagamentoConfiavel:async pedidoId=>comprovantes.get(pedidoId)
 });
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte});
 const escritorio=new EscritorioIndividualDemo({contas,ponte});
 const raiz=contas.cadastrar({nome:'Pessoa Principal',email:'raiz@exemplo.invalid',
  senha:'senha-ficticia-segura'});
 const convidado=contas.cadastrar({nome:'Pessoa Indicada',email:'convidado@exemplo.invalid',
  senha:'senha-ficticia-segura',codigoIndicador:raiz.codigoConvite});
 async function comprar(conta,pedidoId){
  comprovantes.set(pedidoId,{pedidoId,contaId:conta.contaId,
   produtoId:'curso-simulado',valorCentavos:25000,status:STATUS_CONFIRMADO,
   confirmadoEm:'2026-10-18T04:00:00.000Z'});
  return ponte.processar({pedidoId});
 }
 const primeira=await comprar(raiz,'r-1');
 const segunda=await comprar(raiz,'r-2');
 let visao=escritorio.consultar(raiz.contaId);
 assert.equal(visao.posicoes.length,2);
 assert(visao.posicoes.every(p=>p.statusAdesao==='PENDENTE'));
 assert.equal(visao.mapaCores.filaB.length,2);
 adesoes.ativar({contaId:raiz.contaId,posicaoId:primeira.posicaoId,
  cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 visao=escritorio.consultar(raiz.contaId);
 assert.equal(visao.posicoes.filter(p=>p.statusAdesao==='PENDENTE').length,1);
 assert.throws(()=>ponte.atribuirIndicacao({contaId:raiz.contaId,
  convidadoId:convidado.contaId,posicaoId:segunda.posicaoId}),
  {codigo:'INDICACAO_NAO_PERTENCE_A_CONTA'});
 adesoes.ativar({contaId:raiz.contaId,posicaoId:segunda.posicaoId});
 const compraConvidado=await comprar(convidado,'c-1');
 assert.equal(ponte.consultar().filas.A.quantidade,0);
 assert.equal(escritorio.consultar(raiz.contaId).equipe[0].situacao,'AGUARDANDO_CONFIRMACAO');
 assert.throws(()=>ponte.atribuirIndicacao({contaId:raiz.contaId,
  convidadoId:convidado.contaId,posicaoId:segunda.posicaoId}),
  {codigo:'INDICADO_AGUARDANDO_ATIVACAO'});
 adesoes.ativar({contaId:convidado.contaId,posicaoId:compraConvidado.posicaoId,
  cpfFicticio:'12345678909',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 assert.equal(escritorio.consultar(raiz.contaId).equipe[0].situacao,'ATIVO');
 const vinculada=ponte.atribuirIndicacao({contaId:raiz.contaId,
  convidadoId:convidado.contaId,posicaoId:primeira.posicaoId});
 assert.equal(vinculada.repetida,false);
 const sim=ponte._restaurar();
 assert.deepEqual(sim.filas.filaA.filter(p=>p.participanteId===raiz.contaId).map(p=>p.id),
  [primeira.posicaoId]);
 assert.deepEqual(sim.filas.filaB.filter(p=>p.participanteId===raiz.contaId).map(p=>p.id),
  [segunda.posicaoId]);
 assert.equal(sim.filas.filaA.find(p=>p.id===primeira.posicaoId).indicacoesVinculadas,1);
 assert.equal(ponte.atribuirIndicacao({contaId:raiz.contaId,
  convidadoId:convidado.contaId,posicaoId:primeira.posicaoId}).repetida,true);
 assert.throws(()=>ponte.atribuirIndicacao({contaId:raiz.contaId,
  convidadoId:convidado.contaId,posicaoId:segunda.posicaoId}),
  {codigo:'INDICACAO_JA_VINCULADA'});
 visao=escritorio.consultar(raiz.contaId);
 assert.equal(visao.equipe.length,1);
 assert.equal(visao.equipe[0].posicaoAtribuidaId,primeira.posicaoId);
 assert.equal(visao.posicoes.find(p=>p.posicaoId===primeira.posicaoId).indicacoesRecebidas,1);
 assert.equal(visao.posicoes.find(p=>p.posicaoId===segunda.posicaoId).indicacoesRecebidas,0);
 assert.equal(visao.convitesValidosFilaA[0],1);
 // Vínculo posterior a entrada do titular no tabuleiro preserva o motor.
 const proximoConvidado=contas.cadastrar({
  nome:'Segunda Pessoa Indicada',email:'convidado2@exemplo.invalid',
  senha:'senha-ficticia-segura',codigoIndicador:raiz.codigoConvite
 });
 const preparando=ponte._restaurar();
 preparando.prepararTabuleiro();
 ponte.banco.prepare('UPDATE admin_ponte_estado_demo SET snapshot_json=? WHERE id=1')
  .run(JSON.stringify(preparando.exportarSnapshot()));
 const compraProxima=await comprar(proximoConvidado,'c-2');
 adesoes.ativar({contaId:proximoConvidado.contaId,posicaoId:compraProxima.posicaoId,
  cpfFicticio:'52998224725',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 const vinculoTabuleiro=ponte.atribuirIndicacao({contaId:raiz.contaId,
  convidadoId:proximoConvidado.contaId,posicaoId:segunda.posicaoId});
 assert.equal(vinculoTabuleiro.repetida,false);
 const depoisTabuleiro=ponte._restaurar();
 const alvos=[depoisTabuleiro.tabuleiro.centro,...depoisTabuleiro.tabuleiro.vagas];
 assert.equal(alvos.find(p=>p?.id===segunda.posicaoId)?.indicacoesVinculadas,1);
 assert.equal(ponte.atribuirIndicacao({contaId:raiz.contaId,
  convidadoId:proximoConvidado.contaId,posicaoId:segunda.posicaoId}).repetida,true);
 const novaVisao=escritorio.consultar(raiz.contaId);
 assert.equal(novaVisao.posicoes.find(p=>p.posicaoId===primeira.posicaoId).indicacoesRecebidas,1);
 assert.equal(novaVisao.posicoes.find(p=>p.posicaoId===segunda.posicaoId).indicacoesRecebidas,1);
});
