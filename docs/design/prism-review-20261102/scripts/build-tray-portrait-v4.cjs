/** Render review-only portrait tray variants. Run after saving template-source.png in assets/tray-portrait-v4/. */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'assets/tray-portrait-v4');
(async()=>{
 await fs.mkdir(dir,{recursive:true});
 const color=await fs.readFile(path.join(root,'assets/app-icon-maple-rounded-v12.png'));
 await fs.writeFile(path.join(dir,'color.png'),color);
 const source=await fs.readFile(path.join(dir,'template-source.png'));
 const {width,height}=await sharp(source).metadata();
 const outputs=[];
 const svgSources={color:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><defs><clipPath id="round"><rect width="${width}" height="${height}" rx="${width*0.22}"/></clipPath></defs><image href="data:image/png;base64,${color.toString('base64')}" width="${width}" height="${height}" clip-path="url(#round)"/></svg>`};
 for(const [kind,paint] of [['white','#ffffff'],['black','#000000']]){
  // One luminance-and-alpha stencil drives both inks, ensuring exactly matching geometry.
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><defs><clipPath id="round"><rect width="${width}" height="${height}" rx="${width*0.22}"/></clipPath><filter id="ink" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="-1.5" intercept="1.35"/><feFuncG type="linear" slope="-1.5" intercept="1.35"/><feFuncB type="linear" slope="-1.5" intercept="1.35"/></feComponentTransfer></filter><mask id="portrait" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:luminance"><image filter="url(#ink)" href="data:image/png;base64,${source.toString('base64')}" width="${width}" height="${height}"/></mask></defs><rect width="${width}" height="${height}" fill="${paint}" mask="url(#portrait)" clip-path="url(#round)"/></svg>`;
  svgSources[kind]=svg;
  await fs.writeFile(path.join(dir,kind+'.svg'),svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(dir,kind+'.png'));
 }
 for(const size of [16,20,24,32]){
  const alphas={};
  for(const kind of ['color','white','black']){
   const out=path.join(dir,`${kind}-${size}.png`);
   const native=svgSources[kind].replace(`width="${width}" height="${height}"`,`width="${size}" height="${size}"`);
   await sharp(Buffer.from(native)).png().toFile(out);
   const {data,info}=await sharp(out).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   if(info.width!==size||info.height!==size||data[3]!==0)throw Error('Invalid export '+out);
   const alpha=Buffer.alloc(size*size);let ink=0;
   for(let i=0;i<size*size;i++){
    alpha[i]=data[i*4+3];ink+=alpha[i]/255;
    if(kind!=='color'&&alpha[i]>0){
     const target=kind==='white'?255:0;
     const rgb=[data[i*4],data[i*4+1],data[i*4+2]];
     if(rgb.some(v=>Math.abs(v-target)>1)||rgb[0]!==rgb[1]||rgb[1]!==rgb[2])throw Error('Non-template color '+out);
    }
   }
   alphas[kind]=alpha;
   outputs.push({kind,size,cornerAlpha:data[3],inkCoverage:+(ink/(size*size)).toFixed(3)});
  }
  if(!alphas.white.equals(alphas.black))throw Error('Template silhouettes differ at '+size);
 }
 const matches03=crypto.createHash('sha256').update(color).digest('hex')===crypto.createHash('sha256').update(await fs.readFile(path.join(dir,'color.png'))).digest('hex');
 const report={colorMatches03:matches03,templateGeometry:'white and black share one SVG mask; alpha verified identical at all four sizes',outputs,scope:'review only; actual OS tray untested'};
 await fs.writeFile(path.join(root,'tray-portrait-validation-v4.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
