const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
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
            new ButtonBuilder()
                .setCustomId(trackerId + ':' + 'recruit')
                .setLabel('Apply')
                .setStyle(ButtonStyle.Primary),
        ].filter(b => !!b);

        const actionRow = new ActionRowBuilder().addComponents(buttons);

        const embeds = DiscordHelper.getEmbeds([{
            name: '',
            value: 'Please click the "Apply" button to apply to our guild!' +
                '\n\nRequirements:' +
                '\n- At least one class with combat level 120 or higher'
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
                if (!verifiedAccount) {
                    DiscordHelper.reply(i, { content: 'Please verify your Discord account before applying!', ephemeral: true });
                    break;
                }

                customId = 'modal-recruit-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
                modal = new ModalBuilder({
                    customId: customId,
                    title: 'Guild application'
                });

                modal.addLabelComponents(
                    new LabelBuilder()
                        .setLabel('Why do you want to join our guild?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('why')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                            .setMaxLength(100)),
                    new LabelBuilder()
                        .setLabel('What war builds do you have access to?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('builds')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('E.g. Divzer, Guardian')
                            .setMaxLength(100)),
                    new LabelBuilder()
                        .setLabel('What is your timezone?')
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
                            .setMaxLength(50)),
                    new LabelBuilder()
                        .setLabel('Anything else you\'d like to add?')
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

                messageText = '# There is a new application!';
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

                const userInfo = await getApplicationMessage();
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

            async function getApplicationMessage() {
                try {

                    // Adds the reacts for the vote
                    message.react(message.guild.emojis.cache.find(emoji => emoji.name === 'yes'));
                    message.react(message.guild.emojis.cache.find(emoji => emoji.name === 'no'));
                    message.react(message.guild.emojis.cache.find(emoji => emoji.name === 'neutral'));

                    // Adds additional info for the user
                    try {

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

                        let reply = '\n\n**Highest class:** Level ' + highestClass.totalLevel
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