interface Patches {
	[key: string]: Patch
}

interface Patch {
	patch: () => void,
	version: string
}

var patches : Patches = {
	wipePatch: {
		patch: function () {
			delete Memory.patch;
		},
		version: 'Mining'
	},
	addRooms: {
		patch: function () {
			Memory.rooms = {};
      //claimed rooms are upgraded and mined
      let claimedRooms = ['E36S12', 'E37S12', 'E34S12','E38S11', 'E33S11'];
      _.forEach(claimedRooms, function (roomName: string) {
      	if(!Game.rooms) {
      		return true;
      	}
      	let room = Game.rooms[roomName];
      	Memory.rooms[roomName] = {
      		status: 'claimed',
      		roomLevel: room.controller.level
      	}
      });

      //reserved rooms are reserved by a claim creep and mined
      let reservedRooms = 
      {'E36S12': ['E36S11','E35S11','E36S13'],
       'E37S12': ['E37S11','E37S13','E38S13','E39S13'],
       'E38S11': ['E38S12','E39S12','E39S11'],
       'E34S12': ['E34S11','E34S13','E33S13','E35S12'],
       'E33S11': ['E33S12','E32S12','E32S11','E31S11']};
      _.forEach(reservedRooms, function (rooms: string[], roomName: string) {
      	
      });
		},
		version: 'Mining'
	}
};

var oneTimePatch = function() {
	if(Game.rooms['sim']) {
		return;
	}
	if(!Memory.patchHarness) {
		Memory.patchHarness = {};
	}
	if(!Memory.patchHarness[global.Version]) {
		Memory.patchHarness = {};
		Memory.patchHarness[global.Version] = {};
	}
	var currentPatches = Memory.patchHarness[global.Version];

	_.forEach(patches, function (patch: Patch, patchName: string) {
		if(currentPatches[patchName].ran) {
			return true;
		}
		if(patch.version != global.Version) {
			console.log('current version' + global.Version + ' does not match patch version: ' + patch.version);
			return true;
		}
		patch.patch();
		currentPatches[patchName].ran = true;
	});
}

module.exports = oneTimePatch;