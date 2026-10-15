'use strict';

// Cenário 100% FICTICIO de compras e convites: script local opt-in.
// Nunca usa CPF, gateway, webhook, creditos, entregas ou pagamentos.
const fs=require('node:fs');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

async function executar(ambiente=process.env){
 if(ambiente.NODE_ENV==='production'||
   ambiente.LOOP_ADMIN_CATALOGO_LOCAL!=='1'||
   ambiente.LOOP_DEMO_SEED_CONVITES!=='1'){
  throw new Error('Cenario permitido apenas em laboratorio local com opt-in explicito');
 }
 const db=ambiente.LOOP_CATALOGO_DB;
 if(typeof db!=='string'||!path.isAbsolute(db)){
  throw new Error('LOOP_CATALOGO_DB precisa ser um caminho absoluto');
 }
 const projeto=path.resolve(__dirname,'..')+path.sep;
 if(db.startsWith(projeto)||db.startsWith(path.resolve(__dirname,'..','public')+path.sep)){
  throw new Error('Banco de teste deve estar fora do repositorio');
 }
 // Nao sobrescrever nenhum banco de testes que ja tenha contas.
 if(fs.existsSync(db) && !fs.statSync(db).isFile()){
  throw new Error('O caminho do banco nao aponta para um arquivo');
 }
 const repo=new RepositorioCatalogoSQLite({caminho:db});
 try{
  const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
  if(contas.listar().contas.length){
   throw new Error('Este cenario exige um banco sem contas ficticias anteriores');
  }
  const raiz=contas.cadastrar({
   nome:'Conta Demo Principal',email:'principal@cenario.invalid',
   senha:'senha-local-ficticia-2026'
  });
  const b=contas.cadastrar({
   nome:'Conta Demo Convidada Um',email:'convidada-um@cenario.invalid',
   senha:'senha-local-ficticia-2026',codigoIndicador:raiz.codigoConvite
  });
  const c=contas.cadastrar({
   nome:'Conta Demo Convidada Dois',email:'convidada-dois@cenario.invalid',
   senha:'senha-local-ficticia-2026',codigoIndicador:raiz.codigoConvite
  });
  const eventos=new Map([
   ['demo-venda-raiz',{
    pedidoId:'demo-venda-raiz',contaId:raiz.contaId,
    produtoId:'curso-pdf-ficticio',valorCentavos:10000,
    status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-15T12:00:00.000Z'
   }],
   ['demo-venda-um',{
    pedidoId:'demo-venda-um',contaId:b.contaId,
    produtoId:'produto-ficticio-a',valorCentavos:17500,
    status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-15T12:01:00.000Z'
   }],
   ['demo-venda-dois',{
    pedidoId:'demo-venda-dois',contaId:c.contaId,
    produtoId:'curso-pdf-ficticio',valorCentavos:10000,
    status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-15T12:02:00.000Z'
   }]
  ]);
  const ponte=new PonteComprasConvitesDemoSQLite({
   banco:repo.banco,contas,
   consultarPagamentoConfiavel:async id=>eventos.get(id)
  });
  for(const pedidoId of eventos.keys()){
   await ponte.processar({pedidoId});
  }
  const estado=ponte.consultar();
  const resumo={
   modo:'CENARIO_100_POR_CENTO_FICTICIO',
   contas:contas.listar().contas.length,
   comprasSimuladas:estado.compras.length,
   convitesValidadosNoTeste:estado.convites.length,
   filaA:estado.filas.A.quantidade,
   filaB:estado.filas.B.quantidade,
   pagamentosReais:0,
   catracaMovimentada:false,
   painel:'/admin/cadastro-participantes-demo'
  };
  process.stdout.write(JSON.stringify(resumo,null,2)+'\n');
  return resumo;
 }finally{repo.fechar();}
}
if(require.main===module){
 executar().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
}
module.exports={executar};
