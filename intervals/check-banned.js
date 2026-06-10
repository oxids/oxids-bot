
const { applicationChannel, applicationServer, applicationGuildName } = require('../config.json');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');
const DiscordHelper = require('../helpers/discord.helper.js');
var _ = require('lodash');
const LogHelper = require('../helpers/log.helper.js');
const PunishmentHelper = require('../helpers/punishment.helper.js');

module.exports = {
    time: 1000 * 60 * 60 * 24,
	async execute(client) {
        const guild = await DiscordHelper.fetch(client?.guilds, applicationServer);
        if (!guild) {
            console.log('Guild ' + applicationServer + ' could not be loaded!');
            LogHelper.writeToLog('check-banned: Guild ' + applicationServer + ' could not be loaded!');
            return;
        }
 
        const channel = await DiscordHelper.fetch(guild?.channels, applicationChannel);
        if (!channel) {
            console.log('Channel ' + applicationChannel + ' could not be loaded!');
            LogHelper.writeToLog('check-banned: Channel ' + applicationChannel + ' could not be loaded!');
            return;
        }

        const wynnGuild = await WynnApiHelper.getGuildInfo(applicationGuildName);
        if (!wynnGuild) {
            console.log('Wynn Guild ' + applicationGuildName + ' could not be loaded!');
            LogHelper.writeToLog('check-banned: Wynn Guild ' + applicationGuildName + ' could not be loaded!');
            return;
        }

        const punishments = await PunishmentHelper.getPunishments(null, 'ban', true);
        let startMessageSent = false;
        for (const member of wynnGuild.members.all) {
            const userPunishments = _.filter(punishments, p => p.uuid === member.uuid);
            if (!userPunishments?.length) {
                continue;
            }

            if (!startMessageSent) {
                await DiscordHelper.send(channel, 'Users found, that are banned!');
                startMessageSent = true;
            }

            const embeds = PunishmentHelper.getUserPunishmentsEmbed(member.username, userPunishments);
            DiscordHelper.sendEmbedsToChannel(channel, embeds);
        }
	},
};

