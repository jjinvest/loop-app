'use strict';

// Livro persistente EXCLUSIVAMENTE FICTICIO do laboratorio administrativo.
// Nao usa PSP, banco, carteira, saque real, CPF ou participantes verdadeiros.
// Cada lote e atomico, idempotente e imutavel; correcoes = novos lancamentos.
const {criarVisaoFinanceiraAdminDemo,MODOS,COFRES}=require('./financeiro-admin-demo');
const {VENDAS_POR_CICLO}=require('./valor-padrao-loop');
const COFRES_VALIDOS=new Set(Object.values(COFRES));
const NATUREZAS=new Set(['ENTRADA','SAIDA','RETORNO']);
const EVENTOS=new Set(['VENDA_FICTICIA','MOVIMENTO_FICTICIO','AJUSTE_FICTICIO','RECEBIMENTO_PSP_FICTICIO']);
const RE_ID=/^[a-z0-9][a-z0-9-]{2,79}$/;
function validarTexto(valor,campo,max=140){
  if(typeof valor!=='string'||!valor.trim()||valor.length>max||
     /[\u0000-\u001f\u007f]/u.test(valor))throw new Error(campo+' invalido');
  return valor.trim().normalize('NFC');
}
function validarLote(loteId,eventos){
  if(typeof loteId!=='string'||!RE_ID.test(loteId)||
     !Array.isArray(eventos)||eventos.length<1||eventos.length>VENDAS_POR_CICLO){
    throw new Error('Lote de laboratorio invalido');
  }
  const ids=new Set();
  return eventos.map((evento)=>{
    if(!evento||typeof evento!=='object'||Array.isArray(evento)||
       !RE_ID.test(evento.eventoId)||ids.has(evento.eventoId)||
       !EVENTOS.has(evento.tipo)||!Array.isArray(evento.lancamentos)||
       !evento.lancamentos.length||evento.lancamentos.length>5){
      throw new Error('Evento de laboratorio invalido ou repetido');
    }
    ids.add(evento.eventoId);
    const referencia=validarTexto(evento.referencia,'Referencia');
    const descricao=validarTexto(evento.descricao,'Descricao');
    const lancamentos=evento.lancamentos.map(l=>{
      if(!l||typeof l!=='object'||Array.isArray(l)||
         !COFRES_VALIDOS.has(l.cofreId)||!NATUREZAS.has(l.natureza)||
         !Number.isSafeInteger(l.valorCentavos)||l.valorCentavos<1){
        throw new Error('Lancamento ficticio invalido');
      }
      return {cofreId:l.cofreId,natureza:l.natureza,valorCentavos:l.valorCentavos};
    });
    return {eventoId:evento.eventoId,tipo:evento.tipo,referencia,descricao,lancamentos};
  });
}
function nomeSeguro(id){if(typeof id!=='string'||!RE_ID.test(id))throw new Error('ID do registro invalido');}

