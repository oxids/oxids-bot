const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const VerificationHelper = require("../../helpers/verification.helper");

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
                '\n\nRequirements:'
                + '\n- Age 16+'
                + '\n- At least one class with combat level 70 or higher'
        }], 1, '**Guild Application - Nebelwacht [NBLW]**', null, 'Blue');

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
                        .setLabel('How old are you?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('age')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                            .setMaxLength(100)),
                    new LabelBuilder()
                        .setLabel('Were you ever Part of any Guild?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('prevGuilds')
                            .setRequired(false)
                            .setStyle(TextInputStyle.Paragraph)
                            .setMaxLength(500)),
                    new LabelBuilder()
                        .setLabel('How did you find our Guild?')
                        .setTextInputComponent(new TextInputBuilder()
                            .setCustomId('howFound')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                            .setMaxLength(500)),
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

                let age = modalInteraction.fields.getTextInputValue('age');
                let prevGuilds = modalInteraction.fields.getTextInputValue('prevGuilds');
                let howFound = modalInteraction.fields.getTextInputValue('howFound');

                applicationChannel = await DiscordHelper.fetch(i.guild?.channels, recruitOutputChannel);
                if (!applicationChannel) {
                    DiscordHelper.reply(modalInteraction, { content: 'There was an issue fetching the application channel. Please contact a server admin.', ephemeral: true });
                    break;
                }

                message = await DiscordHelper.send(applicationChannel, { content: '# There is a new application!\n\nFetching data...' });
                if (!message) {
                    DiscordHelper.reply(modalInteraction, { content: 'There was an issue sending a application message to the application channel. Please contact a server admin.', ephemeral: true });
                    break;
                }

                messageText = '# There is a new application!';
                messageText += '\nUsername: `' + (user.username ?? '') + '`';
                messageText += '\nDiscord: ' + `<@${i.member.id}> (\`${i.user.username}\`)`;

                messageText += '\nAge: `' + (age ?? '') + '`';
                if (prevGuilds) {
                    messageText += '\nPrevious guilds: `' + (prevGuilds ?? '') + '`';
                }
                messageText += '\nHow found: `' + (howFound ?? '') + '`';

                const userInfo = await getApplicationMessage();
                if (userInfo) {
                    messageText += '\n' + userInfo;
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
                    message.react('👍');
                    message.react('👎');

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
                        let reply = 'Highest class: `' + _.first(classes)?.level
                            + '`\n\nhttps://wynncraft.com/stats/player/' + user.uuid + '\n';

                        return reply;
                    } catch (error) {
                        DiscordHelper.reply(message, 'Couldn\'t load player info!');
                        console.log(error)
                        LogHelper.writeToLog('getApplicationMessage(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
                    }
                } catch (error) {
                    console.error(error);
                    LogHelper.writeToLog('getApplicationMessage(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
        }
    }
};