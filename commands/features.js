const { SlashCommandBuilder } = require('discord.js');
const DiscordHelper = require("../helpers/discord.helper");
const _ = require("lodash");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('features')
		.setDescription('Lists all useful features the bot provides.'),
	async execute(interaction, showHelpPage = false) {
		let embeds = [];
		let commands = [];

		if (showHelpPage) {
			commands = [
				'DM **oxids** on Discord for support or feature requests!'
			];

			embeds = _.concat(embeds, DiscordHelper.getEmbeds([{ name: '', value: commands.sort().join('\n\n') }],
				1, '🆘 Get help', DiscordHelper.getBotImage()));
		}

		commands = [
			'**/anni-tracker**\nAutomated notification and party system for the Annihilation world event.',
			'**/guild-applications**\nAutomated guild application system which lets users apply for Wynncraft guilds using custom Discord modals.',
			'**/guild-member-tracker**\nAutomated member tracker for Wynncraft guilds which tracks joins, promotions and leaves.',
			'**/guild-verification**\nAutomated verification system, which automates giving guild roles to verified users based on their Wynncraft guild ranks.',
			'**/war-tracker**\nAutomated territory tracker for Wynncraft guilds.',
			'**/changelog**\nDisplays the changelog for the bot.',
		];

		embeds = _.concat(embeds, DiscordHelper.getEmbeds([{ name: '', value: commands.sort().join('\n\n') }],
			1, '⭐ Most useful', DiscordHelper.getBotImage()));



		commands = [
			'**/enemy-guild-tracker**\nDisplays world changes for members of a guild for 30m.',
			'**/guild-inactives**\nDisplays which members of a guild have the longest inactivity.',
			'**/guild-info**\nDisplays information about a guild.',
			'**/guild-xp-leaderboard**\nStarts an automatically updating leaderboard that displays which members have donated the most xp.',
			'**/guild-xp-tracker**\nDisplays xp gained for a guild for 30m.',
			'**/guild-verification-lookup**\nDisplays which account a user is linked to.'
		];

		embeds = _.concat(embeds, DiscordHelper.getEmbeds([{ name: '', value: commands.sort().join('\n\n') }],
			1, '⚔️ Guild commands', DiscordHelper.getBotImage()));



		commands = [
			'**/giveaway**\nStarts a giveaway which automatically resolves after a given time.',
			'**/manual-giveaway**\nStarts a giveaway which immediately resolves among the given participants.',
			'**/solve-question-mark**\nDisplays the solution for the ??? quest Lab N part.',
			'**/pokedex**\nFully integrated Pokemon API.',
			'**/cat**\nFully integrated cat API.',
			'**/dog**\nFully integrated dog API.',
			'**/animal**\nFully integrated animal API.',
			'**/prof-xp-tracker**\nDisplays profession xp gained for a player for 30m.'
		];

		embeds = _.concat(embeds, DiscordHelper.getEmbeds([{ name: '', value: commands.sort().join('\n\n') }],
			1, '🚀️ Other commands', DiscordHelper.getBotImage()));

		DiscordHelper.sendEmbedsToInteraction(interaction, embeds);
	},
};