class RazaoFinanceiroDemoSQLite{
  constructor({banco}={}){
    if(!banco||typeof banco.exec!=='function'||typeof banco.prepare!=='function'){
      throw new TypeError('SQLite local de laboratorio obrigatorio');
    }
    this.banco=banco; // pertence ao repositorio de catalogo de laboratorio
    banco.exec(`
      CREATE TABLE IF NOT EXISTS admin_fin_demo_lotes (
        lote_id TEXT PRIMARY KEY NOT NULL,
        eventos_json TEXT NOT NULL,
        criado_em TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_fin_demo_eventos (
        evento_id TEXT PRIMARY KEY NOT NULL,
        lote_id TEXT NOT NULL REFERENCES admin_fin_demo_lotes(lote_id) ON DELETE RESTRICT,
        tipo TEXT NOT NULL,
        referencia TEXT NOT NULL,
        descricao TEXT NOT NULL,
        criado_em TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_fin_demo_lancamentos (
        sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
        evento_id TEXT NOT NULL REFERENCES admin_fin_demo_eventos(evento_id) ON DELETE RESTRICT,
        cofre_id TEXT NOT NULL,
        natureza TEXT NOT NULL CHECK(natureza IN ('ENTRADA','SAIDA','RETORNO')),
        valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
        criado_em TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_fin_demo_eventos_lote
        ON admin_fin_demo_eventos(lote_id);
      CREATE INDEX IF NOT EXISTS idx_admin_fin_demo_lancamentos_cofre
        ON admin_fin_demo_lancamentos(cofre_id,sequencia);
      CREATE TRIGGER IF NOT EXISTS admin_fin_demo_lotes_no_update
        BEFORE UPDATE ON admin_fin_demo_lotes
        BEGIN SELECT RAISE(ABORT,'livro imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_fin_demo_lotes_no_delete
        BEFORE DELETE ON admin_fin_demo_lotes
        BEGIN SELECT RAISE(ABORT,'livro imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_fin_demo_eventos_no_update
        BEFORE UPDATE ON admin_fin_demo_eventos
        BEGIN SELECT RAISE(ABORT,'livro imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_fin_demo_eventos_no_delete
        BEFORE DELETE ON admin_fin_demo_eventos
        BEGIN SELECT RAISE(ABORT,'livro imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_fin_demo_lancamentos_no_update
        BEFORE UPDATE ON admin_fin_demo_lancamentos
        BEGIN SELECT RAISE(ABORT,'livro imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_fin_demo_lancamentos_no_delete
        BEFORE DELETE ON admin_fin_demo_lancamentos
        BEGIN SELECT RAISE(ABORT,'livro imutavel'); END;
    `);
  }
  registrarLote({loteId,eventos}={}, {transacaoAberta=false}={}){
    const validos=validarLote(loteId,eventos);
    const documento=JSON.stringify(validos);
    const agora=new Date().toISOString();
    // Chamado isoladamente: controla propria transacao. Quando integrado
    // ao recebimento simulado: usa a transacao externa, permitindo commit
    // atomico do comprovante ficticio e do seu lancamento no livro.
    if(!transacaoAberta)this.banco.exec('BEGIN IMMEDIATE');
    try{
      const existente=this.banco.prepare(
        'SELECT eventos_json FROM admin_fin_demo_lotes WHERE lote_id=?'
      ).get(loteId);
      if(existente){
        if(existente.eventos_json!==documento){
          const conflito=new Error('Mesmo ID de lote com dados diferentes');
          conflito.codigo='CONFLITO_IDEMPOTENCIA';
          throw conflito;
        }
        if(!transacaoAberta)this.banco.exec('COMMIT');
        return {loteId,repetido:true,eventos:validos.length};
      }
      const jaUsados=this.banco.prepare(
        'SELECT evento_id FROM admin_fin_demo_eventos WHERE evento_id=?'
      );
      for(const evento of validos){
        if(jaUsados.get(evento.eventoId)){
          const conflito=new Error('ID de evento ja registrado em outro lote');
          conflito.codigo='CONFLITO_IDEMPOTENCIA';
          throw conflito;
        }
      }
      this.banco.prepare(
        'INSERT INTO admin_fin_demo_lotes(lote_id,eventos_json,criado_em) VALUES (?,?,?)'
      ).run(loteId,documento,agora);
      const inserirEvento=this.banco.prepare(
        'INSERT INTO admin_fin_demo_eventos(evento_id,lote_id,tipo,referencia,descricao,criado_em) VALUES (?,?,?,?,?,?)'
      );
      const inserirLinha=this.banco.prepare(
        'INSERT INTO admin_fin_demo_lancamentos(evento_id,cofre_id,natureza,valor_centavos,criado_em) VALUES (?,?,?,?,?)'
      );
      for(const evento of validos){
        inserirEvento.run(evento.eventoId,loteId,evento.tipo,evento.referencia,evento.descricao,agora);
        for(const l of evento.lancamentos){
          inserirLinha.run(evento.eventoId,l.cofreId,l.natureza,l.valorCentavos,agora);
        }
      }
      if(!transacaoAberta)this.banco.exec('COMMIT');
      return {loteId,repetido:false,eventos:validos.length};
    }catch(erro){
      if(!transacaoAberta)this.banco.exec('ROLLBACK');
      throw erro;
    }
  }
  registrarCicloFicticio({cicloId,modo=MODOS.SPLIT,centroPosicao=null}={}){
    nomeSeguro(cicloId);
    const base=criarVisaoFinanceiraAdminDemo({modo,centroPosicao});
    const eventos=base.vendas.map(v=>{
      const lancamentos=[
        {cofreId:v.destinoCiclo,natureza:'ENTRADA',valorCentavos:v.parcelaLoopCentavos},
        {cofreId:COFRES.COMERCIAL,natureza:'ENTRADA',valorCentavos:v.sobraBrutaCentavos}
      ];
      if(modo===MODOS.RESERVA){
        lancamentos.push({
          cofreId:COFRES.DISTRIBUIDOR,natureza:'ENTRADA',valorCentavos:v.fornecedorCentavos
        });
      }
      return {
        eventoId:cicloId+'-v'+v.eventoCiclo,
        tipo:'VENDA_FICTICIA',
        referencia:v.vendaId,
        descricao:'Venda hipotetica R$600; custo fornecedor R$300; parcela LOOP; '+modo+
         '; centro: '+base.origemTitularCentro,
        lancamentos
      };
    });
    return this.registrarLote({loteId:cicloId,eventos});
  }
  registrarMovimentoFicticio({eventoId,cofreId,natureza,valorCentavos,referencia}={}){
    nomeSeguro(eventoId);
    return this.registrarLote({
      loteId:'lote-'+eventoId,
      eventos:[{
        eventoId,tipo:'MOVIMENTO_FICTICIO',
        referencia,
        descricao:'Movimento manual ficticio do laboratorio',
        lancamentos:[{cofreId,natureza,valorCentavos}]
      }]
    });
  }
  registrarAjusteFicticio({eventoId,cofreId,natureza,valorCentavos,referencia}={}){
    nomeSeguro(eventoId);
    return this.registrarLote({
      loteId:'lote-'+eventoId,
      eventos:[{
        eventoId,tipo:'AJUSTE_FICTICIO',
        referencia,
        descricao:'Ajuste contabil ficticio por lancamento separado; original preservado',
        lancamentos:[{cofreId,natureza,valorCentavos}]
      }]
    });
  }
  consultar({limite=200}={}){
    if(!Number.isInteger(limite)||limite<1||limite>500)throw new Error('Limite de consulta invalido');
    const totais=this.banco.prepare(
      'SELECT cofre_id AS cofreId, natureza, SUM(valor_centavos) AS total FROM admin_fin_demo_lancamentos GROUP BY cofre_id,natureza'
    ).all();
    const caixas=Object.values(COFRES).map(id=>{
      const a=totais.filter(x=>x.cofreId===id);
      const total=(t)=>a.find(x=>x.natureza===t)?.total||0;
      const entrada=total('ENTRADA'),saida=total('SAIDA'),retorno=total('RETORNO');
      if(![entrada,saida,retorno,entrada-saida+retorno].every(Number.isSafeInteger)){
        throw new Error('Acumulado ficticio nao e um inteiro seguro');
      }
      return {
        id,entradasAcumuladasCentavos:entrada,saidasAcumuladasCentavos:saida,
        retornosAcumuladosCentavos:retorno,saldoProjetadoCentavos:entrada-saida+retorno,
        saldoBancarioRealConhecido:false
      };
    });
    const linhas=this.banco.prepare(
      `SELECT l.sequencia, e.lote_id AS loteId, l.evento_id AS eventoId,
       e.tipo, e.referencia, e.descricao, l.cofre_id AS cofreId,
       l.natureza, l.valor_centavos AS valorCentavos, l.criado_em AS criadoEm
       FROM admin_fin_demo_lancamentos l
       JOIN admin_fin_demo_eventos e ON e.evento_id=l.evento_id
       ORDER BY l.sequencia DESC LIMIT ?`
    ).all(limite);
    const contagem=this.banco.prepare(
      'SELECT COUNT(*) AS lotes FROM admin_fin_demo_lotes'
    ).get().lotes;
    const lancamentos=this.banco.prepare(
      'SELECT COUNT(*) AS total FROM admin_fin_demo_lancamentos'
    ).get().total;
    return {
      modo:'LIVRO_FINANCEIRO_PERSISTENTE_APENAS_LABORATORIO',
      integracaoBancaria:'NAO_CONECTADA',
      saldosReais:false,
      pagamentosReais:false,
      correcoesPorNovosLancamentos:true,
      lotesRegistrados:contagem,lancamentosRegistrados:lancamentos,
      caixas,historicoRecente:linhas
    };
  }
}

module.exports={RazaoFinanceiroDemoSQLite,validarLote};
