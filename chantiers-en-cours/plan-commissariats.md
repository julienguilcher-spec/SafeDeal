# RESTART NOTE (18 November, 00:20 — read before everything else)

The machine restarted: the agents were cut off, but the worktree is intact. State of the « commissariats » feature:
- packages P1, P3, P4, P6 and P2 are FINISHED; their reports (summary, files, deviations from the plan, open issues) are in /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/rapports-paquets-commissariats.json — read it first;
- remaining: PX (wait for the redesign of the command map, then apply it), then P5, then P8;
- the main repository has moved on since (fixes to columns, BRAV-M, kettle, missions; in particular src/sim/police/units.ts, src/sim/police/command/convoy.ts and src/gameplay/session/** changed): your patch will be three-way merged; keep edits in existing files surgical.

# COORDINATOR ADDENDUM (takes precedence over the rest of the plan)

1. PACKAGE P7 (vehicle kind `voiture_bac`) is NOT implemented by this team: the « modes » team creates it in another worktree, following the same P7 spec. Do not add the definition, specs, refdefs or render model. Everything here must work whether or not `ctx.vehicles.def('voiture_bac')` exists (fallback to `voiture_police`, as the plan already says); tests must pass in both cases. String uses of 'voiture_bac' (symbols, fleet lists, crew kinds) are fine.
2. The « modes » team works in parallel in another worktree on: src/core/{contracts,session,launch}.ts, src/gameplay/patrols/** (new model.ts, calls.ts, mode.ts; small additions to index/api/system), src/gameplay/session/{roster,journee-data,equipage,setup,index,journee,mission,manifestations}.ts, src/sim/crowd/**, src/sim/vehicles/{defs,specs}.ts, src/render/vehicles/**, src/ui/screens/**, src/ui/patrol/**, src/ui/command/radioScreen.ts, src/input/bindings.ts. In those files make minimal, localised edits only (they will be three-way merged).
3. A « bugs » team is fixing in parallel: role placement at bases, vehicle columns (autopilot, convoy, bravm), kettle evacuation, missions. Same precaution: surgical edits in existing files.
4. The player's request, to be honoured to the letter (original words): « je veux aussi que tu crées le design du commissariat avec toutes les colonnes, tous les véhicules disponibles. Et tu peux faire plusieurs commissariats dans la ville pour, quand je serai commandant, pouvoir dispatcher des unités selon les trucs. » The player uses a MacBook Air WITHOUT a mouse (keyboard + trackpad) and a phone: everything must work with the keyboard alone and by touch. UI text and code comments are in French.

5. NEW PLAYER FEEDBACK (after this plan was written): « il y a beaucoup trop de boutons, c'est pas assez intuitif… faut que ce soit beaucoup plus clair entre commandants, surtout que je dois cliquer sur tout… rends ça beaucoup plus stratégique et beaucoup plus intuitif… la carte de commandement, où tu donnes les ordres, c'est pas très clair ». A separate team is therefore REDESIGNING the command map (interaction model, order palette, HUD quick actions) in another worktree. Consequences for this plan:
   - a new package PX (below, in section 8) waits for that redesign and applies it to this worktree; P5 and P8 depend on it;
   - PACKAGE P5 must follow the interaction model of /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/commande/design-commande.md (read it before starting P5, especially its section about the commissariats) wherever it differs from the tab / buttons / flow described in this plan: fewer buttons, plain French, the redesign's logic for choosing who, what and where. Do not add a wall of new buttons.

# PLAN — commissariats

## 1. Understanding (what the player asked for)
This feature turns seven real police sites in central Paris into recognisable places, each holding a finite stock of units that a commandant or commissaire can send out from the tactical map.

The seven sites:
- the Préfecture de police (caserne de la Cité, boulevard du Palais);
- the caserne des Célestins (boulevard Henri-IV), used as the staging point for gendarmerie mobile reinforcements;
- the commissariats of the 1st (place du Marché-Saint-Honoré), 3rd (rue aux Ours), 7th (rue Fabert), 8th (avenue du Général-Eisenhower) and 9th (rue Chauchat).

The six existing journée bases become drawn stations, so « on part du commissariat » and « le commissariat dessiné » are the same place.

Each site dresses its real OSM building. No building geometry is added or changed. The dressing is:
- an entrance portal (door frame with « POLICE » on the glass, two bollards);
- the blue « POLICE » lantern, lit at night;
- a tricolour flag and the « RÉPUBLIQUE FRANÇAISE » plaque;
- the sign « COMMISSARIAT DE POLICE — Ne ARRONDISSEMENT », « HÔTEL DE POLICE » or « GENDARMERIE NATIONALE » (none at the Préfecture, whose monument already has one);
- yellow police bays painted on the curb.

The bays are the « cour » of a Paris commissariat in real practice: reserved parking on the station's street, or on the nearest suitable street around the corner when the station's own street is too narrow for parked vans to leave a lane. In them, the station's vehicles stand nose to the exit, one file per unit, in departure order:
- Police secours cars and the new unmarked BAC car;
- fourgons cellulaires;
- the CRS reserve section's three fourgons;
- the Préfecture's water cannons;
- the gendarmerie's Centaures and blue fourgons;
- the BRAV-M motorbikes;
- a CRS coach and a VL de commandement as non-engageable vehicles a police player may still take.

As commandant or commissaire, the tactical map shows each station as a blue symbol with the number of units available. A « Commissariats » tab (« Postes » on a phone) lists every station with its units and their states. The player engages a unit, then designates a destination and a task with the existing order palette. The column leaves the bays with lights and two-tone sirens and drives with the existing convoy code. A new order « Rentrer au commissariat » brings any unit back without sirens to its bays; on arrival:
- detainees still on board are handed over;
- ammunition reserves are refilled;
- the unit rests, then becomes available again.

The stock is finite. Everything works with the keyboard only and on a phone, in mission, free play and journée de service. Nothing changes for the AI commander or the start-of-day column. Every simulation system that would otherwise react to these parked police vehicles is guarded through one shared helper. Without those guards, rioters would assess them, the crowd would treat them as roadblocks, traffic would wait behind them, and the AI would put escorts on them.

## 2. Current state of the code
CHECKED IN THE CODE (true as the plan said)
- src/gameplay/session/journee-data.ts: SERVICE_BASE (1760,1225) and SERVICE_BASES (1er 767,-119; 9e 1412,-897; 3e 2255,271; 8e -640,-96; 7e -765,738), BRAVM_BASES, baseOf, bravmBaseOf, serviceBaseFor. These are bare points.
- src/gameplay/patrols/system.ts (SystemOrder.CONTROL + 6):
  - spawn(site) scans all edges within SECTOR_RADIUS 700 m, always spawns 'voiture_police', crew kind 'policier_civil' for BAC and 'crs' for TV;
  - count() is 0 in missions (missionId set);
  - update() returns early while the patrols list is empty, so a deploy() that pushes into that list works in missions too;
  - PatrolsApi has send() and resume(); states patrouille / en_route / sur_place / mission / hors_service.
- src/sim/police/units.ts:
  - parkSpot / parkClear / parkCellAtRear / spawnVehicle / deploy('embarque') exist;
  - CREW_CALLSIGN is a Record<CrewKind>;
  - createPeloton builds fourgon_crs in colour 0x23407a.
- src/sim/police/api.ts: CrewKind is a closed union; UnitPlacement has no parking option; reserveOf and refillReserve exist.
- src/sim/police/command/convoy.ts: every outbound ap.convoy / ap.driveTo passes urgence: true. The siren is driven by the autopilot's urgence flag (autopilot-drive.ts). The arrival uses ap.parkRow(…, layout 'file'), so a 'file' destination parks along the curb around (x, z).
- src/ui/command/core.ts:
  - issue(), motorize(), afterConvoy, callWithMe, invalidateScope() exist;
  - the scope is cached for 0.5 s (SCOPE_PERIOD);
  - hasVehicles() ignores motos, so « Faire mouvement » on a BRAV-M today falls back to 'colonne' with the misleading notice « pas de véhicule disponible : mouvement à pied ».
- The BRAV-M, Centaure and water-cannon specials (src/sim/police/command/special.ts) are discovered by a periodic scan, so an engaged station special gets its controller automatically. autoAttach attaches specials to the first company command in any phase, and root pelotons only in phase mise_en_place.
- tacticalScreen.ts:
  - TABS has ordres / incidents / circulation / journal;
  - KeyC is free in the tactical screen (it is crouch in game bindings; tactical keys N, F, L already coexist with game bindings);
  - the hint banner (ct-hint) exists;
  - the key handler returns early when the scope is 'lecture', before any key is read.
- keyboardSections, commandableUnits and cycleUnitKey already take a canCommand callback.
- MapPick has no other literal constructors.
- LayerMask has no external literals.
- seats.ts lets police enter a locked police vehicle.
- traffic parking.ts:
  - parked civilian cars are not dormant (they sleep through the physics);
  - curbs are eligible only if the road is ≥ 7.6 m one-way or ≥ 16 m two-way (PARK_MIN_ONEWAY / PARK_MIN_TWOWAY), so that heavy autopilot vehicles pass.
- law handover: src/gameplay/law/handover.ts find() uses vehicles within range and 'law.handover' points within their radius. The person's custody becomes 'in_vehicle' (procedure closed) or 'handed_over'.
- VehicleKind is Open<…> in contracts.ts, so 'voiture_bac' needs no contract change.
- All events used exist: vehicle:entered, vehicle:state, vehicle:removed, command:convoy, session:ended, session:setup.
- SystemOrder.CONTROL + 7 is unused.

WHAT THE ARCHITECT MISSED (verified)
- Placeholder parked police vehicles would be picked up by more consumers than the four listed:
  - src/gameplay/session/engins.ts keepEscorts() scans every police 'centaure' / 'canon_eau' and orders a CRS group to « proteger » it. Parked Centaures and water cannons at the Cité and the Célestins would pull session groups across Paris.
  - src/sim/crowd/detour.ts refresh() counts every stopped police vehicle within 5 m of a road axis as a full barrage (LINE_AGENTS). Cortèges would detour around station streets.
  - src/sim/traffic/car-clear.ts waiting() keeps a pulled-over civilian car waiting while a police vehicle stands just behind it. That can deadlock it beside the bays.
  - src/sim/crowd/radical/assess.ts, src/gameplay/session/follow.ts, src/gameplay/law/handover.ts and src/ui/maps/units.ts were already listed.
  - Not affected:
    - sim/police/ops-arrest.ts uses the squad's own fleet only;
    - session/setup.ts countMeans and seatInCommandRoom run before SESSION_SETUP_EVENT;
    - crowd/radical/targets.ts already excludes police;
    - crowd/formation.ts blocking by a police vehicle actually on the route is physically correct.
- 'law.handover' points are used by src/sim/police/ops-arrest.ts within 500 m whatever their radius. Registering station doors would make AI escorts walk prisoners up to 500 m to a door. This changes existing behaviour.
- findPath's minWidth is a cost, not a constraint. A width check must sample the widths along the path.
- The plan's lane rule (3.5 m one-way / 6 m two-way) is looser than the traffic module's own rule (7.6 / 16 m). Rue aux Ours and rue Chauchat will likely fail the stricter rule.
- After engage, CommandCore's cached scope does not yet contain the new squad. The armed order would be refused for up to 0.5 s unless invalidateScope() is called.

MISSING (as the plan said)
- No station model, sign or bays.
- No stock, availability or dispatch UI.
- No return order.
- No non-urgent column.
- No unmarked BAC car.
- Traffic may park in the bays.
- No validated, tile-independent slot data.

## 3. Player experience (acceptance)

### 3.1
LAPTOP — any police role, any mode: walking or driving past a station, you see the real building with a police entrance portal, the blue « POLICE » lantern (lit at night, visible from far away as a small blue light), the tricolour flag and the sign « COMMISSARIAT DE POLICE — 9e ARRONDISSEMENT » (« GENDARMERIE NATIONALE » at the Célestins; none at the Préfecture, whose monument already has one). On the curb, yellow « POLICE » bays hold the vehicles nose-out in files. At rue Chauchat: two Police secours cars, a grey unmarked BAC car and six BRAV-M motorbikes. At the Cité: three CRS vans, two water cannons, a prisoner van, the CRS coach and a VL de commandement. If the station's street is too narrow, the bays are on the nearest wide street around the corner, and the map label says so (« véhicules : rue X »).

### 3.2
A police player may get into any parked station vehicle (police vehicles are never locked to police). The vehicle then leaves the stock, and its row shows one vehicle fewer.

### 3.3
Journée de service: you start at your base exactly as today (placement belongs to the other agents' fixes). The base is now a dressed station, and its stock vehicles stand in the bays; bays your company already occupies are skipped. The column leaves as today.

### 3.4
LAPTOP, commandant/commissaire — tactical map (Tab): blue station symbols (« P », « PP » for the Préfecture, « G » for the gendarmerie) with a green badge for the units available. The layers panel has a « Commissariats » toggle.

### 3.5
Press C or click the « Commissariats » tab. The 7 sites are sorted by distance to the map cursor (else to you), for example « Commissariat du 9e — rue Chauchat · 2,1 km · ≈ 4 min deux tons · 3 disponibles ». ↑/↓ move between rows; → or Entrée opens a row; ← closes it.

### 3.6
An open row lists one line per unit, for example « TV 75-19 · Police secours · voiture sérigraphiée · 3 gardiens · Au poste — prêt ». States: Au poste — prêt; En alerte (équipage à bord); Engagé — <secteur>; Retour; Au repos 1:20; Indisponible. Patrol cars from this area are listed below as « En patrouille » and are not part of the stock.

### 3.7
Entrée on an « Au poste » unit (or the « Engager… » button) engages it. The crew is aboard at once, and the radio says « CENTRAL : TV 75-19, équipage prêt au commissariat du 9e, en attente de destination ». The tab switches to « Ordres » with that unit selected and an order armed: « Faire mouvement en véhicules vers… », « En colonne vers… » for the BRAV-M, « Avancer jusqu'à… » for a patrol car. The banner reads « Désignez la destination (Entrée) — L : autre ordre — Échap : rester en alerte ».

### 3.8
Move the cursor with the arrows (Shift for faster) and press Entrée, or click. To give another task, L opens the palette or E opens the quick wheel, then designate. Échap leaves the unit « En alerte » in its bays: it is still counted in the station and is never swept up by « Tout », 1–9 or U.

### 3.9
The column leaves the bays head first with blue lights and two-tone sirens and follows its route; the « Ordres en cours » layer shows the route and the ETA. On arrival it deploys and carries out the task. The row reads « Engagé — <secteur> » and the station badge drops by one.

### 3.10
« Rentrer au commissariat » can be given from the palette (« Fin d'action » group), from the station pane (R) or from the unit card. Radio: « FAUCON 9 ICI <vous>. Fin de mission, rentrez au commissariat du 9e. PARLEZ. » The unit drives back without two-tones and parks back in its own bays. Detainees on board are handed over (« 3 interpellés remis à l'OPJ ») and the reserves are refilled. The row shows « Au repos 2:00 », then « Au poste ». Your own company goes back to its journée base station; any other unit goes to the nearest station.

### 3.11
Read-only roles (CRS, chef de groupe…) can also press C. They see the stations and every unit's state, without « Engager » buttons, plus the note « Seul le commandant engage les moyens des commissariats ». A mission with extra.renforts = false shows « Moyens fixés par l'ordre d'opération ».

### 3.12
PHONE — the right drawer has a « Postes » tab. Tapping a station symbol opens it scrolled to that station. Rows and buttons are at least 48 px high. « Engager… » closes the drawer and shows « Touchez la destination »: one tap sets it, a long press opens the order wheel. « Rentrer au commissariat » is also on the unit card.

## 4. Decisions

- D1: {
 "question": "What is 'the station building'?",
 "choice": "Dress the existing OSM building at the real address. Façade items are the entrance portal (door frame, « POLICE » on the glass, two bollards), the sign, the lantern, the flag and the plaque. Bays are painted on the ground. No new building mesh, no collider, no footprint change. The Préfecture monument gets the lantern, flag and bays only.",
 "why": "Real commissariats are ordinary buildings. Rebuilding risks holes and blocked streets and changes pathfinding and tests. The portal answers the user's « design du commissariat » better than a bare sign, at almost no cost."
}
- D2: {
 "question": "What is the 'yard' (cour)?",
 "choice": "Reserved bays along the curb, one file per unit, nose to the exit. The street must satisfy the TRAFFIC module's own parking rule (road ≥ 7.6 m one-way or ≥ 16 m two-way, PARK_MIN_ONEWAY / PARK_MIN_TWOWAY imported from src/sim/traffic/tuning.ts), so heavy autopilot vehicles still pass. If the station's street fails, take the nearest eligible street within 150 m of the door. Never an interior courtyard.",
 "why": "This is real Paris practice, and it avoids the « enclosed in a courtyard » class of bug. The architect's 3.5 / 6 m lane rule was looser than what the traffic code already relies on, so convoys and engines would have rubbed or stopped against the parked vans."
}
- D3: {
 "question": "Which sites?",
 "choice": "Seven: the six existing bases, plus the caserne des Célestins (about x 3028, z 1524, 215 m inside the edge), labelled « Caserne des Célestins — renforts de gendarmerie mobile ».",
 "why": "These are real addresses inside the map extract with a margin, and they are consistent with the journée and BRAV-M bases. The Célestins is a Garde républicaine barracks; presenting it as the staging point of mobile gendarmerie reinforcements is plausible, whereas claiming Centaures are based there would not be."
}
- D4: {
 "question": "What stock does each site hold?",
 "choice": "Cité: section CRS « AQUILON 1 » (3 fourgons_crs), « NEPTUNE 11 » and « NEPTUNE 12 » (canon_eau), « CELLULAIRE 75-04 », plus two non-engageable vehicles (car_crs, vl_commandement « PC MOBILE DOPC »).\nCélestins: « ÉPERVIER 9 » (2 fourgons), « CENTAURE 11 » and « CENTAURE 12 ».\n1er: TV 75-11, TV 75-21, BAC 75-01, CELLULAIRE 75-01.\n3e: TV 75-13, BAC 75-03, CELLULAIRE 75-03.\n7e: TV 75-17, BAC 75-07.\n8e: TV 75-18, TV 75-28, BAC 75-08.\n9e: « FAUCON 9 » (6 motos), TV 75-19, BAC 75-09.\nTotal 32 vehicles.",
 "why": "Realistic French organisation, and every police vehicle kind of the game is present (the coordinator listed vl_commandement). Call signs stay outside the session's numbering."
}
- D5: {
 "question": "Spawn crews at session start?",
 "choice": "No. Only vehicles are spawned at setup. They are solid (not dormant), faction police, locked, engine off, cmd.brake 1, handbrake on, the same state as traffic's parked cars (parking.ts register()). Crews are created aboard on engage.",
 "why": "This saves phone CPU and keeps idle agents away from the AI systems. Embarked crews never spawn on a narrow sidewalk."
}
- D6: {
 "question": "How do the other systems ignore parked station vehicles?",
 "choice": "One helper, src/world/commissariats/held.ts: isHeldVehicle(ctx, id). It reads ctx.service('police.commissariats') through a local shape and returns false when the service is absent. Every consumer guards with it:\n- src/ui/maps/units.ts;\n- src/gameplay/session/follow.ts;\n- src/gameplay/law/handover.ts;\n- src/sim/crowd/radical/assess.ts;\n- src/sim/crowd/detour.ts;\n- src/sim/traffic/car-clear.ts waiting();\n- src/gameplay/session/engins.ts keepEscorts().",
 "why": "The architect listed four consumers; three more were verified in the code (AI escorts sent to parked engines, cortèges detouring around station streets, civilian cars waiting forever). Every layer may import src/world, so one helper avoids seven ad-hoc lookups, and the behaviour is unchanged when the module is absent."
}
- D7: {
 "question": "How does a dispatched unit move?",
 "choice": "Through the existing order pipeline. The engage flow is:\n1. commissariats.engage() materialises the unit;\n2. the UI calls core.invalidateScope();\n3. the UI selects the unit and arms an order;\n4. CommandCore.issue() runs motorize(), then police.command.arrive(…), then afterConvoy.\nPatrol cars are created by patrols.deploy(), which reuses the same spawn code as today's patrols. A BRAV-M given « Faire mouvement » is issued 'colonne' without the misleading « à pied » notice; its special controller rides when the point is more than 60 m away.",
 "why": "No new movement code. invalidateScope() is required because the scope is cached for 0.5 s and would otherwise refuse the new squad."
}
- D8: {
 "question": "Who may dispatch, in which modes?",
 "choice": "Players with scope 'tout' (commandant, commissaire, or rank ≥ commandant) may dispatch in every mode unless extra.renforts === false. The module is inactive in 'editeur' and 'test' modes, and when extra.commissariats === false. Other police roles have read-only access. KeyC is handled BEFORE the tactical screen's early return for read-only scopes.",
 "why": "Matches « quand je serai commandant ». The early return in tacticalScreen's key handler would otherwise hide the pane from read-only roles."
}
- D9: {
 "question": "How do units go back?",
 "choice": "New verb 'retour_poste' « Rentrer au commissariat ».\n- Vehicles: arrive() to the CENTRE OF THE ENTRY'S FILE OF SLOTS on the curb, with the file's heading, layout 'file', boardFirst, disembark false and urgence false. parkRow then parks them back in the bays. An adopted (non-stock) unit uses the station's spare file.\n- Patrol cars: patrols.sendHome() to their first slot.\n- Units on foot: 'colonne' to the door.\nOn arrival (stage 'en_place' within 40 m of the file centre, or leader within 40 m of the door):\n- people with custody 'in_vehicle' seated in the unit's vehicles get out and are removed, with a radio message;\n- refillReserve() runs for each vehicle, then units.rest();\n- rest lasts 120 s (300 s if morale < 0.5).",
 "why": "The architect's target was a point on the carriageway, so returned vans would have stayed parked in the traffic lane. Only 'in_vehicle' people are removed, because their record is already closed; people in other custody states belong to the law module's own lists."
}
- D10: {
 "question": "Register station doors as 'law.handover' points?",
 "choice": "No. Detainees are handed over only when a recalled unit arrives at its station.",
 "why": "src/sim/police/ops-arrest.ts uses any handover point within 500 m, whatever its radius. Doors would make AI escort teams walk prisoners up to 500 m and change existing arrest behaviour and tests. The user did not ask for it."
}
- D11: {
 "question": "How to keep the AI commander and the start-of-day column intact?",
 "choice": "Station units are never 'compagnie' squads. JourneeSystem.engageOthers() skips squads for which isStationUnit() is true; this only matters for a station BRAV-M, the only non-company root it moves. Nothing changes in src/sim/police/command/system.ts. Engaged specials are attached by autoAttach as today; when the player leads, the command is in 'adjoint' mode and issues no orders on its own.",
 "why": "Verified in system.ts: autoAssume takes only compagnies, and mode 'ia' is never set when the player is commandant or commissaire."
}
- D12: {
 "question": "How to choose and validate sites and slots?",
 "choice": "Slots are frozen literal data. layoutYard() generates them once against the real map; validateSite() checks them in a real-data test on every run.\nChecks:\n- façade found by raycast;\n- door on sidewalk, plaza or sett, isFree, with an open arc of 90° or more over 25 m;\n- door within 18 m of a road;\n- slots free (isFree at the centre and at both ends), surface not water, building, interior, park or void;\n- slots at least nodeRadius + 9 m from junctions and 5 m from crossings (the traffic module's PARK_CLEAR values);\n- street width meets the parking rule;\n- no slot overlaps another;\n- vehicle path from every column head to Concorde (0,0) and République (3123,-208), with each edge's width checked every 10 m by nearestRoad along the returned path (≥ 5 m, ≥ 6 m for engines). minWidth is only a cost in findPath;\n- foot path from the door to every slot.\nAt run time the only check is occupancy, with spare slots as fallback.",
 "why": "Deterministic and independent of loaded tiles. The architect's path check relied on minWidth, which does not enforce anything."
}
- D13: {
 "question": "Civilian parked cars in the bays?",
 "choice": "src/sim/traffic/parking.ts drops any curb slot whose centre is within 6 m of a reservedBays() slot.",
 "why": "Deterministic, and it matches the real rule (stationnement réservé)."
}
- D14: {
 "question": "BAC car?",
 "choice": "Add VehicleKind 'voiture_bac' in the vehicle definitions only. VehicleKind is Open<>, so contracts.ts is not touched. CrewKind in src/sim/police/api.ts gains 'voiture_bac'. Patrol and station BAC crews use it, falling back to voiture_police when the definition is missing.",
 "why": "A marked BAC car is a realism error. Not touching contracts.ts avoids a merge conflict on a shared file."
}
- D15: {
 "question": "Naming?",
 "choice": "Use 'commissariat' everywhere in code. Never use 'station' (the metro) or 'post' (the AI's dispositif posts).",
 "why": "Avoids collisions with existing names."
}
- D16: {
 "question": "Which units do the keys and « Tout » ignore?",
 "choice": "atPost(squadId) is true for the states au_poste, alerte and repos. tacticalScreen passes a composed callback (canCommand(id) && !atPost(id)) to the existing keyboardSections, commandableUnits and cycleUnitKey; their signatures do not change. selectAll in panelUnits.ts uses the same filter.",
 "why": "A unit left « En alerte » by Échap must not be swept up by « Tout ». Reusing the existing callback avoids touching tacticalKeys' API."
}
- D17: {
 "question": "Far version?",
 "choice": "One merged far mesh for ALL sites (the lantern face plus the flag, a few quads each), 1 draw call. It is visible from 260 m to 900 m (to 600 m on quality 'bas'); the near dressing is used within 260 m (160 m on 'bas').",
 "why": "The coordinator required a far version. Lit lanterns are what a player notices from a distance at night, and this costs a single draw call."
}
- D18: {
 "question": "Artificial preparation delay?",
 "choice": "None. Boarding, engine start and the staggered exit (10–30 s) are the delay.",
 "why": "Simplest; nothing to test."
}
- D19: {
 "question": "Save format?",
 "choice": "No change.",
 "why": "Session state is not saved today."
}

## 5. Data model
src/core/contracts.ts and src/core/extensions.ts are NOT touched.

1) src/world/commissariats/data.ts (pure, no three.js):
  - CommissariatKind = 'prefecture' | 'commissariat_central' | 'commissariat' | 'caserne_gendarmerie'.
  - CommissariatSign = 'commissariat' | 'hotel_police' | 'gendarmerie' | 'none'.
  - StockKind = 'police_secours' | 'bac' | 'section_crs' | 'peloton_gm' | 'bravm' | 'canon_eau' | 'centaure' | 'cellulaire' | 'hors_dispositif'.
  - YardSlot { x; z; heading; len; file; spare }.
  - StockTemplate { id; kind; callsign; label; vehicle: VehicleKind; vehicles; crew; engageable: boolean; slots: readonly number[] }.
  - CommissariatDef { id; name; short; kind; address; sign; arrondissement; door{x,z}; facade{x,z,heading}; exit{x,z,heading}; street; bayStreet (the street the bays are on, if different); slots; stock }.
  - Exports:
    - COMMISSARIATS;
    - commissariatById;
    - nearestCommissariat(x, z, accept?);
    - reservedBays();
    - fileCentre(def, template) → { x, z, heading } (centre of a template's slots);
    - BAC_COLOR = 0x2e3238;
    - VEHICLE_LEN (voiture 4.7, bac 4.7, fourgon_crs 5.9, cellulaire 6.0, vl_commandement 5.0, canon_eau 10.5, centaure 8.0, car_crs 12.2, moto 2.3).

2) src/world/commissariats/held.ts: isHeldVehicle(ctx: Pick<GameContext, 'service'>, vehicleId: EntityId): boolean. It reads the service 'police.commissariats' as { holds?(id): boolean } with a typeof check, and returns false when the service is absent.

3) src/world/commissariats/layout.ts:
  - SLOT_RULES imports PARK_MIN_ONEWAY, PARK_MIN_TWOWAY, PARK_CLEAR_JUNCTION and PARK_CLEAR_CROSSING from '@/sim/traffic/tuning' (pure constants) and adds doorRoadMax 18, openArcDeg 90, rayLen 25, altStreetMax 150, pathWidthVan 5, pathWidthEngine 6, sampleStep 10, footDetour 1.6, vehicleDetour 3.
  - layoutYard(world, seed): CommissariatDef.
  - validateSite(world, def): SiteReport { id; ok; problems: string[]; openArcDeg; slots: { index; ok; why }[] }.
  - slotRing, slotsOverlap.
  - pathWidthOk(world, path: number[], min): { ok; worst; at }.

4) src/gameplay/commissariats/api.ts:
  - Constants: COMMISSARIATS_SERVICE = 'police.commissariats'; COMMISSARIATS_SYSTEM_ID = 'gameplay.commissariats'.
  - Events:
    - 'commissariat:engaged' { commissariatId; entryId; squadId; t };
    - 'commissariat:returned' { commissariatId; squadId; detainees; t };
    - 'commissariat:stock' { commissariatId }.
  - EntryState = 'au_poste' | 'alerte' | 'engage' | 'retour' | 'repos' | 'indisponible'.
  - StockEntryView { id; commissariatId; kind: StockKind | 'adopte'; callsign; label; vehicle; vehicles; crew; state; squadId; restUntil; vehicleIds; engageable; where }.
  - CommissariatView { id; name; short; kind; x; z; returnX; returnZ; returnHeading; entries; available; engaged; resting; patrols: number[] }.
  - EngageResult { ok; reason; squadId; defaultVerb: 'faire_mouvement' | 'colonne' | 'avancer' }.
  - RecallTarget { commissariatId; x; z; heading; doorX; doorZ }, where x/z/heading is the centre of the entry's file of slots.
  - CommissariatsApi:
    - enabled; canDispatch; list;
    - get(id); entry(entryId);
    - engage(entryId, by?): EngageResult;
    - recall(squadId): RecallTarget | null;
    - holds(vehicleId);
    - isStationUnit(squadId); entryOf(squadId);
    - atPost(squadId), true for au_poste | alerte | repos.
  - Doc header for SessionConfig.extra keys 'commissariats' (default true) and 'renforts' (default true).

5) src/sim/police/api.ts:
  - UnitPlacement.parking?: readonly { x; z; heading }[];
  - CrewKind += 'voiture_bac';
  - PoliceUnitsApi.rest(squadId): void.

6) src/sim/police/command/api.ts: ConvoyDestination.urgence?: boolean (default true).

7) src/gameplay/patrols/api.ts:
  - PatrolState += 'au_poste';
  - PatrolsApi.deploy(kind, callsign, home, at{x,z,heading}, homeAt?): number;
  - PatrolsApi.sendHome(squadId, at{x,z,heading}, issuedBy?): boolean.

8) UI:
  - TacticalTab += 'commissariats'; TacticalOpenData.commissariatId?;
  - TacticalState.focusCommissariat: string and openEntry: string;
  - MapPick.commissariat;
  - LayerMask.commissariats?: boolean;
  - OverlayOptions.focusCommissariat?: string;
  - MapScene.commissariats: SceneCommissariat[] { id; short; name; kind; x; z; available; engaged; resting; total };
  - order verb 'retour_poste';
  - icon 'building'.

9) Render: src/render/commissariats/api.ts exports COMMISSARIATS_RENDER_KEY = 'render.commissariats' and stats { sites; built; visible; farVisible; drawCalls; triangles }.

No save change.

## 6. Risks

- R1: DISAGREEMENT — missed consumers. The architect guarded 4 consumers. Three more were verified in the code and would misbehave with 32 parked police vehicles:
- src/gameplay/session/engins.ts keepEscorts() would order CRS groups to « proteger » every parked Centaure and water cannon;
- src/sim/crowd/detour.ts would count the parked vans as roadblocks and divert cortèges;
- src/sim/traffic/car-clear.ts waiting() could keep a pulled-over civilian car waiting forever beside the bays.
Fixed with one shared isHeldVehicle helper and guards plus tests in P8.
- R2: DISAGREEMENT — law.handover door points. src/sim/police/ops-arrest.ts uses any handover point within 500 m whatever its radius. Registering 7 doors would make AI escorts walk prisoners up to 500 m and change existing arrest behaviour and tests. Cut: detainees are handed over only by a recalled unit arriving at its station, and only people with custody 'in_vehicle' are removed (others sit in the law module's own lists).
- R3: DISAGREEMENT — return target. The architect sent returning units to the 'exit' point on the carriageway. parkRow would have parked the column in the traffic lane. They now return to the centre of their own file of bays.
- R4: DISAGREEMENT — lane rule and path width. The architect left 3.5 m (one-way) / 6 m (two-way) of lane, while the traffic module only allows curb parking on roads ≥ 7.6 m one-way or ≥ 16 m two-way so that heavy autopilot vehicles can pass. The architect also used findPath's minWidth, which is only a cost. Corrected: the traffic rule applies, with an alternative street within 150 m when the station's own street fails (likely rue aux Ours and rue Chauchat), and the width is sampled along the path.
- R5: DISAGREEMENT — scope cache. After engage, CommandCore's scope (cached for 0.5 s) does not contain the new squad, so the armed order could be refused. P5 calls invalidateScope() after engage and tests an order given in the same tick.
- R6: DISAGREEMENT — read-only key. tacticalScreen's key handler returns early for a 'lecture' scope. The promised « read-only roles can open the pane » needs KeyC handled before that return.
- R7: DISAGREEMENT — keys and « Tout ». keyboardSections, commandableUnits and cycleUnitKey already take a canCommand callback; a composed callback is enough and their signatures stay the same. atPost must include 'alerte', otherwise a unit left in alert by Échap would be swept up by « Tout » and 1–9.
- R8: DISAGREEMENT — contracts.ts. VehicleKind is Open<>, so 'voiture_bac' needs no change in contracts.ts. It is left untouched, which avoids a conflict on a shared file with six agents merging.
- R9: DISAGREEMENT — dependencies. The architect's P2 depended on P1 only, but its tests exercise patrols.deploy, the parking option and rest (P3). P5 needs the real service (P2). Corrected: P2 depends on P1 and P3; P5 depends on P1, P2, P3 and P4. P1 is re-sized 'gros' (generator, validator, 7 tuned sites).
- R10: DISAGREEMENT — far version and design. The constraint asks for a far version; the architect had none. A single merged far mesh (lanterns and flags of all sites, 1 draw call) is added. An entrance portal is added to the façade so the « design du commissariat » the user asked for is more than a sign, still within 2 meshes per site.
- R11: DISAGREEMENT — vehicles. The coordinator listed vl_commandement; the architect's stock had none. A non-engageable VL de commandement is added at the Cité next to the CRS coach (32 vehicles). A police player may still take either one, which releases it from the stock.
- R12: Realism: the Célestins is a Garde républicaine barracks. Centaures and EGM are presented as « prépositionnés » reinforcements, not based there.
- R13: Merge conflicts. Shared files touched by this plan:
- journee.ts, follow.ts, engins.ts, handover.ts, assess.ts, detour.ts and car-clear.ts get one guarded line each, in P8, merged last;
- patrols/system.ts gets a spawn refactor in P3. The current code spawns TV crews as 'crs'; if a bug-fix agent changes that, deploy inherits it because it uses the same spawnCar;
- setup.ts, placement.ts and journee-data.ts are untouched.
If another agent moved a base, P1 re-centres that station's door on the street.
- R14: Existing tests and browser scenarios. Unit tests do not load the module. Browser scenarios now see 32 parked police vehicles: selectors that count police vehicles or use « Tout » may need fixing in P8. The traffic parking change near the 7 sites is checked at ±3 %.
- R15: AI commander. Engaged specials are attached by autoAttach as today; when the player is commandant or commissaire the command stays in 'adjoint' mode and gives no order on its own. If a future change lets the AI command while a player commandant leads, station units could be reassigned. Covered by test (b) in P8.
- R16: Phone performance. Crews exist only after engage. The 32 placeholders behave like parked cars (physics asleep). The dressing is at most 2 draw calls per near site plus 1 far draw call for all sites. If the perf pass exceeds +0.3 ms per frame, sites more than 900 m from the player at setup keep virtual vehicles (already supported by the stock logic).
- R17: Determinism. No Math.random; placeholders are spawned synchronously on SESSION_SETUP_EVENT in literal order; tested per seed.

## 7. Out of scope

- Station interiors, a walkable courtyard behind gates, or any new building mesh or collider.
- The AI commander requesting or dispatching station units itself.
- Drone stock (the game has no drone van).
- Registering station doors as 'law.handover' points (it changes AI arrest behaviour).
- Stations outside the map extract or within 150 m of its edge (4e, 5e, 6e, 10e, 11e, 16e, 17e, CRS barracks outside Paris).
- Restocking or crew rotation over time, and keeping the stock between sessions or in the career.
- The four-mode home screen and the BAC patrol mode (#53). This plan only keeps them compatible: a BAC role can later start at its station's bays in a 'voiture_bac'.
- Rewording the journée brief that says « caserne de la Cité » (owned by the journée-texts agent).
- Debrief and career scoring of reinforcements engaged.
- Animated flags or doors, crews walking out of the building.

## 8. Work packages

### PACKAGE PX — Wait for, then apply, the coordinator's redesign of the command map
- dependsOn: []
- size: petit (mostly waiting)
- files: whatever the redesign patch touches (src/ui/command/**, src/ui/hud/**, tests/unit, tests/e2e)

#### Changes
This package only synchronises this worktree with the redesign of the command map made by another team (see addendum item 5). Do NOT start any work of P5.
1. Wait until the marker file /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/patches2/commande.ready exists — or /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/patches2/commande.abandon, which means the redesign was cancelled: then change nothing and report it. Wait with this command, repeated as many times as needed (the redesign can take up to five hours: this is expected; do nothing else meanwhile):
   timeout 590 bash -c 'while [ ! -f /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/patches2/commande.ready ] && [ ! -f /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/patches2/commande.abandon ]; do sleep 20; done'; ls /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/patches2/ | grep commande
2. When ready: cd /tmp/claude-0/hunt/commissariats && git apply --3way --whitespace=nowarn /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/patches2/commande.patch
   (git apply --3way stages what it applies: that is fine; do not commit). Resolve any conflict by keeping BOTH intents: the redesign's structure and this feature's additions already in the tree.
3. Run npx tsc --noEmit -p . and the tests named in the « Tests » parts of /tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/commande/design-commande.md; fix what the combination broke.

#### Tests
Those of the redesign (see the design document), all passing in this worktree.


### PACKAGE P1 — Foundation: station data, frozen yard slots, site validation, held-vehicle helper, API types
- dependsOn: []
- size: gros
- files:
  - src/world/commissariats/data.ts
  - src/world/commissariats/layout.ts
  - src/world/commissariats/held.ts
  - src/world/commissariats/index.ts
  - src/gameplay/commissariats/api.ts
  - tests/unit/commissariats.data.test.ts
  - tests/unit/commissariats.sites.paris.test.ts

#### Changes
Do NOT touch contracts.ts (VehicleKind is Open<>).

layout.ts layoutYard(world, seed):
(a) Door: the projected address (formula of patrols/sites.ts). Find the nearest road R with nearestRoad, maximum 60 m; reject pedestrian, footway, motorway, service and bridge edges.
(b) Façade: raycast from R to the door (and ±15°); the first 'building' hit within 4 m gives facade.heading; door = hit + normal × 0.8.
(c) Bay street: R if eligible under the traffic parking rule (width ≥ PARK_MIN_ONEWAY one-way or ≥ PARK_MIN_TWOWAY two-way); else the nearest eligible edge within 150 m of the door whose foot path from the door is ≤ 1.6 × straight + 10. Record bayStreet.
(d) Bays on the curb of that edge on the door's side, at lateral offset width/2 − 0.15 − halfWidth (the same formula as parking.ts pose()). Heading follows the traffic direction on that side. Spacing = VEHICLE_LEN + 1.2 m (0.5 m between motos). Clearance from junctions and crossings uses the traffic module's PARK_CLEAR values. One contiguous file per template, head nearest the exit. Add 30 % spare slots, at least one spare file of 2 slots for adopted units.
(e) exit = the point on the carriageway 25 m downstream of the last head slot.

validateSite(world, def), after whenLoaded(door, 250): the checks listed in decisions, plus pathWidthOk (sample every 10 m with nearestRoad(…, 8); width ≥ 5, or ≥ 6 for templates with canon_eau, centaure or car_crs) on the findPath('vehicle') result from each column head to (0,0) and to (3123,-208).

data.ts:
- the 7 seeds with the stock from decisions, including the hors-dispositif car_crs and vl_commandement at the Cité (engageable false);
- labels in French;
- literals generated with CRS_COMMISSARIATS_PRINT=1 and pasted rounded (0.1 m, 0.001 rad).
If a seed fails, move along the same street or use the alternative street rule. Never use a courtyard.

held.ts: isHeldVehicle as in dataModel.

gameplay/commissariats/api.ts: types and constants only.

#### Tests
commissariats.data.test.ts (pure):
- ids unique;
- every door and slot lies ≥ 150 m inside the bounds;
- each SERVICE_BASES and BRAVM_BASES entry is within 120 m of a station door of the same arrondissement (bases moved by the other agents: re-centre the door, not the base);
- templates: slot count equals vehicle count, slots contiguous, one file, head first;
- total slots ≥ ceil(1.3 × total vehicles);
- no slot overlap (margin 0.4 m); slot.len ≥ VEHICLE_LEN of its kind;
- call signs unique, matching the pattern, not in COMPANY_CALLSIGNS;
- isHeldVehicle returns false without the service and true with a stub.

commissariats.sites.paris.test.ts (real data, skipIf when the data is missing):
- validateSite ok for all 7, printing the problems on failure;
- pathWidthOk passes for every column head toward Concorde and République;
- every bay street satisfies the traffic parking rule.

### PACKAGE P3 — Police units: parking slots, voiture_bac crew, rest; convoy without two-tones; patrols deploy/sendHome
- dependsOn: ['P1']
- size: moyen
- files:
  - src/sim/police/api.ts
  - src/sim/police/units.ts
  - src/sim/police/roster.ts
  - src/sim/police/system.ts
  - src/sim/police/command/api.ts
  - src/sim/police/command/convoy.ts
  - src/gameplay/patrols/api.ts
  - src/gameplay/patrols/system.ts
  - tests/unit/police.parking-slots.test.ts
  - tests/unit/police-command.convoi-sans-urgence.test.ts
  - tests/unit/patrols.deploy.test.ts

#### Changes
1. police/api.ts: UnitPlacement.parking?; CrewKind += 'voiture_bac'; PoliceUnitsApi.rest(squadId).

2. units.ts:
- begin() keeps `parking`;
- spawnVehicle() uses parking[handle.vehicles.length] when present (exact x, z, heading, y = heightAt), else parkSpot as today;
- parkCellAtRear() does nothing when parking was given;
- CREW_CALLSIGN.voiture_bac = 'BAC'; createEquipage('voiture_bac') spawns the kind when ctx.vehicles.def('voiture_bac') exists, else voiture_police.

3. roster.ts: crewRoster('voiture_bac') = 3 policier_civil (brigadier_chef leader 'interpellation', conducteur, interpellation).

4. system.ts: rest(squadId) on the unit and its descendants (fatigue 0, needsRelief false, morale = max(morale, 0.8)).

5. command/api.ts: ConvoyDestination.urgence?.

6. convoy.ts:
- urgent = dest.urgence !== false;
- every outbound ap.convoy / ap.driveTo passes urgence: urgent and speed: urgent ? urgentSpeed(core) : undefined;
- the 'civil car pulls over for an urgent column' step (near line 473) runs only when urgent;
- depart() is unchanged.

7. patrols/api.ts: 'au_poste', deploy(), sendHome().

8. patrols/system.ts:
- extract spawnCar(kind, callsign, home, homeX, homeZ, at | null, points) from spawn(site), keeping the current crew archetypes. Whatever the bug-fix agents changed (for example the TV crew kind) is kept, because deploy uses the same function;
- spawn(site) keeps today's behaviour, except that BAC uses voiture_bac when its definition exists;
- deploy() places the car exactly at `at`, crew aboard, state 'au_poste', label 'Au poste';
- think(): 'au_poste' does nothing;
- onOrder: from 'au_poste' the same transitions as from 'patrouille';
- sendHome(): non-urgent ap.driveTo(…, { urgence: false, stopBefore: 2 }), lights off, radio report; within 15 m or when the autopilot has arrived → state 'au_poste'.

#### Tests
police.parking-slots.test.ts:
- createSection / createPeloton / createBravm(6, mounted) with parking → vehicles within 0.05 m and 0.01 rad of the slots, everyone seated;
- fewer slots than vehicles → the rest placed by parkSpot without overlap;
- without parking → positions identical to today on a fixed seed;
- rest() resets fatigue;
- createEquipage('voiture_bac') → 3 policier_civil aboard.

police-command.convoi-sans-urgence.test.ts:
- arrive({…, urgence: false}) → siren 0 during 'route' and no forced pull-over of civil cars;
- the default arrive keeps the siren on (regression).

patrols.deploy.test.ts:
- deploy('bac', …) works also in a mission config where count() = 0;
- 3 aboard, 'au_poste', kind voiture_bac when defined, else voiture_police;
- stays put for 900 s;
- send() → en_route urgent; sendHome() → au_poste within 15 m;
- the existing patrol tests pass, and the seeded spawn is identical (regression).

### PACKAGE P7 — Vehicle kind 'voiture_bac' (unmarked BAC car)
- dependsOn: []
- size: petit
- files:
  - src/sim/vehicles/defs.ts
  - src/sim/vehicles/specs.ts
  - src/render/vehicles/refdefs.ts
  - src/render/vehicles/models/index.ts
  - src/render/vehicles/models/cars.ts
  - src/render/vehicles/beacons.ts
  - tests/unit/vehicles.bac.test.ts

#### Changes
- defs.ts: def('voiture_bac', 'Voiture banalisée (BAC)', 'police', 0x2e3238, saloon about 4.70 × 1.83 × 1.47 m, mass 1 450, seats as voiture_police, siren and beacons on); add it to the police kinds list.
- specs.ts: TABLE.voiture_bac.
- refdefs.ts: the same dimensions.
- cars.ts: CAR_STYLES.voiture_bac with police false (no livery or light bar), tinted rear windows, a magnetic roof dome shown only when the beacons are on.
- models/index.ts: builder entry.
- beacons.ts: beaconPatternFor('voiture_bac') gives the dome plus grille flashers.
- Audio is driven by the siren state; nothing to change there.

#### Tests
vehicles.bac.test.ts:
- the definition exists: police faction, siren, beacons, 5 seats, driver on the left;
- spawn, enter and siren toggle work;
- the specs table has the kind;
- refdefs and sim defs agree (pattern of the existing consistency tests);
- the render model builds in Node within the car triangle budget;
- any existing test that iterates every vehicle definition is updated here.

### PACKAGE P2 — Simulation service 'police.commissariats': parked stock, engage, recall, rest, detainee handover
- dependsOn: ['P1', 'P3']
- size: gros
- files:
  - src/gameplay/commissariats/index.ts
  - src/gameplay/commissariats/system.ts
  - src/gameplay/commissariats/stock.ts
  - src/gameplay/commissariats/engage.ts
  - src/gameplay/commissariats/texts.ts
  - tests/unit/commissariats.service.test.ts
  - tests/unit/commissariats.engage.test.ts
  - tests/unit/commissariats.retour.test.ts

#### Changes
system.ts: CommissariatsSystem, SystemOrder.CONTROL + 7 (free; just after patrols at + 6).
- provide() publishes the API.
- init() listens to:
  - SESSION_SETUP_EVENT (onAny) → reset, then spawnPlaceholders() if enabled;
  - 'session:ended' → reset;
  - 'vehicle:entered' on a held vehicle → release it (vehicles − 1; an entry with no vehicle left becomes indisponible);
  - 'vehicle:state' wrecked or burnt on a held vehicle → same;
  - 'vehicle:removed';
  - 'command:convoy' for recalled squads.
- enabled and canDispatch as in decisions.

stock.ts spawnPlaceholders():
- for each slot, check occupancy (any vehicle OBB within 0.4 m, or a blocksMove prop within 3.2 m); use spare slots of the same file, then any spare;
- spawn with faction police (BAC_COLOR for voiture_bac, which falls back to voiture_police when undefined), y = heightAt, locked, engineOn false, cmd.throttle 0, cmd.brake 1, cmd.handbrake true;
- a vehicle with no free slot is counted virtual and is spawned on engage through the units' fallback parking.

engage.ts engage(entryId, by):
- refuse when !canDispatch, the entry is unknown, not engageable or indisponible;
- idempotent: an entry already materialised returns its squad;
- remove the placeholders, then build the unit:
  - police_secours / bac → patrols.deploy(kind, callsign, short, slot0, door), else units.createEquipage(vehicle, slot0);
  - section_crs → createSection({ exit pose, section: 1, vehicles, drivers, layout 'embarque', callsign, parking });
  - peloton_gm → createPeloton(same);
  - bravm → createBravm(6, { vehicles, mounted, callsign, parking });
  - canon_eau / centaure / cellulaire → createEquipage(kind, slot).
- Fallback when parking is not honoured: move each vehicle still at rest onto its slot.
- State 'alerte'; emit the engaged and stock events; radio « CENTRAL : <callsign>, équipage prêt au <commissariat>, en attente de destination. »
- Return defaultVerb: patrol → 'avancer', bravm → 'colonne', else 'faire_mouvement'.

State update (every 0.5 s):
- alerte → engage when the lead vehicle is more than 60 m from the file centre;
- repos → au_poste when the rest time is over;
- indisponible when all its vehicles are wrecked or burnt and fewer than 50 % of the crew is valid;
- where = sectorName.

recall(squadId):
- home = the stock entry's station; else a patrol's station (door within 300 m of its homeX/Z); else the journée base station (within 150 m of baseOf); else the nearest station;
- a non-stock squad is adopted into the spare file;
- state 'retour'; return RecallTarget = fileCentre.

Arrival: 'command:convoy' stage 'en_place' within 40 m of the file centre (or a patrol in 'au_poste', or a leader on foot within 40 m of the door) → arrive():
- state 'repos', rest 120 s (300 s if morale < 0.5);
- refillReserve() for every vehicle of the unit and its descendants; units.rest?.();
- people with custody 'in_vehicle' in those vehicles: vehicles.exit, then people.remove; radio « <n> interpellé(s) remis à l'officier de police judiciaire. »;
- emit the returned event.

No 'law.handover' points are registered. No Math.random; iteration follows the literal data order.

#### Tests
createTestContext with world, roles, people, vehicles, traffic, police, law, radio, session, patrols, commissariats; commandant, libre, Concorde.

commissariats.service.test.ts:
- 32 placeholders (fewer only for logged occupied slots), each within 0.5 m of a literal slot, police, locked, empty, handbrake on;
- holds() is true for them;
- no overlap with other vehicles;
- deterministic per seed;
- extra.commissariats false → none;
- role crs → canDispatch false and engage refused with a reason;
- extra.renforts false → canDispatch false;
- 300 s with crowd and company: no stock squad appears, and police.command commands.length is unchanged.

commissariats.engage.test.ts:
- TV 75-19 → patrol, au_poste, 3 aboard, idempotent;
- FAUCON 9 → 6 motos on the slots, 12 mounted;
- AQUILON 1 → 3 fourgons in file, everyone aboard;
- then arrive to République → engage, siren on during 'route';
- a held vehicle entered by the player is released.

commissariats.retour.test.ts:
- cellulaire with a detainee 'in_vehicle', recall → arrival removes the detainee, returned event with detainees 1, repos, then au_poste after 120 s;
- vehicles end within 3 m of their slots (not on the carriageway);
- reserves refilled;
- the journée company recalled goes to its base station.

### PACKAGE P4 — Maps: station symbols, scene data, unit list hygiene
- dependsOn: ['P1']
- size: moyen
- files:
  - src/ui/maps/scene.ts
  - src/ui/maps/overlay.ts
  - src/ui/maps/symbols.ts
  - src/ui/maps/units.ts
  - src/ui/maps/icons.ts
  - tests/unit/ui-maps.commissariats.test.ts

#### Changes
- scene.ts: commissariats: SceneCommissariat[], refreshed at most every 0.5 s in ensureFresh() from the service (type-only import); empty without the service.
- symbols.ts: drawCommissariatGlyph (« P » / « PP » / « G », tricolour bar, green badge, grey at 0) and a cached commissariatIconUrl.
- overlay.ts:
  - LayerMask.commissariats? and OverlayOptions.focusCommissariat?;
  - drawCommissariats after the routes and manifestations, before the orders;
  - radius 9 px (11 compact); label when mpp < 2.5 or the station is focused.
- units.ts:
  - the « véhicules de service hors unité » loop skips isHeldVehicle(ctx, v.id);
  - symbolOfVehicle('voiture_bac') = 'patrouille'.
- icons.ts: PATHS.building.

#### Tests
- A stub service through ctx.provide fills scene.commissariats.
- A held vehicle is absent from scene.units while a non-held one is still present.
- The voiture_bac symbol is 'patrouille'.
- drawOverlay with a recording fake 2D context draws the label when mpp < 2.5, and nothing when layers.commissariats === false.
- Nothing is drawn and nothing throws without the service.

### PACKAGE P5 — Tactical map: « Commissariats » tab, engage flow, « Rentrer au commissariat », keyboard and phone
- dependsOn: ['P1', 'P2', 'P3', 'P4']
- size: gros
- files:
  - src/ui/command/api.ts
  - src/ui/command/tacticalState.ts
  - src/ui/command/commissariatsModel.ts
  - src/ui/command/panelCommissariats.ts
  - src/ui/command/tacticalScreen.ts
  - src/ui/command/tacticalMap.ts
  - src/ui/command/tacticalKeys.ts
  - src/ui/command/panelUnits.ts
  - src/ui/command/orders.ts
  - src/ui/command/phrases.ts
  - src/ui/command/core.ts
  - src/ui/command/style.ts
  - tests/unit/ui-command.commissariats.test.ts

#### Changes
1. api.ts and tacticalState.ts: the new tab, open data, focusCommissariat and openEntry.

2. orders.ts: verb 'retour_poste' « Rentrer au commissariat », group 'fin', immediate, force 0. phrases.ts: its radio phrase.

3. core.ts:
(a) issue():
- 'retour_poste' → recall(s, from) and continue;
- a BRAV-M group (isBravmGroup or a special of kind 'bravm') with 'faire_mouvement' → issue 'colonne' with the geometry, without the « à pied » notice.
(b) recall(s, from):
- target = service.recall(s.id), else notify 'Aucun commissariat joignable';
- patrol → patrols.sendHome(s.id, target);
- hasVehicles → cmd.arrive(s.id, { …target, layout 'file', boardFirst true, stagger true, disembark false, urgence false });
- otherwise 'colonne' to the door;
- follow release, afterConvoy delete, trace, radio.
(c) engageFromCommissariat(entryId) → service.engage(entryId, playerId); then invalidateScope(); returns the result.

4. commissariatsModel.ts (pure):
- buildRows sorted by distance, with texts (km, « ≈ n min deux tons » from the vehicle path length ÷ 11 m/s, cached per site for 5 s), chips, entry state texts and actions;
- moveCursor for the arrows, Entrée and Échap.

5. panelCommissariats.ts:
- DOM with « Engager… », « Sélectionner », « Rentrer au commissariat » and « Centrer » buttons;
- read-only note;
- rebuilt only when the structure signature changes;
- data-id attributes for the e2e scenarios.

6. tacticalScreen.ts:
- TABS += commissariats (label 'Postes' when compact); LAYERS += commissariats;
- KeyC handled BEFORE the `scope().level === 'lecture'` early return: toggles the tab, opens the panel, focuses the first row;
- a station picked on the map opens the tab focused on it;
- engage ok → setSelection([squadId]), mode { kind 'order', verb: verbOf(defaultVerb) }, tab 'ordres', drawer closed when compact, map focused, ct-hint banner « Désignez la destination… »; failure → notify the reason;
- the units passed to keyboardSections / cycleUnitKey / commandableUnits use (id) => core.canCommand(id) && !(svc?.atPost(id) ?? false). The signatures are unchanged.

7. tacticalMap.ts: MapPick.commissariat, picked within 14 px (22 px on touch).

8. tacticalKeys.ts: legend line 'C = commissariats' only.

9. panelUnits.ts:
- selectAll skips atPost units;
- the card shows the station state;
- a « Rentrer au commissariat » button.

10. style.ts: the pane; rows at least 44 px high (48 compact); visible focus ring.

#### Tests
Headless, with the modules of ui-command.after-convoy.test.ts plus patrols and commissariats, commandant at Concorde:
- verbOf('retour_poste') is in group 'fin';
- engageFromCommissariat(FAUCON 9) returns 'colonne', and issue('faire_mouvement', [bravm]) gives order 'colonne' with no « à pied » notice;
- engage AQUILON 1, then issue('tenir', [section], [République]) IMMEDIATELY (same tick) → accepted (scope invalidated), convoy started, afterConvoy holds 'tenir';
- issue('retour_poste') → convoy destination within 1 m of the file centre, siren 0 after 30 s;
- a patrol's retour ends 'au_poste';
- role crs → refused, and the KeyC handler still opens the pane (DOM-less model test);
- buildRows sorting and texts; moveCursor covers every key;
- the composed callback excludes 'alerte' and 'au_poste' units while the company's sections keep digits 1..n (regression of ui-command.clavier).

### PACKAGE P6 — 3D dressing: entrance portal, sign, lantern, flag, painted bays, shared far mesh
- dependsOn: ['P1']
- size: moyen
- files:
  - src/render/commissariats/index.ts
  - src/render/commissariats/api.ts
  - src/render/commissariats/system.ts
  - src/render/commissariats/build.ts
  - src/render/commissariats/atlas.ts
  - harness/commissariats.html
  - harness/commissariats.ts
  - tests/unit/render-commissariats.budget.test.ts
  - tests/e2e/commissariats.mjs

#### Changes
Follow the src/render/props pattern: SystemOrder.VIEW, a no-op without ctx.view, and only '@/world/commissariats' imported.

atlas.ts: one shared 1024×512 CanvasTexture with the sign plates, the « POLICE » lantern face, the door glass lettering, the République plaque, the flag, the bay line and the ground lettering. In Node it returns null and vertex colours are used.

build.ts buildSite(def, groundAt):
- one merged façade geometry: portal frame 2.6 × 3.0 m with « POLICE » glass, 2 bollards, sign 4.2 × 0.7 m, lantern, flag pole and flag, plaque;
- one merged ground geometry for the bays, placed 0.02 m above the ground with polygonOffset;
- 2 materials shared by all sites; emissive intensity driven by the night level once per frame;
- at most 1 800 triangles and 2 meshes per site.
buildFar(defs): one merged mesh for all sites (lantern quad and flag, under 20 triangles per site), 1 draw call.

system.ts:
- near groups built lazily within 450 m, visible within 260 m (160 m on 'bas');
- far mesh visible from 260 m to 900 m (600 m on 'bas') when its site's near group is hidden. Per-site visibility uses a vertex attribute or draw-range groups ordered by site, and must still be 1 draw call;
- dispose on session end.

harness: one site of each sign kind, day/night toggle.

#### Tests
Budget test (Node): for every site ≤ 2 meshes and ≤ 1 800 triangles; 2 unique materials; every vertex within 30 m of the door; bay quad count equals the slot count; the far mesh is 1 geometry under 150 triangles in total.

e2e on the harness: day and night screenshots; the lantern is brighter at night; the sign region is non-uniform; at 390×844 the draw calls are ≤ base + 2 per near site + 1.

### PACKAGE P8 — Integration: wiring, guards in all consumers, traffic bays, end-to-end scenario
- dependsOn: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']
- size: moyen
- files:
  - src/main.ts
  - src/gameplay/session/journee.ts
  - src/gameplay/session/follow.ts
  - src/gameplay/session/engins.ts
  - src/gameplay/law/handover.ts
  - src/sim/crowd/radical/assess.ts
  - src/sim/crowd/detour.ts
  - src/sim/traffic/car-clear.ts
  - src/sim/traffic/parking.ts
  - tests/unit/integration.commissariats.test.ts
  - tests/unit/traffic.commissariats.test.ts
  - tests/e2e/verif-commissariats.mjs
  - tests/e2e/run-all.mjs

#### Changes
1. main.ts: the gameplay commissariats module after patrols; the render commissariats module after renderProps.

2. journee.ts engageOthers(): skip isStationUnit(s.id).

3. Guards, one line each, with isHeldVehicle(ctx, v.id) from '@/world/commissariats':
- follow.ts: in the fleet loop; POLICE_FLEET += 'voiture_bac';
- engins.ts: in keepEscorts() (no CRS escort for parked Centaures or water cannons);
- handover.ts: find() skips held vehicles;
- assess.ts: skip held vehicles;
- detour.ts: refresh() skips held vehicles (no false barrages on station streets);
- car-clear.ts: in waiting(), skip held vehicles in the « police vehicle stopped just behind » test.

4. parking.ts: drop curb slots within 6 m of reservedBays() (deterministic, module-independent).

5. run-all.mjs: register verif-commissariats.mjs.

#### Tests
integration.commissariats.test.ts:
(a) The journée CRS scenario of integration.journee.test.ts with commissariats and patrols added keeps the same expectations.
(b) Journée commandant with BRAV-M: engage FAUCON 9 and send it to République; at the journée return it is not ordered to the journée base; the session BRAV-M still follows (regression of integration.journee.bravm.test.ts).
(c) Near the Cité, « Me suivre en colonne » never takes a held vehicle.
(d) After 120 s with a company in a session near the Cité, no squad order targets a held Centaure or water cannon (engins escort guard).
(e) A crowd detour refresh with a station's bays on the route does not mark that edge as barred.
(f) A civilian car that pulled over beside the 9e bays resumes within 30 s once the convoy has passed.

traffic.commissariats.test.ts (real map): no parked civilian car intersects a bay ring; the parked count elsewhere is within ±3 % (logged).

verif-commissariats.mjs (laptop, then 390×844 touch):
- Tab, C, 7 rows; 9e → TV 75-19 → Entrée → banner; designate → after 60 s the unit is > 100 m away with the siren on; retour → « Au repos »;
- read-only CRS: C shows the pane without buttons;
- phone: tap the symbol, Engager, tap the map;
- screenshots at the 9e door at 14 h and 22 h; perf pass (pattern of verif-tpm-perf.mjs) ≤ +0.3 ms per frame.

Then run the whole vitest suite and every browser scenario.
