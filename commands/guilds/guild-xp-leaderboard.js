const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const FormatHelper = require("../../helpers/format.helper");



const LEADERBOARD_TRACKERS_FILENAME = './assets/guild-xp-leaderboard-trackers.json';
const LEADERBOARD_DATA_FOLDERNAME = './assets/guild-xp-leaderboard-data';

let intervals = []; // All intervals across all bot instances

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-xp-leaderboard')
		.setDescription('Shows a leaderboards for the 20 people with the most xp gained since command execution.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to track xp')
				.setRequired(true))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('(Optional) Set to true if you want the bot to stop the leaderboard system'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(LEADERBOARD_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId;
		});

		console.log('Starting ' + activeTrackers.length + ' guild-xp-leaderboard from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' guild-xp-leaderboard from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('Guild xp-leaderboard for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild xp-leaderboard for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(LEADERBOARD_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.channelId);
				if (!channel) {
					console.log('Guild xp-leaderboard for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild xp-leaderboard for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
					FileHelper.writeToFile(LEADERBOARD_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				// Should not stop the existing tracker on a message fetching error
				let message = await DiscordHelper.fetch(channel?.messages, tracker.messageId);
				if (!message) {
					console.log('Guild xp-leaderboard for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message!');
					LogHelper.writeToLog('Guild xp-leaderboard for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message\n' + JSON.stringify(tracker));
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
				console.log('Guild xp-leaderboard for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('Guild xp-leaderboard for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
				FileHelper.writeToFile(LEADERBOARD_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' Guild xp-leaderboard from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' Guild xp-leaderboard from memory!');
	},
	async execute(interaction) {
		let guildName, disable, message;
		if (interaction.fromMemory) {
			guildName = interaction.options.guildName;
			message = interaction.message;
		} else {
			guildName = interaction.options.getString('guild');
			disable = interaction.options.getBoolean('disable');
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
		if (existingInterval) {
			removeActiveTracker();
			DiscordHelper.followUp(interaction, 'Stopped the existing guild-xp-leaderboard tracker.');

			if (disable) {
				return;
			}
		} else if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active guild-xp-leaderboard trackers for this server.');
			return;
		}

		// Loads the info of the guild
		let guild = await WynnApiHelper.getGuildInfo(guildName);
		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;

		if (!message) {
			message = await DiscordHelper.send(interaction.channel, await getXPMessage(!interaction.fromMemory));
		} else {
			message = await DiscordHelper.edit(message, await getXPMessage());
		}

		if (!message) {
			return;
		}

		const interval = setInterval(async () => {
			try {
				message = await DiscordHelper.edit(message, await getXPMessage());
			} catch (e) {
				console.log('guild-xp-leaderboard: interval: ', e);
				LogHelper.writeToLog('guild-xp-leaderboard: interval: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
			}
		}, 1000 * 60 * 5);

		addActiveTracker();

		if (!interaction.fromMemory) {
			DiscordHelper.deleteReply(interaction);
		}



		async function getXPMessage(initialStart = false) {
			let xpGains = FileHelper.readFromFile(LEADERBOARD_DATA_FOLDERNAME + '/' + guildName + '.json') ?? [];
			guild = await WynnApiHelper.getGuildInfo(guildName);

			for (const member of guild.members.all) {
				if (!member.contributed) {
					continue;
				}

				const xpGain = _.find(xpGains, g => g.minecraftUUID === member.uuid);
				if (!xpGain) {
					xpGains.push({
						minecraftUUID: member.uuid,
						minecraftUsername: member.username,
						totalXP: initialStart ? 0 :member.contributed,
						lastXP: member.contributed
					});
				} else {
					if (xpGain.lastXP > member.contributed) {
						xpGain.totalXP += member.contributed; // Member left the guild in the meantime
					} else {
						xpGain.totalXP += member.contributed - xpGain.lastXP;
					}

					xpGain.lastXP = member.contributed;
					xpGain.minecraftUsername = member.username;
				}
			}

			FileHelper.writeToFile(LEADERBOARD_DATA_FOLDERNAME + '/' + guildName + '.json', xpGains);

			if (!xpGains?.length) {
				return { content: 'No XP gained so far!' };
			}

			xpGains = _.orderBy(xpGains, g => g.totalXP, 'desc');
			xpGains = _.map(xpGains, xpGain => {
				xpGain.totalXP = xpGain.totalXP.toLocaleString();
				return xpGain;
			});

			xpGains = FormatHelper.formatEqualLength(xpGains, 'minecraftUsername');
			xpGains = FormatHelper.formatEqualLength(xpGains, 'totalXP');

			let xpMessage = 'Username | Total XP | Placement\n';
			for (let i = 0; i < xpGains.length && i < 20; i++) {
				const curGain = xpGains[i];

				xpMessage += '`' + curGain.minecraftUsername + '` | `' + curGain.totalXP + '` | ';

				switch (i) {
					case 0:
						xpMessage += '🥇';
						break;
					case 1:
						xpMessage += '🥈';
						break;
					case 2:
						xpMessage += '🥉';
						break;
					default:
						xpMessage += (i + 1) + 'th';
						break;
				}

				xpMessage += '\n';
			}

			return {
				embeds: DiscordHelper.getEmbeds([{
					name: '',
					value: xpMessage
				}], 1, 'XP Leaderboard', null, 'Blue') };
		}

		function addActiveTracker() {
			removeActiveTracker();

			intervals.push({
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				guildName: guildName,
				interval: interval
			});

			updateTrackersFile();
		}

		function removeActiveTracker() {
			const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
			if (!existingInterval) {
				return;
			}

			clearInterval(existingInterval.interval);
			intervals = intervals.filter(i => !(i.guildId === interaction.guild.id));

			updateTrackersFile(true);
		}

		function updateTrackersFile(removeCurrent = false) {
			let activeTrackers = FileHelper.readFromFile(LEADERBOARD_TRACKERS_FILENAME);
			if (!activeTrackers) {
				activeTrackers = [];
			}

			activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id));

			if (!removeCurrent) {
				activeTrackers.push(getTrackerForFile());
			}

			FileHelper.writeToFile(LEADERBOARD_TRACKERS_FILENAME, activeTrackers);
		}

		function getTrackerForFile() {
			return {
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				options: {
					guildName: guildName,
				},
			};
		}
	},
};