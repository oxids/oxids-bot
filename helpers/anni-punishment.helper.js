var _ = require('lodash');
const FileHelper = require('../helpers/file.helper.js');
const DiscordHelper = require('../helpers/discord.helper.js');


module.exports = {
    getPunishmentsFileName(guildId) {
        return `./assets/anni-punishments/${guildId}.json`
    },

    async getPunishments(guildId, userId, type, onlyActive) {
        let punishments = FileHelper.readFromFile(this.getPunishmentsFileName(guildId));
		if (!punishments) {
			return [];
		}

        // Maps the punishments
        punishments = _.map(punishments, punishment => {
            punishment.punishDate = new Date(punishment.punishDate);
            punishment.revokeDate = punishment.revokeDate
                ? new Date(punishment.revokeDate)
                : null;

                return punishment;
        })

		// Filters by type and user
		if (userId) {
			punishments = _.filter(punishments, p => p.userId === userId);
		}

		if (type) {
			punishments = _.filter(punishments, p => p.type === type);
		}

        if (onlyActive) {
            punishments = _.filter(punishments, p => !p.revokeDate && p.amountServed < p.amountTotal);
        }

        // Sorts th epunishments
		punishments = _.orderBy(punishments,
			['punishDate', 'id'],
			['desc', 'desc']);

        return punishments;
    },

    getUserPunishmentsEmbed(userId, punishments) {
        let embeds = [];
        _.forEach(punishments, punishment => {
            let fields = [
                { name: '', value: 'For ' + punishment.amountTotal + ' events (' + (punishment.amountTotal - punishment.amountServed) + ' left)'

                    + '\n\nPunished by: `' + punishment.punishUsername + '`'
                        + '\nPunished on: ' + '<t:' + Math.floor(punishment.punishDate.getTime() / 1000) + '>'
                        + (punishment.punishReason ? '\nPunished for: "' + punishment.punishReason + '"' : '')

                    + (punishment.revokeDate
                        ? '\n\nRevoked by `' + punishment.revokeUsername + '`'
                            + '\nRevoked on: ' + '<t:' + Math.floor(punishment.revokeDate.getTime() / 1000) + '>'
                            + '\nRevoked for: "' + punishment.revokeReason + '"'
                        : '')

                    + '\n\nUser: ' + `<@${punishment.userId}>` + ' (' + punishment.userId + ')'
                },
            ];

            const titleAndColor = this.getTitleAndColor(punishment);
            embeds = _.concat(embeds, DiscordHelper.getEmbeds(fields, 1, titleAndColor.title, punishment.avatar, titleAndColor.color));
        });

        return embeds;
    },

    getTitleAndColor(punishment) {
        let title = '`' + punishment.username + '` | ' + punishment.type + ' (#' + punishment.id + ')';
        let color = 'Red';

        if (punishment.revokeDate) {
            title = 'REVOKED ' + title;
            color = 'Green';
        } else if (punishment.amountTotal === punishment.amountServed) {
            title = 'EXPIRED ' + title;
            color = 'Grey';
        }

        return { title: title, color: color };
    }
}
