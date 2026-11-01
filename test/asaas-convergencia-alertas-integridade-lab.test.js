'use strict';
// Regressao focal: alertas administrativos NAO conciliam nem movimentam valores.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const ADMIN={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};

async function prepararCompra(m,email,nome='Cliente Alerta Convergencia'){
 const titular=m.contas.cadastrar({nome,
  email,senha:'senha-ficticia-convergencia'});
 const {cookie}=await m.http('/entrar',{body:{
  nome:titular.nome,senha:'senha-ficticia-convergencia'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 return {pedido,cookie};
}
async function ler(m){
 const antes=m.banco.prepare('SELECT total_changes() AS n').get().n;
 const resposta=await fetch(m.base+'/api/admin/asaas-conciliacao-lab',{headers:ADMIN});
 assert.equal(resposta.status,200);
 assert.equal(resposta.headers.get('cache-control'),'no-store');
 const dados=await resposta.json();
 assert.equal(m.banco.prepare('SELECT total_changes() AS n').get().n,antes);
 assert.equal(JSON.stringify(dados).includes('contaId'),false);
 return dados;
}

test('Escritorio alerta criacao de PIX indeterminada sem repetir POST',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const {pedido,cookie}=await prepararCompra(m,'indeterminado-alerta@example.invalid');
 // Resposta local perdida depois do POST simulado: precisa verificacao humana.
 m.banco.prepare(`UPDATE akitemm_sandbox_cobrancas
  SET pagamento_id=NULL,status='CRIACAO_INDETERMINADA_SANDBOX'
  WHERE pedido_id=?`).run(pedido);
 const antes=m.banco.prepare('SELECT COUNT(*) n FROM lab_psp_http_fixture').get().n;
 const dados=await ler(m);
 assert.equal(dados.criacoesIndeterminadas,1);
 assert.equal(dados.recebidosAguardandoPonte,0);
 assert.equal(dados.revisaoManualIndicada,true);
 assert.equal(dados.idReutilizadoEmPosicaoAdicional,0);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM lab_psp_http_fixture').get().n,antes);
 assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
});

test('Escritorio sinaliza recebimento sem ponte e estorno antes da posicao',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const {pedido,cookie}=await prepararCompra(m,'recebimento-alerta@example.invalid');
 m.confirmar(pedido);
 await m.integracao.cobrancas.conferir(pedido);
 const recebido=await ler(m);
 assert.equal(recebido.recebimentosInformados,1);
 assert.equal(recebido.recebidosAguardandoPonte,1);
 assert.equal(recebido.reversoesInformadas,0);
 assert.equal(recebido.revisaoManualIndicada,true);
 // Reversao ANTES da criacao da posicao continua exigindo acompanhamento.
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='REFUNDED' WHERE pedido=?")
  .run('LOOPLAB-'+pedido);
 await m.integracao.cobrancas.conferir(pedido);
 const revertido=await ler(m);
 assert.equal(revertido.reversoesInformadas,1);
 assert.equal(revertido.reversoesComPosicaoPreservada,0);
 assert.equal(revertido.recebidosAguardandoPonte,0);
 assert.equal(revertido.revisaoManualIndicada,true);
 assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,0);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('Escritorio identifica ID de posicao adicional repetindo cadeira primaria',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const {pedido,cookie}=await prepararCompra(m,'cadeira-alerta@example.invalid');
 m.confirmar(pedido);
 await m.integracao.conciliador.processar(pedido);
 const normal=await ler(m);
 assert.equal(normal.pedidosComPosicao,1);
 assert.equal(normal.idReutilizadoEmPosicaoAdicional,0);
 assert.equal(normal.revisaoManualIndicada,false);
 const primaria=m.banco.prepare('SELECT posicao_id AS id FROM admin_ponte_compras_demo WHERE pedido_id=?')
  .get(pedido).id;
 // Reproduz corrupcao logica permitida pelos UNIQUE separados das tabelas;
 // nao reescreve o snapshot do motor nem ativa posicao.
 // A protecao impede nova atribuicao duplicada no proprio SQLite.
 assert.throws(()=>m.banco.prepare(
  'INSERT INTO admin_ponte_posicoes_adicionais_demo(pedido_id,ordem,posicao_id) VALUES(?,2,?)'
 ).run(pedido,primaria),/posicao ja usada em compra/);
 assert.equal((await ler(m)).idReutilizadoEmPosicaoAdicional,0);
 // Simula dado de snapshot LEGADO corrompido antes da protecao.
 // O monitor continua detectando inconsistencias historicas sem apagar dados.
 m.banco.exec('DROP TRIGGER admin_ponte_posicao_extra_sem_reuso_primaria');
 m.banco.prepare('INSERT INTO admin_ponte_posicoes_adicionais_demo(pedido_id,ordem,posicao_id) VALUES(?,2,?)')
  .run(pedido,primaria);
 const alerta=await ler(m);
 assert.equal(alerta.posicoesAdicionais,1);
 assert.equal(alerta.idReutilizadoEmPosicaoAdicional,1);
 assert.equal(alerta.anomaliasContadasPorCriterio,1);
 assert.equal(alerta.revisaoManualIndicada,true);
 // A visao individual ja possui bloqueio contra duplicacao de IDs e
 // falharia ao abrir a corrupcao artificial. Conferir o livro e o motor
 // diretamente, sem depender do endpoint de cliente sobre dados invalidos.
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo WHERE pedido_id=?')
  .get(pedido).n,1);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('SQLite bloqueia inserir primaria com ID ja reservado para posicao extra',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const {pedido}=await prepararCompra(m,'extra-guarda@example.invalid');
 m.confirmar(pedido);
 await m.integracao.conciliador.processar(pedido);
 // Prepara extra isolada apenas para exercitar a UNIQUE cruzada.
 const idExtra=987654321;
 m.banco.prepare('INSERT INTO admin_ponte_posicoes_adicionais_demo(pedido_id,ordem,posicao_id) VALUES(?,2,?)')
  .run(pedido,idExtra);
 const {pedido:novo}=await prepararCompra(m,'outra-conta-guardada@example.invalid',
  'Cliente Guarda Segundo');
 const idTitular=m.banco.prepare('SELECT conta_id AS id FROM admin_pedidos_titularidade_demo WHERE pedido_id=?')
  .get(novo).id;
 const antes=m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n;
 assert.throws(()=>m.banco.prepare(`INSERT INTO admin_ponte_compras_demo
  (pedido_id,conta_id,produto_id,valor_centavos,confirmado_em,posicao_id)
  VALUES(?,?,?,?,?,?)`).run(novo,idTitular,'curso-lab-250',25000,
   '2026-11-01T00:00:00.000Z',idExtra),/posicao ja usada em pacote/);
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,antes);
 assert.equal((await ler(m)).idReutilizadoEmPosicaoAdicional,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
