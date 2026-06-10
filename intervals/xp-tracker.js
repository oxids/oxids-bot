
const FileHelper = require('../helpers/file.helper.js');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');
var _ = require('lodash');
const LogHelper = require('../helpers/log.helper.js');

// Each guild takes around 10MB of space total, depending on the amount of members
const { trackedGuilds } = require('../config.json');
const XP_GAIN_FOLDERNAME = './assets/xp-gains';

module.exports = {
    time: 1000 * 60 * 60 * 1,
	async execute(client) {
        _.forEach(trackedGuilds, async guild => {
            const guildInfo = await WynnApiHelper.getGuildInfo(guild);
            if (!guildInfo) {
                console.log('Guild ' + guild + ' could not be loaded!');
                LogHelper.writeToLog('xp-tracker: Guild ' + guild + ' could not be loaded!');
                return;
            }

            const filename = XP_GAIN_FOLDERNAME + '/' + guildInfo.name + '.json';
            let xpGains = FileHelper.readFromFile(filename);

            if (!xpGains) {
                xpGains = [];
            }

            xpGains.push({
                date: new Date(),
                level: guildInfo.level,
                xpPercent: guildInfo.xpPercent,
                members: _.map(guildInfo.members.all, member => {
                    return {
                        uuid: member.uuid,
                        contributed: member.contributed
                    };
                })
            });
    
            FileHelper.writeToFile(filename, xpGains);
        });
	},
};

