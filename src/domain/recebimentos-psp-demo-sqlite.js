'use strict';

// Simulador de resposta de PSP para 10 compras DE TESTE e nenhuma compra real.
// Nao e um webhook aberto, nao autentica um PSP e nao cria posicoes na fila.
// Confirma/estorna APENAS vendas ficticias prefixadas, em uma transacao
// atomica com os lancamentos de laboratorio no livro financeiro.
const {COFRES,MODOS}=require('./financeiro-admin-demo');
const {DESTINOS}=require('./tabuleiro-loop');
const ID=/^[a-z0-9][a-z0-9-]{2,79}$/;
const TIPOS=Object.freeze({
  CONFIRMAR:'CONFIRMAR_FICTICIO',
  ESTORNAR:'ESTORNAR_FICTICIO'
});
const POSICOES=Object.freeze([
  COFRES.CENTRO,COFRES.ESQUERDA,COFRES.CENTRO,COFRES.DIREITA,COFRES.CENTRO
]);
function erro(codigo,mensagem){
  const e=new Error(mensagem);
  e.codigo=codigo;
  return e;
}
function validarId(id){
  if(typeof id!=='string'||!ID.test(id)){
    throw erro('VALIDACAO','Identificador de evento ou pagamento ficticio invalido');
  }
}
function validarDestino(){
  if(DESTINOS.length!==5||POSICOES.some((p,i)=>
    (p===COFRES.CENTRO)!==(DESTINOS[i]==='PARTICIPANTE'))){
    throw new Error('Premissa do tabuleiro e do financeiro divergiu');
  }
}
const FATURAS=Object.freeze([
  ...Array.from({length:5},(_,i)=>Object.freeze({
    pagamentoId:'pag-split-'+(i+1).toString().padStart(2,'0'),
    cicloDemo:'split',ordemCiclo:i+1,modo:MODOS.SPLIT,
    valorCentavos:60000,fornecedorCentavos:30000,
    parcelaLoopCentavos:10000,sobraBrutaCentavos:20000,
    destinoCofre:POSICOES[i]
  })),
  ...Array.from({length:5},(_,i)=>Object.freeze({
    pagamentoId:'pag-reserva-'+(i+1).toString().padStart(2,'0'),
    cicloDemo:'reserva',ordemCiclo:i+1,modo:MODOS.RESERVA,
    valorCentavos:60000,fornecedorCentavos:30000,
    parcelaLoopCentavos:10000,sobraBrutaCentavos:20000,
    destinoCofre:POSICOES[i]
  }))
]);

