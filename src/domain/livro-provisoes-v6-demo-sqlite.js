'use strict';

// Livro de OBRIGACOES PREVISTAS, somente laboratorio.
// Documenta o ciclo concluido e seus seis pedidos internos simulados.
// NUNCA converte previsao em credito liquidado, dinheiro sacavel ou saldo real.
const {cofreDoEvento,centroDoLoop}=require('./destino-financeiro-centro-loop');

function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function inteiroPositivo(n){return Number.isSafeInteger(n)&&n>0;}
const COFRES=['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS'];

class LivroProvisoesV6DemoSQLite{
  constructor({banco,ponte}={}){
    if(!banco||!ponte||ponte.banco!==banco)
      throw new TypeError('Livro de provisoes requer a ponte e o mesmo SQLite');
    this.banco=banco;
    this.ponte=ponte;
    banco.exec([
      'CREATE TABLE IF NOT EXISTS loop_v6_provisoes_ciclos (',
      'giro INTEGER PRIMARY KEY CHECK(giro>0),',
      'posicao_centro INTEGER NOT NULL CHECK(posicao_centro>0),',
      'conta_id TEXT,',
      'cofre_centro TEXT NOT NULL,',
      'referencia_centro INTEGER NOT NULL CHECK(referencia_centro>=0),',
      'previsto_centro INTEGER NOT NULL CHECK(previsto_centro>=0),',
      'referencia_eventos INTEGER NOT NULL CHECK(referencia_eventos>0),',
      'documento_json TEXT NOT NULL, registrado_em TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS loop_v6_provisoes_eventos (',
      'giro INTEGER NOT NULL REFERENCES loop_v6_provisoes_ciclos(giro),',
      'ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 6),',
      'venda_id TEXT NOT NULL UNIQUE, pedido_id TEXT NOT NULL UNIQUE,',
      'destino_cofre TEXT NOT NULL,',
      'referencia_centavos INTEGER NOT NULL CHECK(referencia_centavos>0),',
      'PRIMARY KEY(giro,ordem));',
      'CREATE TABLE IF NOT EXISTS loop_v6_provisoes_parcelas (',
      'giro INTEGER NOT NULL REFERENCES loop_v6_provisoes_ciclos(giro),',
      'ordem INTEGER NOT NULL CHECK(ordem IN (1,3,5)),',
      'conta_id TEXT NOT NULL, posicao_centro INTEGER NOT NULL,',
      'previsto_centavos INTEGER NOT NULL CHECK(previsto_centavos>0),',
      "situacao TEXT NOT NULL CHECK(situacao='PREVISTO_NAO_LIQUIDADO'),",
      'PRIMARY KEY(giro,ordem));',
      'CREATE INDEX IF NOT EXISTS idx_loop_v6_provisoes_conta',
      'ON loop_v6_provisoes_parcelas(conta_id,giro);',
      ...['loop_v6_provisoes_ciclos','loop_v6_provisoes_eventos',
          'loop_v6_provisoes_parcelas'].flatMap(nome=>[
        'CREATE TRIGGER IF NOT EXISTS '+nome+'_imutavel_update',
        'BEFORE UPDATE ON '+nome+
          " BEGIN SELECT RAISE(ABORT,'provisao imutavel'); END;",
        'CREATE TRIGGER IF NOT EXISTS '+nome+'_imutavel_delete',
        'BEFORE DELETE ON '+nome+
          " BEGIN SELECT RAISE(ABORT,'provisao imutavel'); END;"
      ])
    ].join('\n'));
  }
  _origemCentro(centro){
    if(centroDoLoop(centro))return {contaId:null,referencia:0,cofre:'LOOP_DOURADAS'};
    if(!centro||typeof centro.participanteId!=='string'||
       centro.statusAdesao==='PENDENTE')throw falha('CENTRO_NAO_HABILITADO');
    const r=this.banco.prepare([
      'SELECT c.conta_id AS contaId,v.valor_referencia_centavos AS referencia',
      'FROM admin_ponte_compras_demo c',
      'JOIN admin_ponte_posicoes_valores_demo v ON v.pedido_id=c.pedido_id',
      'WHERE c.conta_id=? AND (c.posicao_id=? OR EXISTS(',
      'SELECT 1 FROM admin_ponte_posicoes_adicionais_demo a',
      'WHERE a.pedido_id=c.pedido_id AND a.posicao_id=?))'
    ].join(' ')).all(centro.participanteId,centro.id,centro.id);
    if(r.length!==1||!inteiroPositivo(r[0].referencia))
      throw falha('TITULAR_CENTRO_SEM_ORIGEM');
    return {contaId:r[0].contaId,referencia:r[0].referencia,cofre:'LOOP_CENTRO'};
  }
  _documentar(ciclo){
    if(!ciclo||!inteiroPositivo(ciclo.ciclo)||
       !inteiroPositivo(ciclo.centro?.id)||
       !Array.isArray(ciclo.vendas)||ciclo.vendas.length!==6)
      throw falha('CICLO_INCOMPLETO_V6');
    const centro=ciclo.centro;
    const titular=this._origemCentro(centro);
    const procurar=this.banco.prepare([
      'SELECT c.pedido_id AS pedidoId,c.conta_id AS contaId,',
      'v.valor_referencia_centavos AS referencia',
      'FROM admin_ponte_compras_demo c',
      'JOIN admin_ponte_posicoes_valores_demo v ON v.pedido_id=c.pedido_id',
      'WHERE c.pedido_id=? AND c.valor_centavos>0'
    ].join(' '));
    const eventos=[];
    const vistos=new Set();
    for(let i=0;i<6;i++){
      const v=ciclo.vendas[i];
      if(!v||typeof v.vendaId!=='string'||!v.vendaId.startsWith('compra-demo-')||
         v.ciclo!==ciclo.ciclo||v.ordem!==i+1||v.posicaoCentroId!==centro.id||
         v.destinoCofre!==cofreDoEvento({posicaoCentro:centro,ordem:i+1})||
         vistos.has(v.vendaId))throw falha('EVENTO_CICLO_INVALIDO');
      vistos.add(v.vendaId);
      const pedido=v.vendaId.slice('compra-demo-'.length);
      const fonte=procurar.get(pedido);
      if(!fonte||!inteiroPositivo(fonte.referencia))throw falha('PEDIDO_SEM_CONFIRMACAO_DEMO');
      eventos.push({ordem:i+1,vendaId:v.vendaId,pedidoId:pedido,
        destinoCofre:v.destinoCofre,referenciaCentavos:fonte.referencia});
    }
    const soma=eventos.reduce((acc,v)=>acc+v.referenciaCentavos,0);
    const previsao=titular.contaId?titular.referencia*3:0;
    if(!Number.isSafeInteger(soma)||!Number.isSafeInteger(previsao))
      throw falha('VALOR_FORA_DE_LIMITE');
    const documento={giro:ciclo.ciclo,posicaoCentroId:centro.id,
      titularContaId:titular.contaId,cofreCentro:titular.cofre,
      referenciaCentroCentavos:titular.referencia,
      previstoCentroCentavos:previsao,
      totalReferenciasEventosCentavos:soma,eventos};
    return documento;
  }
  registrarCiclos({sim,transacaoAberta=false}={}){
    if(!sim||!sim.tabuleiro||!Array.isArray(sim.tabuleiro.ciclosConcluidos))
      throw falha('MOTOR_AUSENTE');
    const b=this.banco;
    if(!transacaoAberta)b.exec('BEGIN IMMEDIATE;');
    try{
      let novos=0;
      for(const ciclo of sim.tabuleiro.ciclosConcluidos){
        if(ciclo.vendas.length===5)continue; // migracao V5, nao criar provisao V6
        const doc=this._documentar(ciclo);
        const json=JSON.stringify(doc);
        const antiga=b.prepare(
          'SELECT documento_json FROM loop_v6_provisoes_ciclos WHERE giro=?'
        ).get(doc.giro);
        if(antiga){
          if(antiga.documento_json!==json)throw falha('DIVERGENCIA_DE_PROVISAO');
          continue;
        }
        const insercao=b.prepare([
          'INSERT INTO loop_v6_provisoes_ciclos',
          '(giro,posicao_centro,conta_id,cofre_centro,referencia_centro,',
          'previsto_centro,referencia_eventos,documento_json,registrado_em)',
          'VALUES(?,?,?,?,?,?,?,?,?)'
        ].join(' '));
        insercao.run(doc.giro,doc.posicaoCentroId,doc.titularContaId,
          doc.cofreCentro,doc.referenciaCentroCentavos,
          doc.previstoCentroCentavos,doc.totalReferenciasEventosCentavos,
          json,new Date().toISOString());
        const inserirEvento=b.prepare([
          'INSERT INTO loop_v6_provisoes_eventos',
          '(giro,ordem,venda_id,pedido_id,destino_cofre,referencia_centavos)',
          'VALUES(?,?,?,?,?,?)'
        ].join(' '));
        const inserirParcela=b.prepare([
          'INSERT INTO loop_v6_provisoes_parcelas',
          '(giro,ordem,conta_id,posicao_centro,previsto_centavos,situacao)',
          "VALUES(?,?,?,?,?,'PREVISTO_NAO_LIQUIDADO')"
        ].join(' '));
        for(const e of doc.eventos){
          inserirEvento.run(doc.giro,e.ordem,e.vendaId,e.pedidoId,
            e.destinoCofre,e.referenciaCentavos);
          if(doc.titularContaId&&[1,3,5].includes(e.ordem)){
            inserirParcela.run(doc.giro,e.ordem,doc.titularContaId,
              doc.posicaoCentroId,doc.referenciaCentroCentavos);
          }
        }
        novos++;
      }
      if(!transacaoAberta)b.exec('COMMIT;');
      return {ciclosNovos:novos,semSaldoReal:true};
    }catch(e){
      if(!transacaoAberta)b.exec('ROLLBACK;');
      throw e;
    }
  }
  resumo(){
    const b=this.banco;
    const ciclos=b.prepare(
      'SELECT COUNT(*) AS n, COALESCE(SUM(previsto_centro),0) AS previsto,'
      +' COALESCE(SUM(referencia_eventos),0) AS referencias'
      +' FROM loop_v6_provisoes_ciclos'
    ).get();
    const destinos=b.prepare([
      'SELECT destino_cofre AS destino, SUM(referencia_centavos) AS centavos',
      'FROM loop_v6_provisoes_eventos GROUP BY destino_cofre'
    ].join(' ')).all();
    const porCofre=Object.fromEntries(COFRES.map(c=>[c,0]));
    for(const d of destinos)porCofre[d.destino]=d.centavos;
    const parcelas=b.prepare(
      'SELECT COUNT(*) AS n, COALESCE(SUM(previsto_centavos),0) AS total'
      +' FROM loop_v6_provisoes_parcelas'
    ).get();
    const eventos=b.prepare('SELECT COUNT(*) AS n FROM loop_v6_provisoes_eventos').get().n;
    const desvio=porCofre.LOOP_CENTRO-ciclos.previsto;
    return {
      modo:'LIVRO_PROVISOES_SEM_LIQUIDACAO_REAL',
      ciclosRegistrados:ciclos.n,eventosDocumentados:eventos,
      referenciasDeComprasFicticiasCentavos:ciclos.referencias,
      destinoMatematicoPorCofreCentavos:porCofre,
      totalPrevistoParaTitularesCentavos:ciclos.previsto,
      parcelasPrevistas:parcelas.n,
      divergenciaReferenciasCentroCentavos:desvio,
      divergenciaEntreReferenciasEObrigacoes:desvio!==0,
      centroDisponivelParaSaqueCentavos:0,
      comprovantesBancariosReconciliados:0,
      valorRealLiquidadoCentavos:0,
      pagamentosExecutadosCentavos:0,
      ajustesPermitidos:false,
      contabilizacaoReais:false,
      natureza:'PROJECAO_CONDICIONAL_NAO_LIQUIDADA'
    };
  }
  extrato(contaId){
    if(typeof contaId!=='string'||!this.ponte.contas.buscar(contaId))return null;
    const linhas=this.banco.prepare([
      'SELECT p.giro AS giro,p.ordem AS ordem,',
      'p.posicao_centro AS posicaoCentroId,',
      'p.previsto_centavos AS previstoCentavos',
      'FROM loop_v6_provisoes_parcelas p',
      'WHERE p.conta_id=? ORDER BY p.giro,p.ordem'
    ].join(' ')).all(contaId);
    return {modo:'PARCELAS_PREVISTAS_NAO_SACAVEIS',
      parcelas:linhas,totalPrevistoCentavos:linhas.reduce((s,x)=>s+x.previstoCentavos,0),
      disponivelParaSaqueCentavos:0,liquidadoCentavos:0,transferidoCentavos:0};
  }
}

module.exports={LivroProvisoesV6DemoSQLite};
