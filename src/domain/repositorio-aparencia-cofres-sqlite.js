'use strict';

// Somente nomes e cores do LABORATORIO ADMINISTRATIVO.
// IDs, posicoes, finalidades e destinos financeiros nunca sao editaveis.
// Usa o SQLite local do catalogo, sem modificar PRAGMA user_version.
const {COFRES}=require('./financeiro-admin-demo');

const DEFINICOES=Object.freeze([
  Object.freeze({id:COFRES.ESQUERDA,posicao:'ESQUERDA',grupo:'LOOP',finalidade:'INVESTIMENTO',nomePadrao:'Investimento LOOP',corPadrao:'#D5A62A'}),
  Object.freeze({id:COFRES.CENTRO,posicao:'CENTRO',grupo:'LOOP',finalidade:'PARTICIPANTES',nomePadrao:'Bonificacoes e participacao dos clientes',corPadrao:'#319774'}),
  Object.freeze({id:COFRES.DOURADAS,posicao:'DOURADAS',grupo:'LOOP',finalidade:'POSICOES_ASSUMIDAS',nomePadrao:'Caixa das bolas douradas',corPadrao:'#E1B74B'}),
  Object.freeze({id:COFRES.DIREITA,posicao:'DIREITA',grupo:'LOOP',finalidade:'RESERVA',nomePadrao:'Reserva de suporte LOOP',corPadrao:'#5D789D'}),
  Object.freeze({id:COFRES.COMERCIAL,posicao:'COMERCIAL',grupo:'LOJA',finalidade:'SOBRA_BRUTA',nomePadrao:'Sobra bruta comercial',corPadrao:'#D5A62A'}),
  Object.freeze({id:COFRES.DISTRIBUIDOR,posicao:'FORNECEDOR_A_PAGAR',grupo:'LOJA',finalidade:'COMPROMISSO_FORNECEDOR',nomePadrao:'Reserva para pagar distribuidor',corPadrao:'#5D789D'})
]);
const DEFINICAO_POR_ID=new Map(DEFINICOES.map(p=>[p.id,p]));

function validarNome(nome){
  if(typeof nome!=='string')throw new Error('Nome deve ser texto');
  const valor=nome.trim().normalize('NFC');
  if(!valor || Array.from(valor).length>70 || /[\u0000-\u001f\u007f<>]/u.test(valor)){
    throw new Error('Nome de cofre invalido (maximo 70 caracteres)');
  }
  return valor;
}
function validarCor(cor){
  if(typeof cor!=='string' || !/^#[0-9a-f]{6}$/i.test(cor)){
    throw new Error('Cor deve estar em hexadecimal #RRGGBB');
  }
  return cor.toUpperCase();
}
function validarId(id){
  if(!DEFINICAO_POR_ID.has(id))throw new Error('Cofre desconhecido');
}
function validarRevisao(revisao){
  if(!Number.isSafeInteger(revisao)||revisao<0)throw new Error('Revisao esperada invalida');
}
function linhaParaConfig(def,linha){
  return {
    id:def.id,posicao:def.posicao,grupo:def.grupo,finalidade:def.finalidade,
    nome:linha?linha.nome:def.nomePadrao,
    cor:linha?linha.cor:def.corPadrao,
    revisao:linha?linha.revisao:0,
    atualizadoEm:linha?linha.atualizado_em:null,
    integracaoBancaria:'NAO_CONFIGURADA'
  };
}

