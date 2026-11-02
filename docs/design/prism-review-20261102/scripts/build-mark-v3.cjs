/** Build review-only melody marks and optical-size PNGs. Run: node scripts/build-mark-v3.cjs */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'assets/marks-v3');
// A continuous open melody curve: outer arc, inner negative-space loop and upper hook.
const curve = 'M8.3 5.0 C5.0 6.4 3.0 9.6 3.6 13.4 C4.2 17.3 7.5 20.2 11.6 20.2 C16.2 20.2 19.7 16.8 19.7 12.5 C19.7 9.1 17.1 6.9 14.4 7.3 C11.4 6.8 9.0 8.6 9.0 11.4 C9.0 13.4 10.2 14.8 11.6 14.8 C13.3 14.8 14.0 13.2 13.2 11.3 L10.9 5.2 C10.0 2.7 12.5 1.5 14.5 2.9';
const defs = '<defs><linearGradient id="mapleBlue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#bd3d4b"/><stop offset=".52" stop-color="#9c4d77"/><stop offset="1" stop-color="#4a679e"/></linearGradient></defs>';
const svg = (paint, width) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${defs}<path d="${curve}" fill="none" stroke="${paint}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
(async () => {
 await fs.mkdir(dir, {recursive:true});
 const outputs = [];
 for (const [name,paint] of [['interface','url(#mapleBlue)'],['compact-color','#b43b4c'],['compact-white','#ffffff'],['compact-black','#000000']]) {
  await fs.writeFile(path.join(dir,name+'.svg'),svg(paint,name==='interface'?2.05:2.5));
 }
 for (const [kind,paint] of [['color','#b43b4c'],['white','#ffffff'],['black','#000000']]) {
  for (const size of [16,18,20,24,32]) {
   const width = size<=18?2.65:size<=20?2.55:size<=24?2.5:2.4;
   const source=svg(paint,width);
   const name=`${kind}-${size}`;
   await fs.writeFile(path.join(dir,name+'.svg'),source);
   await sharp(Buffer.from(source)).resize(size,size).png().toFile(path.join(dir,name+'.png'));
   const {data,info}=await sharp(path.join(dir,name+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   if(info.width!==size || info.height!==size || data[3]!==0) throw Error('Invalid icon export '+name);
   outputs.push({name,width:info.width,height:info.height,cornerAlpha:data[3]});
  }
 }
 await fs.writeFile(path.join(root,'marks-validation-v3.json'),JSON.stringify({curve,outputs,note:'Review exports only; platform tray integration not tested.'},null,2));
 console.log('4 shared-family SVG masters; 15 optical-size transparent PNGs verified.');
})().catch(e=>{console.error(e);process.exitCode=1});
