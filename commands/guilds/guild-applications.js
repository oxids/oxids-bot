const { SlashCommandBuilder, ComponentType} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');

// Existing layouts for guilds
const DevLayout = require("../../assets/guild-application-layouts/Dev");
const ProfessionHeavenLayout = require("../../assets/guild-application-layouts/Profession Heaven");

const APPLICATION_TRACKERS_FILENAME = './assets/application-trackers.json';

let intervals = []; // All intervals across all bot instances

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-applications')
		.setDescription('Allows users to submit applications to your guild.')
		.addChannelOption(option =>
			option.setName('recruit-output')
				.setDescription('The channel to output Recruit applications to')
				.setRequired(true))
		.addChannelOption(option =>
			option.setName('recruiter-output')
				.setDescription('The channel to output Recruiter applications to')
				.setRequired(true))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('(Optional) Set to true if you want the bot to stop the verification system'))
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(APPLICATION_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId;
		});

		console.log('Starting ' + activeTrackers.length + ' guild-applications from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' guild-applications from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('Guild application for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild application for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(APPLICATION_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.channelId);
				if (!channel) {
					console.log('Guild application for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild application for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
					FileHelper.writeToFile(APPLICATION_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				// Should not stop the existing tracker on a message fetching error
				let message = await DiscordHelper.fetch(channel?.messages, tracker.messageId);
				if (!message) {
					console.log('Guild application for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message!');
					LogHelper.writeToLog('Guild application for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message\n' + JSON.stringify(tracker));
				}

				tracker.fromMemory = true;
				tracker.guild = guild;
				tracker.channel = channel;
				tracker.message = message;

				tracker.deferReply = async function() {};
				tracker.followUp = async function() {};
				tracker.deleteReply = async function() {};

				await this.execute(tracker);
			} catch (e) {
				console.log(e);
				console.log('Guild application for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('Guild application for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
				FileHelper.writeToFile(APPLICATION_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' Guild application from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' Guild application from memory!');
	},
	async execute(interaction) {
		let collector;

		let recruitOutputChannel, recruiterOutputChannel, disable, message, trackerId;
		if (interaction.fromMemory) {
			recruitOutputChannel = interaction.options.recruitOutputChannel;
			recruiterOutputChannel = interaction.options.recruiterOutputChannel;
			message = interaction.message;
			trackerId = interaction.trackerId;
		} else {
			recruitOutputChannel = interaction.options.getChannel('recruit-output')?.id;
			recruiterOutputChannel = interaction.options.getChannel('recruiter-output')?.id;
			disable = interaction.options.getBoolean('disable');
			trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Checks if the guild has applications enabled
		let layout;
		switch (interaction.guild.id) {
			case '9250628631088579561':
				layout = DevLayout;
				break;
			case '920506925186154567':
				layout = ProfessionHeavenLayout;
				break;
			/*case '837345552785473567':
				layout = GermanyLayout;
				break;*/
			default:
				DiscordHelper.followUp(interaction, 'There is currently no layout set for your server. Please contact oxids if you\'d like to use guild applications to set your own layout!');
				return;
		}

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
		if (existingInterval) {
			removeActiveTracker();
			DiscordHelper.followUp(interaction, 'Stopped the existing guild-applications tracker.');

			if (disable) {
				return;
			}
		} else if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active guild-applications trackers for this server.');
			return;
		}

		if (message) {
			message = await DiscordHelper.edit(message, layout.getMessage(trackerId));
		} else {
			message = await DiscordHelper.send(interaction.channel, layout.getMessage(trackerId));
		}

		if (!message) {
			return;
		}

		addActiveTracker();
		startCollector();

		DiscordHelper.deleteReply(interaction);



		function addActiveTracker() {
			removeActiveTracker();

			intervals.push({
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				recruitOutputChannel: recruitOutputChannel,
				recruiterOutputChannel: recruiterOutputChannel,
				trackerId: trackerId,
			});

			updateTrackersFile();
		}

		function removeActiveTracker() {
			const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
			if (!existingInterval) {
				return;
			}

			intervals = intervals.filter(i => !(i.guildId === interaction.guild.id));

			if (collector) {
				try {
					collector.stop();
				} catch (e) {
					console.log('guild-applications: removeActiveTracker(): collector.stop():', e);
					LogHelper.writeToLog('guild-applications: removeActiveTracker(): collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			}

			updateTrackersFile(true);
		}

		function updateTrackersFile(removeCurrent = false) {
			let activeTrackers = FileHelper.readFromFile(APPLICATION_TRACKERS_FILENAME);
			if (!activeTrackers) {
				activeTrackers = [];
			}

			activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id));

			if (!removeCurrent) {
				activeTrackers.push(getTrackerForFile());
			}

			FileHelper.writeToFile(APPLICATION_TRACKERS_FILENAME, activeTrackers);
		}

		function getTrackerForFile() {
			return {
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				options: {
					recruitOutputChannel: recruitOutputChannel,
					recruiterOutputChannel: recruiterOutputChannel,
				},
				trackerId: trackerId,
			};
		}

		function startCollector() {
			if (collector) {
				try {
					collector.stop();
				} catch (e) {
					console.log('guild-applications: collector.stop():', e);
					LogHelper.writeToLog('guild-applications: collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			}

			collector = interaction.channel.createMessageComponentCollector({ componentType: ComponentType.Button });
			collector.on('collect', async i => {

				// Checks if its the button for this instance
				// If not, another instance is listening
				if (!i.customId || !i.customId.includes(trackerId + ':')) {
					return;
				}

				try {
					layout.handleButtonClick(i, recruitOutputChannel, recruiterOutputChannel);
				} catch (e) {
					console.log('guild-applications: collector.collect():', e);
					LogHelper.writeToLog('guild-applications: collector.collect():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

					if (!await DiscordHelper.editReply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true })) {
						DiscordHelper.reply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true });
					}
				}
			});

			collector.on('end', () => {
				try {
					collector.stop();
				} catch (e) {
					console.log('guild-applications: collector.end():', e);
					LogHelper.writeToLog('guild-applications: collector.end():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			});
		}
	},
};