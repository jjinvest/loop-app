'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validar,MAX_VIDEO}=require('../src/domain/akitemm-midia-avaliacoes-demo');
const {gerarPngTeste}=require('../scripts/fixtures/gerar-png-teste');
function box(tipo,dados){
 const r=Buffer.alloc(8);r.writeUInt32BE(dados.length+8,0);r.write(tipo,4,4,'ascii');
 return Buffer.concat([r,dados]);
}
function mp4Segundos(segundos){
 const ftyp=box('ftyp',Buffer.from('isom0000iso2','ascii'));
 const mvhd=Buffer.alloc(20);mvhd.writeUInt32BE(1000,12);
 mvhd.writeUInt32BE(Math.round(segundos*1000),16);
 const hdlr=Buffer.alloc(12);hdlr.write('vide',8,4,'ascii');
 const mdia=box('mdia',box('hdlr',hdlr));
 const moov=box('moov',Buffer.concat([box('mvhd',mvhd),box('trak',mdia)]));
 return Buffer.concat([ftyp,moov,box('mdat',Buffer.alloc(2048,0x55))]);
}
function jpegComGps(){
 const app=Buffer.from('Exif\u0000\u0000GPS_LOCALIZACAO', 'utf8');
 const app1=Buffer.alloc(4);app1[0]=255;app1[1]=225;app1.writeUInt16BE(app.length+2,2);
 const sof=Buffer.from([255,192,0,11,8,0,2,0,2,1,1,17,0]);
 const sos=Buffer.from([255,218,0,8,1,1,0,0,63,0]);
 return Buffer.concat([Buffer.from([255,216]),app1,app,sof,sos,Buffer.alloc(200,0x5A),Buffer.from([255,217])]);
}
test('AKITEMM: 30 segundos MP4 permitidos; 30.1 segundos bloqueados no servidor',()=>{
 const trinta=validar({tipo:'VIDEO',mime:'video/mp4',dados:mp4Segundos(30)});
 assert.equal(trinta.duracaoSegundos,30);
 assert.equal(trinta.dados.length>1024,true);
 assert.throws(()=>validar({tipo:'VIDEO',mime:'video/mp4',dados:mp4Segundos(30.1)}),
  /VIDEO_DURACAO_INVALIDA/);
 assert.throws(()=>validar({tipo:'VIDEO',mime:'video/mp4',dados:Buffer.alloc(1200)}),
  /VIDEO_INVALIDO/);
 assert.throws(()=>validar({tipo:'VIDEO',mime:'video/mp4',dados:Buffer.alloc(MAX_VIDEO+1)}),
  /VIDEO_GRANDE_DEMAIS/);
});
test('AKITEMM: foto JPEG aceita e localização EXIF nunca é persistida',()=>{
 const original=jpegComGps();
 const limpa=validar({tipo:'FOTO',mime:'image/jpeg',dados:original});
 assert.ok(original.includes(Buffer.from('GPS_LOCALIZACAO')));
 assert.ok(!limpa.dados.includes(Buffer.from('GPS_LOCALIZACAO')));
 assert.equal(limpa.mime,'image/jpeg');
 assert.throws(()=>validar({tipo:'FOTO',mime:'image/svg+xml',dados:original}),
  /TIPO_MIDIA_NAO_PERMITIDO/);
});
test('AKITEMM: imagem PNG mínima aceita; tipo declarado não engana assinatura do arquivo',()=>{
 const png=gerarPngTeste();
 const x=validar({tipo:'FOTO',mime:'image/png',dados:png});
 assert.ok(x.dados.length>50);
 const corrompido=Buffer.from(png);corrompido[corrompido.length-20]^=1;
 assert.throws(()=>validar({tipo:'FOTO',mime:'image/png',dados:corrompido}),/FOTO_INVALIDA/);
 assert.throws(()=>validar({tipo:'FOTO',mime:'image/png',dados:jpegComGps()}),
  /FOTO_INVALIDA/);
});
