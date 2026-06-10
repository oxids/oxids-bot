const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
var _ = require('lodash');
const PunishmentHelper = require('../../helpers/punishment.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const { applicationServer } = require('../../config.json');
const DiscordHelper = require("../../helpers/discord.helper");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('punishments-revoke')
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

		// Only works on PROF discord
		if (interaction.guildId !== applicationServer) {
			DiscordHelper.reply(interaction, 'This command currently only works on the PROF guild discord!');
			return;
		}

		const reason = interaction.options.getString('reason');
		const id = interaction.options.getNumber('id');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Loads the punishments
		let punishments = FileHelper.readFromFile(PunishmentHelper.PUNISHMENTS_FILENAME);
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
		if (punishment.punishEndDate && new Date() >= new Date(punishment.punishEndDate)) {
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

		FileHelper.writeToFile(PunishmentHelper.PUNISHMENTS_FILENAME, punishments);
		DiscordHelper.editReply(interaction, PunishmentHelper.getPunishmentName(punishment.type) + ' #' + id + ' for user "' + punishment.username + '" got revoked!');
	},
};

