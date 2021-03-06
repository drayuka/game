/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('job');
 * mod.thing == 'a thing'; // true
 */
import "utils"
import { UpgradeJob } from "./job.upgrade";
import { SpawnJob } from "./job.spawn";
import { HarvestJob } from "./job.harvest"
import { LogisticsJob } from "./job.logistics"
import { ClaimJob } from "./job.claim"
import { ScoutJob } from "./job.scout"
import { ReserveJob } from "./job.reserve"
import { RoomworkerJob } from "./job.roomworker"
import { LinkJob } from "./job.links"
import { ProtectorJob } from "./job.protector"
import { TowerJob } from "./job.tower"
import { LoaderJob } from "./job.loader"
import { InitialRoomJob } from "./job.initial"
import * as _ from "lodash"


interface roomMemory {
    upgrading : boolean,
    claimed : boolean,
    claiming : boolean,
    linking : number,
    mining : boolean,
    roomworker : boolean,
    harvest : boolean,
    scout : boolean,
    reserve : boolean,
    logistics : boolean,
    protector : boolean,
    storage : boolean,
}

var jobNames = [
    'upgrade',
    'spawn',
    'harvest',
    'logistics',
    'bootstrap',
    'claim',
    'scout',
    'reserve',
    'roomworker',
    'links',
    'protector',
    'tower',
    'loader',
    'initial'
];

export interface JobList {
    upgrade : UpgradeJob,
    spawn : SpawnJob,
    harvest : HarvestJob,
    logistics : LogisticsJob,
    bootstrap : Bootstrap,
    claim : ClaimJob,
    scout : ScoutJob,
    reserve : ReserveJob,
    roomworker : RoomworkerJob,
    links : LinkJob,
    protector : ProtectorJob,
    tower : TowerJob,
    loader : LoaderJob,
    initial: InitialRoomJob
}

interface roomDirectory {
    [key: string] : claimedRoom
}

