const DiscordHelper = require('../helpers/discord.helper.js');
var _ = require('lodash');
const LogHelper = require('../helpers/log.helper.js');
const VerificationHelper = require('../helpers/verification.helper.js');
const FileHelper = require('../helpers/file.helper.js');

const VERIFICATION_TRACKERS_FILENAME = './assets/verification-trackers.json';

module.exports = {
    time: 1000 * 60 * 15,
	async execute(client) {
        try {
            const trackers = FileHelper.readFromFile(VERIFICATION_TRACKERS_FILENAME);
            if (!trackers?.length) {
                return;
            }

            for (const tracker of trackers) {
                const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
                if (!guild) {
                    console.log('Guild Verification for guild ' + tracker.guildId + ' not found!');
                    LogHelper.writeToLog('Guild Verification for guild ' + tracker.guildId + ' not found!\n' + JSON.stringify(tracker));
                    continue;
                }

                VerificationHelper.updateRanks(guild);
            }
        } catch(e) {
            console.log(e);
            console.log('Error in update-guild-ranks: execute(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in update-guild-ranks: execute(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
	}
};