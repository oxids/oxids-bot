const { SlashCommandBuilder } = require('discord.js');
var _ = require('lodash');
const DiscordHelper = require('../../helpers/discord.helper.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('changelog')
		.setDescription('Shows the changelog for the bot.')
		.addBooleanOption(option =>
			option.setName('only-1st-page')
				.setDescription('Set to true if you only want the first page'))
	,
	async execute(interaction) {
		const only1stPage = interaction.options.getBoolean('only-1st-page');

		let embeds = [];

		let changelog = getChangelog();
		if (only1stPage) {
			changelog = _.slice(changelog, 0, 1);
		}

		for (const changelogItem of changelog) {
			let content = '';
			for (const type of Object.keys(TYPE_ENUM)) {
				let bulletPoints = _.filter(changelogItem.content, c => c.type === TYPE_ENUM[type]);
				if (!bulletPoints?.length) {
					continue;
				}

				bulletPoints = _.orderBy(bulletPoints, ['command'], ['asc']);

				content += '\n\n\n**__' + getHeader(TYPE_ENUM[type]) + '__**\n\n';
				content += _.map(bulletPoints, b => getIcon(b.type) + ' '
					+ (b.command ? '**' + b.command + '**\n' : '')
					+ b.description + (b.description.endsWith('.') ? '' : '.')
				).join('\n\n');
			}

			embeds = _.concat(embeds, DiscordHelper.getEmbeds(
				[{
					name: '**Version ' + changelogItem.version + ' - ' + changelogItem.date + '**',
					value: content
				}],
				1, 'Changelog', DiscordHelper.getBotImage()));
		}

		DiscordHelper.sendEmbedsToInteraction(interaction, embeds);
	},
};

const TYPE_ENUM = {
	ADD: 'add',
	EDIT: 'edit',
	REMOVE: 'remove'
};

function getIcon(type) {
	switch (type) {
		case TYPE_ENUM.ADD:
			return '✚ ';
		case TYPE_ENUM.EDIT:
			return '⚙️ ';
		case TYPE_ENUM.REMOVE:
			return '❌ ';
		default:
			return '';
	}
}

function getHeader(type) {
	switch (type) {
		case TYPE_ENUM.ADD:
			return 'New features';
		case TYPE_ENUM.EDIT:
			return 'Updated features';
		case TYPE_ENUM.REMOVE:
			return 'Removed features';
		default:
			return '';
	}
}

