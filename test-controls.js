/* Offline VM tests only. No network, agents or world entities. */
"use strict";
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const CHANNEL = "shufflizer.dj.control.v1";
function signal() {
    const handlers = new Set();
    return { connect: f => handlers.add(f), disconnect: f => handlers.delete(f),
        emit: (...args) => [...handlers].forEach(f => f(...args)), handlers };
}
let now = 100000, next = 1, edits = {}, deliveries = [], clients = [];
const timers = new Map(), bus = [];
function clock(ms) {
    const end = now + ms;
    for (;;) {
        let found = null;
        for (const [id,t] of timers) if (t.at <= end && (!found || t.at < found[1].at)) found = [id,t];
        if (!found) break;
        const [id,t] = found; now = t.at;
        if (t.every) t.at += t.every; else timers.delete(id);
        t.fn();
    }
    now = end;
}
function env(sender) {
    const message = signal(), update = signal(), ending = signal();
    const subscriptions = new Set();
    const e = {
        print: () => {}, Math, JSON, isFinite,
        Date: { now: () => now },
        Agent: { sessionUUID: sender },
        Avatar: {},
        Messages: {
            subscribe: c => subscriptions.add(c),
            unsubscribe: c => subscriptions.delete(c),
            messageReceived: message,
            sendMessage: (c,text,local) => {
                deliveries.push({sender,c,m:JSON.parse(text),local});
                bus.push([c,text,sender,local]);
            }
        },
        Script: { update, scriptEnding: ending,
            setTimeout: (fn,ms) => { const id=next++; timers.set(id,{fn,at:now+ms}); return id; },
            setInterval: (fn,ms) => { const id=next++; timers.set(id,{fn,at:now+ms,every:ms}); return id; },
            clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id)
        },
        Entities: { editEntity: (id,p) => { edits[id] = p; } },
        subscriptions
    };
    clients.push(e);
    return e;
}
function flush() {
    let count = 0;
    while (bus.length) {
        assert(++count < 1000, "message loop");
        const [c,t,s,l] = bus.shift();
        clients.forEach(e => { if (e.subscriptions.has(c)) e.Messages.messageReceived.emit(c,t,s,l); });
    }
}
function load(file,e) { return vm.runInNewContext(fs.readFileSync(file,"utf8"),e,{filename:file}); }
function command(m,sender="visitor") {
    const text=JSON.stringify(Object.assign({v:1,target:"shufflizer-dj"},m));
    agent.Messages.messageReceived.emit(CHANNEL,text,sender,false);
    flush();
}
function state() {
    return deliveries.filter(d => d.sender === "agent" && d.m.type === "state").slice(-1)[0].m;
}
const agent=env("agent");
load("shufflizer-dj.js",agent);
assert.strictEqual(agent.Agent.isAvatar,true);
assert.strictEqual(agent.Avatar.skeletonModelURL,undefined);
clock(4999); assert.strictEqual(agent.Avatar.skeletonModelURL,undefined);
clock(1); flush();
assert.strictEqual(agent.Avatar.skeletonModelURL,"https://files.vr.darkride.ai/judas/highduryteeth.fst");
assert.strictEqual(state().walking,false);
assert.strictEqual(state().soundRequested,false);
const interfaceEnv=env("visitor");
const walkFactory=load("shufflizer-walk.js",interfaceEnv);
const soundFactory=load("shufflizer-sound.js",interfaceEnv);
const walk=new walkFactory(), sound=new soundFactory();
walk.preload("walk"); sound.preload("sound"); flush();
assert(edits.walk.name.includes("OFF"));
assert(edits.sound.name.includes("AUDIO UNSUPPORTED"));
walk.mousePressOnEntity("walk",{isPrimaryButton:false}); flush();
assert.strictEqual(state().walking,false);
walk.mousePressOnEntity("walk",{isPrimaryButton:true}); flush();
assert.strictEqual(state().walking,true);
const request=deliveries.filter(d=>d.m.type==="toggle").slice(-1)[0].m;
command(request); assert.strictEqual(state().walking,true,"duplicate must not toggle again");
const home={x:5001.03,y:5015.66,z:5008.53};
let previous={...agent.Avatar.position}, moved=false;
for(let i=0;i<24000;i++) {
    agent.Script.update.emit(1/60);
    const p=agent.Avatar.position;
    assert(Math.hypot(p.x-home.x,p.z-home.z)<=5.000001);
    assert.strictEqual(p.y,home.y);
    const step=Math.hypot(p.x-previous.x,p.z-previous.z);
    assert(step<=0.35/60+1e-8);
    moved=moved||step>0; previous={...p};
}
assert(moved,"walking must move");
clock(350); flush();
walk.mousePressOnEntity("walk",{isPrimaryButton:true}); flush();
assert.strictEqual(state().walking,false);
const stopped=JSON.stringify(agent.Avatar.position);
for(let i=0;i<100;i++) agent.Script.update.emit(0.1);
assert.strictEqual(JSON.stringify(agent.Avatar.position),stopped,"OFF stops immediately");
sound.mousePressOnEntity("sound",{isPrimaryButton:true}); flush();
assert.strictEqual(state().soundRequested,true);
assert.strictEqual(state().audioPlaying,false);
assert.strictEqual(state().audioStatus,"unsupported");
assert(edits.sound.name.includes("REQUEST"));
command({type:"toggle",control:"bogus",requestId:"bad"});
command({type:"toggle",control:"walk"});
agent.Messages.messageReceived.emit(CHANNEL,"{invalid","visitor",false);
assert.strictEqual(state().walking,false);
clock(350); flush();
sound.mousePressOnEntity("sound",{isPrimaryButton:true}); flush();
assert.strictEqual(state().soundRequested,false);
walk.unload();
assert(interfaceEnv.subscriptions.has(CHANNEL),"unloading WALK must preserve SOUND subscription");
command({type:"toggle",control:"sound",requestId:"after-walk-unload"});
assert(edits.sound.name.includes("ON"));
agent.Script.scriptEnding.emit(); flush();
clock(7000); flush();
const before=deliveries.filter(d=>d.m.type==="toggle").length;
sound.mousePressOnEntity("sound",{isPrimaryButton:true}); flush();
assert.strictEqual(deliveries.filter(d=>d.m.type==="toggle").length,before,"offline clicks blocked");
sound.unload();
assert.strictEqual(interfaceEnv.Messages.messageReceived.handlers.size,0);
assert.strictEqual(agent.Messages.messageReceived.handlers.size,0);
assert.strictEqual(timers.size,0,"all timers cleaned up");
console.log("PASS: delayed model, click/state protocol, deduplication, bounded motion, immediate OFF, sound request, malformed messages, shared subscription and cleanup");
