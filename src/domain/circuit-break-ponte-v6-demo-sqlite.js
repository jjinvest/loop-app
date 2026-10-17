'use strict';

// Integra giros da PONTE de contas ficticias ao Circuit Break administrativo.
// O cenario artificial de 1.800 pessoas permanece separado da ponte.
// O mesmo status PAUSA/ABERTA e limite diario valem para ambas as origens.
// Nunca processa Pix, dinheiro real, PSP ou saldo sacavel.
const {LOTES}=require('./circuit-break-v6-demo-sqlite');
const {centroDoLoop}=require('./destino-financeiro-centro-loop');
const {LivroProvisoesV6DemoSQLite}=require('./livro-provisoes-v6-demo-sqlite');

function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function diaLocal(iso){
  const d=new Date(iso);
  if(!Number.isFinite(d.getTime()))throw falha('RELOGIO_INVALIDO');
  return new Intl.DateTimeFormat('sv-SE',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(d);
}
class CircuitBreakPonteV6DemoSQLite{
  constructor({banco,ponte,controle,agora=()=>new Date().toISOString()}={}){
    if(!banco||!ponte||!controle||ponte.banco!==banco||controle.banco!==banco)
      throw new TypeError('Circuit Break e ponte devem compartilhar banco de laboratorio');
    this.banco=banco;this.ponte=ponte;this.controle=controle;this.agora=agora;
    this.livro=new LivroProvisoesV6DemoSQLite({banco,ponte});
    // Reconstrucao idempotente de giros de laboratorio anteriores ao livro.
    // Falha fechada se o snapshot divergir das compras documentadas.
    this.livro.registrarCiclos({sim:this.ponte._restaurar()});
  }
  comprasConfirmadas(){
    return this.banco.prepare([
      'SELECT pedido_id AS pedidoId,conta_id AS contaId,',
      'confirmado_em AS confirmadoEm FROM admin_ponte_compras_demo',
      'ORDER BY confirmado_em,pedido_id'
    ].join(' ')).all();
  }
  avaliar(sim,compras){
    const usadas=sim.tabuleiro.vendasProcessadas;
    const pendentes=compras.filter(c=>!usadas.has('compra-demo-'+c.pedidoId));
    const tab=sim.tabuleiro;
    const livres=sim.filas.filaA.length+sim.filas.filaB.length;
    const ocupados=[tab.centro,...tab.vagas].filter(Boolean).length;
    return {comprasElegiveis:compras.length,comprasConsumidas:usadas.size,
      comprasPendentes:pendentes.length,girosProntosPorCompras:Math.floor(pendentes.length/6),
      girosConcluidos:sim.giros,centro:tab.centro?.participanteId??null,
      centroEmpresa:centroDoLoop(tab.centro),
      lugaresOcupados:ocupados,posicoesNaFila:livres,
      cicloParcial:tab.vendasDoCiclo.length,
      podeCompletarTabuleiro:ocupados+livres>=7,
      podeReporVaga6:livres+ocupados>=8,
      aguardandoConfirmacaoFinanceiraReal:true,
      pagamentosReais:0};
  }
  resumo(){
    const sim=this.ponte._restaurar();
    const compras=this.comprasConfirmadas();
    const controle=this.controle.resumo();
    return {modo:'PONTE_DE_CONTAS_APENAS_FICTICIAS',
      ...this.avaliar(sim,compras),
      catraca:controle.status,
      limiteDiario:controle.limiteDiario,girosHoje:controle.girosHoje,
      restantesHoje:controle.restantesHoje,revisaoControle:controle.revisao,
      compartilhadoComCenarioArtificial:true,
      creditoRealDisponivelCentavos:0,
      provisoes:this.livro.resumo()};
  }
  liberar({comandoId,revisaoEsperada,quantidade}={}){
    if(typeof comandoId!=='string'||!/^cb-[a-z0-9-]{5,70}$/.test(comandoId))
      throw falha('COMANDO_ID_INVALIDO');
    if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0||revisaoEsperada>1000000)
      throw falha('REVISAO_INVALIDA');
    if(!LOTES.includes(quantidade))throw falha('LOTE_INVALIDO');
    const entrada={tipo:'LIBERAR_LOTE_PONTE',valor:quantidade};
    const b=this.banco;
    b.exec('BEGIN IMMEDIATE;');
    try{
      const anterior=b.prepare(
        'SELECT entrada_json,saida_json FROM loop_cb_v6_auditoria WHERE comando_id=?'
      ).get(comandoId);
      if(anterior){
        if(anterior.entrada_json!==JSON.stringify(entrada))
          throw falha('CONFLITO_COMANDO_ID');
        b.exec('COMMIT;');
        return {...JSON.parse(anterior.saida_json),repetido:true};
      }
      const estado=this.controle.linha();
      if(estado.revisao!==revisaoEsperada)throw falha('CONFLITO_REVISAO');
      if(estado.status!=='ABERTA')throw falha('CATRACA_PAUSADA');
      const agora=this.agora(),dia=diaLocal(agora);
      const usadosHoje=dia===estado.dia_local?estado.giros_dia:0;
      if(usadosHoje+quantidade>estado.limite_diario)
        throw falha('LIMITE_DIARIO_ATINGIDO');
      const sim=this.ponte._restaurar();
      if(sim.tabuleiro.vendasDoCiclo.length!==0)
        throw falha('CICLO_PARCIAL_NAO_GERENCIADO');
      const compras=this.comprasConfirmadas();
      const elegiveis=compras.filter(c=>
        !sim.tabuleiro.vendasProcessadas.has('compra-demo-'+c.pedidoId));
      if(elegiveis.length<quantidade*6)
        throw falha('COMPRAS_CONFIRMADAS_INSUFICIENTES');
      if(!sim.tabuleiro.iniciado){
        sim.prepararTabuleiro();
      }
      // O tabuleiro precisa ter as 7 posicoes e cada giro, uma nova
      // entrada pela vaga 6. Nenhuma vaga some para forcar girar.
      if(!sim.tabuleiro.centro||sim.tabuleiro.vagas.some(p=>!p)||
         sim.filas.filaA.length+sim.filas.filaB.length<quantidade)
        throw falha('TABULEIRO_SEM_REPOSICAO');
      const giros=[];
      for(let i=0;i<quantidade;i++){
        const vendas=elegiveis.slice(i*6,(i+1)*6);
        const eventos=[];
        for(const compra of vendas){
          const registro=sim.registrarVendaNoCicloSimulada({
            vendaId:'compra-demo-'+compra.pedidoId
          });
          if(registro.repetida)throw falha('VENDA_DUPLICADA');
          eventos.push(registro.venda);
        }
        if(new Set(eventos.map(v=>v.vendaId)).size!==6)
          throw falha('EVENTOS_DUPLICADOS');
        sim.abrirCatraca();
        const giro=sim.tentarGiro();
        sim.pausarCatraca();
        if(!giro.girou||!giro.novaPosicao6)throw falha('GIRO_NAO_AUTORIZADO');
        giros.push({giro:sim.giros,centroPosicaoId:giro.centroConcluido.id,
          titularCentroId:giro.centroConcluido.participanteId,
          centroEmpresa:centroDoLoop(giro.centroConcluido),
          eventos:eventos.map(v=>({vendaId:v.vendaId,
            ordem:v.ordem,destinoCofre:v.destinoCofre}))});
      }
      // Livro das seis fontes de cada ciclo na MESMA transacao atomica.
      // Se uma origem nao corresponde a pedido interno, todo lote reverte.
      this.livro.registrarCiclos({sim,transacaoAberta:true});
      // Giro, controle de ritmo e auditoria gravados no MESMO COMMIT.
      b.prepare([
        'INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES(1,?)',
        'ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json'
      ].join(' ')).run(JSON.stringify(sim.exportarSnapshot()));
      const atualizado=b.prepare([
        'UPDATE loop_cb_v6_estado SET revisao=?,dia_local=?,giros_dia=?',
        'WHERE id=1 AND revisao=?'
      ].join(' ')).run(estado.revisao+1,dia,usadosHoje+quantidade,estado.revisao);
      if(atualizado.changes!==1)throw falha('CONFLITO_REVISAO');
      const resposta={comando:'LIBERAR_LOTE_PONTE',
        girosLiberados:giros,modo:'PONTE_FICTICIA',
        resultado:this.avaliar(sim,compras),
        semPagamentoReal:true,semSaldoSacavel:true,repetido:false,
        revisaoControle:estado.revisao+1};
      b.prepare([
        'INSERT INTO loop_cb_v6_auditoria',
        '(comando_id,tipo,entrada_json,saida_json,registrado_em)',
        'VALUES (?,?,?,?,?)'
      ].join(' ')).run(comandoId,'LIBERAR_LOTE_PONTE',
        JSON.stringify(entrada),JSON.stringify(resposta),agora);
      b.exec('COMMIT;');
      return resposta;
    }catch(e){b.exec('ROLLBACK;');throw e;}
  }
}
module.exports={CircuitBreakPonteV6DemoSQLite};
