var _ = require('lodash');
const FileHelper = require('../helpers/file.helper.js');
const LogHelper = require('../helpers/log.helper.js');
const WynnApiHelper = require("./wynn-api.helper");
const DiscordHelper = require("./discord.helper");
const {ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle} = require("discord.js");
const FormatHelper = require("./format.helper");


const VERIFICATIONS_USERS_FILENAME = './assets/verification-users.json';
const VERIFICATION_TRACKERS_FILENAME = './assets/verification-trackers.json';

let pendingVerifications = []; // All pending verifications across all bot instances, to allow users to continue after 15 minutes

module.exports = {
    async getVerifiedAccounts() {
        let verifiedAccounts = FileHelper.readFromFile(VERIFICATIONS_USERS_FILENAME);
        if (!verifiedAccounts) {
            return [];
        }

        return verifiedAccounts;
    },
    async getVerifiedAccountByDiscord(discordId) {
        return _.find(await this.getVerifiedAccounts(), a => a.discordId === discordId);
    },
    async getVerifiedAccountByMinecraft(minecraftUUID) {
        return _.find(await this.getVerifiedAccounts(), a => a.minecraftUUID === minecraftUUID);
    },
    async setVerifiedAccount(discordId, minecraftUUID) {
        const accounts = await this.getVerifiedAccounts();
        if (_.find(accounts, a => a.discordId === discordId || a.minecraftUUID === minecraftUUID)) {
            console.log('Error in verification-helper: setVerifiedAccount(): ' + 'User already verified!');
            LogHelper.writeToLog('Error in verification-helper: setVerifiedAccount(): ' + 'User already verified!');
            return;
        }

        accounts.push({ minecraftUUID, discordId, addDate: new Date() });
        FileHelper.writeToFile(VERIFICATIONS_USERS_FILENAME, accounts);
    },
    async removeVerifiedAccount(discordId) {
        let accounts = await this.getVerifiedAccounts();
        accounts = _.filter(accounts, a => a.discordId !== discordId);

        FileHelper.writeToFile(VERIFICATIONS_USERS_FILENAME, accounts);
    },
    async getTrackerForServer(id) {
        const trackers = FileHelper.readFromFile(VERIFICATION_TRACKERS_FILENAME);
        if (!trackers?.length) {
            return null;
        }

        return _.find(trackers, tracker => tracker.guildId === id);
    },
    async verifyAccount(interaction, guild) {
        const VerificationHelper = this;
        const existingAccount = await this.getVerifiedAccountByDiscord(interaction.member.id);
        if (existingAccount) {
            const user = await WynnApiHelper.getPlayerInfo(existingAccount.minecraftUUID);
            DiscordHelper.reply(interaction, { content: 'You are already verified to the Minecraft account '
                    + (user?.username ?? existingAccount.minecraftUUID) + '!', ephemeral: true });
            this.updateRanks(guild);
            return;
        }

        const customId = 'modal-verify-' + interaction.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
        const modal = new ModalBuilder({
            customId: customId,
            title: 'Account verification'
        });

        modal.addLabelComponents(
            new LabelBuilder()
                .setLabel('Minecraft username')
                .setTextInputComponent(new TextInputBuilder()
                    .setCustomId('username')
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Your Minecraft Username (e.g. oxids)')
                    .setMaxLength(16)),
        );

        await DiscordHelper.showModal(interaction, modal);
        const modalInteraction = await DiscordHelper.awaitModalSubmit(interaction, {
            filter: (i2) => i2.customId === customId && i2.user.id === interaction.user.id,
            time: 1000 * 60 * 30
        });

        if (!modalInteraction) {
            return;
        }

        let username = modalInteraction.fields.getTextInputValue('username');
        if (!username) {
            return;
        }

        username = username.replace(/[^a-zA-Z0-9_]/g, '');
        let user = await WynnApiHelper.getPlayerInfo(username);
        if (!user) {
            DiscordHelper.reply(modalInteraction, { content: 'The account ' + username + ' could not be found!', ephemeral: true });
            return;
        }

        if (_.find(await this.getVerifiedAccounts(), account => account.minecraftUUID === user.uuid)) {
            DiscordHelper.reply(modalInteraction, { content: 'The account ' + username + ' is already linked to another discord account!', ephemeral: true });
            return;
        }

        const message = await DiscordHelper.reply(modalInteraction, { content: 'Starting verification...', ephemeral: true });
        if (!message) {
            return;
        }

        let prevWorlds = [];
        let successes = 0;
        let curWorld = _.first(await WynnApiHelper.getOnlinePlayers([username]))?.server;

        // Checks if the user has a pending verification
        const pendingVerification = _.find(pendingVerifications, p => p.uuid === user.uuid);
        if (pendingVerification) {
            prevWorlds = pendingVerification.prevWorlds;
            successes = pendingVerification.successes;
        }

        let verificationMessageInfo = await getVerificationMessageInfo();
        let startDate = new Date();

        verificationIntervalFunc();
        const interval = setInterval(async () => {
            verificationIntervalFunc();
        }, 1000 * 10 * 1);
        return;

        async function verificationIntervalFunc() {
            try {
                if ((new Date() - startDate) >= 1000 * 60 * 14) {
                    await DiscordHelper.edit(message, { content: '# Timeout exceeded' +
                            '\n\nPlease click the "Verify your account" button again to continue where you left off, **your progress will not be lost**.' +
                            '\n\n-# Due to Discord limitations, ephemeral messages can only be edited for 15 minutes. This is the best fix I came up with.', ephemeral: true });
                    clearInterval(interval);
                    return;
                }

                curWorld = _.first(await WynnApiHelper.getOnlinePlayers([username]))?.server;
                if (curWorld === verificationMessageInfo.world) {
                    successes++;
                    verificationMessageInfo = await getVerificationMessageInfo();

                    pendingVerifications = _.filter(pendingVerifications, p => p.uuid !== user.uuid);
                    pendingVerifications.push({ uuid: user.uuid, prevWorlds: prevWorlds, successes: successes });
                } else if (verificationMessageInfo.world === 'N/A') {
                    verificationMessageInfo = await getVerificationMessageInfo();
                }

                let verificationMessage = verificationMessageInfo.message;
                verificationMessage += '\n\nCurrent world: ';
                if (!curWorld) {
                    verificationMessage += 'Offline (Please check your API settings!)';
                } else {
                    verificationMessage += curWorld;
                }

                verificationMessage += '\nLast update: ' + '<t:' + Math.floor(new Date().getTime() / 1000) + ':T>' +
                    '\n\n-# Please note that it might take up to 5 minutes to detect switching servers due to Wynncraft API TTL.';

                if (successes >= 3) {
                    await VerificationHelper.setVerifiedAccount(interaction.user.id, user.uuid);
                    await DiscordHelper.edit(message, {
                        content: 'You successfully linked your Discord account to the Minecraft account '
                            + username + '!',
                        ephemeral: true
                    });
                    clearInterval(interval);

                    // Update ranks so the just verified user gets their ranks
                    VerificationHelper.updateRanks(guild);

                    pendingVerifications = _.filter(pendingVerifications, p => p.uuid !== user.uuid);
                } else {
                    await DiscordHelper.edit(message, {
                        content: verificationMessage,
                        ephemeral: true
                    });
                }
            } catch (e) {
                console.log('verifyAccount: interval: ', e);
                LogHelper.writeToLog('verifyAccount: interval: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
            }
        }

        async function getVerificationMessageInfo() {
            const worlds = await WynnApiHelper.getWorlds();
            if (!worlds?.length) {
                return { world: 'N/A', message: 'Worlds could not be loaded!' };
            }

            // So it doesnt take NA10 3x
            const allowedWorlds = _.filter(worlds, world => world.world
                && curWorld !== world.world
                && !_.find(prevWorlds, prevWorld => world.world === prevWorld)
                && world.players?.length && world.players.length > 10 // To prevent Wynn hallucinating worlds
                && (world.world.startsWith('NA') || world.world.endsWith('EU') || world.world.startsWith('AS')) // To filter Media
            );
            const world = _.orderBy(allowedWorlds, w => w.players?.length ?? 0)[0].world;
            prevWorlds.push(world);

            let message = '## Verification for `' + user.username + '` in progress (' + successes + ' of 3 done)' +
                '\n\nConnect to the following world in order to verify your account:' +
                '\n# Target world: ' + world + '' +
                '\n-# If the world no longer exists, click on "Verify your account" again to get another target world. Your progress will not be lost.';

            return { world: world, message: message }
        }
    },
    async updateRanks(guild) {
        const tracker = await this.getTrackerForServer(guild?.id);
        if (!tracker) {
            console.log('updateRanks: User tried to verify but no tracker found for server ' + (guild?.id ?? ''));
            LogHelper.writeToLog('updateRanks: User tried to verify but no tracker found for server ' + (guild?.id ?? ''));
            return;
        }

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

        const verifiedUsers = await this.getVerifiedAccounts();
        const guildInfo = await WynnApiHelper.getGuildInfo(tracker.options.guildName);
        const discordMembers = [...(await DiscordHelper.fetchMembers(guild))?.values()];

        if (!guildInfo?.members?.all?.length) {
            console.log('updateRanks: Guild Verification for Minecraft guild ' + tracker.guildId + ' not found!');
            LogHelper.writeToLog('updateRanks: Guild Verification for Minecraft guild ' + tracker.guildId + ' not found!\n' + JSON.stringify(tracker));
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

                console.log('updateRanks: Removing role ' + role.discordRole.id + ' from user ' + discordMember.user.id + ' on server ' + guild.id + '!');
                if (await DiscordHelper.remove(discordMember.roles, role.discordRole.id)) {
                    LogHelper.writeToLog('updateRanks: Removed role ' + role.discordRole.id + ' from user ' + discordMember.user.id + ' on server ' + guild.id + '!');
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

                console.log('updateRanks: Adding role ' + role.discordRole.id + ' to user ' + discordMember.user.id + ' on server ' + guild.id + '!');
                if (await DiscordHelper.add(discordMember.roles, role.discordRole.id)) {
                    LogHelper.writeToLog('updateRanks: Added role ' + role.discordRole.id + ' to user ' + discordMember.user.id + ' on server ' + guild.id + '!');
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

        async function getServerRole(guild, roleId) {
            if (!roleId) {
                return null;
            }

            return await DiscordHelper.fetch(guild.roles, roleId);
        }
    }
}