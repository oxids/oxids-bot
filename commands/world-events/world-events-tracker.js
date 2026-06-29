const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ComponentType, ActionRowBuilder, ThreadAutoArchiveDuration, ModalBuilder, TextInputBuilder, TextInputStyle,
	StringSelectMenuBuilder,
	LabelBuilder,
	StringSelectMenuOptionBuilder,} = require('discord.js');
const WorldEventsHelper = require('../../helpers/world-events.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WorldEventsPunishmentHelper = require('../../helpers/world-events-punishment.helper.js');
const VerificationHelper = require('../../helpers/verification.helper.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');



const WORLD_EVENT_TRACKERS_FILENAME = './assets/world-events-trackers.json';

let intervals = []; // All intervals across all bot instances

module.exports = {
	data: new SlashCommandBuilder()
		.setName('world-events-tracker')
		.setDescription('Tracks a major Wynncraft world event.')
		.addStringOption(option =>
			option.setName('world-event')
				.setDescription('The world event to track (Default: ' + WorldEventsHelper.WORLD_EVENTS_ENUM.PRELUDE_TO_ANNIHILATION + ')')
				.addChoices(...(_.map(Object.keys(WorldEventsHelper.WORLD_EVENTS_ENUM), key => {
					return { name: WorldEventsHelper.WORLD_EVENTS_ENUM[key], value: WorldEventsHelper.WORLD_EVENTS_ENUM[key] };
				}))))
		.addRoleOption(option =>
			option.setName('ping-role')
				.setDescription('The role to be pinged (Default: None)'))
		.addBooleanOption(option =>
			option.setName('resend-on-update')
				.setDescription('Send a new message with each update instead of updating the current one? (Default: No)'))
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The channel to post into (Default: Current channel)'))
		.addBooleanOption(option =>
			option.setName('disable-1h-ping')
				.setDescription('Disable ping at the 1h mark (Default: No)'))
		.addBooleanOption(option =>
			option.setName('disable-30m-ping')
				.setDescription('Disable ping at the 30m mark (Default: No)'))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('Set to true if you want the bot to stop tracking world events'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(WORLD_EVENT_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId && a.channelId === b.channelId && a.worldEvent === b.worldEvent;
		});

		console.log('Starting ' + activeTrackers.length + ' world event trackers from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' world event trackers from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('World Event Tracker for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('World Event Tracker for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(WORLD_EVENT_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.options.channel);
				if (!channel) {
					console.log('World Event Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('World Event Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.options.channel === tracker.options.channel);
					FileHelper.writeToFile(WORLD_EVENT_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				// Should not stop the existing tracker on a message fetching error
				const message = await DiscordHelper.fetch(channel?.messages, tracker.message);
				if (!message) {
					console.log('World Event Tracker for message ' + tracker.message + ' in channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not find message!');
					LogHelper.writeToLog('World Event Tracker for message ' + tracker.message + ' in channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not find message\n' + JSON.stringify(tracker));
				}

				// Should not stop the existing tracker on a thread fetching error
				let thread;
				try {
					thread = tracker.thread ? await DiscordHelper.fetch(channel?.threads, tracker.thread) : null;
				} catch (e) {
					console.log('Tracker for thread ' + tracker.thread + ' in channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not find the thread!', e);
				}

				if (tracker.thread && !thread) {
					console.log('World Event Tracker for thread ' + tracker.thread + ' in channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not find the thread!');
					LogHelper.writeToLog('World Event Tracker for thread ' + tracker.thread + ' in channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not find the thread!');
				}

				tracker.fromMemory = true;
				tracker.guild = guild;
				tracker.options.channel = channel;
				tracker.message = message;
				tracker.thread = thread;

				tracker.deferReply = async function() {};
				tracker.followUp = async function() {};

				await this.execute(tracker, client);

				LogHelper.writeToLog('Started an World Event tracker for server ' + guild.id + ' ' + (guild.name || 'n/A') + '!\n');
			} catch (e) {
				console.log(e);
				console.log('World Event Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('World Event Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.options.channel === tracker.options.channel && a.worldEvent === tracker.options.worldEvent);
				FileHelper.writeToFile(WORLD_EVENT_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' World Event trackers from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' World Event trackers from memory!');
	},
	async execute(interaction, client) {
		let collector, interval;

		// Checks if the command was executed from memory
		let messagesToDelete = [];
		let channel, message, thread, disable, pingRole, participants, worldEventData, trackerId, resendOnUpdate, disable1hPing, disable30mPing, worldEvent;
		if (interaction.fromMemory) {
			channel = interaction.options.channel;
			pingRole = interaction.options.pingRole;
			participants = interaction.participants;
			message = interaction.message;
			thread = interaction.thread;
			worldEventData = interaction.worldEventData || interaction.anniData;
			trackerId = interaction.trackerId;
			resendOnUpdate = interaction.options.resendOnUpdate;
			disable1hPing = interaction.options.disable1hPing;
			disable30mPing = interaction.options.disable30mPing;
			worldEvent = interaction.options.worldEvent || WorldEventsHelper.WORLD_EVENTS_ENUM.PRELUDE_TO_ANNIHILATION;

			if (!message) {
				message = await DiscordHelper.send(channel, 'Old message not found, so sending new one...');
				if (!message) {
					return;
				}

				addActiveTracker();
			}
		} else {
			channel = interaction.options.getChannel('channel') ?? interaction.channel;
			disable = interaction.options.getBoolean('disable');
			pingRole = interaction.options.getRole('ping-role')?.id;
			participants = [];
			message = null;
			thread = null;
			worldEventData = null;
			trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
			resendOnUpdate = interaction.options.getBoolean('resend-on-update');
			disable1hPing = interaction.options.getBoolean('disable-1h-ping');
			disable30mPing = interaction.options.getBoolean('disable-30m-ping');
			worldEvent = interaction.options.getString('worldEvent') || WorldEventsHelper.WORLD_EVENTS_ENUM.PRELUDE_TO_ANNIHILATION;
		}

		await DiscordHelper.deferReply(interaction);

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = _.find(intervals, i => i.guildId === interaction.guild.id && i.channel === channel.id && i.worldEvent === worldEvent);
		if (existingInterval) {
			removeActiveTracker(true);
			DiscordHelper.followUp(interaction, 'Stopped the existing world event tracker.');

			if (disable) {
				return;
			}
		} else if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active ' + worldEvent + ' trackers for this channel.');
			return;
		}

		if (!message) {
			message = await DiscordHelper.editReply(interaction, { content: 'Starting ' + worldEvent + ' tracker. If nothing else happens, the bot is missing permissions to either see this channel or write in it!' });
			if (!message) {
				return;
			}
		}



		//region Functions

		function addActiveTracker() {
			removeActiveTracker();

			intervals.push({
				guildId: interaction.guild.id,
				channel: channel.id,
				message: message.id,
				interval: interval,
				participants: participants ?? [],
				worldEventData: worldEventData,
				trackerId: trackerId,
				resendOnUpdate: resendOnUpdate,
				disable1hPing: disable1hPing,
				disable30mPing: disable30mPing,
				worldEvent: worldEvent
			});

			updateTrackersFile();
			startCollector();
		}

		// This function exists to locally update the trackers for a restart, without it restarting the entire thing each time someone enters/leaves the party
		function updateTrackersFile(removeCurrent = false) {
			let activeTrackers = FileHelper.readFromFile(WORLD_EVENT_TRACKERS_FILENAME);
			if (!activeTrackers) {
				activeTrackers = [];
			}

			activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id && tracker.options.channel === channel.id));

			if (!removeCurrent) {
				activeTrackers.push({
					guildId: interaction.guild.id,
					options: {
						channel: channel.id,
						pingRole: pingRole,
						resendOnUpdate: resendOnUpdate,
						disable1hPing: disable1hPing,
						disable30mPing: disable30mPing,
						worldEvent: worldEvent
					},
					message: message.id,
					thread: thread?.id,
					worldEventData: worldEventData,
					trackerId: trackerId,
					participants: participants,
				});
			}

			FileHelper.writeToFile(WORLD_EVENT_TRACKERS_FILENAME, activeTrackers);
		}

		function removeActiveTracker(initialCheck = false) {
			const existingInterval = _.find(intervals, i => i.guildId === interaction.guild.id && i.channel === channel.id);
			if (!existingInterval) {
				return;
			}

			intervals = _.filter(intervals, i => !(i.guildId === interaction.guild.id && i.channel === channel.id));

			// Only remove the interval if another will be started afterwards
			if (initialCheck) {
				clearInterval(existingInterval.interval);
			}

			if (collector) {
				try {
					collector.stop();
				} catch (e) {
					console.log('world-events-tracker: removeActiveTracker(): collector.stop():', e);
					LogHelper.writeToLog('world-events-tracker: removeActiveTracker(): collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			}

			updateTrackersFile(true);
		}

		function startCollector() {
			if (collector) {
				try {
					collector.stop();
				} catch (e) {
					console.log('world-events-tracker: collector.stop():', e);
					LogHelper.writeToLog('world-events-tracker: collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			}

			collector = channel.createMessageComponentCollector({ componentType: ComponentType.Button });
			collector.on('collect', async i => {

				// Checks if its the button for this instance
				// If not, another instance is listening
				if (!i.customId || !i.customId.includes(trackerId + ':')) {
					return;
				}

				try {
					let existingParticipants, customId, modal, modalInteraction, username, partiesWithSpace, info, build, scrolls, party, existingParticipant, usernameSelect;
					const verifiedAccount = await VerificationHelper.getVerifiedAccountByDiscord(i.user.id);
					const hasKick = (await DiscordHelper.fetch(i.guild?.members, i.user.id))?.permissions?.has(PermissionFlagsBits.KickMembers);

					switch (_.last(i.customId.split(':'))) {
						case 'enter':

                            const punishments = await WorldEventsPunishmentHelper.getPunishments(interaction.guild.id, i.user.id, null, true);
                            if (_.find(punishments, p => p.type === 'ban')) {
                                DiscordHelper.reply(i, { content: 'You are banned from the current ' + worldEvent + ' party!\nIf you believe this to be an error, please contact any Chief privately.', ephemeral: true });
                                break;
                            }

                            if (punishments?.length) {
                                const hoursBeforeJoinable = punishments.length === 1 ? 4 : 1;
                                if ((new Date(worldEventData.datetime_utc) - new Date()) >= 1000 * 60 * 60 * hoursBeforeJoinable) {
                                    DiscordHelper.reply(i, { content: 'Due to your recent untimeliness, you can only join ' + hoursBeforeJoinable + 'h before the event!\nIf you believe this to be an error, please contact any Chief privately.', ephemeral: true });
                                    break;
                                }
                            }

							existingParticipants = _.filter(participants, participant => participant.id === i.user.id);

							// Allow users to freely choose party
							partiesWithSpace = getPartiesWithSpace();
							if (!partiesWithSpace?.length) {
								DiscordHelper.reply(i, { content: 'All 50 party slots are full. You guys sure have a lot of people participating!', ephemeral: true });
								break;
							}

							customId = 'modal-enter-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
							modal = new ModalBuilder({
								customId: customId,
								title: 'Enter party'
							});

							modal.addLabelComponents(
								new LabelBuilder()
									.setLabel('Ingame name')
									.setTextInputComponent(new TextInputBuilder()
										.setCustomId('username')
										.setStyle(TextInputStyle.Short)
										.setRequired(true)
										.setValue((verifiedAccount && !existingParticipants?.length
											? await WynnApiHelper.getPlayerName(verifiedAccount.minecraftUUID)
											: null) || '')
										.setPlaceholder('Your Minecraft Username (e.g. oxids)')
										.setMaxLength(16)),

								new LabelBuilder()
									.setLabel('Build')
									.setTextInputComponent(new TextInputBuilder()
										.setCustomId('build')
										.setStyle(TextInputStyle.Short)
										.setRequired(true)
										.setPlaceholder('Your build (e.g. Labyrinth Trapper)')
										.setMaxLength(50)),

								new LabelBuilder()
									.setLabel('Party (optional)')
									.setStringSelectMenuComponent(new StringSelectMenuBuilder()
										.setCustomId('party')
										.setRequired(true)
										.addOptions(
											...(_.map(partiesWithSpace, (p, index) => new StringSelectMenuOptionBuilder()
												.setLabel(p.name)
												.setValue(p.value.toString())
												.setDefault(index === 0)
											))
										)
									),

								new LabelBuilder()
									.setLabel('Scrolls (optional)')
									.setStringSelectMenuComponent(new StringSelectMenuBuilder()
										.setCustomId('scrolls')
										.setRequired(true)
										.addOptions(
											new StringSelectMenuOptionBuilder()
												.setLabel('Yes')
												.setValue('yes'),
											new StringSelectMenuOptionBuilder()
												.setLabel('No')
												.setValue('no')
												.setDefault(true),
										)
								),

								new LabelBuilder()
									.setLabel('Additional info (Optional)')
									.setTextInputComponent(new TextInputBuilder()
										.setCustomId('info')
										.setStyle(TextInputStyle.Paragraph)
										.setRequired(false)
										.setMaxLength(50)),
							);

							await DiscordHelper.showModal(i, modal);

							modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
								filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
								time: 1000 * 60 * 30
							});

							if (!modalInteraction) {
								break;
							}

							username = modalInteraction.fields.getTextInputValue('username');
							if (username) {
								username = username.replace(/[^a-zA-Z0-9_]/g, '');
							}

							info = modalInteraction.fields.getTextInputValue('info');
							build = modalInteraction.fields.getTextInputValue('build');
							scrolls = modalInteraction.fields.getStringSelectValues('scrolls')[0].toLowerCase() === 'yes';
							party = Number(modalInteraction.fields.getStringSelectValues('party')[0]);

							if (_.find(participants, participant => participant.name?.toUpperCase() === username?.toUpperCase())) {
								DiscordHelper.reply(modalInteraction, {
									content: 'Somebody else already entered ' + username + ' to the party!',
									ephemeral: true
								});
								break;
							}

							if (!build?.trim()) {
								DiscordHelper.reply(modalInteraction, { content: 'Please provide a build!', ephemeral: true });
								break;
							}

							// Default role (DPS, Heal, ...)
							let partyRole = undefined;
							if (build) {
								const dpsRoles = ['laby', 'labyrinth'];
								const healerRoles = ['aco', 'acolyte', 'lb', 'lightbender', 'bender', 'abso', 'lament' ];
								const tankRoles = ['guard', 'guardian', 'pala', 'paladin', 'mac', 'bigmac', 'burger'];

								const splitBuild = _.map(_.split(build, ' '), b => b.toLowerCase().replace(/[^a-z0-9]/gi, ''));

								if (_.find(dpsRoles, r => _.find(splitBuild, s => s === r))) {
									partyRole = 'dps';
								} else if (_.find(healerRoles, r => _.find(splitBuild, s => s === r))) {
									partyRole = 'healer';
								} else if (_.find(tankRoles, r => _.find(splitBuild, s => s === r))) {
									partyRole = 'tank';
								}
							}

							addParticipant({ id: i.user.id, name: username, info: info, build: build, scrolls: scrolls,
								partyRole: partyRole }, party);
							await DiscordHelper.reply(modalInteraction, {
								content: 'You entered ' + username + ' to the party. Get that Hana! 🔥'
									+ '\nPlease join at least 15m in advance or your spot might be given to someone else.'
									+ '\nIf you can\'t make it, please make sure to leave by clicking the "Leave party" button!',
								ephemeral: true,
								components: [getPartyRoleButtons(username)]
							});

							await updateMessage();
							updateTrackersFile();
							break;
						case 'modify':
							existingParticipants = _.filter(participants, participant => participant.id && (hasKick || participant.id === i.user.id));
							if (!existingParticipants?.length) {
								DiscordHelper.reply(i, { content: 'Please use the "Enter party" button to join a party!', ephemeral: true });
								break;
							}

							// Allow users to freely choose party
							partiesWithSpace = getPartiesWithSpace(existingParticipants.map(p => p.name));
							if (!partiesWithSpace?.length) {
								DiscordHelper.reply(i, { content: 'All 50 party slots are full. You guys sure have a lot of people participating!', ephemeral: true });
								break;
							}

							existingParticipant = existingParticipants.length === 1 ? existingParticipants[0] : null;

							customId = 'modal-modify-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
							modal = new ModalBuilder({
								customId: customId,
								title: 'Modify party entry'
							});

							usernameSelect = canUseUsernameSelect(existingParticipants);
							modal.addLabelComponents(
								usernameSelect
									? new LabelBuilder()
										.setLabel('Entry')
										.setStringSelectMenuComponent(new StringSelectMenuBuilder()
											.setCustomId('username')
											.setRequired(true)
											.addOptions(
												...(_.map(existingParticipants, p => new StringSelectMenuOptionBuilder()
													.setLabel(p.name)
													.setValue(p.name)
													.setDefault(p.name === existingParticipant?.name)
												))
											)
										)
									: new LabelBuilder()
										.setLabel('Entry')
										.setTextInputComponent(new TextInputBuilder()
											.setCustomId('username')
											.setRequired(true)
											.setStyle(TextInputStyle.Short)
											.setPlaceholder('The Minecraft Username (e.g. oxids)')
											.setValue(existingParticipant?.name || '')
											.setMaxLength(16)),

								new LabelBuilder()
									.setLabel('Build')
									.setTextInputComponent(new TextInputBuilder()
										.setCustomId('build')
										.setStyle(TextInputStyle.Short)
										.setValue(existingParticipant?.build || '')
										.setRequired(false)
										.setMaxLength(50)),

								new LabelBuilder()
									.setLabel('Party')
									.setStringSelectMenuComponent(new StringSelectMenuBuilder()
										.setCustomId('party')
										.setRequired(false)
										.addOptions(
											...(_.map(partiesWithSpace, p => new StringSelectMenuOptionBuilder()
												.setLabel(p.name)
												.setValue(p.value.toString())
												.setDefault(!!_.find(p.partyMembers, p2 => p2.name === existingParticipant?.name))
											))
										)
									),

								new LabelBuilder()
									.setLabel('Scrolls (optional)')
									.setStringSelectMenuComponent(new StringSelectMenuBuilder()
										.setCustomId('scrolls')
										.setRequired(false)
										.addOptions(
											new StringSelectMenuOptionBuilder()
												.setLabel('Yes')
												.setValue('yes')
												.setDefault(!!existingParticipant && !!existingParticipant?.scrolls),
											new StringSelectMenuOptionBuilder()
												.setLabel('No')
												.setValue('no')
												.setDefault(!!existingParticipant && !existingParticipant?.scrolls),
										)
									),

								new LabelBuilder()
									.setLabel('Additional info (Optional)')
									.setTextInputComponent(new TextInputBuilder()
										.setCustomId('info')
										.setValue(existingParticipant?.info || '')
										.setStyle(TextInputStyle.Paragraph)
										.setRequired(false)
										.setMaxLength(50)),
							);

							await DiscordHelper.showModal(i, modal);

							modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
								filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
								time: 1000 * 60 * 30
							});

							if (!modalInteraction) {
								break;
							}

							if (usernameSelect) {
								username = modalInteraction.fields.getStringSelectValues('username')[0];
							} else {
								username = modalInteraction.fields.getTextInputValue('username');
								if (username) {
									username = username.replace(/[^a-zA-Z0-9_]/g, '');
								}
							}

							if (!username) {
								await DiscordHelper.reply(modalInteraction, {
									content: 'Something went wrong, got no username!',
									ephemeral: true
								});
								break;
							}

							existingParticipant = _.find(existingParticipants, p => p.name === username);
							if (!existingParticipant) {
								await DiscordHelper.reply(modalInteraction, {
									content: 'This user is not in the party!',
									ephemeral: true
								});
								break;
							}

							info = modalInteraction.fields.getTextInputValue('info') || existingParticipant.info;
							build = modalInteraction.fields.getTextInputValue('build') || existingParticipant.build;
							scrolls = modalInteraction.fields.getStringSelectValues('scrolls')?.length
								? modalInteraction.fields.getStringSelectValues('scrolls')[0].toLowerCase() === 'yes'
								: existingParticipant.scrolls;

							const currentParty = _.find(partiesWithSpace, p => p.partyMembers?.find(p2 => p2.name === existingParticipant.name))?.value;
							party = modalInteraction.fields.getStringSelectValues('party')?.length
								? Number(modalInteraction.fields.getStringSelectValues('party')[0])
								: currentParty;

							if (party !== currentParty && !_.find(getPartiesWithSpace(), p => p.value === party)) {
								await DiscordHelper.reply(modalInteraction, {
									content: 'This party is already full!',
									ephemeral: true
								});
								break;
							}

							removeParticipant(_.find(participants, participant => participant.name?.toUpperCase() === username?.toUpperCase()));
							addParticipant({ id: i.user.id, name: username, info: info, build: build, scrolls: scrolls,
								partyRole: existingParticipant.partyRole, partyLeader: existingParticipant.partyLeader,
								partyWorld: existingParticipant.partyWorld }, party);

							await DiscordHelper.reply(modalInteraction, {
								content: 'You updated ' + username + '\'s party entry!',
								ephemeral: true
							});

							await updateMessage();
							updateTrackersFile();
							break;
						case 'remove':
							existingParticipants = _.filter(participants, participant => participant.id && (hasKick || participant.id === i.user.id));
							if (!existingParticipants?.length) {
								DiscordHelper.reply(i, { content: 'Please use the "Enter party" button to join a party!', ephemeral: true });
								break;
							}

							existingParticipant = existingParticipants.length === 1 ? existingParticipants[0] : null;

							customId = 'modal-remove-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
							modal = new ModalBuilder({
								customId: customId,
								title: 'Leave party'
							});

							usernameSelect = canUseUsernameSelect(existingParticipants);
							modal.addLabelComponents(
								usernameSelect
									? new LabelBuilder()
										.setLabel('Entry')
										.setStringSelectMenuComponent(new StringSelectMenuBuilder()
											.setCustomId('username')
											.setRequired(true)
											.addOptions(
												...(_.map(existingParticipants, p => new StringSelectMenuOptionBuilder()
													.setLabel(p.name)
													.setValue(p.name)
													.setDefault(p.name === existingParticipant?.name)
												))
											)
										)
									: new LabelBuilder()
										.setLabel('Entry')
										.setTextInputComponent(new TextInputBuilder()
											.setCustomId('username')
											.setRequired(true)
											.setStyle(TextInputStyle.Short)
											.setPlaceholder('The Minecraft Username (e.g. oxids)')
											.setMaxLength(16)),
							);

							await DiscordHelper.showModal(i, modal);

							modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
								filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
								time: 1000 * 60 * 30
							});

							if (!modalInteraction) {
								break;
							}

							if (usernameSelect) {
								username = modalInteraction.fields.getStringSelectValues('username')[0];
							} else {
								username = modalInteraction.fields.getTextInputValue('username');
								if (username) {
									username = username.replace(/[^a-zA-Z0-9_]/g, '');
								}
							}

							if (!username) {
								await DiscordHelper.reply(modalInteraction, {
									content: 'Something went wrong, got no username!',
									ephemeral: true
								});
								break;
							}

							existingParticipant = _.find(existingParticipants, p => p.name === username);
							if (!existingParticipant) {
								await DiscordHelper.reply(modalInteraction, {
									content: 'This user is not in the party!',
									ephemeral: true
								});
								break;
							}

							removeParticipant(_.find(participants, participant => participant.name?.toUpperCase() === username?.toUpperCase()));

							await DiscordHelper.reply(modalInteraction, {
								content: 'You removed ' + username + '\'s party entry!',
								ephemeral: true
							});

							await updateMessage();
							updateTrackersFile();
							break;
						case 'role':
							await DiscordHelper.deferReply(i, true);

							if (!checkCanAddRemovePingRole()) {
								DiscordHelper.editReply(i, { content: 'I don\'t have permissions to add or remove the notification role!', ephemeral: true });
								break;
							}

							if (i.member.roles.cache.some(r => r.id === pingRole)) {
								i.member.roles.remove(pingRole);
								DiscordHelper.editReply(i, { content: 'Your notification role was removed.', ephemeral: true });
								break;
							}

							i.member.roles.add(pingRole);
							DiscordHelper.editReply(i, { content: 'You received the notification role.', ephemeral: true });
							break;
						case 'set-leader':
							existingParticipants = _.filter(participants, participant => participant.id === i.user.id);
							customId = 'modal-party-leader-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
							modal = new ModalBuilder({
								customId: customId,
								title: 'Set party leader'
							});

							modal.addComponents(
								new ActionRowBuilder().addComponents(new TextInputBuilder()
									.setCustomId('username')
									.setLabel('Username')
									.setPlaceholder('What\'s their Minecraft username?')
									.setValue(existingParticipants?.length !== 1 ? '' : existingParticipants[0].name)
									.setStyle(TextInputStyle.Short)
									.setRequired(true)
									.setMaxLength(16)),
								new ActionRowBuilder().addComponents(new TextInputBuilder()
									.setCustomId('world')
									.setLabel('World')
									.setPlaceholder('What world will their party be on?')
									.setStyle(TextInputStyle.Short)
									.setRequired(false)
									.setMaxLength(8))
							);

							await DiscordHelper.showModal(i, modal);

							modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
								filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
								time: 1000 * 60 * 30
							});

							if (!modalInteraction) {
								break;
							}

							username = modalInteraction.fields.getTextInputValue('username');
							const world = modalInteraction.fields.getTextInputValue('world');

							const participant = participants.find(p => p.name?.toUpperCase() === username?.toUpperCase());
							if (!participant) {
								DiscordHelper.reply(modalInteraction, { content: 'No user named ' + username + ' is in any party!', ephemeral: true });
								break;
							}

							let previousLeader = null;
							const index = participants.indexOf(participant);
							party = Math.floor(index / 10) + 1;
							for (let i = (party - 1) * 10; i < party * 10 && i < participants.length; i++) {
								const p = participants[i];
								if (!p?.partyLeader) {
									continue;
								}

								previousLeader = p.name;
								p.partyLeader = false;
								p.partyWorld = null;
							}

							participants[index].partyLeader = true;
							participants[index].partyWorld = world;

							// Don't send a message if they just update the world
							if (previousLeader?.toUpperCase() === username?.toUpperCase()) {
								modalInteraction.deferUpdate();
							} else {
								messagesToDelete.push((await DiscordHelper.reply(modalInteraction, {
									content: `<@${i.user.id}>` + ' has set ' + DiscordHelper.sanitizeString(username)
										+ ' as a party leader for party ' + party + '!',
									withResponse: true
								}))?.resource?.id);
							}

							await updateMessage();
							updateTrackersFile();
							break;
						default:

							//  Might be party role with username included
							const split = i.customId.split(':');
							if (split.length === 4 && split[1] === 'party-role') {
								const username = split[2];
								const role = split[3];

								const index = participants.indexOf(participants.find(p => p.name === username));
								if (index === -1) {
									DiscordHelper.reply(i, { content: DiscordHelper.sanitizeString(username) + ' is not in the party!', ephemeral: true });
									break;
								}

								if (participants[index].id !== i.user.id) {
									DiscordHelper.reply(i, { content: DiscordHelper.sanitizeString(username) + ' was not added to the party by you!', ephemeral: true });
									break;
								}

								participants[index].partyRole = role;
								DiscordHelper.reply(i, {
									content: DiscordHelper.sanitizeString(username) + ' is now marked as ' + getPartyRole(role).icon + ' ' + getPartyRole(role).name + '!',
									ephemeral: true
								});

								await updateMessage();
								updateTrackersFile();
								break;
							}

							await DiscordHelper.deferReply(i, true);
							DiscordHelper.editReply(i, { content: 'Unknown interaction. How did you get here?', ephemeral: true });
					}
				} catch (e) {
					console.log('world-events-tracker: collector.collect():', e);
					LogHelper.writeToLog('world-events-tracker: collector.collect():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

					if (!await DiscordHelper.editReply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true })) {
						DiscordHelper.reply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true });
					}
				}
			});

			collector.on('end', () => {
				try {
					collector.stop();
				} catch (e) {
					console.log('world-events-tracker: collector.end():', e);
					LogHelper.writeToLog('world-events-tracker: collector.end():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			});
		}

		function canUseUsernameSelect(existingParticipants) {
			return existingParticipants?.length <= 25;
		}

		function getPartiesWithSpace(ignoredExistingUsernames = null) {
			const highestParty = (Math.floor(_.findLastIndex(participants, participant => participant.id) / 10)) + 1;

			const partiesWithSpace = [];
			for (let i = 1; i <= 5 && i <= highestParty; i++) {
				if (participants.length < i * 10) {
					partiesWithSpace.push(i);
					continue;
				}

				let spaceFound = false;
				for (let j = (i - 1) * 10; j < i * 10 && j < participants.length && !spaceFound; j++) {
					if (!participants[j].id || _.find(ignoredExistingUsernames, u => u === participants[j].name)) {
						partiesWithSpace.push(i);
						spaceFound = true;
					}
				}
			}

			if (highestParty < 5) {
				partiesWithSpace.push(highestParty + 1);
			}

			if (!partiesWithSpace.length) {
				return null;
			}

			return _.map(partiesWithSpace, p => {
				const partyMembers = participants.slice((p - 1) * 10, p * 10);
				const leader = _.find(partyMembers, participant => participant.partyLeader);

				if (!leader?.partyWorld) {
					return { name: 'Party ' + p.toString(), value: p, partyMembers: partyMembers };
				}

				return { name: getWorldIcon(leader.partyWorld?.toUpperCase()) + ' Party ' +  p.toString()
					+ ' [' + leader.partyWorld + ']', value: p, partyMembers: partyMembers }
			});
		}

		let initialPinged = false;
		let oneHourPinged = false;
		let thirtyMinutePinged = false;
		async function processWorldEventData(newWorldEventData) {
			if (!newWorldEventData) {
				return;
			}

			// It is possible the world event data had to be manually set, because the API did not yet update. Ignore new data in this case
			if (worldEventData && newWorldEventData.predicted && !worldEventData.predicted && (new Date(worldEventData.datetime_utc).getTime() >= new Date().getTime()
				|| (new Date(newWorldEventData.datetime_utc).getTime() < new Date().getTime()))) {

				newWorldEventData = worldEventData;
			}

			// Pings for the world event
			if (!newWorldEventData.predicted && pingRole) {
				const WORLD_EVENT_MESSAGE = worldEvent + ' starts <t:' + Math.floor(new Date(newWorldEventData.datetime_utc).getTime() / 1000) + ':R> ' + `<@&${ pingRole }>!`;

				// Ping 30m in advance
				if (!disable30mPing && !thirtyMinutePinged && (new Date(newWorldEventData.datetime_utc) - new Date()) < (1000 * 60 * 30)) {
					thirtyMinutePinged = true;
					oneHourPinged = true;
					initialPinged = true;

					messagesToDelete.push((await DiscordHelper.send(channel, WORLD_EVENT_MESSAGE))?.id);
				}

				// Ping 1h in advance
				else if (!disable1hPing && !thirtyMinutePinged && !oneHourPinged && (new Date(newWorldEventData.datetime_utc) - new Date()) < (1000 * 60 * 60 * 1)) {
					oneHourPinged = true;
					initialPinged = true;

					messagesToDelete.push((await DiscordHelper.send(channel, WORLD_EVENT_MESSAGE))?.id);
				}

				// Ping if it just swapped from prediction to confirmed
				else if (!initialPinged && !thirtyMinutePinged && !oneHourPinged && (!worldEventData || worldEventData.predicted)) {
					initialPinged = true;

					messagesToDelete.push((await DiscordHelper.send(channel, WORLD_EVENT_MESSAGE))?.id);
				}
			}

			// If no data changed, nothing needs to be updated
			if (newWorldEventData.predicted === worldEventData?.predicted && newWorldEventData.datetime_utc === worldEventData?.datetime_utc) {
				return;
			}

			// Adds the tracker if it is the initial start or archives the existing tracker, if it is a new event
			if (!worldEventData || (!worldEventData.predicted && (newWorldEventData.predicted || (Math.abs(new Date(newWorldEventData.datetime_utc) - new Date(worldEventData.datetime_utc)) > (1000 * 60 * 60 * 24 * 2))))) {

				// Archives the previous world event message
				if (worldEventData) {
					await updateMessage(true);
					await archiveThread();
					removeActiveTracker();
					reducePunishments();
				}

				worldEventData = newWorldEventData;
				participants = [];
				message = await DiscordHelper.send(channel, 'New data detected...');
				thread = null;
				trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
				initialPinged = false;
				oneHourPinged = false;
				thirtyMinutePinged = false;

				const channelWithMessage = await DiscordHelper.fetch(channel);
				for (const messageToDelete of messagesToDelete) {
					if (!messageToDelete) {
						continue;
					}

					await DiscordHelper.delete(await DiscordHelper.fetch(channelWithMessage?.messages, messageToDelete));
				}
				messagesToDelete = [];

				addActiveTracker();
				createThread();
			} else {
				worldEventData = newWorldEventData;
			}

			updateTrackersFile();
			await updateMessage();
		}

		function createThread() {

			// If the thread is created immediately, discord does not recognize the parent message correctly
			setTimeout(async () => {
				thread = await DiscordHelper.startThread(message, {
					name: 'Active ' + worldEvent + ' event',
					autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays
				});

				const messageLink = 'https://discord.com/channels/' + interaction.guild.id + '/' + channel.id + '/' + message.id;
				await DiscordHelper.send(thread, getRandomThreadStarter() + '\n\nPlease make sure to join via ' + messageLink + ', **__as you can\'t interact with message buttons within threads!__**');

				updateTrackersFile();
			}, 1000 * 5);
		}

		function reducePunishments() {

			let punishments = FileHelper.readFromFile(WorldEventsPunishmentHelper.getPunishmentsFileName(interaction.guild.id));
			if (!punishments) {
				punishments = [];
			}

			for (const punishment of punishments) {
				if (punishment.revokeDate || punishment.amountServed === punishment.amountTotal

					// Do not revoke if the punishment was just added
					|| (new Date() - new Date(punishment.punishDate)) < 1000 * 60 * 60 * 1

					// Do not revoke if the person did not show up
					|| !_.find(participants, participant => participant.id?.toString() === punishment.userId?.toString())
				) {
					continue;
				}

				punishment.amountServed++;
			}

			FileHelper.writeToFile(WorldEventsPunishmentHelper.getPunishmentsFileName(interaction.guild.id), punishments);
		}

		async function archiveThread() {
			try {
				if (!thread) {
					return;
				}

				const closedThread = await thread.setName(new Date(worldEventData.datetime_utc).toLocaleDateString('de-DE') + ' ' + worldEvent + ' event');

				// Timeout so people can write some last messages after the world event ends
				setTimeout(async () => {
					await closedThread.setLocked(true);
					await closedThread.setArchived(true);
				}, 1000 * 60 * 15);
			} catch (e) {
				console.error(e);
			}
		}

		function addParticipant(participant, party) {
			const missingParticipants = ((party - 1) * 10) - participants.length;
			if (missingParticipants > 0) {
				for (let i = 0; i < missingParticipants; i++) {
					participants.push({ id: null, name: null });
				}
			}

			let foundIndex = -1;
			for (let i = ((party - 1) * 10); i < party * 10 && i < participants.length && foundIndex === -1; i++) {
				if (!participants[i].id) {
					foundIndex = i;
				}
			}

			if (foundIndex > -1) {
				participants[foundIndex] = participant;
			} else {
				participants.push(participant);
			}
		}

		function removeParticipant(participant) {
			const index = participants.indexOf(participant);
			if (index > -1) {
				participants[index] = { id: null, name: null };
			}
		}

		function getPartyRoleButtons(username) {
			return new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(trackerId + ':party-role:' + username + ':' + 'dps')
					.setEmoji(getPartyRole('dps').icon)
					.setLabel(getPartyRole('dps').name)
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId(trackerId + ':party-role:' + username + ':' + 'healer')
					.setEmoji(getPartyRole('healer').icon)
					.setLabel(getPartyRole('healer').name)
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId(trackerId + ':party-role:' + username + ':' + 'tank')
					.setEmoji(getPartyRole('tank').icon)
					.setLabel(getPartyRole('tank').name)
					.setStyle(ButtonStyle.Primary)
			);
		}

		async function updateMessage(removeButtons = false) {

			// Creates a new message, if the users want it
			// This will cause the thread to not be embedded correctly, there is nothing that can be done about this at this time
			// Also fallback in case the message could not be sent
			if (resendOnUpdate || !message) {
				if (message) {
					await DiscordHelper.delete(message);
				}

				message = await DiscordHelper.send(channel, 'Resending message...');
			}

			// Remove trailing participants
			if (!participants) {
				participants = [];
			}
			participants.splice(_.findLastIndex(participants, participant => participant.id) + 1);

			if (!message) {
				return;
			}

			if (worldEventData.predicted) {
				DiscordHelper.edit(message, getPredictionMessage());
			} else {
				DiscordHelper.edit(message, await getActiveMessage(removeButtons));
			}

			updateTrackersFile();
		}

		function getPredictionMessage() {
			const buttons = _.filter([
				pingRole
					? new ButtonBuilder()
						.setCustomId(trackerId + ':' + 'role')
						.setEmoji({ name: '🔔' })
						.setLabel('Toggle notifications')
						.setStyle(ButtonStyle.Primary)
					: undefined,
			], b => !!b);

			const actionRow = buttons?.length ? new ActionRowBuilder().addComponents(buttons) : null;

			const embeds = DiscordHelper.getEmbeds([{
				name: '',
				value: 'There is currently no active ' + worldEvent + ' event.'
					+ '\nPrediction for next event: <t:' + Math.floor(new Date(worldEventData.datetime_utc).getTime() / 1000) + '>'
					+ ' <t:' + Math.floor(new Date(worldEventData.datetime_utc).getTime() / 1000) + ':R>'
					+ '\n\n**__Please note that the timestamp is only a prediction and might be off by multiple hours!__**'
			}], 1, 'Waiting for next ' + worldEvent + ' event', getEmbedImage(), 'Blue');

			return {
				embeds: embeds,
				content: '',
				components: actionRow ? [actionRow] : []
			}
		}

		async function getActiveMessage(removeButtons = false) {
			const buttons = _.filter([
				new ButtonBuilder()
					.setCustomId(trackerId + ':' + 'enter')
					.setEmoji({ name: '⚔️' })
					.setLabel('Enter party')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId(trackerId + ':' + 'modify')
					.setEmoji('🛠️')
					.setLabel('Modify entry')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId(trackerId + ':' + 'remove')
					.setEmoji('🚪')
					.setLabel('Leave party')
					.setStyle(ButtonStyle.Danger),
				new ButtonBuilder()
					.setCustomId(trackerId + ':' + 'set-leader')
					.setEmoji('👑')
					.setLabel('Set party leader')
					.setStyle(ButtonStyle.Primary),
				pingRole
					? new ButtonBuilder()
						.setCustomId(trackerId + ':' + 'role')
						.setEmoji({ name: '🔔' })
						.setLabel('Toggle notifications')
						.setStyle(ButtonStyle.Primary)
					: undefined,
			], b => !!b);

			const actionRow = buttons?.length ? new ActionRowBuilder().addComponents(buttons) : null;

			const parties = [];
			let party = [];

			let i = 1;
			for (let participant of participants) {
				party.push(participant);

				// Parties can have max 10 members
				if (i % 10 === 0 || participants.length === i) {
					parties.push(_.cloneDeep(party));
					party = [];
				}

				i++;
			}

			// Immediately show the next party to encourage people to join
			if (!(participants.length % 10)) {
				parties.push([{ id: null, name: null }]);
			}

			// One Embed per Party to prevent too many characters in one
			let partyEmbeds = _.map(parties, (party, index) => {

				// Header
				const headerFields = [
					{ name: 'Slots', value: _.filter(party, p => !!p.id).length + ' / 10', inline: true },
				];

				const partyLeader = _.find(party, person => person.partyLeader);
				if (partyLeader) {
					headerFields.push({ name: 'Leader', value: partyLeader?.name ? '👑 ' + partyLeader.name : ' ', inline: true });

					if (partyLeader.partyWorld) {
						headerFields.push({
							name: 'Region',
							value: getWorldIcon(partyLeader.partyWorld?.toUpperCase()) + ' ' + partyLeader.partyWorld.toUpperCase(),
							inline: true
						});
					}
				}

				// Members
				let memberFields = _.map(_.filter(party, p => !!p.id), (person, index2) => {
					const slot = '**' + (index2 % 10 + 1).toString().padStart(2) + '\\) **';

					if (!person.id) {
						return null;
					}

					return {
						value: slot + ' '
							+ (person.partyRole ? (getPartyRole(person.partyRole).iconSmall ?? '') + ' ' : '') // Small icon bc the custom ones have too many characters
							+ (person.scrolls ? '📜 ' : '')
							+ ' **' + DiscordHelper.sanitizeString(person.name) + '**'
							+ (person.build ? ' using *' + DiscordHelper.sanitizeString(person.build) + '*' : '')
							+ ` (<@${person.id}>)`
							+ (person.info ? '\n  📝' + DiscordHelper.sanitizeString(person.info) : '')
					};
				});

				// Available space
				memberFields = _.filter(memberFields, f => !!f);
				if (memberFields?.length < 10) {
					memberFields.push({ value: '**' + (memberFields.length + 1).toString().padStart(2) + '\\) **' + '<Available>' });
				}

				return DiscordHelper.getEmbeds(_.concat(headerFields, memberFields), 1,
					'**Party ' + (index + 1) + '**', getEmbedImage(party), removeButtons ? 'Grey' : 'Red')[0];
			});

			const embeds = _.concat(
				[
					DiscordHelper.getEmbeds([
						{
							name: '',
							value: worldEvent + ' ' + (removeButtons ? 'was' : 'will be')
								+ ' on <t:' + Math.floor(new Date(worldEventData.datetime_utc).getTime() / 1000) + '>'
								+ ' <t:' + Math.floor(new Date(worldEventData.datetime_utc).getTime() / 1000) + ':R>'
								+ (thread?.id ? '\n<#' + thread?.id + '>' : '')
						}
					], 1, (removeButtons ? 'Past' : 'Active') + ' ' + worldEvent + ' event', getEmbedImage(), removeButtons ? 'Grey' : 'Red')[0],
				],
				partyEmbeds
			);

			return {
				embeds: embeds,
				content: '',
				components: removeButtons || !actionRow ? []: [actionRow]
			};
		}

		function checkCanAddRemovePingRole() {
			if (!pingRole) {
				return false;
			}

			const role = interaction.guild.roles.cache.get(pingRole);
			if (!role) {
				return false;
			}

			return role.editable;
		}

		//endregion



		// This interval is started once and used across multiple events.
		interval = setInterval(async () => {
			try {
				processWorldEventData(await WorldEventsHelper.getWorldEventInfo(worldEvent));
			} catch (e) {
				console.log('world-events-tracker: interval: ', e);
				LogHelper.writeToLog('world-events-tracker: interval: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
			}
		}, 1000 * 15 * 1);

		if (interaction.fromMemory) {
			addActiveTracker();
		}

		try {
			processWorldEventData(await WorldEventsHelper.getWorldEventInfo(worldEvent));
		} catch (e) {
			console.log('world-events-tracker: initial start:', e);
			LogHelper.writeToLog('world-events-tracker: initial start:' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
		}
	},
};

function getWorldIcon(world) {
	if (!world) {
		return null;
	}

	let emoji = '🌍';
	if (world.startsWith('NA')) {
		emoji = '🌎';
	} else if (world.startsWith('AS')) {
		emoji = '🌏'
	}

	return emoji;
}

function getEmbedImage(party = null) {
	if (!party) {
		return 'https://media.discordapp.net/attachments/1271834621721444483/1384472430990589972/world_event.png'
	}

	const partyLeader = _.find(party, person => person.partyLeader);
	if (partyLeader) {
		return 'https://crafthead.net/armor/cube/' + partyLeader.name;
	}

	return 'https://media.discordapp.net/attachments/1120399616312082442/1391375228617359400/super_mario__question_block_2d_by_joshuat1306_dcpa2oe-fullview.png';
}

function getRandomThreadStarter() {
	const texts = [
		'Go get that Laby 🏹',
		'Go get that Bloodbath ⚔️',
		'Go get that Hanafubuki 🗡️',
		'Go get that Resonance 🌱',
		'Go get that Trance 🪄',
		'Go get that cache 🤑',
		'Bring your scrolls 📜',
		'Bring your potions ⚗️',
		'Can we get above 100,000ms? 📶',
		'Watch out for the sun ☀️',
		'Watch out for healers 👀',
	];

	return texts[Math.floor(Math.random() * texts.length)];
}

function getPartyRole(role) {
	switch (role) {
		case 'dps':
			return { icon: '<:dps:1387021653246087329>', iconSmall: '⚔️', name: 'DPS', id: role };
		case 'healer':
			return { icon: '<:healer:1387021657117425744>', iconSmall: '❤️‍🩹', name: 'Healer', id: role };
		case 'tank':
			return { icon: '<:tank:1387021655183855627>', iconSmall: '🛡️️', name: 'Tank', id: role };
		default:
			return { icon: '', name: '', id: null };
	}
}
