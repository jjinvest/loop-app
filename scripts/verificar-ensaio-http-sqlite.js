'use strict';
// Conferencia independente, somente leitura, do banco produzido pelo ensaio.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {auditarSeisPedidosDoCicloLab}=require('../src/domain/auditoria-seis-pedidos-ciclo-lab');
function verificar(pasta){
 const arquivo=path.join(pasta,'laboratorio.sqlite');
 const relatorio=JSON.parse(fs.readFileSync(path.join(pasta,'relatorio.json'),'utf8'));
 const b=new DatabaseSync(arquivo,{readOnly:true});
 try{
  assert.equal(Object.values(b.prepare('PRAGMA integrity_check').get())[0],'ok');
  assert.deepEqual(b.prepare('PRAGMA foreign_key_check').all(),[]);
  const contar=t=>b.prepare('SELECT COUNT(*) n FROM '+t).get().n;
  const contas=contar('admin_contas_participantes_demo');
  const pedidos=contar('admin_carrinho_loop_demo');
  const posicoes=contar('admin_ponte_compras_demo');
  const ativacoes=contar('admin_loop_adesoes_posicoes_demo');
  const indicacoes=contar('admin_loop_vinculos_indicacao_posicao_demo');
  for(const n of [contas,pedidos,posicoes,ativacoes])assert.equal(n,relatorio.clientesSequenciais);
  assert.equal(indicacoes,relatorio.indicacoes);
  const unicas=b.prepare('SELECT COUNT(DISTINCT conta_id) titulares,COUNT(DISTINCT posicao_id) posicoes FROM admin_ponte_compras_demo').get();
  assert.equal(unicas.titulares,contas);assert.equal(unicas.posicoes,posicoes);
  const psp=b.prepare("SELECT COUNT(*) n,SUM(valor)*100 bruto FROM lab_psp_http_fixture WHERE status='RECEIVED'").get();
  assert.equal(psp.n,pedidos);assert.equal(psp.bruto,relatorio.faturamentoBrutoFicticioCentavos);
  const snapshot=JSON.parse(b.prepare('SELECT snapshot_json FROM admin_ponte_estado_demo WHERE id=1').get().snapshot_json);
  const motor=SimuladorLoop.restaurarSnapshot(snapshot);
  const rastreio=auditarSeisPedidosDoCicloLab({banco:b,ponte:{banco:b,_restaurar:()=>motor}});
  assert.deepEqual(rastreio.alertas,[]);
  assert.equal(rastreio.eventosDocumentados,relatorio.eventosDocumentados);
  assert.equal(rastreio.girosDocumentados,relatorio.giros);
  assert.equal(relatorio.posicoesAtivas+relatorio.giros,posicoes);
  assert.equal(relatorio.conciliacaoCofres.quantidadeDivergencias,0);
  assert.equal(relatorio.conciliacaoCofres.somaDestinacoesConservadasCentavos,
   relatorio.conciliacaoCofres.entradasAportesSimuladosCentavos);
  return {estado:'CONFERIDO_SOMENTE_LEITURA',contas,pedidos,posicoes,ativacoes,indicacoes,
   titularesDistintos:unicas.titulares,posicoesDistintas:unicas.posicoes,
   cobrancasFixtureRecebidas:psp.n,brutoFicticioCentavos:psp.bruto,
   giros:rastreio.girosDocumentados,eventos:rastreio.eventosDocumentados,
   integridadeSqlite:'ok',violacoesForeignKeys:0,alertasRastreio:0,
   sha256Banco:createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex'),
   sha256Relatorio:createHash('sha256').update(fs.readFileSync(path.join(pasta,'relatorio.json'))).digest('hex'),
   bancoRealConciliado:false,pagamentosReais:0};
 }finally{b.close();}
}
if(require.main===module){
 try{console.log(JSON.stringify(verificar(path.resolve(process.argv[2]||'artifacts/ensaio-10000-http')),null,2));}
 catch(e){console.error(e);process.exitCode=1;}
}
module.exports={verificar};