interface claimedRoom {
    roomMemory : roomMemory,
    subRooms : {
        [key : string] : subRoom
    },
    jobs : JobList
}
//not much of a difference between reserved and 
//sub claimed at the moment, but there
//could be in the future.
interface subRoom {
    type: string
    roomMemory : roomMemory
}
// can be called with just name, or with target as well
export class Bootstrap {
    _subRoomToClaimedRoom : {[key: string] : string} | null;
    memory: any;
    execute() {
        var self = this;
        self.checkRooms();
        self.runRooms();
        self.cleanupDeadCreeps();
    }
    constructor() {
        var self = this;
        if(!Memory.jobs.bootstrap) {
            Memory.jobs.bootstrap = {};
        }
        self.memory = Memory.jobs.bootstrap;
    }
    get claimedRooms () : roomDirectory {
        var self = this;
        if(!self.memory.claimedRooms) {
            self.memory.claimedRooms = {};
        }
        return self.memory.claimedRooms;
    }
    set claimedRooms (roomList) {
        var self = this;
        self.memory.claimedRooms = roomList;
    }
    //alternative to patchHarness having to
    //claim and reserve rooms, setup flagging system.
    scanForRooms() {
        var self = this;
        _.forEach(Game.flags, function (flag) {
            if(flag.pos.roomName) {

            }
        });
    }
    claimRoom (claimedRoomName : string) {
        var self = this;
        if(!claimedRoomName) {
            throw new Error('no claimed room name');
        }
        if(self.claimedRooms[claimedRoomName]) {
            throw new Error('room ' + claimedRoomName + ' is already claimed');
        }
        var room = Game.rooms[claimedRoomName];
        if(room && !room.controller) {
            throw new Error(claimedRoomName + ' does not have a controller');
        }
        if(room && room.controller) {
            if(room.controller.owner && room.controller.owner.username != global.username) {
                throw new Error(claimedRoomName + ' is currently claimed by ' + room.controller.owner.username);
            }
        } else if (!Game.map.isRoomAvailable) {
            throw new Error(claimedRoomName + ' is unavailable for claiming');
        }
        self.claimedRooms[claimedRoomName] = {
            roomMemory: {
                upgrading : false,
                claiming : false,
                claimed : false,
                linking : 0,
                mining : false,
                roomworker : false,
                harvest : false,
                scout : false,
                reserve : false,
                logistics : false,
                protector : false,
                storage : false
            }, 
            subRooms: {}, 
            jobs: <JobList>{}
        };
        self.initalizeRoom(self.claimedRooms[claimedRoomName], claimedRoomName);
        var claimedRoom = self.claimedRooms[claimedRoomName];
        var room = Game.rooms[claimedRoomName];
        if(room && room.controller && room.controller.owner && room.controller.owner.username == global.username) {
            claimedRoom.roomMemory.claimed = true;
            //if the room is already claimed we don't need to scout it
            claimedRoom.roomMemory.scout = true;
            return;
        }
        claimedRoom.roomMemory.scout = true;
        claimedRoom.roomMemory.claiming = true;
        claimedRoom.roomMemory.roomworker = true;
        claimedRoom.roomMemory.protector = true;
        claimedRoom.jobs.protector.addRoomToProtect(claimedRoomName);
        claimedRoom.jobs.scout.addRoomToScout(claimedRoomName);
        claimedRoom.jobs.claim.addRoomToClaim(claimedRoomName);
        return;
    }
    //reserve a room for use by a claimed room, this means that the claimed room should spawn everything
    //claimed rooms without spawns cannot reserve any rooms
    reserveRoom (reservedRoomName : string, claimedRoomName : string) {
        var self = this;
        if(!reservedRoomName) {
            throw new Error('no reservedRoomName');
        } else if (!claimedRoomName) {
            throw new Error('no claimedRoomName');
        }
        if(!self.claimedRooms[claimedRoomName]) {
            throw new Error('room ' + claimedRoomName + ' is not a recorded claimed room and cannot be used as the parent of room ' + reservedRoomName + ' for reservation');
        }
        if(!Game.rooms[claimedRoomName]) {
            throw new Error('claimed room ' + claimedRoomName + ' is not visible');
        }
        if(self.subRoomToClaimRoom[reservedRoomName]) {
            throw new Error('reserved ' + reservedRoomName + ' already reserved by ' + self.subRoomToClaimRoom[reservedRoomName]);
        }
        var room = Game.rooms[reservedRoomName];
        if(room && !room.controller) {
            throw new Error('reserved room ' + reservedRoomName + ' does not have a controller');
        }
        if(room && room.controller && room.controller.owner) {
            throw new Error(reservedRoomName + ' is already owned by ' + room.controller.owner.username);
        }

        //all checks are done, add it in;
        self.claimedRooms[claimedRoomName].subRooms[reservedRoomName] = {
            roomMemory : {
                upgrading : false,
                claiming : false,
                claimed : false,
                linking : 0,
                mining : false,
                roomworker : false,
                harvest : false,
                scout : false,
                reserve : false,
                logistics : false,
                protector : false,
                storage : false
            },
            type: 'reserved'
        };
        var reserveRoom = self.claimedRooms[claimedRoomName].subRooms[reservedRoomName];
        var claimedRoom = self.claimedRooms[claimedRoomName];
        claimedRoom.jobs.scout.addRoomToScout(reservedRoomName);
        claimedRoom.jobs.reserve.addRoomToReserve(reservedRoomName);
        claimedRoom.jobs.protector.addRoomToProtect(reservedRoomName);
        reserveRoom.roomMemory.protector = true;
        reserveRoom.roomMemory.roomworker = true;
        reserveRoom.roomMemory.scout = true;
        reserveRoom.roomMemory.reserve = true;
        //reset so that this reserve room now appears there.
        delete self._subRoomToClaimedRoom;
    }
    SubClaimRoom(subClaimRoomName : string, claimedRoomName: string) {
        var self = this;
        if(!subClaimRoomName) {
            throw new Error('no sub claimed room name');
        } else if(!claimedRoomName) {
            throw new Error('no claimed room name');
        }
        if(!self.claimedRooms[claimedRoomName]) {
            throw new Error('room ' + claimedRoomName + ' is not a recorded claimed room and cannot be used as the parent of room ' + subClaimRoomName + ' for sub claiming');
        }
        if(!Game.rooms[claimedRoomName]) {
            throw new Error('claimed room ' + claimedRoomName + ' is not visible');
        }
        if(self.subRoomToClaimRoom[subClaimRoomName]) {
            throw new Error('sub claim room ' + subClaimRoomName + ' already covered by ' + self.subRoomToClaimRoom[subClaimRoomName]);
        }
        var room = Game.rooms[subClaimRoomName];
        if(room && !room.controller) {
            throw new Error('sub claim room ' + subClaimRoomName + ' does not have a controller');
        }
        if(room && room.controller && room.controller.owner) {
            throw new Error(subClaimRoomName + ' is already owned by ' + room.controller.owner.username);
        }

        self.claimedRooms[claimedRoomName].subRooms[subClaimRoomName] = {
            roomMemory : {
                upgrading: false,
                claiming: false,
                claimed: false,
                linking : 0,
                mining : false,
                roomworker: false,
                harvest: false,
                scout: false,
                reserve: false,
                logistics: false,
                protector: false,
                storage: false
            },
            type: 'claimed'
        };
        var subRoom = self.claimedRooms[claimedRoomName].subRooms[subClaimRoomName];
        var claimedRoom = self.claimedRooms[claimedRoomName];
        claimedRoom.jobs.scout.addRoomToScout(subClaimRoomName);
        claimedRoom.jobs.claim.addRoomToClaim(subClaimRoomName);
        claimedRoom.jobs.protector.addRoomToProtect(subClaimRoomName);
        subRoom.roomMemory.protector = true;
        subRoom.roomMemory.roomworker = true;
        subRoom.roomMemory.scout = true;
        subRoom.roomMemory.claiming = true;
        delete self._subRoomToClaimedRoom;
    }
    transitionRoom(transitionRoomName: string, claimedRoomName: string) {
        var self = this;

    }
    //also automatically unreserves all rooms associated with that claimed room
    unClaimRoom (claimedRoomName : string) {
        var self = this;
        if(!self.claimedRooms[claimedRoomName]) {
            throw new Error('room ' + claimedRoomName + ' cannot be unclaimed as it was not claimed');
        }
        if(!Game.rooms[claimedRoomName]) {
            throw new Error('cant see room ' + claimedRoomName + ' to unclaim');
        }
        var room = Game.rooms[claimedRoomName];
        if(!room.controller) {
            throw new Error('attempted to unclaim ' + claimedRoomName + ' but somehow it doesnt have a controller');
        }

        room.controller.unclaim();
        //delete spawn requests
        delete global.spawn.requisitions[claimedRoomName];
        //delete memory for all jobs.
        delete Memory.jobs[claimedRoomName];
        //delete bootstrap memory for room
        delete self.claimedRooms[claimedRoomName];
    }
    unReserveRoom (reservedRoomName : string) {
        throw new Error('unreserve room is currently non functional');
        var self = this;
        if(!self.subRoomToClaimRoom[reservedRoomName]) {
            throw new Error('room ' + reservedRoomName + ' cannot be unreserved as it was not reserved');
        }
        var claimedRoomName = self.subRoomToClaimRoom[reservedRoomName];

        var claimedRoom = self.claimedRooms[claimedRoomName];
        var roomMemory = claimedRoom.subRooms[reservedRoomName].roomMemory;
        if(roomMemory.scout) {
            claimedRoom.jobs.scout.removeRoom(reservedRoomName);
        }
        if(roomMemory.reserve) {
            claimedRoom.jobs.reserve.removeRoom(reservedRoomName);
        }
        if(roomMemory.protector) {
            claimedRoom.jobs.protector.removeRoomToProtect(reservedRoomName);
        }
        if(roomMemory.harvest) {
            claimedRoom.jobs.harvest.removeSources(reservedRoomName);
        }
        claimedRoom.jobs.logistics.removeRoomNodesAndCleanup(reservedRoomName);
        delete claimedRoom.subRooms[reservedRoomName];
    }
    get subRoomToClaimRoom() {
        var self = this;
        if(self._subRoomToClaimedRoom) {
            return self._subRoomToClaimedRoom;
        }
        self._subRoomToClaimedRoom = {};
        _.forEach(self.claimedRooms, function (claimedRoom, claimedRoomName) {
            _.forEach(self.claimedRooms[claimedRoomName].subRooms, function (reservedRoom, reservedRoomName) {
                self._subRoomToClaimedRoom[reservedRoomName] = claimedRoomName;
            });
        });
        return self._subRoomToClaimedRoom;
    }
    initializeRooms() {
        var self = this;
        _.forEach(self.claimedRooms, function (claimedRoom, claimedRoomName) {
            self.initalizeRoom(claimedRoom, claimedRoomName);
        });
    }
    initalizeRoom(claimedRoom : claimedRoom, claimedRoomName: string) {
        var self = this;
        if(!claimedRoom.jobs) {
            claimedRoom.jobs = <JobList>{};
            _.forEach(global.jobClasses, function (jobClass, jobName: string) {
                try {
                    if(jobName == 'spawn') {
                        //kind of a hacky way to deal with global non-bootstrap jobs like spawn
                        claimedRoom.jobs[jobName] = global.spawn;
                    } else if(jobName == 'scout') {
                        claimedRoom.jobs[jobName] = global.scout;
                    } else {
                        (<any>claimedRoom.jobs)[jobName] = new jobClass(jobName, claimedRoomName, claimedRoom.jobs);
                    }
                } catch (e) {
                    console.log('job ' + jobName + ' had the following error on instantiation:');
                    console.log(e.stack);
                    debugger;
                }
            });
            claimedRoom.jobs.bootstrap = self;
        }
    }
    runRooms() {
        var self = this;
        _.forEach(self.claimedRooms, function (claimedRoom: claimedRoom, claimedRoomName : string) {
            _.forEach(claimedRoom.jobs, function (job, jobName) {
                try {
                    job.execute();
                } catch (e) {
                    console.log('job ' + jobName + ' had the following error when executing:');
                    console.log(e.stack);
                    debugger;
                }
            });
        });
    }
    checkRooms() {
        var self = this;
        _.forEach(self.claimedRooms, function (claimedRoom: claimedRoom, claimedRoomName: string) {
            try {
                self.checkClaimedRoom(claimedRoomName, claimedRoom);
            } catch (e) {
                console.log('had problems checking rooms for ' + claimedRoomName + ' had the following error: ');
                console.log(e.stack);
                debugger;
            }
        })
    }
    cleanupDeadCreeps() {
        var self = this;
        _.forEach(Memory.creeps, function (creep: any ,name: string) {
            if(!Game.creeps[name]) {
                delete Memory.creeps[name];
            }
        });
    }
    //TODO: FIX AS THIS DOES NOT CURRENTLLY WORK
    promoteRoomToClaimRoom(roomName: string) {
        var self = this;
        if(!self.subRoomToClaimRoom[roomName]) {
            throw new Error('cant promote a room that isnt a sub room');
        }
        var room = Game.rooms[roomName];
        if(!room) {
            throw new Error('cant promote a room that isnt visible');
        }
        if(!room.storage) {
            throw new Error('cant promote a room that doesnt have a central storage');
        }
        var claimedRoomName = self.subRoomToClaimRoom[roomName];
        var claimedRoom = self.claimedRooms[claimedRoomName];
        var subClaimRoom = claimedRoom.subRooms[roomName];
        var roomMemory = subClaimRoom.roomMemory;

        if(roomMemory.scout) {
            claimedRoom.jobs.scout.removeRoom(roomName);
        }
        if(roomMemory.claimed) {
            claimedRoom.jobs.upgrade.removeRoom(roomName);
        }
        if(roomMemory.protector) {
            claimedRoom.jobs.protector.removeRoomToProtect(roomName);
        }
        if(roomMemory.harvest) {
            claimedRoom.jobs.harvest.removeSources(roomName);
        }
        claimedRoom.jobs.logistics.removeRoomNodesAndCleanup(roomName);
        delete claimedRoom.subRooms[roomName];
        delete self._subRoomToClaimedRoom;
        self.claimRoom(roomName);
    }
    checkSubClaimedRoom(roomName: string, subClaimedRoom: subRoom, jobs: JobList) {
        var self = this;
        var roomMemory = subClaimedRoom.roomMemory;

        if(!Game.rooms[roomName]) {
            console.log('cant check claimed room' + roomName + ' as it is not visible');
            return;
        }
        var room = Game.rooms[roomName];

        if(!room.controller) {
            return;
        }
        //if we think this room is claimed but it isn't, we should probably try to reclaim it
        if(!room.controller.my && roomMemory.claimed) {
            roomMemory.claiming = jobs.claim.addRoomToClaim(roomName);
            roomMemory.claimed = false;
        }
        if(room.controller.my && !roomMemory.claimed) {
            roomMemory.claimed = true;
        }
        if(room.controller.my && !roomMemory.upgrading) {
            roomMemory.upgrading = jobs.upgrade.addRoom(roomName);
        }
        if(room.storage && !roomMemory.storage) {
            roomMemory.storage == jobs.logistics.addNode(room.storage, 'storage', 0);
        }
        if(!roomMemory.harvest) {
            roomMemory.harvest = jobs.harvest.addSources(roomName);
        }
        if(room.controller.level > 5) {
            if(!room.storage) {
                console.log('couldnt promote room because we have failed to build a storage');
            } else {
                self.promoteRoomToClaimRoom(roomName);
            }
        }
    }
    checkClaimedRoom(roomName: string, claimedRoom: claimedRoom) {
        var self = this;
        var roomMemory = claimedRoom.roomMemory;
        var jobs = claimedRoom.jobs;
        var subRooms = claimedRoom.subRooms;

        if(!Game.rooms[roomName]) {
            console.log('cant check claimed room ' + roomName + ' as it is not visible');
            return;
        }
        var room = Game.rooms[roomName];
        if(!room.controller) {
            return;
        }
        if(room.controller.my && !roomMemory.upgrading) {
            roomMemory.upgrading = jobs.upgrade.addRoom(roomName);
        }
        if(room.storage && !roomMemory.storage) {
            roomMemory.storage = jobs.logistics.addNode(room.storage, 'storage', 0);
        }
        if((!roomMemory.linking && room.controller.level >= 5) || (roomMemory.linking != room.controller.level)) {
            jobs.links.setupRoomLinks(roomName);

            roomMemory.linking = room.controller.level;
        }
        if(!roomMemory.harvest) {
            roomMemory.harvest = jobs.harvest.addSources(roomName);
        }
        _.forEach(subRooms, function (subRoom, subRoomName) {
            if(subRoom.type == 'reserved') {
                self.checkReservedRoom(subRoomName, subRoom, jobs);
            } else if(subRoom.type == 'claimed') {
                self.checkSubClaimedRoom(subRoomName, subRoom, jobs);
            }
        })
    }
    checkReservedRoom(roomName: string, reservedroom: subRoom, jobs: JobList) {
        var self = this;
        var roomMemory = reservedroom.roomMemory;
        
        if(!Game.rooms[roomName]) {
            console.log('cant check claimed room ' + roomName + ' as it is not visible');
            return;
        }
        var room = Game.rooms[roomName];
        if(!roomMemory.harvest) {
            roomMemory.harvest = jobs.harvest.addSources(roomName);
        }
    }
}
