const WynnApiHelper = require('../helpers/wynn-api.helper.js');
const DiscordHelper = require('../helpers/discord.helper.js');
var _ = require('lodash');
const LogHelper = require('../helpers/log.helper.js');
const VerificationHelper = require('../helpers/verification.helper.js');
const FileHelper = require('../helpers/file.helper.js');
const FormatHelper = require('../helpers/format.helper.js');

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

                updateFunc(guild, tracker);
            }
        } catch(e) {
            console.log(e);
            console.log('Error in update-guild-ranks: execute(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in update-guild-ranks: execute(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
	},
    async updateRanks(guild, tracker) {
        try {
            if (!guild || !tracker) {
                return;
            }

            updateFunc(guild, tracker);
        } catch(e) {
            console.log(e);
            console.log('Error in update-guild-ranks: updateRanks(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            LogHelper.writeToLog('Error in update-guild-ranks: updateRanks(): ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
    }
};

async function updateFunc(guild, tracker) {
    const roles = _.filter([
        { discordRole: await getServerRole(guild, tracker.options.verifiedRole), ingameRank: null, ignoreInGuild: true },
        { discordRole: await getServerRole(guild, tracker.options.verifiedRole2), ingameRank: null, ignoreInGuild: true, doNotRemove: true },
        { discordRole: await getServerRole(guild, tracker.options.memberRole), ingameRank: null, ignoreGuildRank: true },
        { discordRole: await getServerRole(guild, tracker.options.recruitRole), ingameRank: FormatHelper.GUILD_RANKS_ENUM.RECRUIT },
        { discordRole: await getServerRole(guild, tracker.options.recruiterRole), ingameRank: FormatHelper.GUILD_RANKS_ENUM.RECRUITER },
        { discordRole: await getServerRole(guild, tracker.options.captainRole), ingameRank: FormatHelper.GUILD_RANKS_ENUM.CAPTAIN },
        { discordRole: await getServerRole(guild, tracker.options.strategistRole), ingameRank: FormatHelper.GUILD_RANKS_ENUM.STRATEGIST },
        { discordRole: await getServerRole(guild, tracker.options.chiefRole), ingameRank: FormatHelper.GUILD_RANKS_ENUM.CHIEF },
        { discordRole: await getServerRole(guild, tracker.options.ownerRole), ingameRank: FormatHelper.GUILD_RANKS_ENUM.OWNER },
    ], r => !!r?.discordRole);

    const verifiedUsers = await VerificationHelper.getVerifiedAccounts();
    const guildInfo = await WynnApiHelper.getGuildInfo(tracker.options.guildName);
    const discordMembers = [...(await DiscordHelper.fetchMembers(guild))?.values()];

    if (!guildInfo?.members?.all?.length) {
        console.log('Guild Verification for Minecraft guild ' + tracker.guildId + ' not found!');
        LogHelper.writeToLog('Guild Verification for Minecraft guild ' + tracker.guildId + ' not found!\n' + JSON.stringify(tracker));
        return;
    }

    for (const role of roles) {

        // Remove people who are not supposed to have the role
        for (const discordMember of _.filter(discordMembers, m => m.roles.cache.has(role.discordRole.id))) {
            const verifiedUser = _.find(verifiedUsers, u => u.discordId === discordMember.user.id);
            const minecraftMember = _.find(guildInfo.members.all, m => m.uuid === verifiedUser?.minecraftUUID);

            if (shouldHaveRank(verifiedUser, minecraftMember, role) || role.doNotRemove) {
                continue;
            }

            console.log('Removing role ' + role.discordRole.id + ' from user ' + discordMember.user.id + ' on server ' + guild.id + '!');
            if (await DiscordHelper.remove(discordMember.roles, role.discordRole.id)) {
                LogHelper.writeToLog('Removed role ' + role.discordRole.id + ' from user ' + discordMember.user.id + ' on server ' + guild.id + '!');
            }
        }

        // Add people who don't have the role currently
        for (const verifiedUser of verifiedUsers) {
            const discordMember = _.find(discordMembers, m => m.user.id === verifiedUser.discordId);
            if (!discordMember || discordMember.roles.cache.has(role.discordRole.id)) {
                continue;
            }

            const minecraftMember = _.find(guildInfo.members.all, member => member.uuid === verifiedUser.minecraftUUID);
            if (!shouldHaveRank(verifiedUser, minecraftMember, role)) {
                continue;
            }

            console.log('Adding role ' + role.discordRole.id + ' to user ' + discordMember.user.id + ' on server ' + guild.id + '!');
            if (await DiscordHelper.add(discordMember.roles, role.discordRole.id)) {
                LogHelper.writeToLog('Added role ' + role.discordRole.id + ' to user ' + discordMember.user.id + ' on server ' + guild.id + '!');
            }
        }
    }

    // Change the names of the verified users if needed
    if (tracker.options.changeNicks) {
        for (const verifiedUser of verifiedUsers) {
            const discordMember = _.find(discordMembers, m => m.user.id === verifiedUser.discordId);
            if (!discordMember) {
                continue;
            }

            // Prevent API limits
            await WynnApiHelper.waitTime(200);

            const minecraftName = await WynnApiHelper.getPlayerName(verifiedUser.minecraftUUID);

            // Owners name cant be changed
            if (!minecraftName || discordMember.nickname === minecraftName || discordMember.guild.ownerId === discordMember.user.id) {
                continue;
            }

            DiscordHelper.setNickname(discordMember, minecraftName, false);
        }
    }

    function shouldHaveRank(verifiedUser, minecraftMember, role) {

        // If user isn't verified, he is never allowed to have a rank
        if (!verifiedUser) {
            return false;
        }

        // Checks all roles in case any of them has the same discord rank
        for (const curRole of roles) {
            if (curRole.discordRole.id !== role.discordRole.id) {
                continue;
            }

            // If it doesn't matter which guild he is in, he can have the role as he is verified
            // If it matters and he is not in the guild, he can't have the role
            if (curRole.ignoreInGuild) {
                return true;
            } else if (!minecraftMember) {
                continue;
            }

            if (curRole.ignoreGuildRank || FormatHelper.getGuildRank(minecraftMember.rank, true) === curRole.ingameRank) {
                return true;
            }
        }

        return false;
    }
}

async function getServerRole(guild, roleId) {
    if (!roleId) {
        return null;
    }

    return await DiscordHelper.fetch(guild.roles, roleId);
}
