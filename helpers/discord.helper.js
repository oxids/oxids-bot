const { EmbedBuilder } = require('discord.js');
const {pagination, ButtonTypes, ButtonStyles} = require('@devraelfreeze/discordjs-pagination');
const LogHelper = require('./log.helper.js');
var _ = require('lodash');

let CACHED_SERVER_MEMBERS = [];

module.exports = {
    sendEmbedsToInteraction: async function(interaction, embeds) {
        try {
            await pagination(await getPagination(embeds, interaction));
        } catch (e) {
            console.log(e);
            LogHelper.writeToLog('discord.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
    },

    sendFieldsToInteraction: async function(interaction, fields, fieldGroupSize, header, thumbnail, color = 'Blue') {
        const embeds = getEmbeds(fields, fieldGroupSize, header, thumbnail, color);

        try {
            await pagination(await getPagination(embeds, interaction));
        } catch (e) {
            console.log(e);
            LogHelper.writeToLog('discord.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
    },

    sendEmbedsToChannel: async function (channel, embeds) {
        try {
            const message = { channel: channel };
            await pagination(await getPagination(embeds, null, message));
        } catch (e) {
            console.log(e);
            LogHelper.writeToLog('discord.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
    },

    // This function doesn't support pagination!
    sendFieldsToChannel: async function(channel, fields, fieldGroupSize, header, thumbnail, color = 'Blue', text = null) {
        const embeds = getEmbeds(fields, fieldGroupSize, header, thumbnail, color);

        try {
            for (let embed of embeds) {
                await this.send(channel, { embeds: [embed], content: text ? text : undefined });
            }
        } catch (e) {
            console.log(e);
            LogHelper.writeToLog('discord.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }        
    },
    sanitizeString: function(value) {
        if (!value) {
            return value;
        }

        return value.replaceAll('*', '\\*')
            .replaceAll('_', '\\_')
            .replaceAll('~', '\\~')
            .replaceAll('#', '\\#')
            .replaceAll('-', '\\-')
            .replaceAll('`', '\\`')
            .replaceAll('>', '\\>')
            .replaceAll('\n', ' ');
    },

    getEmbeds: getEmbeds,
    getBotImage: getBotImage,

    reply: async function(interaction, content) {
        if (!interaction) {
            console.error('DiscordHelper.reply(): interaction is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.reply(): interaction is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await interaction.reply(content).then(newMessage => newMessage).catch(error => {
            console.error('DiscordHelper.reply(): ', error);
            LogHelper.writeToLog('DiscordHelper.reply(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    editReply: async function(interaction, content) {
        if (!interaction) {
            console.error('DiscordHelper.editReply(): interaction is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.editReply(): interaction is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return false;
        }

        return await interaction.editReply(content).then(newMessage => newMessage).catch(error => {
            console.error('DiscordHelper.editReply(): ', error);
            LogHelper.writeToLog('DiscordHelper.editReply(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return false;
        });
    },
    followUp: async function(interaction, content) {
        if (!interaction) {
            console.error('DiscordHelper.followUp(): interaction is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.followUp(): interaction is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await interaction.followUp(content).then(newMessage => newMessage).catch(error => {
            console.error('DiscordHelper.followUp(): ', error);
            LogHelper.writeToLog('DiscordHelper.followUp(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    deferReply: async function(interaction, ephemeral = false) {
        if (!interaction) {
            console.error('DiscordHelper.deferReply(): interaction is NULL');
            LogHelper.writeToLog('DiscordHelper.deferReply(): interaction is NULL');
            return false;
        }

        try {
            await interaction.deferReply({ ephemeral: ephemeral });
            return true;
        } catch (error) {
            console.error('DiscordHelper.deferReply(): ', error);
            LogHelper.writeToLog('DiscordHelper.deferReply(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return false;
        }
    },
    deleteReply: async function(interaction) {
        if (!interaction) {
            console.error('DiscordHelper.deleteReply(): interaction is NULL');
            LogHelper.writeToLog('DiscordHelper.deleteReply(): interaction is NULL');
            return false;
        }

        try {
            await interaction.deleteReply();
            return true;
        } catch (error) {
            console.error('DiscordHelper.deleteReply(): ', error);
            LogHelper.writeToLog('DiscordHelper.deleteReply(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return false;
        }
    },
    send: async function(channel, content) {
        if (!channel) {
            console.error('DiscordHelper.send(): channel is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.send(): channel is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await channel.send(content).then(newMessage => newMessage).catch(error => {
            console.error('DiscordHelper.send(): ', error);

            // Disabled bc it spams logs with world events command
            // LogHelper.writeToLog('DiscordHelper.send(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    startThread: async function(channel, content) {
        if (!channel) {
            console.error('DiscordHelper.startThread(): channel is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.startThread(): channel is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await channel.startThread(content).then(thread => thread).catch(error => {
            console.error('DiscordHelper.send(): ', error);
            LogHelper.writeToLog('DiscordHelper.send(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    fetch: async function(guilds, guildId = null) {
        if (!guilds) {
            console.error('DiscordHelper.fetch(): guilds is NULL: ', guildId);
            LogHelper.writeToLog('DiscordHelper.fetch(): guilds is NULL: ' + JSON.stringify(guildId, Object.getOwnPropertyNames(guildId)));
            return null;
        }

        let promise;
        if (!guildId) {
            promise = guilds.fetch();
        } else {
            promise = guilds.fetch(guildId);
        }

        return await promise.then(thread => thread).catch(error => {
            console.error('DiscordHelper.fetch(): ', error);
            LogHelper.writeToLog('DiscordHelper.fetch(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    fetchMembers: async function(guild) {
        if (!guild?.members) {
            console.error('DiscordHelper.fetchMembers(): guild is NULL');
            LogHelper.writeToLog('DiscordHelper.fetchMembers(): guild is NULL');
            return null;
        }

        const cachedValue = _.find(CACHED_SERVER_MEMBERS, m => m.guild === guild.id && (new Date() - m.cacheDate) <= 1000 * 30 );
        if (cachedValue) {
            return cachedValue.members;
        }

        CACHED_SERVER_MEMBERS = _.filter(CACHED_SERVER_MEMBERS, m => (new Date() - m.cacheDate) <= 1000 * 30);

        return await guild.members.fetch().then(members => {
            CACHED_SERVER_MEMBERS.push({ guild: guild.id, cacheDate: new Date(), members: members });
            return members;
        }).catch(error => {
            console.error('DiscordHelper.fetchMembers(): ', error);
            LogHelper.writeToLog('DiscordHelper.fetchMembers(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    edit: async function(message, content) {
        if (!message) {
            console.error('DiscordHelper.edit(): message is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.edit(): message is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await message.edit(content).then(thread => thread).catch(error => {
            console.error('DiscordHelper.edit(): ', error);
            LogHelper.writeToLog('DiscordHelper.edit(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    delete: async function(message) {
        if (!message) {
            console.error('DiscordHelper.delete(): message is NULL');
            LogHelper.writeToLog('DiscordHelper.delete(): message is NULL');
            return null;
        }

        return await message.delete().catch(error => {
            console.error('DiscordHelper.delete(): ', error);
            LogHelper.writeToLog('DiscordHelper.delete(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
        });
    },
    awaitModalSubmit: async function(interaction, content) {
        if (!interaction) {
            console.error('DiscordHelper.awaitModalSubmit(): interaction is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.awaitModalSubmit(): interaction is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await interaction.awaitModalSubmit(content).then(result => result).catch(error => {
            console.error('DiscordHelper.awaitModalSubmit(): ', error);
            LogHelper.writeToLog('DiscordHelper.awaitModalSubmit(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    showModal: async function(interaction, content) {
        if (!interaction) {
            console.error('DiscordHelper.showModal(): interaction is NULL: ', content);
            LogHelper.writeToLog('DiscordHelper.showModal(): interaction is NULL: ' + JSON.stringify(content, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await interaction.showModal(content).then(result => result).catch(error => {
            console.error('DiscordHelper.showModal(): ', error);
            LogHelper.writeToLog('DiscordHelper.showModal(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    add: async function(roles, role) {
        if (!roles) {
            console.error('DiscordHelper.add(): roles is NULL: ', role);
            // LogHelper.writeToLog('DiscordHelper.add(): roles is NULL: ' + JSON.stringify(role, Object.getOwnPropertyNames(role)));
            return null;
        }

        return await roles.add(role).then(() => true).catch(error => {
            console.error('DiscordHelper.add(): ', error);
            // LogHelper.writeToLog('DiscordHelper.add(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    remove: async function(roles, role) {
        if (!roles) {
            console.error('DiscordHelper.remove(): roles is NULL: ', role);
            // LogHelper.writeToLog('DiscordHelper.remove(): roles is NULL: ' + JSON.stringify(role, Object.getOwnPropertyNames(role)));
            return null;
        }

        return await roles.remove(role).then(() => true).catch(error => {
            console.error('DiscordHelper.remove(): ', error);
            // LogHelper.writeToLog('DiscordHelper.remove(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
    setNickname: async function(member, nickname, logErrors = true) {
        if (!member) {
            console.error('DiscordHelper.setNickname(): member is NULL: ', nickname);
            LogHelper.writeToLog('DiscordHelper.setNickname(): member is NULL: ' + JSON.stringify(nickname, Object.getOwnPropertyNames(nickname)));
            return null;
        }

        if (!member) {
            console.error('DiscordHelper.setNickname(): nickname is NULL: ', member);
            LogHelper.writeToLog('DiscordHelper.setNickname(): nickname is NULL: ' + JSON.stringify(member, Object.getOwnPropertyNames(member)));
            return null;
        }

        return await member.setNickname(nickname).then(() => null).catch(error => {
            console.error('DiscordHelper.setNickname(): ', error);

            if (logErrors) {
                LogHelper.writeToLog('DiscordHelper.setNickname(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            }

            return null;
        });
    },
    create: async function(channels, channel) {
        if (!channels) {
            console.error('DiscordHelper.create(): channels is NULL: ', channel);
            LogHelper.writeToLog('DiscordHelper.create(): channels is NULL: ' + JSON.stringify(channel, Object.getOwnPropertyNames(content)));
            return null;
        }

        return await channels.create(channel).then(c => c).catch(error => {
            console.error('DiscordHelper.create(): ', error);
            LogHelper.writeToLog('DiscordHelper.create(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return null;
        });
    },
}



async function getPagination(embeds, interaction, message = null) {

    // Bugfix for direct messages
    if (!message && interaction && !interaction.guildId) {
        // Currently not working...
    }

    // Do NOT clone interaction object, as it breaks pagination!
    return {
        embeds: embeds,
        author: interaction?.member?.user,
        interaction: interaction,
        message: message,
        ephemeral: false,
        time: 1000 * 60 * 15, 
        disableButtons: false,
        fastSkip: false,
        pageTravel: false,
        customFilter: () => true,
        buttons: [
          {
            type: ButtonTypes.previous,
            label: 'Previous Page',
            style: ButtonStyles.Primary
          },
          {
            type: ButtonTypes.next,
            label: 'Next Page',
            style: ButtonStyles.Primary
          }
        ]
    };
}

function getEmbeds(fields, fieldGroupSize, header, thumbnail, color = 'Blue') {
    let embeds = [];
    let embed = getEmbed(thumbnail, color);

    // Maximum amount of fields per embed
    // Every embed can have a maximum of 25 fields, but if the fields are grouped, the groups need to stay together
    const fieldsPerEmbed = 25 - (25 % fieldGroupSize);

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];

        // Bugfix since no value throws error
        if (!field.name) {
            field.name = ' ';
        }
        if (!field.value) {
            field.value = 'n/A';
        }

        embed = embed.addFields([fields[i]]);
       

        // Checks if the embed has the max amount of fields possible            
        if ((i + 1) % fieldsPerEmbed === 0) {
            embeds.push(embed.setTitle(header));
            embed = getEmbed(thumbnail, color);
        }
    }

    // Sends the remaining messages
    if (fields.length % fieldsPerEmbed) {
        embeds.push(embed.setTitle(header));
    }

    return embeds;
}

function getEmbed(thumbnail, color) {
    let embed = new EmbedBuilder()
        .setColor(color);

    if (thumbnail) {
        embed = embed.setThumbnail(thumbnail);
    }

    return embed;
}

function getBotImage() {
    return 'https://media.tenor.com/Y-P9NBHKN94AAAAM/twm.gif';
}