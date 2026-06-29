const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ComponentType, ActionRowBuilder, PermissionFlagsBits
} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const VerificationHelper = require('../../helpers/verification.helper.js');
const UpdateGuildRanksInterval = require('../../intervals/update-guild-ranks.js');



const VERIFICATION_TRACKERS_FILENAME = './assets/verification-trackers.json';

let intervals = []; // All intervals across all bot instances

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-verification')
		.setDescription('Allows Minecraft account verification and automatic role assignment.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to assign roles for')
				.setRequired(true))
		.addRoleOption(option =>
			option.setName('verified-role')
				.setDescription('(optional) Role given to every verified member'))
		.addRoleOption(option =>
			option.setName('verified-role-2')
				.setDescription('(optional) Role given to every verified member which is not removed for unverified members'))
		.addRoleOption(option =>
			option.setName('member-role')
				.setDescription('(optional) General member role given to every guild member'))
		.addRoleOption(option =>
			option.setName('recruit-role')
				.setDescription('(optional) Member role given to recruits'))
		.addRoleOption(option =>
			option.setName('recruiter-role')
				.setDescription('(optional) Member role given to recruiters'))
		.addRoleOption(option =>
			option.setName('captain-role')
				.setDescription('(optional) Member role given to captains'))
		.addRoleOption(option =>
			option.setName('strategist-role')
				.setDescription('(optional) Member role given to strategists'))
		.addRoleOption(option =>
			option.setName('chief-role')
				.setDescription('(optional) Member role given to chiefs'))
		.addRoleOption(option =>
			option.setName('owner-role')
				.setDescription('(optional) Member role given to owners'))
		.addBooleanOption(option =>
			option.setName('change-nicks')
				.setDescription('Change the names of verified members to their Minecraft account name (Default: No)'))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('(Optional) Set to true if you want the bot to stop the verification system'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(VERIFICATION_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId;
		});

		console.log('Starting ' + activeTrackers.length + ' guild-verification from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' guild-verification from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('Guild Verification for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild Verification for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(VERIFICATION_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.channelId);
				if (!channel) {
					console.log('Guild Verification for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild Verification for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
					FileHelper.writeToFile(VERIFICATION_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				// Should not stop the existing tracker on a message fetching error
				let message = await DiscordHelper.fetch(channel?.messages, tracker.messageId);
				if (!message) {
					console.log('Guild Verification for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message!');
					LogHelper.writeToLog('Guild Verification for message ' + tracker.messageId + ' in channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not find message\n' + JSON.stringify(tracker));
				}

				tracker.fromMemory = true;
				tracker.guild = guild;
				tracker.channel = channel;
				tracker.message = message;

				tracker.deferReply = async function() {};
				tracker.followUp = async function() {};
				tracker.deleteReply = async function() {};

				await this.execute(tracker);

				LogHelper.writeToLog('Started a Guild Verification for server ' + guild.id + ' ' + (guild.name || 'n/A') + '!\n');
			} catch (e) {
				console.log(e);
				console.log('Guild Verification for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('Guild Verification for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
				FileHelper.writeToFile(VERIFICATION_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' Guild Verification from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' Guild Verification from memory!');
	},
	async execute(interaction) {
		let collector;

		let guildName, verifiedRole, verifiedRole2, memberRole, recruitRole, recruiterRole, captainRole, strategistRole, chiefRole, ownerRole, changeNicks, disable, message, trackerId;
		if (interaction.fromMemory) {
			guildName = interaction.options.guildName;
			verifiedRole = interaction.options.verifiedRole;
			verifiedRole2 = interaction.options.verifiedRole2;
			memberRole = interaction.options.memberRole;
			recruitRole = interaction.options.recruitRole;
			recruiterRole = interaction.options.recruiterRole;
			captainRole = interaction.options.captainRole;
			strategistRole = interaction.options.strategistRole;
			chiefRole = interaction.options.chiefRole;
			ownerRole = interaction.options.ownerRole;
			changeNicks = interaction.options.changeNicks;
			message = interaction.message;
			trackerId = interaction.trackerId;
		} else {
			guildName = interaction.options.getString('guild');
			disable = interaction.options.getBoolean('disable');
			verifiedRole = interaction.options.getRole('verified-role')?.id;
			verifiedRole2 = interaction.options.getRole('verified-role-2')?.id;
			memberRole = interaction.options.getRole('member-role')?.id;
			recruitRole = interaction.options.getRole('recruit-role')?.id;
			recruiterRole = interaction.options.getRole('recruiter-role')?.id;
			captainRole = interaction.options.getRole('captain-role')?.id;
			strategistRole = interaction.options.getRole('strategist-role')?.id;
			chiefRole = interaction.options.getRole('chief-role')?.id;
			ownerRole = interaction.options.getRole('owner-role')?.id;
			changeNicks = interaction.options.getBoolean('change-nicks');
			trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
		if (existingInterval) {
			removeActiveTracker();
			DiscordHelper.followUp(interaction, 'Stopped the existing guild-verification tracker.');

			if (disable) {
				return;
			}
		} else if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active guild-verification trackers for this server.');
			return;
		}

		const buttons = [
			new ButtonBuilder()
				.setCustomId(trackerId + ':' + 'verify')
				.setLabel('Verify your account')
				.setStyle(ButtonStyle.Primary),
		].filter(b => !!b);

		const actionRow = new ActionRowBuilder().addComponents(buttons);

		const embeds = DiscordHelper.getEmbeds([{
			name: '',
			value: 'In order to get your guild roles, please verify your Minecraft account. Only access to Wynncraft is required for this.'
		}], 1, 'Account verification', null, 'Blue');

		if (message) {
			message = await DiscordHelper.edit(message, {
				embeds: embeds,
				content: '',
				components: actionRow ? [actionRow] : []
			});
		} else {
			message = await DiscordHelper.send(interaction.channel, {
				embeds: embeds,
				content: '',
				components: actionRow ? [actionRow] : []
			});
		}

		if (!message) {
			return;
		}

		// Loads the info of the guild
		const guild = await WynnApiHelper.getGuildInfo(guildName);

		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;

		addActiveTracker();
		startCollector();

		// If from memory, the function will be executed anyways
		if (!interaction.fromMemory) {
			UpdateGuildRanksInterval.updateRanks(interaction.guild);
			DiscordHelper.deleteReply(interaction);
		}



		function addActiveTracker() {
			removeActiveTracker();

			intervals.push({
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				guildName: guildName,
				verifiedRole: verifiedRole,
				verifiedRole2: verifiedRole2,
				memberRole: memberRole,
				recruitRole: recruitRole,
				recruiterRole: recruiterRole,
				captainRole: captainRole,
				strategistRole: strategistRole,
				chiefRole: chiefRole,
				ownerRole: ownerRole,
				changeNicks: changeNicks,
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
					console.log('guild-verification: removeActiveTracker(): collector.stop():', e);
					LogHelper.writeToLog('guild-verification: removeActiveTracker(): collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			}

			updateTrackersFile(true);
		}

		function updateTrackersFile(removeCurrent = false) {
			let activeTrackers = FileHelper.readFromFile(VERIFICATION_TRACKERS_FILENAME);
			if (!activeTrackers) {
				activeTrackers = [];
			}

			activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id));

			if (!removeCurrent) {
				activeTrackers.push(getTrackerForFile());
			}

			FileHelper.writeToFile(VERIFICATION_TRACKERS_FILENAME, activeTrackers);
		}

		function getTrackerForFile() {
			return {
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				options: {
					guildName: guildName,
					verifiedRole: verifiedRole,
					verifiedRole2: verifiedRole2,
					memberRole: memberRole,
					recruitRole: recruitRole,
					recruiterRole: recruiterRole,
					captainRole: captainRole,
					strategistRole: strategistRole,
					chiefRole: chiefRole,
					ownerRole: ownerRole,
					changeNicks: changeNicks
				},
				trackerId: trackerId,
			};
		}

		function startCollector() {
			if (collector) {
				try {
					collector.stop();
				} catch (e) {
					console.log('guild-verification: collector.stop():', e);
					LogHelper.writeToLog('guild-verification: collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
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
					switch (_.last(i.customId.split(':'))) {
						case 'verify':
							VerificationHelper.verifyAccount(i, interaction.guild);
							break;
						default:
							await DiscordHelper.deferReply(i, true);
							DiscordHelper.editReply(i, { content: 'Unknown interaction. How did you get here?', ephemeral: true });
					}
				} catch (e) {
					console.log('guild-verification: collector.collect():', e);
					LogHelper.writeToLog('guild-verification: collector.collect():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

					if (!await DiscordHelper.editReply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true })) {
						DiscordHelper.reply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true });
					}
				}
			});

			collector.on('end', () => {
				try {
					collector.stop();
				} catch (e) {
					console.log('guild-verification: collector.end():', e);
					LogHelper.writeToLog('guild-verification: collector.end():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			});
		}
	},
};