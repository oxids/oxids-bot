const { SlashCommandBuilder, ComponentType, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits} = require('discord.js');
const DiscordHelper = require('../helpers/discord.helper.js');
const FileHelper = require('../helpers/file.helper.js');
const LogHelper = require('../helpers/log.helper.js');
var _ = require('lodash');

const ROLE_TRACKERS_FILENAME = './assets/role-trackers.json';

let intervals = []; // All intervals across all bot instances

module.exports = {
	data: new SlashCommandBuilder()
		.setName('role-giver')
		.setDescription('Creates a message with buttons to give out roles.')
		.addRoleOption(option =>
			option.setName('role-1')
				.setDescription('A role the bot can give out')
				.setRequired(true))
		.addRoleOption(option =>
			option.setName('role-2')
				.setDescription('A role the bot can give out'))
		.addRoleOption(option =>
			option.setName('role-3')
				.setDescription('A role the bot can give out'))
		.addRoleOption(option =>
			option.setName('role-4')
				.setDescription('A role the bot can give out'))
		.addRoleOption(option =>
			option.setName('role-5')
				.setDescription('A role the bot can give out'))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('(Optional) Set to true if you want the bot to stop the role giver'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(ROLE_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId && a.channelId === b.channelId;
		});

		console.log('Starting ' + activeTrackers.length + ' role-givers from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' role-givers from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('Role giver for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Role giver for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(ROLE_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.channelId);
				if (!channel) {
					console.log('Role giver for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Role giver for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
					FileHelper.writeToFile(ROLE_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				// Should not stop the existing tracker on a message fetching error
				let message = await DiscordHelper.fetch(channel?.messages, tracker.messageId);
				if (!message) {
					console.log('Role giver for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message!');
					LogHelper.writeToLog('Role giver for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message\n' + JSON.stringify(tracker));
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
				console.log('Role giver for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('Role giver for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
				FileHelper.writeToFile(ROLE_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' Role giver from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' Role giver from memory!');
	},
	async execute(interaction) {
		let collector;

		let role1, role2, role3, role4, role5, disable, message, trackerId;
		if (interaction.fromMemory) {
			role1 = interaction.options.role1;
			role2 = interaction.options.role2;
			role3 = interaction.options.role3;
			role4 = interaction.options.role4;
			role5 = interaction.options.role5;
			message = interaction.message;
			trackerId = interaction.trackerId;
		} else {
			role1 = interaction.options.getRole('role-1')?.id;
			role2 = interaction.options.getRole('role-2')?.id;
			role3 = interaction.options.getRole('role-3')?.id;
			role4 = interaction.options.getRole('role-4')?.id;
			role5 = interaction.options.getRole('role-5')?.id;
			disable = interaction.options.getBoolean('disable');
			trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
		if (existingInterval) {
			removeActiveTracker();
			DiscordHelper.followUp(interaction, 'Stopped the existing role-giver tracker.');

			if (disable) {
				return;
			}
		} else if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active role-giver trackers for this server.');
			return;
		}

		if (message) {
			message = await DiscordHelper.edit(message, getMessage(trackerId));
		} else {
			message = await DiscordHelper.send(interaction.channel, getMessage(trackerId));
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
				role1: role1,
				role2: role2,
				role3: role3,
				role4: role4,
				role5: role5,
				trackerId: trackerId,
			});

			updateTrackersFile();
		}

		function removeActiveTracker() {
			const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
			if (!existingInterval) {
				return;
			}

			intervals = intervals.filter(i => !(i.guildId === interaction.guild.id && i.channelId === interaction.channel.id));

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
			let activeTrackers = FileHelper.readFromFile(ROLE_TRACKERS_FILENAME);
			if (!activeTrackers) {
				activeTrackers = [];
			}

			activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id && tracker.channelId === interaction.channel.id));

			if (!removeCurrent) {
				activeTrackers.push(getTrackerForFile());
			}

			FileHelper.writeToFile(ROLE_TRACKERS_FILENAME, activeTrackers);
		}

		function getTrackerForFile() {
			return {
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				options: {
					role1: role1,
					role2: role2,
					role3: role3,
					role4: role4,
					role5: role5,
				},
				trackerId: trackerId,
			};
		}

		function startCollector() {
			if (collector) {
				try {
					collector.stop();
				} catch (e) {
					console.log('role-giver: collector.stop():', e);
					LogHelper.writeToLog('role-giver: collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
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
					await DiscordHelper.deferReply(i, true);

					const split = i.customId.split(':');
					if (split.length !== 2) {
						DiscordHelper.editReply(i, { content: 'Unknown interaction. How did you get here?', ephemeral: true });
						return;
					}

					const role = _.last(split);
					const serverRole = interaction.guild.roles.cache.get(role);
					if (!role) {
						DiscordHelper.editReply(i, { content: 'Unknown role ' + role + '. Please let the server team know :)', ephemeral: true });
						return;
					}

					if (!serverRole.editable) {
						DiscordHelper.editReply(i, { content: 'I don\'t have permissions to add or remove this role!', ephemeral: true });
						return;
					}

					if (i.member.roles.cache.some(r => r.id === role)) {
						i.member.roles.remove(role);
						DiscordHelper.editReply(i, { content: 'Your ' + serverRole.name + ' role was removed.', ephemeral: true });
						return;
					}

					i.member.roles.add(role);
					DiscordHelper.editReply(i, { content: 'You received the ' + serverRole.name + ' role.', ephemeral: true });
				} catch (e) {
					console.log('role-giver: collector.collect():', e);
					LogHelper.writeToLog('role-giver: collector.collect():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

					if (!await DiscordHelper.editReply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true })) {
						DiscordHelper.reply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true });
					}
				}
			});

			collector.on('end', () => {
				try {
					collector.stop();
				} catch (e) {
					console.log('role-giver: collector.end():', e);
					LogHelper.writeToLog('role-giver: collector.end():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			});
		}

		function getMessage() {
			const buttons = [];
			for (const role of [role1, role2, role3, role4, role5]) {
				if (!role) {
					continue;
				}

				const serverRole = interaction.guild.roles.cache.get(role);
				if (!serverRole) {
					continue;
				}

				buttons.push(new ButtonBuilder()
					.setCustomId(trackerId + ':' + role)
					.setLabel(serverRole.name)
					.setStyle(ButtonStyle.Primary));
			}

			const actionRow = new ActionRowBuilder().addComponents(buttons);

			const embeds = DiscordHelper.getEmbeds([{
				name: '',
				value: 'Please click on the roles you would like to receive or taken away!'
			}], 1, 'Roles', null, 'Blue');

			return {
				embeds: embeds,
				content: '',
				components: actionRow ? [actionRow] : []
			};
		}
	},
};