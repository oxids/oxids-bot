const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ComponentType, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
	LabelBuilder,
	PermissionFlagsBits
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
let pendingVerifications = []; // All pending verifications across all bot instances, to allow users to continue after 15 minutes

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
			UpdateGuildRanksInterval.updateRanks(interaction.guild, getTrackerForFile());
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
							const existingAccount = await VerificationHelper.getVerifiedAccountByDiscord(i.member.id);
							if (existingAccount) {
								const user = await WynnApiHelper.getPlayerInfo(existingAccount.minecraftUUID);
								DiscordHelper.reply(i, { content: 'You are already verified to the Minecraft account '
									+ (user?.username ?? existingAccount.minecraftUUID) + '!', ephemeral: true });
								UpdateGuildRanksInterval.updateRanks(interaction.guild, getTrackerForFile());
								break;
							}

							const customId = 'modal-verify-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
							const modal = new ModalBuilder({
								customId: customId,
								title: 'Account verification'
							});

							modal.addLabelComponents(
								new LabelBuilder()
									.setLabel('Minecraft username')
									.setTextInputComponent(new TextInputBuilder()
										.setCustomId('username')
										.setRequired(true)
										.setStyle(TextInputStyle.Short)
										.setPlaceholder('Your Minecraft Username (e.g. oxids)')
										.setMaxLength(16)),
							);

							await DiscordHelper.showModal(i, modal);
							const modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
								filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
								time: 1000 * 60 * 30
							});

							if (!modalInteraction) {
								break;
							}

							let username = modalInteraction.fields.getTextInputValue('username');
							if (!username) {
								break;
							}

							username = username.replace(/[^a-zA-Z0-9_]/g, '');
							let user = await WynnApiHelper.getPlayerInfo(username);
							if (!user) {
								DiscordHelper.reply(modalInteraction, { content: 'The account ' + username + ' could not be found!', ephemeral: true });
								break;
							}

							if (_.find(await VerificationHelper.getVerifiedAccounts(), account => account.minecraftUUID === user.uuid)) {
								DiscordHelper.reply(modalInteraction, { content: 'The account ' + username + ' is already linked to another discord account!', ephemeral: true });
								break;
							}

							const message = await DiscordHelper.reply(modalInteraction, { content: 'Starting verification...', ephemeral: true });
							if (!message) {
								break;
							}

							let prevWorlds = [];
							let successes = 0;
							let curWorld = _.first(await WynnApiHelper.getOnlinePlayers([username]))?.server;

							// Checks if the user has a pending verification
							const pendingVerification = _.find(pendingVerifications, p => p.uuid === user.uuid);
							if (pendingVerification) {
								prevWorlds = pendingVerification.prevWorlds;
								successes = pendingVerification.successes;
							}

							let verificationMessageInfo = await getVerificationMessageInfo();
							let startDate = new Date();

							verificationIntervalFunc();
							const interval = setInterval(async () => {
								verificationIntervalFunc();
							}, 1000 * 10 * 1);
							break;

							async function verificationIntervalFunc() {
								try {
									if ((new Date() - startDate) >= 1000 * 60 * 14) {
										await DiscordHelper.edit(message, { content: '# Timeout exceeded' +
											'\n\nPlease click the "Verify your account" button again to continue where you left off, **your progress will not be lost**.' +
											'\n\n-# Due to Discord limitations, ephemeral messages can only be edited for 15 minutes. This is the best fix I came up with.', ephemeral: true });
										clearInterval(interval);
										return;
									}

									curWorld = _.first(await WynnApiHelper.getOnlinePlayers([username]))?.server;
									if (curWorld === verificationMessageInfo.world) {
										successes++;
										verificationMessageInfo = await getVerificationMessageInfo();

										pendingVerifications = _.filter(pendingVerifications, p => p.uuid !== user.uuid);
										pendingVerifications.push({ uuid: user.uuid, prevWorlds: prevWorlds, successes: successes });
									} else if (verificationMessageInfo.world === 'N/A') {
										verificationMessageInfo = await getVerificationMessageInfo();
									}

									let verificationMessage = verificationMessageInfo.message;
									verificationMessage += '\n\nCurrent world: ';
									if (!curWorld) {
										verificationMessage += 'Offline (Please check your API settings!)';
									} else {
										verificationMessage += curWorld;
									}

									verificationMessage += '\nLast update: ' + '<t:' + Math.floor(new Date().getTime() / 1000) + ':T>' +
										'\n\n-# Please note that it might take up to 5 minutes to detect switching servers due to Wynncraft API TTL.';

									if (successes >= 3) {
										await VerificationHelper.setVerifiedAccount(i.user.id, user.uuid);
										await DiscordHelper.edit(message, {
											content: 'You successfully linked your Discord account to the Minecraft account '
												+ username + '!',
											ephemeral: true
										});
										clearInterval(interval);

										// Update ranks so the just verified user gets their ranks
										UpdateGuildRanksInterval.updateRanks(interaction.guild, getTrackerForFile());

										pendingVerifications = _.filter(pendingVerifications, p => p.uuid !== user.uuid);
									} else {
										await DiscordHelper.edit(message, {
											content: verificationMessage,
											ephemeral: true
										});
									}
								} catch (e) {
									console.log('guild-verification: interval: ', e);
									LogHelper.writeToLog('guild-verification: interval: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
								}
							}

							async function getVerificationMessageInfo() {
								const worlds = await WynnApiHelper.getWorlds();
								if (!worlds?.length) {
									return { world: 'N/A', message: 'Worlds could not be loaded!' };
								}

								// So it doesnt take NA10 3x
								const allowedWorlds = _.filter(worlds, world => world.world
									&& curWorld !== world.world
									&& !_.find(prevWorlds, prevWorld => world.world === prevWorld)
									&& world.players?.length && world.players.length > 10 // To prevent Wynn hallucinating worlds
									&& (world.world.startsWith('NA') || world.world.endsWith('EU') || world.world.startsWith('AS')) // To filter Media
								);
								const world = _.orderBy(allowedWorlds, w => w.players?.length ?? 0)[0].world;
								prevWorlds.push(world);

								let message = '## Verification for `' + user.username + '` in progress (' + successes + ' of 3 done)' +
									'\n\nConnect to the following world in order to verify your account:' +
									'\n# Target world: ' + world + '' +
									'\n-# If the world no longer exists, click on "Verify your account" again to get another target world. Your progress will not be lost.';

								return { world: world, message: message }
							}

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