var _ = require('lodash');
const FileHelper = require('../helpers/file.helper.js');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');
const DiscordHelper = require('../helpers/discord.helper.js');



module.exports = {
    PUNISHMENTS_FILENAME: './assets/punishments.json',

    async getPunishments(username, type, onlyActive) {
        let punishments = FileHelper.readFromFile(this.PUNISHMENTS_FILENAME);
		if (!punishments) {
			return [];
		}

        // Maps the punishments
        punishments = _.map(punishments, punishment => {
            punishment.punishDate = new Date(punishment.punishDate);
            punishment.punishEndDate = punishment.punishEndDate 
                ? new Date(punishment.punishEndDate)
                : null; 
            punishment.revokeDate = punishment.revokeDate 
                ? new Date(punishment.revokeDate)
                : null;

                return punishment;
        })

		// Filters by type and user
		if (username) {
			const playerInfo = await WynnApiHelper.getPlayerInfo(username);
			if (!playerInfo) {
                throw { publicMessage: 'User "' + username + '" not found!' };
			}

			// Updates the username for the user
			punishments = _.map(punishments, p => {
				if (p.uuid === playerInfo.uuid) {
					p.username = playerInfo.username;
				}

				return p;
			});

			FileHelper.writeToFile(this.PUNISHMENTS_FILENAME, punishments);

			// Filters the punishments
			punishments = _.filter(punishments, p => p.uuid === playerInfo.uuid);
			username = playerInfo.username;
		}

		if (type) {
			punishments = _.filter(punishments, p => p.type === type);
		}

        if (onlyActive) {
            punishments = _.filter(punishments, p => !p.revokeDate && new Date() > p.punishDate);
        }

        // Sorts th epunishments
		punishments = _.orderBy(punishments, 
			['punishDate', 'id'],
			['desc', 'desc']);

        return punishments;
    },

    getUserPunishmentsEmbed(username, punishments) {
        let embeds = [];
        _.forEach(punishments, punishment => {
            let fields = [
                { name: '', value: 'until: ' 
                    + (punishment.punishEndDate 
                        ? '<t:' + Math.floor(punishment.punishEndDate.getTime() / 1000) + '>'
                        : 'PERMANENT')
        
                    + '\n\nPunished by: `' + punishment.punishUsername + '`'
                        + '\nPunished on: ' + '<t:' + Math.floor(punishment.punishDate.getTime() / 1000) + '>'
                        + '\nPunished for: "' + punishment.punishReason + '"'
        
                    + (punishment.revokeDate
                        ? '\n\nRevoked by `' + punishment.revokeUsername + '`'
                            + '\nRevoked on: ' + '<t:' + Math.floor(punishment.revokeDate.getTime() / 1000) + '>'
                            + '\nRevoked for: "' + punishment.revokeReason + '"'
                        : '')
        
                    + '\n\nNameMC: https://namemc.com/profile/' + punishment.uuid
                        + '\nStats: https://wynncraft.com/stats/player/' + punishment.uuid
                },
            ];

            const titleAndColor = this.getTitleAndColor(punishment);
            embeds = _.concat(embeds, DiscordHelper.getEmbeds(fields, 1, titleAndColor.title, 'https://mc-heads.net/avatar/' + username, titleAndColor.color));
        });

        return embeds;
    },

    getTitleAndColor(punishment) {
        let title = '`' + punishment.username + '` | ' + this.getPunishmentName(punishment.type) + ' (#' + punishment.id + ')';
        let color = 'Red';
    
        if (punishment.revokeDate) {
            title = 'REVOKED ' + title;
            color = 'Green';
        } else if (punishment.punishEndDate && new Date() >= punishment.punishEndDate) {
            title = 'EXPIRED ' + title;
            color = 'Grey';
        }
    
        return { title: title, color: color };
    },

    getPunishmentName(type) {
        switch (type) {
            case 'warn':
                return 'Warning';
            case 'ban':
                return 'Ban';
            default: 
                return '';
        }
    }
    
}

