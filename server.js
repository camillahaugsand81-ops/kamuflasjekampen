import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
const app=express(),server=createServer(app),io=new Server(server,{maxHttpBufferSize:2e6});app.use(express.static('public'));
const rooms=new Map();const paintings=['starry','scream','lilies','kiss'];
const players=r=>Object.values(r.players);
function state(r){io.to(r.code).emit('state',{code:r.code,phase:r.phase,round:r.round,painting:r.painting,players:players(r).map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,score:p.score,found:p.found,art:p.art,ready:p.ready})),host:r.host,ends:r.ends});}
function finish(r){if(r.timer)clearTimeout(r.timer);r.phase='results';r.ends=null;players(r).forEach(p=>{if(!p.found)p.score+=3});state(r)}
function hunt(r){r.phase='hunt';r.ends=Date.now()+60000;state(r);r.timer=setTimeout(()=>finish(r),60000)}
function advance(r){if(r.timer)clearTimeout(r.timer);r.round++;r.phase='paint';r.ends=Date.now()+150000;players(r).forEach(p=>{p.found=false;p.ready=false;p.art=null;p.x=.5;p.y=.5});state(r);r.timer=setTimeout(()=>hunt(r),150000)}
function ackSafe(ack,v){if(typeof ack==='function')ack(v)}
io.on('connection',s=>{
 s.on('join',(data={},ack)=>{let name=String(data.name||'').trim().slice(0,20),code=String(data.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);if(!name)return ackSafe(ack,{error:'Skriv et kallenavn'});if(data.create){do{code=Math.random().toString(36).slice(2,7).toUpperCase()}while(rooms.has(code));rooms.set(code,{code,host:s.id,phase:'lobby',round:0,painting:'starry',players:{},ends:null})}const r=rooms.get(code);if(!r)return ackSafe(ack,{error:'Fant ikke rommet'});if(!['lobby','results'].includes(r.phase))return ackSafe(ack,{error:'En runde er i gang'});if(players(r).length>=30)return ackSafe(ack,{error:'Rommet er fullt'});r.players[s.id]={id:s.id,name,x:.5,y:.5,score:0,found:false,ready:false,art:null};s.join(code);s.data.code=code;ackSafe(ack,{code,id:s.id});state(r)});
 s.on('painting',id=>{let r=rooms.get(s.data.code);if(r&&r.host===s.id&&['lobby','results'].includes(r.phase)&&paintings.includes(id)){r.painting=id;state(r)}});
 s.on('start',()=>{let r=rooms.get(s.data.code);if(r&&r.host===s.id&&['lobby','results'].includes(r.phase)&&players(r).length>=2)advance(r)});
 s.on('place',({x,y}={})=>{let r=rooms.get(s.data.code),p=r?.players[s.id];if(!p||r.phase!=='paint'||p.ready)return;p.x=Math.max(.04,Math.min(.96,Number(x)||.5));p.y=Math.max(.07,Math.min(.93,Number(y)||.5));state(r)});
 s.on('submit',({art,x,y}={})=>{let r=rooms.get(s.data.code),p=r?.players[s.id];if(!p||r.phase!=='paint'||p.ready)return;if(typeof art!=='string'||art.length>130000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(art))return;p.art=art;p.x=Math.max(.04,Math.min(.96,Number(x)||.5));p.y=Math.max(.07,Math.min(.93,Number(y)||.5));p.ready=true;state(r);if(players(r).every(q=>q.ready)){clearTimeout(r.timer);hunt(r)}});
 s.on('find',({id,x,y}={})=>{let r=rooms.get(s.data.code),p=r?.players[s.id],target=r?.players[id];if(r?.phase!=='hunt'||!p||!target||id===s.id||target.found)return;let dx=Number(x)-target.x,dy=Number(y)-target.y;if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)>0.065)return;target.found=true;p.score+=2;state(r);if(players(r).every(q=>q.found)){finish(r)}});
 s.on('disconnect',()=>{let r=rooms.get(s.data.code);if(!r)return;delete r.players[s.id];if(!players(r).length){clearTimeout(r.timer);rooms.delete(r.code);return}if(r.host===s.id)r.host=players(r)[0].id;state(r)})
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Kamuflasjekampen kjører'));
