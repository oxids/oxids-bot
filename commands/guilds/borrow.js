const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
var _ = require('lodash');
const DiscordHelper = require("../../helpers/discord.helper");



module.exports = {
	data: new SlashCommandBuilder()
		.setName('borrow')
		.setDescription('Disables war-tracker pings for a territory for 30m.')
		.addStringOption(option =>
			option.setName('territory')
				.setDescription('The territory that is being borrowed (Default: Forest of Eyes)'))
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild that has borrowed the territory (Default: Any guild)'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {
		const territory = interaction.options.getString('territory') ?? 'Forest of Eyes';
		let guildName = interaction.options.getString('guild');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Loads the info of the guild
		if (guildName) {
			let guild = await WynnApiHelper.getGuildInfo(guildName);
			if (!guild?.members) {
				await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
				return;
			}

			// Corrects case of the guild name parameter
			guildName = guild.name;
		}
		

		WynnApiHelper.addBorrowedTerritory(interaction.guild.id, territory, guildName);

		let responseText = 'Territory "' + territory + '" can be borrowed';
		if (guildName) {
			responseText += ' by "' + guildName + '"';
		}

		responseText += ' for the next 30m without causing a war ping!';
		DiscordHelper.followUp(interaction, responseText);
	},
};
