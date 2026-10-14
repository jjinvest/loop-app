'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {PedidosLogisticosSimuladosSQLite}=require('../src/domain/pedidos-logisticos-simulados-sqlite');

function criarBanco(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-logistica-demo-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const arquivo=path.join(dir,'logistica.sqlite');
  const banco=new PedidosLogisticosSimuladosSQLite({caminho:arquivo});
  t.after(()=>banco.fechar());
  return {banco,arquivo};
}
const dados={pedidoId:'pedido-demo-1',produtoId:'produto-exemplo',
  fornecedorId:'parceiro-ficticio',sku:'SKU_001'};

function evento(banco,tipo,n,anterior) {
  return banco.registrar({pedidoId:dados.pedidoId,eventoId:'evento-'+n,
    tipo,revisaoEsperada:anterior});
}

test('pedido ficticio tem caminho completo, historico e nenhum dado financeiro',t=>{
  const {banco}=criarBanco(t);
  assert.deepEqual(banco.listar(),[]);
  assert.equal(banco.cadastrar(dados).repetido,false);
  assert.equal(banco.buscar(dados.pedidoId).status,'AGUARDANDO_CONFIRMACAO');
  assert.equal(banco.buscar(dados.pedidoId).revisao,1);
  const passos=[
    ['CONFIRMAR_PAGAMENTO_SIMULADO','CONFIRMADO_SIMULADO'],
    ['REPASSAR_PEDIDO_SIMULADO','ENVIADO_FORNECEDOR'],
    ['INICIAR_SEPARACAO','EM_SEPARACAO'],
    ['REGISTRAR_TRANSPORTE','EM_TRANSPORTE'],
    ['REGISTRAR_ENTREGA','ENTREGUE']
  ];
  let rev=1;
  for(const [acao,estado] of passos) {
    const resultado=evento(banco,acao,rev,rev);
    assert.equal(resultado.pedido.status,estado);
    assert.equal(resultado.pedido.revisao,++rev);
  }
  assert.equal(banco.historico(dados.pedidoId).length,6);
  assert.equal(banco.historico(dados.pedidoId)[0].tipo,'PEDIDO_CRIADO');
  assert.equal(banco.historico(dados.pedidoId).at(-1).statusDepois,'ENTREGUE');
  assert.equal('valorCentavos' in banco.buscar(dados.pedidoId),false);
  assert.equal('participanteId' in banco.buscar(dados.pedidoId),false);
  assert.equal('posicao' in banco.buscar(dados.pedidoId),false);
  assert.equal('endereco' in banco.buscar(dados.pedidoId),false);
});

test('registro duplicado e eventos repetidos nao criam novas revisoes',t=>{
  const {banco}=criarBanco(t);
  const criado=banco.cadastrar(dados);
  assert.equal(criado.repetido,false);
  assert.equal(banco.cadastrar(dados).repetido,true);
  assert.throws(()=>banco.cadastrar({...dados,sku:'OUTRO'}),/outra mercadoria/);
  const confirmado=evento(banco,'CONFIRMAR_PAGAMENTO_SIMULADO',1,1);
  assert.equal(confirmado.repetido,false);
  const repetido=evento(banco,'CONFIRMAR_PAGAMENTO_SIMULADO',1,1);
  assert.equal(repetido.repetido,true);
  assert.equal(banco.buscar(dados.pedidoId).revisao,2);
  assert.equal(banco.historico(dados.pedidoId).length,2);
  assert.throws(()=>banco.registrar({pedidoId:dados.pedidoId,
    eventoId:'evento-1',tipo:'SOLICITAR_CANCELAMENTO',revisaoEsperada:2}),/ja utilizado/);
});

test('ocorrencia, cancelamento e registro de reembolso sao apenas simulados',t=>{
  const {banco}=criarBanco(t);
  banco.cadastrar(dados);
  evento(banco,'CONFIRMAR_PAGAMENTO_SIMULADO',1,1);
  evento(banco,'REPASSAR_PEDIDO_SIMULADO',2,2);
  evento(banco,'INICIAR_SEPARACAO',3,3);
  evento(banco,'REGISTRAR_TRANSPORTE',4,4);
  evento(banco,'REGISTRAR_OCORRENCIA',5,5);
  assert.equal(banco.buscar(dados.pedidoId).status,'OCORRENCIA');
  const pedido=evento(banco,'SOLICITAR_REEMBOLSO_SIMULADO',6,6).pedido;
  assert.equal(pedido.reembolso,'SOLICITADO_SIMULADO');
  assert.equal(pedido.status,'OCORRENCIA');
  evento(banco,'SOLICITAR_CANCELAMENTO',7,7);
  evento(banco,'REGISTRAR_CANCELAMENTO',8,8);
  const feito=evento(banco,'REGISTRAR_REEMBOLSO_SIMULADO',9,9);
  assert.equal(feito.pedido.status,'CANCELADO');
  assert.equal(feito.pedido.reembolso,'REGISTRADO_SIMULADO');
  assert.deepEqual(banco.historico(dados.pedidoId).map(x=>x.revisao),
    [1,2,3,4,5,6,7,8,9,10]);
  assert.equal('valor' in feito.pedido,false);
  assert.equal('devolvido' in feito.pedido,false);
});

