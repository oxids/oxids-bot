const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
var _ = require('lodash');
const FileHelper = require('../../helpers/file.helper.js');
const DiscordHelper = require("../../helpers/discord.helper");
const WorldEventsPunishmentHelper = require('../../helpers/world-events-punishment.helper.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('world-events-punishments-revoke')
		.setDescription('Revokes an existing punishment.')
		.addNumberOption(option =>
			option.setName('id')
				.setDescription('Id of the punishment')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('reason')
				.setDescription('The reason for revoking the punishment')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {

		const reason = interaction.options.getString('reason');
		const id = interaction.options.getNumber('id');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Loads the punishments
		let punishments = FileHelper.readFromFile(WorldEventsPunishmentHelper.getPunishmentsFileName(interaction.guildId));
		if (!punishments) {
			punishments = [];
		}

		// Checks if the punishment exists
		const punishment = _.find(punishments, p => p.id === id);
		if (!punishment) {
			DiscordHelper.followUp(interaction, 'Punishment #"' + id + '" not found!');
			return;
		}

		// Checks if the punishment was already revoked
		if (punishment.revokeDate) {
			DiscordHelper.followUp(interaction, 'Punishment #"' + id + '" was already revoked!');
			return;
		}

		// Checks if the punishment already expired
		if (punishment.amountTotal === punishment.amountServed) {
			DiscordHelper.followUp(interaction, 'Punishment #"' + id + '" already expired!');
			return;
		}

		// Revoked the punishment
		punishments = _.map(punishments, p => {
			if (p.id === id) {
				p.revokeDate = new Date();
				p.revokeUsername = interaction.user.username;
				p.revokeReason = reason;
			}

			return p;
		})

		FileHelper.writeToFile(WorldEventsPunishmentHelper.getPunishmentsFileName(interaction.guildId), punishments);
		DiscordHelper.editReply(interaction, punishment.type + ' #' + id + ' for user '
			+ `<@${punishment.userId}>` + ' (' + punishment.username + ') got revoked!');
	},
};
