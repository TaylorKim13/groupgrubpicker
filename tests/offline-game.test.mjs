import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('offline game scores food, ends after 30 seconds and can restart',async()=>{
 const elements=Object.fromEntries(['board','start','status','score','time'].map(id=>[id,{textContent:'',append(){}}]));
 const buttons=[];const timers=[];let now=0;
 vm.runInNewContext(await readFile(new URL('../public/offline-game.js',import.meta.url),'utf8'),{document:{getElementById:id=>elements[id],createElement:()=>{const b={setAttribute(){}};buttons.push(b);return b;}},Math:{...Math,random:()=>.5,floor:Math.floor,max:Math.max,ceil:Math.ceil},Date:{now:()=>now},setInterval:fn=>{timers.push(fn);return timers.length;},clearInterval(){}});
 assert.equal(buttons.length,9);elements.start.onclick();assert.equal(elements.start.disabled,true);
 assert.equal(buttons[4].textContent, '\u{1F363}');
 assert.equal(buttons[0].textContent, '\u00b7');
 buttons[4].onclick();assert.equal(elements.score.textContent,'Score: 1');
 now=30000;timers.at(-1)();assert.equal(elements.start.disabled,false);assert.ok(buttons.every(b=>b.disabled));
 elements.start.onclick();assert.equal(elements.score.textContent,'Score: 0');
});
