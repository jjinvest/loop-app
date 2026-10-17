'use strict';

// Material PDF REALMENTE BAIXAVEL, porem APENAS COMO FIXTURE DO LABORATORIO.
// Este arquivo NAO contem um curso de verdade e NAO usa uploads de clientes.
// Nao requer armazenamento, biblioteca ou fornecedor. O conteudo e estatico.
function criarMaterialPDFTeste(){
  const conteudo='BT\n/F1 21 Tf\n50 770 Td\n(LOOP - MATERIAL DE TESTE) Tj\n0 -36 Td\n/F1 12 Tf\n(Este PDF comprova apenas o download no laboratorio.) Tj\n0 -23 Td\n(Nao e um curso vendido. Nao houve cobranca real.) Tj\n0 -23 Td\n(O acesso de clientes sera desenvolvido separadamente.) Tj\nET\n';
  const objetos=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length '+Buffer.byteLength(conteudo,'ascii')+' >>\nstream\n'+conteudo+'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let documento='%PDF-1.4\n%LOOP-FIXTURE-LABORATORIO\n';
  const posicoes=[0];
  for(let i=0;i<objetos.length;i++){
    posicoes.push(Buffer.byteLength(documento,'ascii'));
    documento+=(i+1)+' 0 obj\n'+objetos[i]+'\nendobj\n';
  }
  const xref=Buffer.byteLength(documento,'ascii');
  documento+='xref\n0 '+(objetos.length+1)+'\n0000000000 65535 f \n';
  for(const pos of posicoes.slice(1)){
    documento+=String(pos).padStart(10,'0')+' 00000 n \n';
  }
  documento+='trailer\n<< /Size '+(objetos.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return Buffer.from(documento,'ascii');
}
module.exports={criarMaterialPDFTeste};
