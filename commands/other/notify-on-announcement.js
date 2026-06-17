const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');



const ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME = './assets/announcement-notification-trackers.json';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('notify-on-announcement')
		.setDescription('Pings a role when an external announcement is sent into the channel.')
		.addRoleOption(option =>
			option.setName('ping-role')
				.setDescription('The role to be pinged')
				.setRequired(true))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('Set to true if you want the bot to stop pinging'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId && a.channelId === b.channelId;
		});

		console.log('Starting ' + activeTrackers.length + ' Announcement notification trackers from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' Announcement notification trackers from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('Announcement notification Tracker for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Announcement notification Tracker for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.options.channel);
				if (!channel) {
					console.log('Announcement notification Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Announcement notification Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
					FileHelper.writeToFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				// Nothing needs to be done as the event handles the logic
			} catch (e) {
				console.log(e);
				console.log('Announcement notification Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('Announcement notification Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
				FileHelper.writeToFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' Announcement notification trackers from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' Announcement notification trackers from memory!');
	},
	async execute(interaction) {
		const disable = interaction.options.getBoolean('disable');
		const pingRole = interaction.options.getRole('ping-role')?.id;

		await DiscordHelper.deferReply(interaction);

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = _.find(FileHelper.readFromFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME), i => i.guildId === interaction.guild.id && i.channelId === interaction.channel.id);
		if (existingInterval) {
			updateTrackersFile(true);
			DiscordHelper.followUp(interaction, 'Stopped the existing Announcement notification tracker.');

			if (disable) {
				return;
			}
		} else if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active Announcement notification trackers for this channel.');
			return;
		}

		addActiveTracker();

		DiscordHelper.followUp(interaction, 'The provided role will now be pinged for announcements!');



		//region Functions

		function addActiveTracker() {
			updateTrackersFile(true);
			updateTrackersFile();
		}

		// This function exists to locally update the trackers for a restart, without it restarting the entire thing each time someone enters/leaves the party
		function updateTrackersFile(removeCurrent = false) {
			let activeTrackers = FileHelper.readFromFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME);
			if (!activeTrackers) {
				activeTrackers = [];
			}

			activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id && tracker.channelId === interaction.channel.id));

			if (!removeCurrent) {
				activeTrackers.push({
					guildId: interaction.guild.id,
					channelId: interaction.channel.id,
					options: {
						pingRole: pingRole,
					}
				});
			}

			FileHelper.writeToFile(ANNOUNCEMENT_NOTIFICATION_TRACKERS_FILENAME, activeTrackers);
		}
	},
};