test('estorno nunca pode ser registrado sem cancelamento e solicitacao',t=>{
  const {banco}=criarBanco(t);
  banco.cadastrar(dados);
  assert.throws(()=>evento(banco,'REGISTRAR_REEMBOLSO_SIMULADO',1,1),/nao permitido/);
  assert.throws(()=>evento(banco,'REGISTRAR_ENTREGA',1,1),/nao permitida/);
  evento(banco,'SOLICITAR_CANCELAMENTO',1,1);
  assert.throws(()=>evento(banco,'REGISTRAR_REEMBOLSO_SIMULADO',2,2),/nao permitido/);
  evento(banco,'SOLICITAR_REEMBOLSO_SIMULADO',2,2);
  evento(banco,'REGISTRAR_CANCELAMENTO',3,3);
  const fim=evento(banco,'REGISTRAR_REEMBOLSO_SIMULADO',4,4);
  assert.equal(fim.pedido.reembolso,'REGISTRADO_SIMULADO');
  assert.throws(()=>evento(banco,'REGISTRAR_REEMBOLSO_SIMULADO',5,5),/nao permitido/);
});

test('concorrencia, conflitos e eventos com IDs reutilizados falham fechados',t=>{
  const {banco}=criarBanco(t);
  banco.cadastrar(dados);
  banco.cadastrar({...dados,pedidoId:'pedido-demo-2'});
  evento(banco,'CONFIRMAR_PAGAMENTO_SIMULADO',1,1);
  assert.throws(()=>evento(banco,'SOLICITAR_CANCELAMENTO',2,1),/Conflito de revisao/);
  assert.throws(()=>banco.registrar({pedidoId:'pedido-demo-2',
    eventoId:'evento-1',tipo:'CONFIRMAR_PAGAMENTO_SIMULADO',revisaoEsperada:1}),/operacao diferente/);
  assert.throws(()=>banco.registrar({pedidoId:dados.pedidoId,
    eventoId:'evento-3',tipo:'ALTERAR_PRECO',revisaoEsperada:2}),/nao permitido/);
  assert.throws(()=>banco.registrar({pedidoId:dados.pedidoId,
    eventoId:'../perigo',tipo:'SOLICITAR_CANCELAMENTO',revisaoEsperada:2}),/eventoId invalido/);
  assert.equal(banco.buscar(dados.pedidoId).revisao,2);
  assert.equal(banco.historico(dados.pedidoId).length,2);
});

test('reabre o banco e mantem historico sem autorizar editar ou apagar eventos',t=>{
  const {banco,arquivo}=criarBanco(t);
  banco.cadastrar(dados);
  evento(banco,'CONFIRMAR_PAGAMENTO_SIMULADO',1,1);
  const outro=new PedidosLogisticosSimuladosSQLite({caminho:arquivo});
  t.after(()=>outro.fechar());
  assert.equal(outro.buscar(dados.pedidoId).status,'CONFIRMADO_SIMULADO');
  assert.equal(outro.historico(dados.pedidoId).length,2);
  assert.equal(fs.statSync(arquivo).mode&0o777,0o600);
  const sql=new DatabaseSync(arquivo);
  assert.throws(()=>sql.prepare('DELETE FROM pedidos_logistica_eventos WHERE pedido_id=?').run(dados.pedidoId),/historico logistica imutavel/);
  assert.throws(()=>sql.prepare("UPDATE pedidos_logistica_eventos SET tipo='X' WHERE pedido_id=?").run(dados.pedidoId),/historico logistica imutavel/);
  sql.close();
});

test('não permite confirmação de pedido digitando campos desconhecidos pela API de domínio',t=>{
  const {banco}=criarBanco(t);
  assert.throws(()=>banco.cadastrar({...dados,pedidoId:'invalido id'}),/pedidoId invalido/);
  assert.throws(()=>banco.cadastrar({...dados,sku:'https://site'}),/sku invalido/);
  assert.equal(banco.listar().length,0);
});

test('apos entrega, devolucao e reembolso ficticio continuam registrados',t=>{
  const {banco}=criarBanco(t);
  banco.cadastrar(dados);
  const passos=[
    'CONFIRMAR_PAGAMENTO_SIMULADO',
    'REPASSAR_PEDIDO_SIMULADO',
    'INICIAR_SEPARACAO',
    'REGISTRAR_TRANSPORTE',
    'REGISTRAR_ENTREGA',
    'SOLICITAR_DEVOLUCAO',
    'SOLICITAR_REEMBOLSO_SIMULADO',
    'CONFIRMAR_DEVOLUCAO',
    'REGISTRAR_REEMBOLSO_SIMULADO'
  ];
  let revisao=1;
  for(const tipo of passos) {
    const r=evento(banco,tipo,revisao,revisao);
    assert.equal(r.pedido.revisao,++revisao);
  }
  const final=banco.buscar(dados.pedidoId);
  assert.equal(final.status,'DEVOLVIDO');
  assert.equal(final.reembolso,'REGISTRADO_SIMULADO');
  assert.equal(banco.historico(dados.pedidoId).length,10);
  assert.equal(final.valorCentavos,undefined);
  assert.equal(final.valorRetido,undefined);
});