class RepositorioAparenciaCofresSQLite {
  constructor({banco}={}){
    if(!banco || typeof banco.prepare!=='function' || typeof banco.exec!=='function'){
      throw new TypeError('Banco SQLite local do catalogo e obrigatorio');
    }
    this.banco=banco; // administrado e fechado pelo repositorio principal
    banco.exec(`
      CREATE TABLE IF NOT EXISTS admin_cofres_aparencia (
        id TEXT PRIMARY KEY NOT NULL,
        nome TEXT NOT NULL, cor TEXT NOT NULL,
        revisao INTEGER NOT NULL CHECK(revisao>=1),
        atualizado_em TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_cofres_aparencia_historico (
        sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
        cofre_id TEXT NOT NULL, revisao INTEGER NOT NULL,
        antes_nome TEXT NOT NULL, antes_cor TEXT NOT NULL,
        depois_nome TEXT NOT NULL, depois_cor TEXT NOT NULL,
        alterado_em TEXT NOT NULL,
        UNIQUE(cofre_id,revisao),
        FOREIGN KEY(cofre_id) REFERENCES admin_cofres_aparencia(id) ON DELETE RESTRICT
      );
      CREATE TRIGGER IF NOT EXISTS admin_cofres_historico_sem_update
        BEFORE UPDATE ON admin_cofres_aparencia_historico
        BEGIN SELECT RAISE(ABORT,'historico de aparencia imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_cofres_historico_sem_delete
        BEFORE DELETE ON admin_cofres_aparencia_historico
        BEGIN SELECT RAISE(ABORT,'historico de aparencia imutavel'); END;
    `);
  }
  buscar(id){
    validarId(id);
    const linha=this.banco.prepare(
      'SELECT nome,cor,revisao,atualizado_em FROM admin_cofres_aparencia WHERE id=?'
    ).get(id);
    return linhaParaConfig(DEFINICAO_POR_ID.get(id),linha);
  }
  listar(){
    return DEFINICOES.map(d=>this.buscar(d.id));
  }
  historico(id){
    validarId(id);
    return this.banco.prepare(
      'SELECT sequencia,cofre_id AS cofreId,revisao,antes_nome AS antesNome,antes_cor AS antesCor,depois_nome AS depoisNome,depois_cor AS depoisCor,alterado_em AS alteradoEm FROM admin_cofres_aparencia_historico WHERE cofre_id=? ORDER BY sequencia'
    ).all(id);
  }
  salvar({id,nome,cor,revisaoEsperada}={}){
    validarId(id);
    const novoNome=validarNome(nome);
    const novaCor=validarCor(cor);
    validarRevisao(revisaoEsperada);
    this.banco.exec('BEGIN IMMEDIATE');
    try{
      const anterior=this.buscar(id);
      if(anterior.revisao!==revisaoEsperada){
        const erro=new Error('Conflito de revisao: recarregue antes de salvar');
        erro.codigo='CONFLITO_DE_REVISAO';
        throw erro;
      }
      if(anterior.nome===novoNome && anterior.cor===novaCor){
        this.banco.exec('COMMIT');
        return anterior;
      }
      const revisao=anterior.revisao+1;
      const atualizadoEm=new Date().toISOString();
      if(anterior.revisao===0){
        this.banco.prepare(
          'INSERT INTO admin_cofres_aparencia (id,nome,cor,revisao,atualizado_em) VALUES (?,?,?,?,?)'
        ).run(id,novoNome,novaCor,revisao,atualizadoEm);
      }else{
        this.banco.prepare(
          'UPDATE admin_cofres_aparencia SET nome=?,cor=?,revisao=?,atualizado_em=? WHERE id=?'
        ).run(novoNome,novaCor,revisao,atualizadoEm,id);
      }
      this.banco.prepare(
        'INSERT INTO admin_cofres_aparencia_historico (cofre_id,revisao,antes_nome,antes_cor,depois_nome,depois_cor,alterado_em) VALUES (?,?,?,?,?,?,?)'
      ).run(id,revisao,anterior.nome,anterior.cor,novoNome,novaCor,atualizadoEm);
      this.banco.exec('COMMIT');
      return this.buscar(id);
    }catch(e){
      this.banco.exec('ROLLBACK');
      throw e;
    }
  }
}
module.exports={RepositorioAparenciaCofresSQLite,DEFINICOES,validarNome,validarCor};
