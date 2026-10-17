'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {MotorFilas}=require('../src/domain/motor-filas');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {cofreDoEvento}=require('../src/domain/destino-financeiro-centro-loop');

function criar(){
 let instante=0;
 const relogio=()=>new Date(Date.UTC(2026,9,16,12,0,++instante)).toISOString();
 return new SimuladorLoop({relogio});
}
function criarCompra(loop,num,adesaoPendente){
 return loop.registrarPosicaoSimulada({
  participanteId:'titular-'+num,nome:'Pessoa '+num,
  vendaId:'pedido-'+num,adesaoPendente
 });
}
function fecharCiclo(loop,identificador){
 for(let i=1;i<=6;i++)loop.registrarVendaNoCicloSimulada({
  vendaId:identificador+'-'+i
 });
 loop.abrirCatraca();
 return loop.tentarGiro();
}

test('azul espera nas filas ate entrar na vaga 6 e so entao vira dourado',()=>{
 const loop=criar();
 for(let i=1;i<=8;i++)criarCompra(loop,i,i===8);
 const ultimoAntes=loop.filas.filaB.at(-1);
 assert.equal(ultimoAntes.statusAdesao,'PENDENTE');
 assert.equal(ultimoAntes.titularOperacional,undefined);
 assert.equal(ultimoAntes.empresa,undefined);
 assert.equal(ultimoAntes.entradaPelaVaga6Em,undefined);
 loop.prepararTabuleiro();
 const aguardando=loop.filas.filaB.at(-1);
 assert.equal(aguardando.id,8);
 assert.equal(aguardando.statusAdesao,'PENDENTE');
 assert.equal(aguardando.entradaPelaVaga6Em,undefined);
 assert.equal(loop.tabuleiro.vagas[5].id,7);
 const giro=fecharCiclo(loop,'giro-um');
 assert.equal(giro.girou,true);
 const entrada=giro.estado.vagas[5];
 assert.equal(entrada.id,8);
 assert.equal(entrada.statusAdesao,'PRAZO_ENCERRADO');
 assert.equal(entrada.titularOperacional,'LOOP_EMPRESA');
 assert.equal(entrada.empresa,true);
 assert.equal(entrada.motivoAssuncao,'SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6');
 assert.equal(entrada.prazoEncerradoEm,entrada.entradaPelaVaga6Em);
 assert.ok(entrada.entradaPelaVaga6Em);
 assert.equal(loop.filas.filaB.length,0);
 // Apos seis giros no total, a mesma posicao chega ao centro dourada.
 for(let volta=2;volta<=7;volta++)fecharCiclo(loop,'giro-'+volta);
 assert.equal(loop.tabuleiro.centro.id,8);
 const destinos=[];
 for(let i=1;i<=6;i++){
  const ev=loop.registrarVendaNoCicloSimulada({vendaId:'centro-dourado-'+i});
  destinos.push(ev.venda.destinoCofre);
 }
 assert.deepEqual(destinos,[
  'LOOP_DOURADAS','LOOP_ESQUERDA','LOOP_DOURADAS',
  'LOOP_DIREITA','LOOP_DOURADAS','LOOP_ESQUERDA'
 ]);
 assert.equal(cofreDoEvento({posicaoCentro:loop.tabuleiro.centro,ordem:3}),'LOOP_DOURADAS');
});

test('posicao ativa que entra na vaga 6 nao vira dourada',()=>{
 const loop=criar();
 for(let i=1;i<=8;i++)criarCompra(loop,i,false);
 loop.prepararTabuleiro();
 const chegada=fecharCiclo(loop,'ciclo-ativo');
 assert.equal(chegada.estado.vagas[5].id,8);
 assert.equal(chegada.estado.vagas[5].statusAdesao,undefined);
 assert.equal(chegada.estado.vagas[5].empresa,undefined);
 assert.equal(chegada.estado.vagas[5].prazoEncerradoEm,undefined);
 assert.ok(chegada.estado.vagas[5].entradaPelaVaga6Em);
});

test('montagem inicial tambem registra a passagem logica pela vaga 6',()=>{
 const loop=criar();
 criarCompra(loop,1,true);
 criarCompra(loop,2,false);
 const antes=[...loop.filas.filaB];
 assert.equal(antes[0].statusAdesao,'PENDENTE');
 assert.equal(antes[0].entradaPelaVaga6Em,undefined);
 loop.prepararTabuleiro();
 assert.equal(loop.tabuleiro.centro.id,1);
 assert.equal(loop.tabuleiro.centro.empresa,true);
 assert.equal(loop.tabuleiro.centro.entradaPelaVaga6Em,loop.tabuleiro.centro.prazoEncerradoEm);
 assert.equal(loop.tabuleiro.vagas[0].id,2);
 assert.equal(loop.tabuleiro.vagas[0].empresa,undefined);
 assert.ok(loop.tabuleiro.vagas[0].entradaPelaVaga6Em);
 const restaurado=SimuladorLoop.restaurarSnapshot(loop.exportarSnapshot());
 assert.equal(restaurado.tabuleiro.centro.entradaPelaVaga6Em,loop.tabuleiro.centro.entradaPelaVaga6Em);
 assert.equal(restaurado.tabuleiro.centro.empresa,true);
});
