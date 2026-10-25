# Shufflizer DJ controls for DarkRide

Prepared for Crompton Moor / Build Pad. **Not deployed. Do not launch a second DJ.**
The working DJ has not been inspected or replaced; these are replacement scripts for manual review.

## Files and behaviour

- `shufflizer-dj.js`: assignment-client agent, named SHUFFLIZER DJ. Starts with WALK and SOUND request OFF.
- `shufflizer-walk.js`: client-entity constructor for the existing WALK sphere.
- `shufflizer-sound.js`: client-entity constructor for a visible SOUND cube.
- `test-controls.js`: dependency-free mocked runtime regression checks; does not contact DarkRide.

The agent starts at `{x:5001.03,y:5015.66,z:5008.53}`, orientation
`{x:0,y:0.188107,z:0,w:0.982149}`. It assigns
`https://files.vr.darkride.ai/judas/highduryteeth.fst` **5000 ms after**
`Agent.isAvatar = true`, preserving the reported loading-impostor workaround.

WALK uses position updates, gradual acceleration up to 0.35 m/s, gradual turning,
random destinations within 4.5 m, and 1–4 second pauses. Position is constrained to
a 5 m horizontal radius, with the supplied Y fixed. OFF stops position updates
immediately on command receipt. Network delivery still adds latency.
No animation assets, navigation mesh, collision avoidance or terrain following are provided;
the avatar may slide and should be tested on the clear Build Pad.

SOUND toggles **soundRequested**, not actual playback. Its ON indicator is amber,
labelled REQUEST / AUDIO UNSUPPORTED. `audioPlaying` remains false.
Future source: `http://192.168.68.57:8001/stream.mp3`.
The prior inspection decoded this stream with FFprobe, but this does not demonstrate
DarkRide continuous-MP3 playback or spatial audio. No stream download, injector or
audio adapter is started by these scripts. A future tested adapter must implement
start/stop/reconnect and position tracking before reporting playback as working.

## Manual installation — only after approving replacement

1. Identify the existing DJ assignment and save its script URL/content and configuration
   outside this project with a timestamp. Back up the WALK entity's current script URL,
   name and colour and any existing SOUND script before changing them. This project was
   created in an empty directory; no existing scripts were overwritten.
2. Publish the three JS files on a static HTTP(S) host reachable by the domain's
   assignment-client host and participating Interface clients. Example proposed URLs:
   - `https://files.vr.darkride.ai/judas/shufflizer-dj.js`
   - `https://files.vr.darkride.ai/judas/shufflizer-walk.js`
   - `https://files.vr.darkride.ai/judas/shufflizer-sound.js`
   These are proposed destinations, **not uploaded or verified URLs**. Inspect fetched
   content before use. Version URLs when updating to avoid cached scripts.
3. At an approved maintenance point, manually replace the existing DJ assignment script
   using the domain's existing assignment workflow. Ensure the old DJ is stopped before
   starting the replacement; do not add another assignment. No server restart is required.
   Check the assignment logs and confirm exactly one SHUFFLIZER DJ.
4. In Interface's entity editor, select the existing visible WALK sphere and set its
   client **script** URL to the WALK URL. Do not use `serverScripts`, run the entity
   script as a standalone Interface script, or try to attach a click handler to the avatar.
5. Select the existing SOUND cube, or manually create one if absent, and attach the SOUND
   client script URL. Give it visible dimensions/colour and place it on the Build Pad.
   Neither script creates or deletes world entities.
6. Ensure entity scripts are enabled, a Messages mixer is available, and users have the
   necessary edit permissions for name/colour changes. World entity colour/name changes
   are best-effort and shared; they do not require clicking the avatar.

No services, world backups, agents or live entities are modified by building/testing this project.

## Controls and state

Use primary mouse click or controller laser trigger. The entity method is
`mousePressOnEntity(entityID,event)`, checked with `event.isPrimaryButton`.
Only this callback is registered, preventing double toggles from registering both
mousePress and clickDown. The files are parenthesised constructor expressions,
not invoked IIFEs, as expected by client-entity script loading.