class RecebimentosPSPDemoSQLite {
  constructor({banco,razao}={}){
    if(!banco||typeof banco.exec!=='function'||typeof banco.prepare!=='function'||
       !razao||typeof razao.registrarLote!=='function'||razao.banco!==banco){
      throw new TypeError('SQLite e livro de laboratorio compartilhados obrigatorios');
    }
    validarDestino();
    this.banco=banco;
    this.razao=razao;
    banco.exec(`
      CREATE TABLE IF NOT EXISTS admin_receb_demo_pagamentos (
        pagamento_id TEXT PRIMARY KEY NOT NULL,
        ciclo_demo TEXT NOT NULL, ordem_ciclo INTEGER NOT NULL,
        modo TEXT NOT NULL, valor_centavos INTEGER NOT NULL,
        fornecedor_centavos INTEGER NOT NULL,
        parcela_loop_centavos INTEGER NOT NULL,
        sobra_bruta_centavos INTEGER NOT NULL,
        destino_cofre TEXT NOT NULL,
        UNIQUE(ciclo_demo,ordem_ciclo)
      );
      CREATE TABLE IF NOT EXISTS admin_receb_demo_eventos (
        sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
        evento_id TEXT UNIQUE NOT NULL,
        pagamento_id TEXT NOT NULL REFERENCES admin_receb_demo_pagamentos(pagamento_id),
        tipo TEXT NOT NULL CHECK(tipo IN ('CONFIRMAR_FICTICIO','ESTORNAR_FICTICIO')),
        registrado_em TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_receb_demo_eventos_pagamento
        ON admin_receb_demo_eventos(pagamento_id,sequencia);
      CREATE TRIGGER IF NOT EXISTS admin_receb_demo_pagamentos_sem_update
        BEFORE UPDATE ON admin_receb_demo_pagamentos
        BEGIN SELECT RAISE(ABORT,'pagamentos demo imutaveis'); END;
      CREATE TRIGGER IF NOT EXISTS admin_receb_demo_pagamentos_sem_delete
        BEFORE DELETE ON admin_receb_demo_pagamentos
        BEGIN SELECT RAISE(ABORT,'pagamentos demo imutaveis'); END;
      CREATE TRIGGER IF NOT EXISTS admin_receb_demo_eventos_sem_update
        BEFORE UPDATE ON admin_receb_demo_eventos
        BEGIN SELECT RAISE(ABORT,'eventos de recebimento demo imutaveis'); END;
      CREATE TRIGGER IF NOT EXISTS admin_receb_demo_eventos_sem_delete
        BEFORE DELETE ON admin_receb_demo_eventos
        BEGIN SELECT RAISE(ABORT,'eventos de recebimento demo imutaveis'); END;
    `);
    const adicionar=banco.prepare(`
      INSERT OR IGNORE INTO admin_receb_demo_pagamentos
      (pagamento_id,ciclo_demo,ordem_ciclo,modo,valor_centavos,
       fornecedor_centavos,parcela_loop_centavos,sobra_bruta_centavos,destino_cofre)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for(const f of FATURAS){
      adicionar.run(f.pagamentoId,f.cicloDemo,f.ordemCiclo,f.modo,
        f.valorCentavos,f.fornecedorCentavos,f.parcelaLoopCentavos,
        f.sobraBrutaCentavos,f.destinoCofre);
    }
    // Corrupcao ou mudanca de fixture nao deve ser absorvida silenciosamente.
    const obtidas=banco.prepare(`
      SELECT pagamento_id AS pagamentoId,ciclo_demo AS cicloDemo,
        ordem_ciclo AS ordemCiclo,modo,valor_centavos AS valorCentavos,
        fornecedor_centavos AS fornecedorCentavos,
        parcela_loop_centavos AS parcelaLoopCentavos,
        sobra_bruta_centavos AS sobraBrutaCentavos,
        destino_cofre AS destinoCofre
      FROM admin_receb_demo_pagamentos ORDER BY pagamento_id`).all();
    if(obtidas.length!==FATURAS.length||
       JSON.stringify(obtidas)!==JSON.stringify([...FATURAS].sort((a,b)=>a.pagamentoId.localeCompare(b.pagamentoId)))){
      throw new Error('Base de recebimentos demonstrativos divergiu da amostra');
    }
  }
  buscar(pagamentoId){
    validarId(pagamentoId);
    return this.banco.prepare(`
      SELECT pagamento_id AS pagamentoId,ciclo_demo AS cicloDemo,
        ordem_ciclo AS ordemCiclo,modo,valor_centavos AS valorCentavos,
        fornecedor_centavos AS fornecedorCentavos,
        parcela_loop_centavos AS parcelaLoopCentavos,
        sobra_bruta_centavos AS sobraBrutaCentavos,
        destino_cofre AS destinoCofre
      FROM admin_receb_demo_pagamentos WHERE pagamento_id=?`).get(pagamentoId)||null;
  }
  historico(pagamentoId){
    validarId(pagamentoId);
    if(!this.buscar(pagamentoId))throw erro('NAO_ENCONTRADO','Pagamento ficticio nao encontrado');
    return this.banco.prepare(`
      SELECT sequencia,evento_id AS eventoId,pagamento_id AS pagamentoId,
        tipo,registrado_em AS registradoEm
      FROM admin_receb_demo_eventos WHERE pagamento_id=?
      ORDER BY sequencia`).all(pagamentoId);
  }
  listar(){
    const lista=this.banco.prepare('SELECT pagamento_id AS id FROM admin_receb_demo_pagamentos ORDER BY ciclo_demo,ordem_ciclo').all();
    return {
      modo:'CONFIRMACOES_TOTALMENTE_FICTICIAS',
      pagamentosReais:false,webhookExternoAtivo:false,
      posicoesCriadas:false,catracaMovimentada:false,
      pagamentos:lista.map(l=>{
        const pagamento=this.buscar(l.id);
        const eventos=this.historico(l.id);
        const ultimo=eventos.at(-1);
        const situacao=!ultimo?'AGUARDANDO_FICTICIO':
          ultimo.tipo===TIPOS.CONFIRMAR?'CONFIRMADO_FICTICIO':'ESTORNADO_FICTICIO';
        return {...pagamento,situacao,eventosRegistrados:eventos.length};
      })
    };
  }
  registrarEvento({pagamentoId,eventoId,tipo}={}){
    validarId(pagamentoId);
    validarId(eventoId);
    if(!Object.values(TIPOS).includes(tipo))throw erro('VALIDACAO','Tipo de evento ficticio invalido');
    this.banco.exec('BEGIN IMMEDIATE');
    try{
      const pagamento=this.buscar(pagamentoId);
      if(!pagamento)throw erro('NAO_ENCONTRADO','Pagamento ficticio nao encontrado');
      const repetido=this.banco.prepare(
        'SELECT pagamento_id AS pagamentoId,tipo FROM admin_receb_demo_eventos WHERE evento_id=?'
      ).get(eventoId);
      if(repetido){
        if(repetido.pagamentoId!==pagamentoId||repetido.tipo!==tipo){
          throw erro('CONFLITO','ID de evento ja utilizado com dados diferentes');
        }
        this.banco.exec('COMMIT');
        return {repetido:true,pagamentoId,eventoId,tipo};
      }
      const eventos=this.historico(pagamentoId);
      if((tipo===TIPOS.CONFIRMAR&&eventos.length!==0) ||
         (tipo===TIPOS.ESTORNAR&&
          (eventos.length!==1||eventos[0].tipo!==TIPOS.CONFIRMAR))){
        throw erro('TRANSICAO','Sequencia de confirmacao/estorno ficticio invalida');
      }
      const natureza=tipo===TIPOS.CONFIRMAR?'ENTRADA':'SAIDA';
      const lancamentos=[
        {cofreId:pagamento.destinoCofre,natureza,valorCentavos:pagamento.parcelaLoopCentavos},
        {cofreId:COFRES.COMERCIAL,natureza,valorCentavos:pagamento.sobraBrutaCentavos}
      ];
      if(pagamento.modo===MODOS.RESERVA){
        lancamentos.push({
          cofreId:COFRES.DISTRIBUIDOR,natureza,valorCentavos:pagamento.fornecedorCentavos
        });
      }
      // Livro e comprovante falso sao atomicos: ou os dois entram, ou nenhum.
      this.razao.registrarLote({
        loteId:'receb-'+eventoId,
        eventos:[{
          eventoId:'contabil-'+eventoId,
          tipo:'AJUSTE_FICTICIO',
          referencia:pagamentoId,
          descricao:tipo+' por evento demonstrativo '+eventoId,
          lancamentos
        }]
      },{transacaoAberta:true});
      this.banco.prepare(
        'INSERT INTO admin_receb_demo_eventos(evento_id,pagamento_id,tipo,registrado_em) VALUES (?,?,?,?)'
      ).run(eventoId,pagamentoId,tipo,new Date().toISOString());
      this.banco.exec('COMMIT');
      return {repetido:false,pagamentoId,eventoId,tipo,
        situacao:tipo===TIPOS.CONFIRMAR?'CONFIRMADO_FICTICIO':'ESTORNADO_FICTICIO',
        lancamentosRegistrados:lancamentos.length};
    }catch(e){
      this.banco.exec('ROLLBACK');
      throw e;
    }
  }
}

module.exports={RecebimentosPSPDemoSQLite,TIPOS,FATURAS};
