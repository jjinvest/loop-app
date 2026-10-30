'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');

test('circuit break ficticio: pausa, seis compras distintas por giro, limite e lotes',()=>{
  const banco=new DatabaseSync(':memory:');
  try{
    let dia='2026-10-17T13:00:00.000Z',sequencia=0;
    const controle=new CircuitBreakV6DemoSQLite({banco,agora:()=>dia});
    const executar=(tipo,valor)=>{
      const revisaoEsperada=controle.resumo().revisao;
      return controle.executar({tipo,valor,comandoId:'cb-teste-'+(++sequencia),revisaoEsperada});
    };
    const inicial=controle.resumo();
    assert.equal(inicial.status,'PAUSADA');
    assert.equal(inicial.comprasFicticiasGeradas,0);
    assert.equal(inicial.girosProntos,0);
    assert.throws(()=>executar('LIBERAR_LOTE',1),{codigo:'CATRACA_PAUSADA'});
    executar('ABRIR');
    assert.throws(()=>executar('LIBERAR_LOTE',1),{codigo:'COMPRAS_FICTICIAS_INSUFICIENTES'});
    executar('GERAR_30_COMPRAS');
    assert.equal(controle.resumo().girosProntos,5);
    assert.equal(controle.resumo().filaA,0);
    executar('LIMITE_DIARIO',4);
    assert.throws(()=>executar('LIBERAR_LOTE',5),{codigo:'LIMITE_DIARIO_ATINGIDO'});
    const r=executar('LIBERAR_LOTE',3);
    assert.equal(r.girosLiberados.length,3);
    assert.equal(r.girosLiberados[0].titularCentro,'fundador');
    assert.equal(new Set(r.girosLiberados.flatMap(x=>x.eventos.map(v=>v.vendaId))).size,18);
    assert.equal(controle.resumo().girosConcluidos,3);
    assert.equal(controle.resumo().girosHoje,3);
    assert.equal(controle.resumo().comprasFicticiasProcessadas,18);
    assert.equal(controle.resumo().girosProntos,2);
    assert.throws(()=>executar('LIBERAR_LOTE',3),{codigo:'LIMITE_DIARIO_ATINGIDO'});
    executar('LIBERAR_LOTE',1);
    assert.equal(controle.resumo().restantesHoje,0);
    assert.throws(()=>executar('LIBERAR_LOTE',1),{codigo:'LIMITE_DIARIO_ATINGIDO'});
    executar('PAUSAR');
    dia='2026-10-18T13:00:00.000Z';
    assert.equal(controle.resumo().girosHoje,0);
    assert.throws(()=>executar('LIBERAR_LOTE',1),{codigo:'CATRACA_PAUSADA'});
    executar('ABRIR');
    executar('LIBERAR_LOTE',1);
    assert.equal(controle.resumo().girosConcluidos,5);
    assert.equal(controle.resumo().comprasFicticiasProcessadas,30);
    assert.equal(controle.resumo().girosProntos,0);
    assert.equal(controle.resumo().vendasNoCiclo,0);
    assert.equal(controle.resumo().financeiroFicticio.centrosCentavos,375000);
  }finally{banco.close();}
});

test('circuit break: idempotencia, revisao, auditoria imutavel e persistencia',()=>{
  const banco=new DatabaseSync(':memory:');
  try{
    const c=new CircuitBreakV6DemoSQLite({banco});
    const cmd={tipo:'GERAR_30_COMPRAS',comandoId:'cb-unica-001',revisaoEsperada:0};
    const um=c.executar(cmd);
    assert.equal(um.resumo.comprasFicticiasGeradas,30);
    const dois=c.executar(cmd);
    assert.equal(dois.repetido,true);
    assert.equal(c.resumo().comprasFicticiasGeradas,30);
    assert.throws(()=>c.executar({...cmd,tipo:'ABRIR'}),{codigo:'CONFLITO_COMANDO_ID'});
    assert.throws(()=>c.executar({tipo:'ABRIR',comandoId:'cb-teste-conflito',revisaoEsperada:0}),
      {codigo:'CONFLITO_REVISAO'});
    const reaberto=new CircuitBreakV6DemoSQLite({banco});
    assert.equal(reaberto.resumo().comprasFicticiasGeradas,30);
    assert.equal(reaberto.historico().length,1);
    assert.throws(()=>banco.exec('DELETE FROM loop_cb_v6_auditoria'),/historico imutavel/);
    assert.throws(()=>banco.exec('UPDATE loop_cb_v6_auditoria SET tipo = \'ABRIR\''),/historico imutavel/);
    assert.throws(()=>c.executar({tipo:'LIBERAR_LOTE',valor:2,
      comandoId:'cb-lote-ruim',revisaoEsperada:1}),{codigo:'LOTE_INVALIDO'});
  }finally{banco.close();}
});

test('circuit break: avanco por ondas acrescenta compradores sem giros inventados',()=>{
  const banco=new DatabaseSync(':memory:');
  try{
    const c=new CircuitBreakV6DemoSQLite({banco});
    const cmd=(tipo,valor)=>{
      const rev=c.resumo().revisao;
      return c.executar({tipo,valor,comandoId:'cb-wave-'+rev+'-'+tipo.toLowerCase().replaceAll('_','-'),
        revisaoEsperada:rev});
    };
    cmd('GERAR_30_COMPRAS');
    cmd('ABRIR');
    cmd('LIBERAR_LOTE',5);
    assert.equal(c.resumo().girosConcluidos,5);
    assert.equal(c.resumo().comprasPendentes,0);
    cmd('GERAR_30_COMPRAS');
    assert.equal(c.resumo().comprasFicticiasGeradas,60);
    assert.equal(c.resumo().girosProntos,5);
    cmd('LIBERAR_LOTE',5);
    assert.equal(c.resumo().girosConcluidos,10);
    assert.equal(c.resumo().comprasFicticiasProcessadas,60);
    assert.equal(c.resumo().financeiroFicticio.vendasBrutasCentavos,1500000);
    assert.equal(c.resumo().financeiroFicticio.investimentoCentavos,500000);
  }finally{banco.close();}
});
