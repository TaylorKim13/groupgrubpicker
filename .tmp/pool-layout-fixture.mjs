import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
const label = process.argv[2];
const source = readFileSync('src/routes/room.$code.tsx', 'utf8');
const ast = ts.createSourceFile('room.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const poolFunction = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Pool');
const compiled = ts.transpileModule(poolFunction.getText(ast), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const candidates = [
  {id:'long',name:'The Restaurant With An Exceptionally Long Name and Neighborhood',cuisine:'American',address:'1234 An Extremely Long Street Name, Suite 200, Provo, Utah',price:2},
  {id:'unbroken',name:'RestaurantWithAVeryLongUnbrokenNameThatMustFitOnMobile',cuisine:'Mediterranean',address:'456 Another Very Long Street Name, Orem, Utah',price:2},
  {id:'short',name:'Cafe',cuisine:'Cafe',price:1},
];
let stateIndex=0;
const noop=()=>{};
const Button=({children,variant,size,...props})=>React.createElement('button',{...props,className:'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold '+(size==='sm'?'h-8 px-3 text-xs':'h-10 px-4 py-2')},children);
const context = {exports:{},require:()=>jsx,useSelectionTracking:noop,useServerFn:(fn)=>fn,castVote:noop,startVoting:noop,closeVoting:noop,searchPlaces:noop,removeRestaurantFromPool:noop,useState:(initial)=>React.useState(stateIndex++===7?candidates:initial),useEffect:noop,useMemo:React.useMemo,useRestaurantDeals:()=>new Map(),Button,priceLabel:()=>'$15–30',RestaurantMap:()=>React.createElement('div',{className:'h-full w-full'},'Map preview'),toast:{success:noop,error:noop}};
context.Onboarding=()=>null;
context.hasRewardMatch=()=>false;
context.RestaurantCard=({r})=>React.createElement('article',{className:'min-h-48 rounded-xl border p-4'},r.name);
vm.runInNewContext(compiled+'\nexports.Pool=Pool;',context);
const markup=renderToStaticMarkup(React.createElement('main',{className:'mx-auto max-w-2xl px-5 py-8'},React.createElement('div',{className:'mt-6 space-y-6'},React.createElement(context.exports.Pool,{requestedRestaurant:null,setupFlow:true,onCreateRoom:noop,s:{status:'lobby',members:[],me:{isHost:true},pool:candidates.slice(0,2),candidates,settings:{center:{lat:40,lng:-111},radiusKm:5}},session:{},refresh:noop,rewardRestaurants:[],addRestaurant:noop,suggestionsPanel:null}))));
const cssFile=readdirSync('.output/public/assets').find(file=>file.endsWith('.css')&&file.startsWith('styles-'));
if(!cssFile)throw Error('Built stylesheet not found');
const css=readFileSync('.output/public/assets/'+cssFile,'utf8');
let finalMarkup=markup;
if(label==='voting'){
  stateIndex=0;
  finalMarkup=renderToStaticMarkup(React.createElement('main',{className:'mx-auto max-w-2xl px-5 py-8'},React.createElement('div',{className:'space-y-6'},React.createElement(context.exports.Pool,{requestedRestaurant:null,setupFlow:false,onCreateRoom:noop,s:{status:'voting',members:[{voted:true}],me:{isHost:true},pool:candidates,candidates,settings:{center:{lat:40,lng:-111},radiusKm:5}},session:{},refresh:noop,rewardRestaurants:[],addRestaurant:noop,suggestionsPanel:null}))));
}
writeFileSync('.tmp/pool-'+label+'.html','<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body>'+finalMarkup+'</body></html>');
console.log('Rendered actual Pool component:',label);
