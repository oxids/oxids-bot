const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const PunishmentHelper = require("../../helpers/punishment.helper");
const FormatHelper = require("../../helpers/format.helper");
const VerificationHelper = require("../../helpers/verification.helper");

const SHOWN_PROFESSIONS = [
    { name: 'Fishing', value: 'fishing', color: 'blue' },
    { name: 'Woodcutting', value: 'woodcutting', color: 'brown' },
    { name: 'Mining', value: 'mining', color: 'grey' },
    { name: 'Farming', value: 'farming', color: 'yellow' },

    { name: 'Scribing', value: 'scribing', color: 'white' },
    { name: 'Jeweling', value: 'jeweling', color: 'yellow' },
    { name: 'Alchemism', value: 'alchemism', color: 'purple' },
    { name: 'Cooking', value: 'cooking', color: 'brown' },
    { name: 'Weaponsmithing', value: 'weaponsmithing', color: 'yellow' },
    { name: 'Tailoring', value: 'tailoring', color: 'blue' },
    { name: 'Woodworking', value: 'woodworking', color: 'green' },
    { name: 'Armouring', value: 'armouring', color: 'grey' },
];

module.exports = {
    getMessage(trackerId) {
        const buttons = [
            /*new ButtonBuilder()
                .setCustomId(trackerId + ':' + 'recruit')
                .setLabel('Temporary member application')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(trackerId + ':' + 'recruiter')
                .setLabel('Permanent member application')
                .setStyle(ButtonStyle.Primary),*/
            new ButtonBuilder()
                .setCustomId(trackerId + ':' + 'recruiter')
                .setLabel('Apply')
                .setStyle(ButtonStyle.Primary),
        ].filter(b => !!b);

        const actionRow = new ActionRowBuilder().addComponents(buttons);

        /*
        * 'Please click on the role you would like to apply for!' +
                '\n\n**Temporary members**' +
                '\nTemporary members are only in PROF for the profession boosts and can leave at any time. Apply via the button or just message any Recruiter or higher ingame to get invited!' +
                '\n\nRequirements:' +
                '\n- At least one class with a gathering profession on level 110' +

                '\n\n**Permanent members**' +
                '\nPermanent members are members of PROF who stay long term and help the guild reclaim territories in case we get attacked.' +
                '\n\nRequirements:' +
                '\n- At least one class with combat level 120 or higher' +
                '\n- Access to at least one decent war build' +
                '\n- At least two weeks of being in PROF as a temporary member before applying'
        * */

        const embeds = DiscordHelper.getEmbeds([{
            name: '',
            value: 'Please click "Apply" to apply!' +
                '\n\nRequirements:' +
                '\n- At least one class with combat level 120 or higher' +
                '\n- Access to at least one decent war build'
        }], 1, 'Guild applications', null, 'Blue');

        return {
            embeds: embeds,
            content: '',
            components: actionRow ? [actionRow] : []
        };
    },
    async handleButtonClick(i, recruitOutputChannel, recruiterOutputChannel) {
        let customId, modal, modalInteraction, applicationChannel, user, message, messageText;
        const verifiedAccount = await VerificationHelper.getVerifiedAccountByDiscord(i.member.id);

        switch (_.last(i.customId.split(':'))) {
            case 'recruit':
                customId = 'modal-recruit-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
                modal = new ModalBuilder({
                    customId: customId,
                    title: 'Temporary member application'
                });

                modal.addLabelComponents(
                    new LabelBuilder()
                        .setLabel('Minecraft username')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('username')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                            .setValue((verifiedAccount
                                ? await WynnApiHelper.getPlayerName(verifiedAccount.minecraftUUID)
                                : null) || '')
                            .setPlaceholder('Your Minecraft Username (e.g. oxids)')
                            .setMaxLength(16)),
                );

                await DiscordHelper.showModal(i, modal);
                modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
                    filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
                    time: 1000 * 60 * 30
                });

                if (!modalInteraction) {
                    break;
                }

                let username = modalInteraction.fields.getTextInputValue('username');
                if (!username) {
                    break;
                }

                username = username.replace(/[^a-zA-Z0-9_]/g, '');
                user = await WynnApiHelper.getPlayerInfo(username);
                if (!user) {
                    DiscordHelper.reply(modalInteraction, { content: 'The account ' + username + ' could not be found!', ephemeral: true });
                    break;
                }

                applicationChannel = await DiscordHelper.fetch(i.guild?.channels, recruitOutputChannel);
                if (!applicationChannel) {
                    DiscordHelper.reply(modalInteraction, { content: 'There was an issue fetching the application channel. Please contact oxids.', ephemeral: true });
                    break;
                }

                message = await DiscordHelper.send(applicationChannel, { content: '# There is a new application!\n\nFetching data...' });
                if (!message) {
                    DiscordHelper.reply(modalInteraction, { content: 'There was an issue sending a application message to the application channel. Please contact oxids.', ephemeral: true });
                    break;
                }

                messageText = '`' + (username ?? '') + '` would like to join as a temp member, somebody please invite them.';
                messageText += '\nDiscord: ' + `<@${i.member.id}> (\`${i.user.username}\`)`;
                messageText += '\n\n`/guild invite ' + username + '`';

                DiscordHelper.edit(message, messageText);
                DiscordHelper.reply(modalInteraction, { content: 'Your application was submitted! You should be hearing back from us within 24 hours.', ephemeral: true });
                break;

            case 'recruiter':
                if (!verifiedAccount) {
                    DiscordHelper.reply(i, { content: 'Please verify your Discord account before applying!', ephemeral: true });
                    break;
                }

                customId = 'modal-recruit-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
                modal = new ModalBuilder({
                    customId: customId,
                    title: 'Permanent member application'
                });

                modal.addLabelComponents(
                    new LabelBuilder()
                        .setLabel('What\'s your reason to join PROF?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('why')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('E.g. To defend the claim')
                            .setMaxLength(100)),
                    new LabelBuilder()
                        .setLabel('What war builds do you have access to?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('builds')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('E.g. Divzer DPs, Abso Healer')
                            .setMaxLength(100)),
                    new LabelBuilder()
                        .setLabel('What is your GMT timezone?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('timezone')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('E.g. GMT +1')
                            .setMaxLength(20)),
                    new LabelBuilder()
                        .setLabel('What guilds were you previously part of?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('guilds')
                            .setRequired(false)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('E.g. PROF')
                            .setMaxLength(50)),
                    new LabelBuilder()
                        .setLabel('What else would you like to add?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('other')
                            .setRequired(false)
                            .setStyle(TextInputStyle.Paragraph)
                            .setMaxLength(100)),
                );

                await DiscordHelper.showModal(i, modal);
                modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
                    filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
                    time: 1000 * 60 * 30
                });

                if (!modalInteraction) {
                    break;
                }

                user = await WynnApiHelper.getPlayerInfo(verifiedAccount.minecraftUUID);
                if (!user) {
                    DiscordHelper.reply(modalInteraction, { content: 'The account ' + verifiedAccount.minecraftUUID + ' could not be found!', ephemeral: true });
                    break;
                }

                let prevGuilds = modalInteraction.fields.getTextInputValue('guilds');
                let whyPROF = modalInteraction.fields.getTextInputValue('why');
                let builds = modalInteraction.fields.getTextInputValue('builds');
                let timezone = modalInteraction.fields.getTextInputValue('timezone');
                let other = modalInteraction.fields.getTextInputValue('other');

                applicationChannel = await DiscordHelper.fetch(i.guild?.channels, recruiterOutputChannel);
                if (!applicationChannel) {
                    DiscordHelper.reply(modalInteraction, { content: 'There was an issue fetching the application channel. Please contact oxids.', ephemeral: true });
                    break;
                }

                message = await DiscordHelper.send(applicationChannel, { content: '# There is a new application!\n\nFetching data...' });
                if (!message) {
                    DiscordHelper.reply(modalInteraction, { content: 'There was an issue sending a application message to the application channel. Please contact oxids.', ephemeral: true });
                    break;
                }

                messageText = '# There is a new permanent member application!';
                messageText += '\nUsername: `' + (user.username ?? '') + '`';
                messageText += '\nDiscord: ' + `<@${i.member.id}> (\`${i.user.username}\`)`;

                if (prevGuilds) {
                    messageText += '\nPrevious guilds: `' + (prevGuilds ?? '') + '`';
                }

                messageText += '\nWhy PROF: `' + (whyPROF ?? '') + '`';
                messageText += '\nAvailable builds: `' + (builds ?? '') + '`';
                messageText += '\nTimezone: `' + (timezone ?? '') + '`';

                if (other) {
                    messageText += '\nOther: `' + (other ?? '') + '`';
                }

                const userInfo = await getRecruiterMessage();
                if (userInfo) {
                    messageText += '\n\n' + userInfo;
                }

                DiscordHelper.edit(message, messageText);
                DiscordHelper.reply(modalInteraction, { content: 'Your application was submitted! You should be hearing back from us within 24 hours.', ephemeral: true });
                break;

            default:
                await DiscordHelper.deferReply(i, true);
                DiscordHelper.editReply(i, { content: 'Unknown interaction. How did you get here?', ephemeral: true });
                break;

            async function getRecruiterMessage() {
                try {

                    // Adds the reacts for the vote
                    message.react(message.guild.emojis.cache.find(emoji => emoji.name === 'yes'));
                    message.react(message.guild.emojis.cache.find(emoji => emoji.name === 'no'));
                    message.react(message.guild.emojis.cache.find(emoji => emoji.name === 'neutral'));

                    // Checks if the user had any previous punishments
                    try {
                        const punishments = await PunishmentHelper.getPunishments(verifiedAccount.minecraftUUID, null, true);
                        if (punishments?.length) {
                            const embeds = PunishmentHelper.getUserPunishmentsEmbed(user.username, punishments);
                            DiscordHelper.sendEmbedsToChannel(message.channel, embeds);
                        }
                    } catch (e) {
                        if (e.publicMessage) {
                            DiscordHelper.reply(message, e.publicMessage);
                            return;
                        }

                        DiscordHelper.reply(message, 'Error fetching punishments. Please contact oxids.');
                        return;
                    }

                    // Checks how long the user has been in the guild for
                    try {

                        // Loads the info of the guild
                        const guild = await WynnApiHelper.getGuildInfo('Profession Heaven');
                        if (!guild) {
                            DiscordHelper.reply(message, 'Couldn\'t load guild!');
                            return;
                        }
                        if (!guild.members?.all?.length) {
                            DiscordHelper.reply(message, 'Guild has no members!');
                            return;
                        }


                        // Looks for the player
                        const player = _.find(guild.members.all, member => member.username.toLowerCase() === user.username.toLowerCase());
                        if (!player) {
                            DiscordHelper.reply(message, 'User `' + user.username + '` is not in the guild!');
                            return;
                        }

                        // Checks the profession levels of the player
                        let classes = await getClasses(user.uuid);
                        if (!classes?.length) {
                            DiscordHelper.reply(message, 'Classes for user `' + user.username + '` not found!');
                            return;
                        }

                        // Sorts the classes by total level
                        classes = _.orderBy(classes, c => c.totalLevel, 'desc');

                        // Loads the professions of the highest level class
                        const highestClass = await getClass(user.uuid, _.first(classes).uuid);
                        if (!highestClass) {
                            DiscordHelper.reply(message, 'Class "' + _.first(classes).uuid + '" could not be loaded!');
                            return;
                        }

                        const joinedSince = FormatHelper.getFormattedTimeSinceTwoDates(new Date(player?.joined));
                        let reply = 'Joined the guild on <t:' + Math.floor(new Date(player?.joined).getTime() / 1000) + '> (' + joinedSince + ')'
                            + '\n\n**Highest class:** Level ' + highestClass.totalLevel
                            + '\nhttps://wynncraft.com/stats/player/' + user.uuid + '?class=' + _.first(classes).uuid + '\n';

                        _.forEach(SHOWN_PROFESSIONS, profession => {
                            reply += '\n**' + profession.name
                                + ':** Level ' + highestClass.professions[profession.value].level
                                + ' (' + highestClass.professions[profession.value].xpPercent + '%)'
                        });

                        return reply;
                    } catch (error) {
                        DiscordHelper.reply(message, 'Couldn\'t load guild joined!');
                        console.log(error)
                        LogHelper.writeToLog('add-application-reaction: ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
                    }
                } catch (error) {
                    console.error(error);
                    LogHelper.writeToLog('add-application-reaction: ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
                }
            }

            async function getClasses(username) {
                const json = await WynnApiHelper.callWynnApi('/player/' + username + '/characters');
                if (!json) {
                    return null;
                }

                const classes = await json?.body?.json();
                return WynnApiHelper.mapObjectToArray(classes, 'uuid');
            }

            async function getClass(username, classUUID) {
                const json = await WynnApiHelper.callWynnApi('/player/' + username + '/characters/' + classUUID);
                if (!json) {
                    return null;
                }

                return await json?.body?.json();
            }
        }
    }
};