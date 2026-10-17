'use strict';

// Auditoria de quatro cofres exclusivamente FICTICIOS.
// O preco/custos da loja NAO sao recebimento do LOOP.
// Um livro de aportes locais NAO e comprovacao do banco ou PSP.
const DESTINOS=Object.freeze([
  'LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS'
]);
class ConciliacaoCofresV6DemoSQLite{
  constructor({banco,preLancamento,livro}={}){
    if(!banco||preLancamento?.banco!==banco||livro?.banco!==banco)
      throw new TypeError('Conciliacao exige os mesmos livros e SQLite');
    this.banco=banco;
    this.preLancamento=preLancamento;
    this.livro=livro;
  }
  conferir(){
    const b=this.banco,pre=this.preLancamento.resumo();
    if(!pre.configurado)return {
      modo:'CONCILIACAO_COFRES_SOMENTE_LABORATORIO',
      fase:'INATIVO',integridadeDemonstrativa:'SEM_PRELANCAMENTO_CONFIGURADO',
      divergencias:[],quantidadeDivergencias:0,
      entradasAportesSimuladosCentavos:0,
      dinheiroBancarioComprovadoCentavos:0,
      disponivelParaSaqueCentavos:0,pagamentosReaisAutorizados:false,
      caixaLojaSeparado:true
    };
    const divergencias=[];
    const alertar=(codigo,detalhe)=>divergencias.push({codigo,detalhe});
    const total=(xs,campo)=>xs.reduce((s,x)=>s+(x[campo]||0),0);
    const aportes=b.prepare([
      'SELECT a.aporte_id AS aporteId,a.pedido_id AS pedidoId,',
      'a.valor_loop_centavos AS valor,',
      'c.conta_id AS contaCompra,c.valor_centavos AS brutoLoja,',
      'r.conta_id AS contaReceita,r.bruto_centavos AS brutoReceita,',
      'r.liquido_centavos AS liquido,',
      'r.centro_centavos AS centro,r.esquerda_centavos AS esquerda,',
      'r.direita_centavos AS direita',
      'FROM loop_v6_pre_aportes_demo a',
      'LEFT JOIN admin_ponte_compras_demo c ON c.pedido_id=a.pedido_id',
      'LEFT JOIN loop_v6_pre_receitas r ON r.pedido_id=a.pedido_id',
      'ORDER BY a.pedido_id'
    ].join(' ')).all();
    const receitasSemAporte=b.prepare([
      'SELECT r.pedido_id AS pedidoId FROM loop_v6_pre_receitas r',
      'LEFT JOIN loop_v6_pre_aportes_demo a ON a.pedido_id=r.pedido_id',
      'WHERE a.pedido_id IS NULL'
    ].join(' ')).all();
    const qtdComerciais=b.prepare(
      'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo'
    ).get().n;
    for(const a of aportes){
      if(!a.contaCompra||a.brutoLoja===null)
        alertar('APORTE_SEM_PEDIDO_INTERNO',a.pedidoId);
      if(a.liquido===null)
        alertar('APORTE_SEM_ESCRITURACAO',a.pedidoId);
      else{
        if(a.valor!==25000||a.liquido!==25000)
          alertar('VALOR_FIXO_DIVERGENTE',a.pedidoId);
        if(a.contaCompra!==a.contaReceita||a.brutoLoja!==a.brutoReceita)
          alertar('VINCULO_COMERCIAL_DIVERGENTE',a.pedidoId);
        if(a.centro+a.esquerda+a.direita!==a.liquido||
           a.centro<0||a.esquerda<0||a.direita<0)
          alertar('DIVISAO_TRES_COFRES_DIVERGENTE',a.pedidoId);
      }
    }
    for(const r of receitasSemAporte)
      alertar('RECEITA_LOOP_SEM_APORTE',r.pedidoId);
    const somas=b.prepare([
      'SELECT COALESCE(SUM(liquido_centavos),0) AS total,',
      'COALESCE(SUM(centro_centavos),0) AS centro,',
      'COALESCE(SUM(esquerda_centavos),0) AS esquerda,',
      'COALESCE(SUM(direita_centavos),0) AS direita',
      'FROM loop_v6_pre_receitas'
    ].join(' ')).get();
    if(somas.total!==somas.centro+somas.esquerda+somas.direita)
      alertar('TOTAL_APORTES_NAO_CONSERVADO','Todos os aportes');
    if(somas.centro!==pre.centroRecebidoSimuladoCentavos||
       somas.total!==pre.totalHipoteticoCentavos)
      alertar('RESUMO_APORTES_DIVERGENTE','Resumo e razao de aportes');
    const saidas=b.prepare([
      'SELECT s.giro AS giro,s.posicao_id AS posicao,',
      's.beneficiario AS beneficiario,s.destino AS destino,',
      's.valor_centavos AS valor,',
      'p.posicao_centro AS posicaoProvisao,p.conta_id AS contaProvisao,',
      'p.cofre_centro AS cofreProvisao,p.previsto_centro AS previstoCentro',
      'FROM loop_v6_pre_saidas s',
      'LEFT JOIN loop_v6_provisoes_ciclos p ON p.giro=s.giro',
      'ORDER BY s.giro'
    ].join(' ')).all();
    for(const s of saidas){
      if(s.posicaoProvisao===null){
        alertar('GIRO_SEM_PROVISAO_DOCUMENTADA',String(s.giro));
        continue;
      }
      const dourado=s.destino==='LOOP_DOURADAS';
      if(!['LOOP_DOURADAS','ESCRITORIO_PREVISTO'].includes(s.destino)||
         s.posicao!==s.posicaoProvisao||
         s.valor<=0||
         (dourado?s.beneficiario!==null:s.beneficiario!==s.contaProvisao)||
         (dourado?s.cofreProvisao!=='LOOP_DOURADAS':s.cofreProvisao!=='LOOP_CENTRO'))
        alertar('DESTINO_GIRO_DIVERGENTE',String(s.giro));
      const parcelas=b.prepare([
        'SELECT ordem,referencia_centavos AS referencia,',
        'destino_cofre AS destino FROM loop_v6_provisoes_eventos',
        'WHERE giro=? ORDER BY ordem'
      ].join(' ')).all(s.giro);
      if(parcelas.length!==6||
         parcelas.some((v,i)=>v.ordem!==i+1))
        alertar('SEIS_EVENTOS_INVALIDOS',String(s.giro));
      if(dourado){
        const ouro=parcelas.filter(v=>[1,3,5].includes(v.ordem));
        if(ouro.length!==3||ouro.some(v=>v.destino!=='LOOP_DOURADAS')||
           total(ouro,'referencia')!==s.valor)
          alertar('VALOR_COFRE_DOURADAS_DIVERGENTE',String(s.giro));
      }else if(s.previstoCentro!==s.valor){
        alertar('VALOR_ESCRITORIO_DIVERGENTE',String(s.giro));
      }
    }
    const provisoes=b.prepare('SELECT giro FROM loop_v6_provisoes_ciclos').all();
    const girosSaidas=new Set(saidas.map(s=>s.giro));
    for(const p of provisoes)
      if(!girosSaidas.has(p.giro))
        alertar('PROVISAO_SEM_SAIDA_CENTRAL',String(p.giro));
    const enviadosDourado=total(saidas.filter(s=>s.destino==='LOOP_DOURADAS'),'valor');
    const enviadosEscritorio=total(saidas.filter(s=>s.destino==='ESCRITORIO_PREVISTO'),'valor');
    const debitadoCentro=total(saidas,'valor');
    const saldoCentro=somas.centro-debitadoCentro;
    const saldoEsquerda=somas.esquerda;
    const saldoDireita=somas.direita;
    const totalConservado=saldoCentro+saldoEsquerda+saldoDireita+
      enviadosDourado+enviadosEscritorio;
    if(saldoCentro<0)
      alertar('CENTRO_FICTICIO_NEGATIVO','Saldo calculado em centavos');
    if(totalConservado!==somas.total)
      alertar('MOVIMENTOS_NAO_CONSERVADOS','Quatro cofres e previsoes dos escritorios');
    if(pre.centroRestanteSimuladoCentavos!==saldoCentro||
       pre.douradasAcumuladoSimuladoCentavos!==enviadosDourado||
       pre.escritoriosPrevistosSimuladoCentavos!==enviadosEscritorio)
      alertar('SALDO_RESUMO_INCOMPATIVEL','Livro do pre-lancamento');
    return {
      modo:'CONCILIACAO_COFRES_SOMENTE_LABORATORIO',
      fase:pre.fase,
      integridadeDemonstrativa:divergencias.length?'DIVERGENTE':'CONFERIDA_APENAS_EM_SIMULACAO',
      quantidadeDivergencias:divergencias.length,divergencias,
      comprasComerciaisSemCreditoAutomatico:qtdComerciais,
      quantidadeAportesSeparados:aportes.length,
      pedidosComerciaisSemAporte:Math.max(0,qtdComerciais-aportes.length),
      entradasAportesSimuladosCentavos:somas.total,
      cofreCentroRecebidoSimuladoCentavos:somas.centro,
      cofreCentroRestanteSimuladoCentavos:saldoCentro,
      cofreEsquerdaSimuladoCentavos:saldoEsquerda,
      cofreDireitaSimuladoCentavos:saldoDireita,
      cofreDouradasSimuladoCentavos:enviadosDourado,
      valoresApenasPrevistosNosEscritoriosCentavos:enviadosEscritorio,
      somaDestinacoesConservadasCentavos:totalConservado,
      girosComDestinoDocumentado:saidas.length,
      cofresDoLoop:DESTINOS,
      lojaComRazaoSeparado:true,
      dinheiroBancarioComprovadoCentavos:0,
      disponivelParaSaqueCentavos:0,
      pagamentosReaisAutorizados:false,
      aptoParaOperacaoFinanceiraReal:false
    };
  }
}
module.exports={ConciliacaoCofresV6DemoSQLite};
