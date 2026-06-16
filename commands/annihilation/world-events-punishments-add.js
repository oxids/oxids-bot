const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
var _ = require('lodash');
const FileHelper = require('../../helpers/file.helper.js');
const DiscordHelper = require("../../helpers/discord.helper");
const WorldEventsPunishmentHelper = require('../../helpers/world-events-punishment.helper.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('world-events-punishments-add')
		.setDescription('Adds a user to the punishment list.')
		.addUserOption(option =>
			option.setName('user')
				.setDescription('The user who is punished')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('type')
				.setDescription('What the punishment is for')
				.setRequired(true)
				.addChoices(
					{ name: 'Untimeliness', value: 'untimeliness' },
					{ name: 'Ban', value: 'ban' }))
		.addStringOption(option =>
			option.setName('reason')
				.setDescription('The reason for of punishment (Default: None)'))
		.addNumberOption(option =>
			option.setName('amount')
				.setDescription('How many world events this punishment is valid for (Default: 2)'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {

		const user = interaction.options.getUser('user');
		const type = interaction.options.getString('type');
		const reason = interaction.options.getString('reason');
		let amount = interaction.options.getNumber('amount') ?? 2;

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Loads the punishments
		let punishments = FileHelper.readFromFile(WorldEventsPunishmentHelper.getPunishmentsFileName(interaction.guildId));
		if (!punishments) {
			punishments = [];
		}

		// Adds the punishment
		punishments.push({
			id: (_.last(punishments)?.id ?? 0) + 1,
			type: type,
			userId: user.id,
			username: user.username,
			avatar: user.avatarURL(),

			punishDate: new Date(),
			amountTotal: amount,
			amountServed: 0,
			punishUsername: interaction.user.username,
			punishReason: reason
		});

		// Expands all active punishments of the user
		for (const punishment of punishments) {
			if (punishment.revokeDate || punishment.amountServed === punishment.amountTotal || punishment.userId !== user.id || !punishment.amountServed) {
				continue;
			}

			punishment.amountServed = 0;
		}

		FileHelper.writeToFile(WorldEventsPunishmentHelper.getPunishmentsFileName(interaction.guildId), punishments);
		DiscordHelper.editReply(interaction, 'The user ' + `<@${user.id}>` + ' (' + user.username + ') was sanctioned for ' + type
			+ ' for ' + amount + ' events!');
	},
};
