'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
const {auditarExtratoPspFicticioLoop}=require('../src/domain/auditoria-extrato-psp-ficticio-loop');
const {PendenciasConciliacaoDemoSQLite}=require('../src/domain/pendencias-conciliacao-demo-sqlite');
const NOW='2036-09-20T12:00:00.000Z';
function abrir(arquivo){
 const repo=new RepositorioCatalogoSQLite({caminho:arquivo});
 if(!repo.buscar('pdf-teste'))repo.salvar({produto:{
  id:'pdf-teste',nome:'PDF de laboratorio',tipo:'PDF',estado:'PUBLICADO',
  descricao:'Apenas ensaio',precoCentavos:25000,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]},revisaoEsperada:0});
 const banco=repo.banco,contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>NOW});
 let carrinhos;
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,
  pedidosIdentificados:pedidos,atribuicaoManualPorPosicao:true,relogio:()=>NOW,
  consultarPagamentoConfiavel:async id=>carrinhos.comprovanteConfirmado(id)});
 carrinhos=new CarrinhoLojaLoopDemoSQLite({catalogo:repo,contas,
  pedidosIdentificados:pedidos,ponte,relogio:()=>NOW});
 const pendencias=new PendenciasConciliacaoDemoSQLite({banco,relogio:()=>NOW});
 return {repo,banco,contas,pedidos,ponte,carrinhos,pendencias};
}
function auditoria(m,extrato){
 return auditarExtratoPspFicticioLoop({carrinhos:m.carrinhos,eventosExternosFicticios:extrato});
}
function externo(m,pedidoId,tipo,id){
 const p=m.pedidos.buscar(pedidoId);
 return {pedidoId,eventoId:id,intentoPagamentoId:p.intentoPagamentoId,
  valorCentavos:p.valorCentavos,tipo};
}
test('pendencia manual: abrir, revisar e encerrar apenas apos conciliacao completa, persistida',async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-triagem-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'triagem.sqlite');
 let m=abrir(arquivo);t.after(()=>{try{m.repo.fechar()}catch{}});
 const p=m.contas.cadastrar({nome:'Triagem',
  email:'triagem@exemplo.invalid',senha:'senha-exemplo-longo-2026'});
 const id='pedido-triagem';
 m.carrinhos.criar({pedidoId:id,contaId:p.contaId,itens:[{produtoId:'pdf-teste',quantidade:1}]});
 m.carrinhos.registrarEvento({pedidoId:id,tipo:'CONFIRMAR_FICTICIO',eventoId:'confirmacao-local-teste'});
 assert.equal((await m.carrinhos.sincronizar(id)).posicaoCriada,true);
 const semExtrato=auditoria(m,[]);
 assert.ok(semExtrato.linhas[0].alertas.includes('POSICAO_SEM_COBERTURA_DO_EXTRATO_FICTICIO'));
 const antes=m.ponte._restaurar().exportarSnapshot();
 const cmd={pedidoId:id,eventoId:'abertura-manual-001',acao:'ABERTURA',
  observacao:'Solicitar prova externa e documentar diferenca',diagnostico:semExtrato};
 const aberto=m.pendencias.registrar(cmd);
 assert.equal(aberto.estado,'PENDENTE');
 assert.equal(m.pendencias.registrar(cmd).repetido,true);
 assert.throws(()=>m.pendencias.registrar({...cmd,
  observacao:'Outro motivo criado com mesmo evento'}),e=>e.codigo==='CONFLITO_IDEMPOTENCIA');
 const analise={pedidoId:id,eventoId:'revisao-manual-001',acao:'ASSUMIR_REVISAO',
  observacao:'Aguardar comprovante ficticio independente',diagnostico:semExtrato};
 assert.equal(m.pendencias.registrar(analise).estado,'EM_REVISAO');
 const fechamento={pedidoId:id,eventoId:'fechar-manual-001',acao:'ENCERRAMENTO',
  observacao:'Revisao documentada com conciliacao',diagnostico:semExtrato};
 assert.throws(()=>m.pendencias.registrar(fechamento),
  e=>e.codigo==='PENDENCIA_FINANCEIRA_NAO_CONCILIADA');
 assert.equal(m.pendencias.consultar(id).historico.length,2);
 assert.deepEqual(m.ponte._restaurar().exportarSnapshot(),antes);
 const conciliado=auditoria(m,[externo(m,id,'CONFIRMACAO_FICTICIA','psp-ref-001')]);
 assert.equal(conciliado.situacao,'SEM_DIVERGENCIAS_NESTA_AMOSTRA');
 assert.equal(m.pendencias.registrar({...fechamento,diagnostico:conciliado}).estado,'ENCERRADA');
 assert.throws(()=>m.banco.exec(
  "UPDATE admin_conciliacao_pendencias_eventos_lab SET observacao='edicao'"),
  /evento de conciliacao imutavel/);
 m.repo.fechar();m=abrir(arquivo);
 assert.equal(m.pendencias.consultar(id).estado,'ENCERRADA');
 assert.equal(m.pendencias.consultar(id).historico.length,3);
 assert.deepEqual(m.ponte._restaurar().exportarSnapshot(),antes);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('LOOP_TRIAGEM_MANUAL='+JSON.stringify({aberturas:1,revisoes:1,
  encerramentosComDivergenciaBloqueados:1,encerramentosConferidos:1,
  trilhaImutavel:true,reaberturaPersistida:true,liquidacaoExecutada:false}));
});
test('estorno com posicao mantida nao pode ser encerrado automaticamente',async t=>{
 const m=abrir(':memory:');t.after(()=>m.repo.fechar());
 const p=m.contas.cadastrar({nome:'Estorno',
  email:'estorno-triagem@exemplo.invalid',senha:'senha-exemplo-longo-2026'});
 const pedidoId='pedido-estorno-triagem';
 m.carrinhos.criar({pedidoId,contaId:p.contaId,itens:[{produtoId:'pdf-teste',quantidade:1}]});
 m.carrinhos.registrarEvento({pedidoId,tipo:'CONFIRMAR_FICTICIO',eventoId:'conf-triagem-estorno'});
 assert.equal((await m.carrinhos.sincronizar(pedidoId)).posicaoCriada,true);
 m.carrinhos.registrarEvento({pedidoId,tipo:'ESTORNAR_FICTICIO',eventoId:'estorno-triagem-local'});
 const e=[externo(m,pedidoId,'CONFIRMACAO_FICTICIA','extrato-triagem-ok'),
  externo(m,pedidoId,'ESTORNO_FICTICIO','extrato-triagem-estorno')];
 const diagnostico=auditoria(m,e);
 assert.ok(diagnostico.linhas[0].alertas.includes('ESTORNO_EXTERNO_COM_POSICAO_PRESERVADA'));
 const f=(eventoId,acao)=>({pedidoId,eventoId,acao,
  observacao:'Revisao obrigatoria por direitos persistidos',diagnostico});
 m.pendencias.registrar(f('abertura-estorno-001','ABERTURA'));
 m.pendencias.registrar(f('revisao-estorno-001','ASSUMIR_REVISAO'));
 assert.throws(()=>m.pendencias.registrar(f('fechamento-estorno-001','ENCERRAMENTO')),
  e=>e.codigo==='PENDENCIA_FINANCEIRA_NAO_CONCILIADA');
 assert.equal(m.pendencias.consultar(pedidoId).estado,'EM_REVISAO');
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
 assert.equal(m.pendencias.consultar(pedidoId).liberacaoFinanceiraReal,false);
});
