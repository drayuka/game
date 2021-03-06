/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('type.worker');
 * mod.thing == 'a thing'; // true
 */

import { Utils as utils } from "./utils"
import { GoalClass } from "./goal";
import { JobClass } from "./job";
import { CreepClass } from "./creep";
import { MissionJobClass } from "./mission.job"
import { Mission } from "./mission.job"
import { MissionGenerators } from "./mission.job"
import * as _ from "lodash"

export class RoomworkerJob extends MissionJobClass {
    execute () {
        var self = this;
        self.updateRequisition();
        self.generateMissions();
        self.assignMissions();
        self.runMissions();
    }
    getWorkerPower() {
        var self = this;
        var room = Game.rooms[self.parentClaim];
        return self.jobs.spawn.powerForCost('roomworker', room.energyCapacityAvailable);
    }
    get missionGenerators() : MissionGenerators {
        var self = this;
        return {
            repairRoads: {
                init: function (missionMem: any) {
                    missionMem.missions = {};
                    missionMem.lastCheck = {};
                },
                new: function (missionMem: any, rooms: string[]) : Mission[] {
                    var newMissions : Mission[] = [];
                    _.forEach(rooms, function (roomName) {
                        var room = Game.rooms[roomName];
                        // can't see in the room, can't check the roads
                        if(!room) {
                            return true;
                        }
                        // already have a mission to repair roads in this room
                        if(missionMem.missions[room.name]) {
                            return true;
                        }
                        // only check every 1000 ticks
                        if(missionMem.lastCheck[room.name] + 1000 > Game.time) {
                            return true;
                        }
                        missionMem.lastCheck[room.name] = Game.time;
                        console.log('checking road repair in ' + room.name);
                        var maxWorkerPower = self.getWorkerPower();
                        //max amount of energy that can be carried by the creep - 20% so that we can repair to full
                        var maxRepair = maxWorkerPower * 150 * 100 * .8;
                        var structures = <Structure[]>room.find(FIND_STRUCTURES);
                        var needsRepair = false;
                        var currentRepairAmount = 0;
                        var roadsNeedingRepair: string[] = [];
                        _.forEach(structures, function (struct) {
                            if(struct.structureType != STRUCTURE_ROAD) {
                                return true;
                            }
                            currentRepairAmount += struct.hitsMax - struct.hits;
                            if(struct.hitsMax != struct.hits) {
                                roadsNeedingRepair.push(struct.id);
                            }
                            if(!needsRepair && currentRepairAmount >= maxRepair) {
                                needsRepair = true;
                            }
                            if(!needsRepair && struct.hits/struct.hitsMax < .3) {
                                //emergency repairs needed
                                needsRepair = true;
                            }
                        });
                        // doesn't need repair move along, but only check 1 per tick
                        if(!needsRepair) {
                            return false;
                        }
                        var mission : Mission = {
                            missionName: 'repairRoads',
                            maxWorkers: 1,
                            runner: 'runMission',
                            missionInit: 'creepMissionInit',
                            creeps: [],
                            priority: 1,
                            other: {
                                roomName: room.name,
                                roads: roadsNeedingRepair
                            }
                        }
                        missionMem.missions[room.name] = 1;
                        newMissions.push(mission);
                        // only check 1 room per tick;
                        return false;
                    });
                    return newMissions;
                },
                remove: function (missionMem: any, mission: Mission) {
                    delete missionMem.missions[mission.other.roomName];
                },
                creepMissionInit:  function (creep : CreepClass) {
                    creep.memory.missionStatus = {
                        gettingEnergy : false,
                        repairingRoad : false,
                        target: undefined,
                        sortTimer: 0
                    }
                },
                runMission: function (mission: Mission, creeps: CreepClass[]) {
                    // should only be one creep
                    var creep = creeps[0];
                    if(creep.memory.missionStatus.gettingEnergy) {
                        if(self.getEnergy(creep)) {
                            creep.memory.missionStatus.gettingEnergy = false;
                        }
                    } else if(creep.memory.missionStatus.repairingRoad) {
                        
                        var roads: StructureRoad[] = [];
                        if(creep.pos.roomName != mission.other.roomName) {
                            creep.navigateToRoom
                            return {continue: true};
                        }
                        //creep has arrived at target, wipe target
                        if(creep.arrived()) {
                            delete creep.memory.missionStatus.target;
                            delete creep.memory.arrived;
                        }
                        if(!creep.memory.missionStatus.target) {
                            roads = _.map(mission.other.roads, function (roadid: string) {
                                return <StructureRoad>Game.getObjectById(roadid)
                            });
                            roads = _.sortBy(roads,function (a) {
                                return a.pos.getRangeTo(creep.pos);
                            });
                            var furthestRoad = roads[roads.length-1];
                            creep.memory.missionStatus.target = furthestRoad.id;
                            var newGoal = new GoalClass(undefined, mission.other.roomName, furthestRoad, {range: 3, halts: true});
                            creep.goal = newGoal;
                        }
                        var roadsNotRepaired: StructureRoad[] = [];
                        var roadsRemoved: string[] = [];
                        var needToStort: boolean = false;
                        if(roads) {
                            mission.other.roads = _.map(roads, function (road) {
                                return road.id;
                            });
                            creep.memory.missionStatus.sortTimer = Game.time + 2;
                        } else if(Game.time > creep.memory.missionStatus.sortTimer) {
                            mission.other.roads = _.sortBy(mission.other.roads, function (roadid: string) {
                                var road = <StructureRoad>Game.getObjectById(roadid);
                                if(!road) {
                                    return 0;
                                } else {
                                    return road.pos.getRangeTo(creep.pos);
                                }
                            });
                        }
                        mission.other.roads = _.dropWhile(mission.other.roads, function (roadid: string) {
                            var road = <StructureRoad>Game.getObjectById(roadid);
                            // if we couldn't find it, give up.
                            if(!road) {
                                return true;
                            }
                            // if it is 
                            if(road.hits/road.hitsMax > .9) {
                                roadsRemoved.push(road.id);
                                return true;
                            } else if(road.pos.getRangeTo(creep.pos) > 3 && creep.memory.missionStatus.sortTimer <= Game.time) {
                                return false;
                            }
                        });
                        // no more roads that need repair that we know about
                        if(mission.other.roads.length = 0) {
                            return {continue: false}
                        }
                        var closestRoad = <StructureRoad>Game.getObjectById(mission.other.roads[0]);
                        if(closestRoad.pos.getRangeTo(creep.pos) <= 3) {
                            creep.repair(closestRoad);
                            creep.memory.missionStatus.sortTimer++;
                        }
                        //if we aren't done but we are out of energy, stop having the repair road status
                        if(creep.carry[RESOURCE_ENERGY] == 0) {
                            return {
                                creepsToGiveBack: [creep.name],
                                continue: true
                            };
                        }
                        creep.navigate();
                    } else {
                        if(creep.carry[RESOURCE_ENERGY] == creep.carryCapacity) {
                            creep.memory.missionStatus.repairingRoad = true;
                        } else {
                            creep.memory.missionStatus.gettingEnergy = true;
                        }
                    }
                    return {continue: true};
                }
            },
            buildStructures: {
                new: function (missionMem: any, rooms :string[]) : Mission[] {
                    var newMissions : Mission[] = [];
                    _.forEach(rooms, function (roomName) {
                        var room = Game.rooms[roomName];
                        if(!room) {
                            return;
                        }
                        var newBuildSites: ConstructionSite[] = room.find(FIND_MY_CONSTRUCTION_SITES, {filter: function (site: ConstructionSite) {
                            if(missionMem.missions[site.id]) {
                                return false;
                            } 
                            return true;
                        }});
                        if(newBuildSites.length == 0) {
                            return true;
                        }
                        newMissions.push(...<Mission[]>_.map(newBuildSites, function (buildSite) {
                            missionMem.missions[buildSite.id] = true;
                            var pos = undefined;
                            var type = undefined;
                            if(buildSite.structureType == STRUCTURE_RAMPART || buildSite.structureType == STRUCTURE_WALL) {
                                pos = [buildSite.pos.x, buildSite.pos.y, buildSite.pos.roomName];
                                type = buildSite.structureType;
                            }
                            return {
                                missionName: 'buildStructures',
                                maxWorkers: Infinity,
                                runner: 'runMission',
                                missionInit: 'creepMissionInit',
                                creeps: [],
                                priority: 2,
                                other: {
                                    buildSiteId: buildSite.id,
                                    pos: pos,
                                    type: type
                                }
                            };
                        }));
                    });
                    return newMissions;
                },
                init: function (missionMem: any) {
                    missionMem.missions = {};
                },
                remove: function (missionMem: any, mission: Mission) {
                    delete missionMem.missions[mission.other.buildSiteId];
                },
                runMission: function (mission: Mission, creeps: CreepClass[]) {
                    var doneCreeps : CreepClass[] = [];
                    var buildSite = <ConstructionSite>Game.getObjectById(mission.other.buildSiteId);
                    var defSite: Structure;
                    if(!buildSite) {
                        // if this is a rampart or wall we need to build it up a bit, before we let other jobs deal with it
                        if(mission.other.type == STRUCTURE_RAMPART || mission.other.type == STRUCTURE_WALL) {
                            if(mission.other.defSite) {
                                defSite = <Structure>Game.getObjectById(mission.other.defSite);
                                if(!defSite) {
                                    throw new Error('couldnt find the ' + mission.other.type + ' at ' + JSON.stringify(mission.other.pos));
                                }
                                // defense site is high enough, we can build it up normally;
                                if(defSite.hits > 10000) {
                                    return {
                                        continue: false
                                    }
                                }
                            } else {
                                var pos = new RoomPosition(mission.other.pos[0], mission.other.pos[1], mission.other.pos[2]);
                                var structures = _.filter(<Structure[]>pos.lookFor(LOOK_STRUCTURES), function (struct: Structure) {
                                    return struct.structureType == mission.other.type;
                                });
                                if(structures.length == 0) {
                                    throw new Error('couldnt find the ' + mission.other.type + ' at ' + JSON.stringify(mission.other.pos));
                                }
                                defSite = structures[0];
                                mission.other.defSite = defSite.id;
                            }
                        } else {
                            return {
                                continue: false
                            }
                        }
                    }
                    _.forEach(creeps, function (creep) {
                        if(creep.memory.missionStatus.gettingEnergy) {
                            if(self.getEnergy(creep)) {
                                creep.memory.missionStatus.gettingEnergy = false;
                            }
                        } else if(creep.memory.missionStatus.buildingStructure) {
                            if(!creep.memory.goal) {
                                var newgoal = new GoalClass(undefined, buildSite.pos.roomName, buildSite.id, {range: 3, halts: true});
                            }
                            if(creep.arrived()) {
                                if(buildSite) {
                                    creep.build(buildSite);
                                } else if (defSite) {
                                    creep.repair(defSite);
                                }
                            } else {
                                creep.navigate();
                            }
                            if(creep.carry[RESOURCE_ENERGY] == 0) {
                                doneCreeps.push(creep);
                            }
                        } else {
                            if(creep.carry[RESOURCE_ENERGY] == creep.carryCapacity) {
                                creep.memory.missionStatus.buildingStructure = true;
                            } else {
                                creep.memory.missionStatus.gettingEnergy = true;
                            }
                        }
                    });
                    return {
                        creepsToGiveBack: doneCreeps,
                        continue: true
                    }
                },
                creepMissonInit: function (creep: CreepClass) {
                    creep.memory.missionStatus = {
                        gettingEnergy : false,
                        buildingStructure : false
                    };
                }
            },
            upgradeWallsAndRamparts: {
                init: function (missionMem: any) : void {
                    missionMem.missions = {};
                    missionMem.roomDefenseLimits = {};
                    missionMem.lastCheck = {};
                    missionMem.lastDefenseCompletion = {};
                    missionMem.lastDefenseRaise = {};
                },
                new: function (missionMem: any, rooms: string[]) : Mission[] {
                    var newMissions : Mission[] = [];
                    _.forEach(rooms, function (roomName) {
                        var room = Game.rooms[roomName];
                        // cant see the room, i don't even
                        if(!room) {
                            return true;
                        }
                        // skip any room which doesn't have a controller, owner, or where the owner of the controller isn't us
                        if(!room.controller || !room.controller.owner || room.controller.owner.username != global.username) {
                            return true;
                        }
                        if(missionMem.lastCheck + 1000 > Game.time) {
                            return true;
                        }
                        missionMem.lastCheck = Game.time;

                        // already have a mission to up the def in this room;
                        if(missionMem.missions[roomName]) {
                            return true;
                        }
                        if(!missionMem.roomDefenseLimits[roomName]) {
                            missionMem.roomDefenseLimits[roomName] = 100000;
                            //only upgrade defense maximums if:
                            //1. it is lower than 10 million
                            //2. we haven't done it in ~1 day 
                            //3. we have completed at least one mission for this room since the last time we raised it
                        } else if (missionMem.roomDefenseLimits[roomName] < 10000000 
                            && missionMem.lastDefenseRaise[roomName] + 30000 < Game.time 
                            && missionMem.lastDefenseCompletion[roomName] > missionMem.lastDefenseRaise[roomName]) {
                            // if we're maxed at controller level, start building defenses more readily
                            if(room.controller.level == 8) {
                                missionMem.roomDefenseLimits[roomName] += 500000;
                            } else {
                                missionMem.roomDefenseLimits[roomName] += 100000;  
                            }
                        }
                        // if any of our defenses are critically low, raise the priority
                        var emergency = false;
                        var defSites : Structure[]= <Structure[]>room.find(FIND_STRUCTURES, {filter: function (struct: Structure) {
                            if(struct.structureType != STRUCTURE_RAMPART && struct.structureType != STRUCTURE_WALL) {
                                return false;
                            }
                            if(struct.hits < missionMem.roomDefenseLimits[roomName] *.9) {
                                return true;
                            }
                            if(struct.hits < 100000) {
                                emergency = true;
                                return true;
                            }
                            return false;
                        }});
                        if(defSites.length = 0) {
                            return false;
                        }

                        var priority = 3;
                        if(emergency) {
                            priority = 1;
                        }
                        newMissions.push({
                            missionName: 'upgradeWallsAndRamparts',
                            maxWorkers: Infinity,
                            runner: 'runMission',
                            missionInit: 'creepMissionInit',
                            creeps: [],
                            priority: priority,
                            other: {
                                roomName: roomName,
                                defSites: _.pluck(defSites, 'id'),
                                takenSites: {},
                                targetHits: missionMem.roomDefenseLimits[roomName]
                            }
                        });
                        missionMem.missions[roomName] = true;

                        // only check 1 room a tick
                        return false;
                    });
                    return newMissions;
                },
                remove: function (missionMem: any, mission: Mission) {
                    delete missionMem.missions[mission.other.roomName];
                    missionMem.lastDefenseCompletion[mission.other.roomName] = Game.time;
                },
                runMission: function (mission: Mission, creeps: CreepClass[]) {
                    var removeSites : string[] = [];
                    var doneCreeps : string[] = [];
                    _.forEach(creeps, function (creep) {
                        if(!creep.memory.missionStatus.target) {
                            return true;
                        }
                        var defObj = <Structure>Game.getObjectById(creep.memory.missionStatus.target);
                        if(defObj.hits > mission.other.targetHits) {
                            removeSites.push(defObj.id);
                            creep.memory.missionStatus.target = undefined;
                        }
                    });
                    mission.other.defSites = _.difference(mission.other.defSites, removeSites);
                    if(mission.other.defSites.length == 0) {
                        return {continue: false};
                    }
                    _.forEach(creeps, function (creep) {
                        if(creep.memory.missionStatus.gettingEnergy) {
                            if(self.getEnergy(creep)) {
                                creep.memory.missionStatus.gettingEnergy = false;
                            }
                        } else if(creep.memory.missionStatus.repairingDefense) {
                            if(!creep.memory.missionStatus.target) {
                                var availableSites = _.difference(mission.other.defSites, _.keys(mission.other.takenSites));
                                var closestSite;
                                // there are available sites which are not being repaired by another creep
                                if(availableSites.length > 0) {
                                    closestSite = _.sortBy(availableSites, function (site : string) {
                                        var siteObj = <Structure>Game.getObjectById(site);

                                        if(siteObj.hits >= mission.other.targetHits) {
                                            return 51;
                                        }
                                        return siteObj.pos.getRangeTo(creep.pos);
                                    })[0];
                                    //all sites are being repaired
                                } else {
                                    closestSite = _.sortBy(mission.other.defSites, function (site : string) {
                                        var siteObj = <Structure>Game.getObjectById(site);
                                        if(siteObj.hits >= mission.other.targetHits) {
                                            return 51;
                                        }
                                        return siteObj.pos.getRangeTo(creep.pos);
                                    })[0];
                                }
                                creep.memory.missionStatus.target = closestSite;
                                creep.goal = new GoalClass(undefined, mission.other.roomName, creep.memory.missionStatus.target, {halts: true, range: 3});
                            }
                            if(creep.arrived()) {
                                var defObj = <Structure>Game.getObjectById(creep.memory.missionStatus.target);
                                creep.repair(defObj);
                            } else {
                                creep.navigate();
                            }

                            if(creep.carry[RESOURCE_ENERGY] == 0) {
                                doneCreeps.push(creep.name);
                            }
                        } else {
                            if(creep.carry[RESOURCE_ENERGY] == creep.carryCapacity) {
                                creep.memory.missionStatus.repairingDefense = true;
                            } else {
                                creep.memory.missionStatus.gettingEnergy = true;
                            }
                        }
                    });
                    return {
                        creepsToGiveBack: doneCreeps,
                        continue: true
                    };
                },
                creepMissionInit: function (creep: CreepClass) : void {
                    creep.memory.missionStatus = {
                        gettingEnergy : false,
                        repairingDefense : false,
                        target: undefined
                    };
                }
            }
        }
    }
    updateRequisition () {
        var self = this;
        var creepsToSpawn = _.reduce(self.rooms, function (total, roomName) {
            var room = Game.rooms[roomName];
            if(!room) {
                return total;
            }
            if(room.controller && room.controller.owner && room.controller.owner.username != global.username) {
                return total;
            }
            if(room.controller && room.controller.my) {
                return total + 1.5;
            }
            return total + .5;
        },0);
        self.jobs.spawn.addRequisition([{
            power: self.getWorkerPower(),
            type: 'roomworker',
            memory: {},
            id: self.parentClaim,
            jobName: self.name,
            parentClaim: self.parentClaim,
            waitingSince: Game.time,
            newClaim: undefined
        }]);
    }
}
