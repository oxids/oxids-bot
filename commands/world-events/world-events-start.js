const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
var _ = require('lodash');
const { applicationServer, trustedWorldEventScouts } = require('../../config.json');
const WorldEventsHelper = require('../../helpers/world-events.helper.js');
const DiscordHelper = require("../../helpers/discord.helper");



module.exports = {
	data: new SlashCommandBuilder()
		.setName('world-events-start')
		.setDescription('Manually sets a start data for a world event.')
		.addStringOption(option =>
			option.setName('start-time')
				.setDescription('When the event starts. (E.g. 10h 20m)')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('world-event')
				.setDescription('The world event to start (Default: ' + WorldEventsHelper.WORLD_EVENTS_ENUM.PRELUDE_TO_ANNIHILATION + ')')
				.addChoices(...(_.map(Object.keys(WorldEventsHelper.WORLD_EVENTS_ENUM), key => {
					return { name: WorldEventsHelper.WORLD_EVENTS_ENUM[key], value: WorldEventsHelper.WORLD_EVENTS_ENUM[key] };
				}))))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {

		// Only works on PROF discord or for whitelisted people
		if (interaction.guildId !== applicationServer && !_.find(trustedWorldEventScouts, s => s.discordId === interaction.user.id)) {
			DiscordHelper.reply(interaction, {
				content: 'This command currently only works on the PROF guild discord or for whitelisted people!',
				ephemeral: true
			});
			return;
		}

		const startTimeString = interaction.options.getString('start-time');
		const worldEvent = interaction.options.getString('world-events') || WorldEventsHelper.WORLD_EVENTS_ENUM.PRELUDE_TO_ANNIHILATION;
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

		WorldEventsHelper.setManualTime(startTime, worldEvent,
			interaction.user.username + ' (' + interaction.user.id + ')');
		DiscordHelper.reply(interaction, { content: 'Set ' + worldEvent + ' start manually to <t:'
			+ Math.floor(startTime.getTime() / 1000) + '>' });
	}
};