'use strict';
// Imagens pequenas e decodificáveis para testes. NUNCA entram no catálogo real.
const {deflateSync}=require('node:zlib');
function crc32(bytes){
 let c=0xffffffff;
 for(const v of bytes){
  c^=v;
  for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
 }
 return (c^0xffffffff)>>>0;
}
function bloco(nome,conteudo){
 const tipo=Buffer.from(nome,'ascii');
 const len=Buffer.alloc(4);len.writeUInt32BE(conteudo.length);
 const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([tipo,conteudo])));
 return Buffer.concat([len,tipo,conteudo,crc]);
}
function gerarPngTeste(r=45,g=105,b=155){
 const w=96,h=78,p=Buffer.alloc((w*3+1)*h);
 for(let y=0;y<h;y++){
  const inicio=y*(w*3+1);p[inicio]=0;
  for(let x=0;x<w;x++){
   const j=inicio+1+x*3;
   const borda=x<3||y<3||x>=w-3||y>=h-3;
   const faixa=(x+y)%27<=2;
   p[j]=borda?240:faixa?205:r;
   p[j+1]=borda?205:faixa?183:g;
   p[j+2]=borda?135:faixa?120:b;
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);
 ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  bloco('IHDR',ihdr),bloco('IDAT',deflateSync(p)),bloco('IEND',Buffer.alloc(0))
 ]);
}
module.exports={gerarPngTeste,crc32};
