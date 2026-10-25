/* Client-entity constructor expression: assign URL to entity.script, not serverScripts. */
(function () {
    "use strict";
    var CONTROL = "walk", LABEL = "WALK";
    var CHANNEL = "shufflizer.dj.control.v1";
    // Optional: pin to the replacement DJ's Agent.sessionUUID after deployment.
    var EXPECTED_AGENT = "";
    var id = null, agent = "", lastSeen = 0, revision = -1, pending = null;
    var sequence = 0, timer = null, active = false, lastClick = 0, canControl = false, conflictUntil = 0;
    var nonce = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    function send(m) {
        m.v = 1; m.target = "shufflizer-dj";
        Messages.sendMessage(CHANNEL, JSON.stringify(m), false);
    }
    function paint(name, color) {
        // Requires entity edit permission. Controls still send commands if edits are denied.
        Entities.editEntity(id, { name: LABEL + " — " + name, color: color });
    }
    function unknown() { canControl = false; paint("NO AGENT", { red: 110, green: 110, blue: 110 }); }
    function receive(channel, text, sender, localOnly) {
        if (!active || channel !== CHANNEL || localOnly || text.length > 4096) return;
        var m;
        try { m = JSON.parse(text); } catch (e) { return; }
        if (!m || m.v !== 1 || m.target !== "shufflizer-dj" || m.type !== "state" ||
                typeof m.session !== "string" || m.session !== String(sender) ||
                (EXPECTED_AGENT && m.session !== EXPECTED_AGENT) ||
                typeof m.revision !== "number" || !isFinite(m.revision) ||
                typeof m.ready !== "boolean" || typeof m.walking !== "boolean" ||
                typeof m.soundRequested !== "boolean" || m.audioPlaying !== false) return;
        if (agent && agent !== m.session && Date.now() - lastSeen < 6500) {
            pending = null; canControl = false; conflictUntil = Date.now() + 6500;
            paint("MULTIPLE AGENTS", { red: 255, green: 0, blue: 0 });
            return;
        }
        if (agent !== m.session) { agent = m.session; revision = -1; pending = null; }
        if (m.revision < revision) return;
        revision = m.revision; lastSeen = Date.now();
        if (Date.now() < conflictUntil) return;
        if (pending && m.requestId === pending.requestId) pending = null;
        if (!m.ready) { unknown(); return; }
        canControl = true;
        var on = CONTROL === "walk" ? m.walking : m.soundRequested;
        var label = on ? "ON" : "OFF";
        if (CONTROL === "sound") label += " (REQUEST; AUDIO UNSUPPORTED)";
        paint(label, on ? (CONTROL === "walk" ?
            { red: 40, green: 210, blue: 80 } : { red: 245, green: 170, blue: 30 }) :
            { red: 160, green: 55, blue: 55 });
    }
    this.preload = function (entityID) {
        id = entityID; active = true;
        Messages.messageReceived.connect(receive);
        Messages.subscribe(CHANNEL);
        unknown(); send({ type: "getState" });
        timer = Script.setInterval(function () {
            if (Date.now() - lastSeen > 6500) { pending = null; unknown(); }
            if (pending) {
                if (Date.now() - pending.created > 4000) {
                    pending = null;
                    paint("NO ACK; CHECK STATE", { red: 245, green: 170, blue: 30 });
                } else send({ type: "toggle", control: CONTROL, requestId: pending.requestId });
            }
            Messages.subscribe(CHANNEL);
            send({ type: "getState" });
        }, 2000);
    };
    this.mousePressOnEntity = function (entityID, event) {
        if (!active || !canControl || entityID !== id || !event || !event.isPrimaryButton ||
                pending || Date.now() - lastSeen > 6500 || Date.now() - lastClick < 300) return;
        lastClick = Date.now();
        pending = { requestId: nonce + "-" + (++sequence), created: Date.now() };
        paint("PENDING", { red: 245, green: 170, blue: 30 });
        send({ type: "toggle", control: CONTROL, requestId: pending.requestId });
    };
    this.unload = function () {
        active = false; pending = null;
        if (timer !== null) Script.clearInterval(timer);
        Messages.messageReceived.disconnect(receive);
        // Do not unsubscribe here: subscriptions are shared by both controls and all
        // client scripts in this Interface. Unloading WALK must not break SOUND.
    };
})
