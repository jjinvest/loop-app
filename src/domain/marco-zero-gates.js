'use strict';
// Fonte unica dos seis gates externos. Nao habilitar por variaveis de ambiente
// ou por uma contagem de testes: evidencias externas exigem aprovacao humana.
const GATES_EXTERNOS=Object.freeze([
 Object.freeze({id:'CI_HEAD_ATUAL',descricao:'CI integral e navegador no codigo que sera publicado'}),
 Object.freeze({id:'ASAAS_REMOTO',descricao:'Checkout e callbacks recebidos do Asaas em ambiente remoto homologado'}),
 Object.freeze({id:'BANCO_E_SAQUES',descricao:'Conferencia independente de recebimentos, cofres e saques bancarios'}),
 Object.freeze({id:'PRODUCAO_E_SEGURANCA',descricao:'Servidor publico, backups testados, monitoramento e revisao de seguranca'}),
 Object.freeze({id:'ESCRITORIO_VISUAL',descricao:'Checkout visual final do proprietario em celular e computador'}),
 Object.freeze({id:'JURIDICO',descricao:'Parecer juridico independente sobre modelo, contratos, publicidade e dados pessoais'})
]);
const IDS_GATE_EXTERNO=Object.freeze(GATES_EXTERNOS.map(g=>g.id));
module.exports={GATES_EXTERNOS,IDS_GATE_EXTERNO};