- WALK: green ON, red OFF.
- SOUND: amber requested ON, red requested OFF; always labelled audio unsupported.
- Grey: no fresh/ready agent. Amber PENDING: waiting for acknowledgement.
- Red MULTIPLE AGENTS: another fresh agent session was observed; controls temporarily block.
  This is a diagnostic, not automatic duplicate-agent prevention.

The agent broadcasts state every two seconds and on commands. Controls query state
on preload/every two seconds; after 6.5 seconds without state they refuse clicks.
A missed acknowledgement is retried with the same request ID. The agent deduplicates
the latest 512 sender/request pairs. Reloading the agent resets all state to OFF.
An unacknowledged click has uncertain delivery: inspect the subsequent authoritative
state before clicking again.

## Message protocol

Domain-wide channel: `shufflizer.dj.control.v1`; `Messages.sendMessage(..., false)`.
All payloads include `v:1,target:"shufflizer-dj"`.

```json
{"v":1,"target":"shufflizer-dj","type":"getState"}
{"v":1,"target":"shufflizer-dj","type":"toggle","control":"walk","requestId":"unique-per-click"}
{"v":1,"target":"shufflizer-dj","type":"toggle","control":"sound","requestId":"another-unique-id"}
```

Agent state includes `type:"state"`, its session UUID, monotonic revision, ready,
walking, soundRequested, audioPlaying:false, audioStatus:"unsupported", streamURL,
and the acknowledged requestId (empty for heartbeats).
Controls check sender UUID against the announced session; an optional EXPECTED_AGENT
constant can pin that UUID. The agent optionally restricts command senders through
ALLOWED_SENDERS. These are session UUIDs, so reconnecting requires updating pins.
Defaults allow domain visitors to control the DJ; a named channel is not authentication.

Messages subscriptions are environment-wide, not reference-counted per entity.
Entity unload disconnects its handler/timer but deliberately leaves the shared
subscription, so unloading WALK does not disable SOUND. Agent shutdown disconnects
and unsubscribes within its separate assignment environment.

## Validation

Run without installing dependencies:

```sh
node --check shufflizer-dj.js
node --check shufflizer-walk.js
node --check shufflizer-sound.js
node test-controls.js
```

After manual approval/deployment:
1. Confirm one DJ, correct transform and name; model assignment occurs after five seconds.
2. Confirm both entities receive OFF state. Click WALK; observe slow bounded movement.
   Click again mid-movement; confirm it stops and stays still. Repeat from a second client.
3. Test controller trigger separately. Confirm right-click does not toggle.
4. Click SOUND twice; confirm acknowledged request ON/OFF and no claim of audible playback.
5. Reload one entity script; confirm it recovers state and the other control remains usable.
6. Stop the replacement manually only if appropriate: controls should go grey and reject
   clicks after timeout. Check reconnect, duplicate-message handling and permissions.
7. Observe the full 5 m area for obstacles and visually assess sliding/turning.

Local tests mock DarkRide globals; they cannot establish live mixer delivery, model
loading, controller mapping, edit permissions or motion quality. No in-world test
was performed during this build. Existing visualiser:
`http://192.168.68.57:8091/index.html`; connecting it as an avatar face is outside
these controls and is not implemented.

## API/source inspection

Inspected before coding:
- [Madders darkride-automata, duck-brain.js](https://github.com/Madders/darkride-automata/blob/01442cb2bbb60efbf0d642dc08c75d670480c5ca/bot/duck-brain.js):
  delayed Messages subscription, domain messages, Avatar position/orientation and lifecycle.
- [DarkRide MessagesClient.h](https://github.com/caitlynmeeks/darkride-interface/blob/main/libraries/networking/src/MessagesClient.h):
  send/subscribe/signal signatures, sender UUID and environment-wide subscription semantics.
- [EntityScriptingInterface.h](https://github.com/caitlynmeeks/darkride-interface/blob/main/libraries/entities/src/EntityScriptingInterface.h):
  mousePressOnEntity supports mouse/controller; clickDownOnEntity is mouse-only;
  entity constructor expression and script property convention.
- [Agent.cpp](https://github.com/caitlynmeeks/darkride-interface/blob/main/assignment-client/src/Agent.cpp):
  scripted Avatar global and Messages client integration.

No local DarkRide checkout or running-DJ source was found in the inspected workspace.
Upstream source compatibility with your deployed binary still needs the manual smoke test.
