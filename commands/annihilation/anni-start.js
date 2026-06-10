const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
var _ = require('lodash');
const { applicationServer, trustedAnniScouts } = require('../../config.json');
const AnniApiHelper = require('../../helpers/anni-api.helper.js');
const DiscordHelper = require("../../helpers/discord.helper");
const LogHelper = require('../../helpers/log.helper.js');



module.exports = {
	data: new SlashCommandBuilder()
		.setName('anni-start')
		.setDescription('Manually sets a start data for annihilation world event.')
		.addStringOption(option =>
			option.setName('start-time')
				.setDescription('When the event starts. (E.g. 10h 20m)')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {

		// Only works on PROF discord or for whitelisted people
		if (interaction.guildId !== applicationServer && !_.find(trustedAnniScouts, s => s.discordId === interaction.user.id)) {
			DiscordHelper.reply(interaction, {
				content: 'This command currently only works on the PROF guild discord or for whitelisted people!',
				ephemeral: true
			});
			return;
		}

		const startTimeString = interaction.options.getString('start-time');
		if (!startTimeString?.trim()) {
			DiscordHelper.reply(interaction, { content: 'You have to set a start time!', ephemeral: true });
		}

		const regex = /^(\d{1,2})h\s*(\d{1,2})m$/;
		const match = startTimeString.match(regex);
		if (!match) {
			DiscordHelper.reply(interaction, { content: 'Invalid time format! Use e.g. "10h 20m"', ephemeral: true });
			return;
		}

		const hours = parseInt(match[1], 10);
		const minutes = parseInt(match[2], 10);

		const startTime = new Date();
		startTime.setHours(startTime.getHours() + hours);
		startTime.setMinutes(startTime.getMinutes() + minutes);

		AnniApiHelper.setManualAnni(startTime.getTime());

		LogHelper.writeToLog('Anni Start was set to ' + startTime.toISOString() + ' by ' + interaction.user.username + ' (' + interaction.user.id + ')');
		DiscordHelper.reply(interaction, { content: 'Set Anni start manually to <t:' + Math.floor(startTime.getTime() / 1000) + '>' });
	}
};