const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
var _ = require('lodash');
const FileHelper = require('../../helpers/file.helper.js');
const { applicationServer } = require('../../config.json');
const PunishmentHelper = require('../../helpers/punishment.helper.js');
const DiscordHelper = require("../../helpers/discord.helper");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('punishments-add')
		.setDescription('Adds a user to the punishment list.')
		.addStringOption(option =>
			option.setName('username')
				.setDescription('The user who is punished')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('type')
				.setDescription('The type of punishment')
				.setRequired(true)
				.addChoices(
					{ name: 'Warning', value: 'warn' },
					{ name: 'Ban', value: 'ban' }))
		.addStringOption(option =>
			option.setName('reason')
				.setDescription('The reason for of punishment')
				.setRequired(true))
		.addNumberOption(option =>
			option.setName('days')
				.setDescription('How many days this punishment is valid (Default: Permanent)'))	
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {

		// Only works on PROF discord
		if (interaction.guildId !== applicationServer) {
			DiscordHelper.reply(interaction, 'This command currently only works on the PROF guild discord!');
			return;
		}

		let username = interaction.options.getString('username');
		const type = interaction.options.getString('type');
		const reason = interaction.options.getString('reason');
		const days = interaction.options.getNumber('days');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Loads the punishments
		let punishments = FileHelper.readFromFile(PunishmentHelper.PUNISHMENTS_FILENAME);
		if (!punishments) {
			punishments = [];
		}

		// Loads the user
		const playerInfo = await WynnApiHelper.getPlayerInfo(username);
		if (!playerInfo) {
			DiscordHelper.followUp(interaction, 'User "' + username + '" not found!');
			return;
		}


		// Updates the username for the user
		username = playerInfo.username;
		punishments = _.map(punishments, p => {
			if (p.uuid === playerInfo.uuid) {
				p.username = username;
			}

			return p;
		});

		// Adds the punishment
		let endDate = null;
		if (days && days > 0) {
			endDate = new Date();
			endDate.setDate(endDate.getDate() + days);
		}

		punishments.push({
			id: (_.last(punishments)?.id ?? 0) + 1,
			type: type,
			uuid: playerInfo.uuid,
			username: username,

			punishDate: new Date(),
			punishEndDate: endDate,
			punishUsername: interaction.user.username,
			punishReason: reason
		});

		FileHelper.writeToFile(PunishmentHelper.PUNISHMENTS_FILENAME, punishments);
		DiscordHelper.editReply(interaction, 'The user "' + username + '" got a ' + PunishmentHelper.getPunishmentName(type) + '!');
	},
};

