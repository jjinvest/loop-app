'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('cores por sessao, ativacao de teste e encerramento ao entrar no tabuleiro',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const senha='senha-ficticia-bem-longa';
 const a=contas.cadastrar({nome:'Posicao Azul Um',email:'um@exemplo.invalid',senha});
 const b=contas.cadastrar({nome:'Posicao Azul Dois',email:'dois@exemplo.invalid',senha});
 const verificacoes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,consultarPagamentoConfiavel:async id=>verificacoes.get(id),
  relogio:()=> '2026-10-15T12:30:00.000Z'
 });
 for(const [i,conta] of [a,b].entries()){
  const pedidoId='compra-posicao-'+i;
  verificacoes.set(pedidoId,{pedidoId,contaId:conta.contaId,
   produtoId:'curso-teste',valorCentavos:25000,status:STATUS_CONFIRMADO,
   confirmadoEm:'2026-10-15T12:00:00.000Z'});
  const x=await ponte.processar({pedidoId});
  assert.equal(x.statusAdesao,'PENDENTE');
 }
 const visao=new EscritorioIndividualDemo({ponte,contas});
 assert.deepEqual(visao.consultar(a.contaId).mapaCores.filaB.map(x=>x.cor),['AZUL','AZUL']);
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte});
 assert.throws(()=>adesoes.ativar({contaId:a.contaId,cpfFicticio:'11144477735',
  aceitaTermos:false,versaoTermos:'LOOP-DEMO-V1'}),e=>e.codigo==='ACEITE_TERMOS_OBRIGATORIO');
 const ativacao=adesoes.ativar({contaId:a.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 assert.equal(ativacao.ativadas,1);
 assert.deepEqual(visao.consultar(a.contaId).mapaCores.filaB.map(x=>x.cor),['VERMELHO','AZUL']);
 assert.deepEqual(visao.consultar(b.contaId).mapaCores.filaB.map(x=>x.cor),['CINZA','AZUL']);
 const entrada=ponte.prepararTabuleiroDemo();
 assert.equal(entrada.tabuleiro.centro.statusAdesao,'ATIVA');
 assert.equal(entrada.tabuleiro.vagas[0].statusAdesao,'PRAZO_ENCERRADO');
 assert.equal(visao.consultar(b.contaId).mapaCores.tabuleiro.vagas[0].cor,'DOURADO');
 assert.equal(visao.consultar(b.contaId).posicoesComPrazoEncerrado,1);
 assert.equal(visao.consultar(b.contaId).posicoes.length,0);
 assert.equal(ponte.consultar().filas.B.quantidade,0);
 assert.throws(()=>adesoes.ativar({contaId:b.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}),e=>e.codigo==='NENHUMA_POSICAO_AZUL_NA_FILA');
});