function getChangelog() {
	return [
		{ date: '2026-06-30', version: '1.0.3.6', content: [
			{ type: TYPE_ENUM.ADD, command: '/raid-pool',
				description: 'Add command to show the current raid pool & automatically post updates.' },
			{ type: TYPE_ENUM.ADD, command: '/lootrun-pool',
				description: 'Add command to show the current lootrun pool & automatically post updates.' },
		]},

		{ date: '2026-06-16', version: '1.0.3.5', content: [
			{ type: TYPE_ENUM.EDIT, command: '/giveaway',
				description: 'The initiator of a giveaway and the winners will now be pinged after the winners were drawn.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Fix parties showing <Available> X times if many spaces are open.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Pings and party leader messages are now deleted after the event is over.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Add parameters to toggle off 1h and 30m pings.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Renamed all "anni-" commands to "world-events-" in anticipation of future major world events.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Show for which party a leader was set.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Fix spam of pings during the initial Anni reveal if the Discord API is slow.' },
			{ type: TYPE_ENUM.ADD, command: '/role-giver',
				description: 'Add a command for the bot to give out or remove roles from users.' },
			{ type: TYPE_ENUM.EDIT, command: '/help',
				description: 'Add dev server to help page.' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-application',
				description: 'Add a default mode for applications, so guilds can test the basic functions.' },
		]},

		{ date: '2026-05-30', version: '1.0.3.4', content: [
			{ type: TYPE_ENUM.ADD, command: '/guild-verification-unverify',
				description: 'Add command to unverify own discord account.' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-verification',
				description: 'Fixed guild verification needing users to verify within 14 minutes. Timeout changed to 2 hours instead.' },
			{ type: TYPE_ENUM.EDIT, command: '/notify-on-announcement',
				description: 'Fixed multi-part announcements causing multiple pings and being split by the pings.' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-inactives',
				description: 'Implemented lastJoin property from the new guild member object to massively reduce loading times.' },
			{ type: TYPE_ENUM.EDIT, command: '/notify-on-announcement',
				description: 'Fixed announcements not correctly disabling & improved notification message.' },
			{ type: TYPE_ENUM.EDIT, command: '/giveaway',
				description: 'Fixed player names not being correctly escaped.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Added an error message if the bot can\'t give notification roles, instead of just saying it did so.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Fixed join modal for parties with leader but no world.' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-verification',
				description: 'Switch API endpoint to load worlds to massively reduce TTL.' },
		]},

		{ date: '2026-04-11', version: '1.0.3.3', content: [
			{ type: TYPE_ENUM.ADD, command: '/notify-on-announcement',
				description: 'Add command to ping a role when an external announcement is sent to a channel.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Instead of abusing placeholders, defaults now get correctly set for text & select inputs.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'The party role now gets pre-assigned by certain value in the build input, e.g. the role Healer when entering "Abso".' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-application',
				description: 'Guild application system can now simply be used by guilds outside PROF.' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-application',
				description: 'The username is now automatically prefilled in applications, if the user is verified with the bot.' },
			{ type: TYPE_ENUM.EDIT,
				description: 'Wynncraft guild banners are now displayed if there is no custom image. Credit to AiverAiva for the API endpoint <3.' },
		]},

		{ date: '2026-03-21', version: '1.0.3.2', content: [
			{ type: TYPE_ENUM.EDIT, command: '/giveaway',
				description: 'Add option to only allow verified users to enter.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-tracker',
				description: 'Fixed a bug where Discord API being slow caused multiple pings of the notification role.' },
			{ type: TYPE_ENUM.EDIT, command: '/anni-punishments-add, /anni-punishments-list, /anni-punishments-revoke',
				description: 'Allow guilds outside PROF to use Anni punishments. Credit to byBackfish <3.' },
		]},

		{ date: '2026-03-09', version: '1.0.3.1', content: [
			{ type: TYPE_ENUM.ADD, command: '/features',
				description: 'Added a feature list.' },
			{ type: TYPE_ENUM.ADD, command: '/help',
				description: 'Added a help command.' },
			{ type: TYPE_ENUM.ADD, command: '/guild-verification-list-unknown',
				description: 'Added a command to see which people in a guild are not yet verified with the bot.' },
			{ type: TYPE_ENUM.ADD,
				description: 'Added the /help command to the displayed bot status.' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-verification',
				description: 'Fixed a bug where Wynncraft API giving empty members in a guild was not resolved correctly.' },
			{ type: TYPE_ENUM.EDIT, command: '/guild-verification',
				description: 'Fixed a bug where the same discord role could not be attached to multiple Ingame guild ranks.' },
			{ type: TYPE_ENUM.EDIT,
				description: 'Fixed a bug where trackers with missing permissions were not correctly removed, spamming logs.' }
		]},

		{ date: '2026-02-13', version: '1.0.3.0', content: [
			{ type: TYPE_ENUM.ADD, command: '/guild-verification',
				description: 'Added a guild verification system to automatically give guild roles.' },
			{ type: TYPE_ENUM.ADD, command: '/guild-application',
				description: 'Added an application system for PROF guild discord.' },
			{ type: TYPE_ENUM.EDIT, command: '/giveaway',
				description: 'Rewrote the old giveaway command entirely and renamed it.' },
			{ type: TYPE_ENUM.EDIT,
				description: 'Fixed a bug that caused message spam due to trackers not being updated correctly on restart.' },
		]}
	];
}