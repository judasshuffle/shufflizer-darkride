/* DarkRide scripted assignment agent. Deploy manually; never run alongside the existing DJ. */
(function () {
    "use strict";
    var CHANNEL = "shufflizer.dj.control.v1";
    var HOME = { x: 5001.03, y: 5015.66, z: 5008.53 };
    var FACING = { x: 0, y: 0.188107, z: 0, w: 0.982149 };
    var MODEL = "https://files.vr.darkride.ai/judas/highduryteeth.fst";
    var STREAM = "http://192.168.68.57:8001/stream.mp3";
    // Optional session UUID allowlist. Empty means any domain visitor can control the DJ.
    var ALLOWED_SENDERS = [];
    var walking = false, soundRequested = false, ready = false, revision = 0;
    var target = null, speed = 0, rest = 0, yaw = Math.atan2(FACING.y, FACING.w) * 2;
    var seen = {}, seenOrder = [], subscribed = false;
    var session = String(Agent.sessionUUID);
    function sendState(requestId) {
        Messages.sendMessage(CHANNEL, JSON.stringify({
            v: 1, target: "shufflizer-dj", type: "state", session: session,
            revision: revision, ready: ready, walking: walking,
            soundRequested: soundRequested, audioPlaying: false,
            audioStatus: "unsupported", streamURL: STREAM, requestId: requestId || ""
        }), false);
    }
    function receive(channel, text, sender, localOnly) {
        if (channel !== CHANNEL || localOnly || text.length > 2048) return;
        var m;
        try { m = JSON.parse(text); } catch (e) { return; }
        if (!m || m.v !== 1 || m.target !== "shufflizer-dj") return;
        if (ALLOWED_SENDERS.length && ALLOWED_SENDERS.indexOf(String(sender)) < 0) return;
        if (m.type === "getState") { sendState(); return; }
        if (!ready || m.type !== "toggle" || (m.control !== "walk" && m.control !== "sound") ||
                typeof m.requestId !== "string" || !m.requestId || m.requestId.length > 160) return;
        var key = String(sender) + ":" + m.requestId;
        if (!seen[key]) {
            seen[key] = true; seenOrder.push(key);
            if (seenOrder.length > 512) delete seen[seenOrder.shift()];
            if (m.control === "walk") {
                walking = !walking;
                speed = 0; target = null; rest = 0; // OFF stops on receipt, with no further movement.
            } else {
                soundRequested = !soundRequested;
                // Future transport hook: reconcile soundRequested with a tested spatial-audio adapter.
                // No SoundCache.getSound(STREAM): continuous MP3 playback is not established.
                print("[SHUFFLIZER DJ] SOUND request " + (soundRequested ? "ON" : "OFF") +
                    "; audio unsupported (no playback started)");
            }
            revision += 1;
        }
        sendState(m.requestId);
    }
    function update(dt) {
        if (!ready || !walking || !isFinite(dt) || dt <= 0) return;
        dt = Math.min(dt, 0.1); // avoid teleporting after a stalled frame
        if (rest > 0) { rest -= dt; return; }
        var p = Avatar.position;
        if (!target) {
            var angle = Math.random() * Math.PI * 2, radius = Math.sqrt(Math.random()) * 4.5;
            target = { x: HOME.x + Math.cos(angle) * radius, z: HOME.z + Math.sin(angle) * radius };
        }
        var dx = target.x - p.x, dz = target.z - p.z, distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 0.06) { target = null; speed = 0; rest = 1 + Math.random() * 3; return; }
        speed = Math.min(0.35, speed + dt * 0.2, Math.sqrt(0.4 * distance));
        var desired = Math.atan2(-dx, -dz);
        var turn = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
        yaw += Math.max(-dt * 0.7, Math.min(dt * 0.7, turn));
        Avatar.orientation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
        var step = Math.min(speed * dt, distance);
        var x = p.x + dx / distance * step, z = p.z + dz / distance * step;
        var hx = x - HOME.x, hz = z - HOME.z, r = Math.sqrt(hx * hx + hz * hz);
        if (r > 5) { x = HOME.x + hx * 5 / r; z = HOME.z + hz * 5 / r; }
        Avatar.position = { x: x, y: HOME.y, z: z };
    }
    Agent.isAvatar = true;
    Avatar.displayName = "SHUFFLIZER DJ";
    Avatar.position = HOME;
    Avatar.orientation = FACING;
    var startup = Script.setTimeout(function () {
        // Required workaround: set model FIVE SECONDS after Agent.isAvatar.
        Avatar.skeletonModelURL = MODEL;
        Messages.messageReceived.connect(receive);
        Messages.subscribe(CHANNEL);
        subscribed = true; ready = true;
        Script.update.connect(update);
        sendState();
    }, 5000);
    var heartbeat = Script.setInterval(function () {
        if (subscribed) {
            // Retry subscription in case the Messages mixer was not ready at startup.
            Messages.subscribe(CHANNEL);
            sendState();
        }
    }, 2000);
    Script.scriptEnding.connect(function () {
        Script.clearTimeout(startup); Script.clearInterval(heartbeat);
        if (ready) Script.update.disconnect(update);
        walking = false; soundRequested = false; ready = false; revision += 1;
        if (subscribed) {
            sendState();
            Messages.messageReceived.disconnect(receive);
            Messages.unsubscribe(CHANNEL); // this assignment has its own scripting environment
        }
    });
}());
