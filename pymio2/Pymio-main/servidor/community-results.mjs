import {inflateRawSync} from 'node:zlib';
import {consolidatedFilesPdf} from './community-pdf.mjs';

export const safeComponent=value=>String(value||'Sin nombre').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,180)||'Sin nombre';
export const safeQuestionComponent=value=>String(value||'Sin nombre').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'').slice(0,180)||'Sin nombre';
export function summarize({form,responses}){
  const total=responses.length;
  return {total,questions:form.questions.filter(q=>q.type==='select').map(q=>({id:q.id,title:q.title,position:q.position,options:[...new Set(q.options)].map(option=>{
    const count=responses.filter(r=>(r.answers||[]).some(a=>a.question_id===q.id&&a.option_value===option)).length;
    return {option,count,percentage:total?Math.round(count/total*10000)/100:0};
  })}))};
}
function resultTable(result){
  const headers=['Opción','Cantidad de usuarios','Porcentaje del total'];
  const rows=result.options.map(item=>[String(item.option).replace(/\s+/g,' ').trim(),String(item.count),`${item.percentage.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:2})} %`]);
  const widths=headers.map((header,index)=>Math.max(header.length,...rows.map(row=>row[index].length)));
  const row=values=>`| ${values.map((value,index)=>value.padEnd(widths[index])).join(' | ')} |`;
  const separator=`|-${widths.map(width=>'-'.repeat(width)).join('-|-')}-|`;
  return [row(headers),separator,...rows.map(row)].join('\r\n');
}
function textResponses(question,responses){
  const lines=[`Pregunta ${question.position} - ${question.title}`,`Total de participantes: ${responses.length}`,''];
  if(!responses.length)lines.push('Sin respuestas.');
  responses.forEach((response,index)=>{
    const answer=response.answers?.find(item=>item.question_id===question.id);
    lines.push(
      '='.repeat(72),
      `INICIO DE RESPUESTA ${index+1}`,
      `Usuario: ${response.name}`,
      '',
      'Texto:',
      ...String(answer?.text_value||'Sin respuesta').split(/\r?\n/),
      '',
      `FIN DE RESPUESTA ${index+1}`,
      '='.repeat(72),
      ''
    );
  });
  return lines.join('\r\n');
}
export async function exportResponses(data,pool,zip){
  const {form,responses}=data,summary=summarize(data),files=[];
  for(const q of [...form.questions].sort((a,b)=>a.position-b.position)){
    const folder=`Pregunta ${q.position} - ${safeQuestionComponent(q.title)}`;
    files.push({name:folder+'/',body:Buffer.alloc(0)});
    if(q.type==='select'){
      const result=summary.questions.find(item=>item.id===q.id);
      files.push({name:folder+'/Resultados.txt',body:Buffer.from([`Pregunta ${q.position} - ${q.title}`,`Total de participantes: ${summary.total}`,'Cada porcentaje se calcula sobre el total de participantes.','',resultTable(result)].join('\r\n'))});
    }else if(q.type==='text'){
      files.push({name:folder+'/Respuestas.txt',body:Buffer.from(textResponses(q,responses))});
    }else{
      const attachments=[];
      for(const r of responses){
        const a=r.answers?.find(a=>a.question_id===q.id);if(!a?.file_path)continue;
        const stored=await pool.getCommunityFile(a.file_path),body=a.compressed?inflateRawSync(stored):stored,extension=String(a.file_name||'').match(/\.(docx|txt|pdf|jpg|png|webp|heic|heif)$/i)?.[0].toLowerCase()||'';
        files.push({name:`${folder}/Respuesta a Pregunta ${q.position} - ${safeComponent(r.name).slice(0,100)}${extension}`,body});
        attachments.push({response:r,answer:a,body});
      }
      files.push({name:`${folder}/Respuestas consolidadas.pdf`,body:await consolidatedFilesPdf(q,attachments)});
    }
  }
  return zip(files);
}
