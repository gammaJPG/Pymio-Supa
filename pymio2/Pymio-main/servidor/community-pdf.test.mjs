import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {zipFiles} from './red-pymio.mjs';
import {consolidatedFilesPdf,docxText,fileFooterLabel} from './community-pdf.mjs';

const response=(id,name)=>({id,company_id:id==='r1'?1:2,name,submitted_at:'2026-10-20'});
const answer=(fileName)=>({file_name:fileName});

test('PDF consolidado: convierte archivos y los identifica en el pie de cada página',async()=>{
  const docx=zipFiles([
    {name:'[Content_Types].xml',body:Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')},
    {name:'_rels/.rels',body:Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')},
    {name:'word/document.xml',body:Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hola &amp; adiós</w:t></w:r></w:p><w:p><w:r><w:t>Segunda línea</w:t></w:r></w:p></w:body></w:document>')},
  ]);
  assert.match(docxText(docx),/Hola & adiós\nSegunda línea/);
  assert.equal(fileFooterLabel(1,'Ana'),'Archivo 1 (Usuario: Ana)');
  assert.equal(fileFooterLabel(2,'Luis'),'Archivo 2 (Usuario: Luis)');
  const webp=await sharp({create:{width:80,height:40,channels:3,background:'#f2cd48'}}).webp().toBuffer();
  const pdf=await consolidatedFilesPdf({position:1,title:'Adjunta evidencia'},[
    {response:response('r1','Ana'),answer:answer('respuesta.docx'),body:docx},
    {response:response('r2','Luis'),answer:answer('imagen.webp'),body:webp},
  ]);
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const consolidated=await PDFDocument.load(pdf);
  assert.equal(consolidated.getPageCount(),2);
  assert.equal(consolidated.getPages().length,2);
});
