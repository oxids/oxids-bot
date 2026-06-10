const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ComponentType,
	ModalBuilder,
	LabelBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder
} = require('discord.js');
const { applicationServer } = require('../config.json');

const DiscordHelper = require('../helpers/discord.helper.js');
const LogHelper = require('../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');
const GiveawayHelper = require('../helpers/giveaway.helper.js');
const VerificationHelper = require('../helpers/verification.helper.js');



module.exports = {
	data: new SlashCommandBuilder()
		.setName('giveaway')
		.setDescription('Creates a giveaway.')
		.addNumberOption(option =>
			option.setName('winners')
				.setDescription('How many winners there should be')
				.setRequired(true))
		.addRoleOption(option =>
			option.setName('notification-role')
				.setDescription('(optional) Role to ping for the giveaway'))
		.addStringOption(option =>
			option.setName('duration')
				.setDescription('(Optional) How long the giveaway should go for (Default: 24h)'))
		.addBooleanOption(option =>
			option.setName('only-verified')
				.setDescription('(optional) Whether only verified people can enter (Default: true)'))
		.addBooleanOption(option =>
			option.setName('prevent-repeated-winners')
				.setDescription('(optional) Whether winners from the last Giveaway should not win (Default: true)'))
		.addStringOption(option =>
			option.setName('description')
				.setDescription('(optional) Description what is being given away (Default: Guild tomes)'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let giveaways = await GiveawayHelper.getGiveaways();
		if (!giveaways?.length) {
			return;
		}

		console.log('Starting ' + giveaways.length + ' giveaways from memory!');
		LogHelper.writeToLog('Starting ' + giveaways.length + ' giveaways from memory!\n' + JSON.stringify(giveaways));

		for (let giveaway of _.cloneDeep(giveaways)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, giveaway.guildId);
				if (!guild) {
					console.log('Giveaway for guild ' + giveaway.guildId + ' could not be started!');
					LogHelper.writeToLog('Giveaway for guild ' + giveaway.guildId + ' could not be started!\n' + JSON.stringify(giveaway));

					giveaway.winners = ['Cancelled as guild could not be found!'];
					GiveawayHelper.updateGiveaway(giveaway, giveaway.trackerId);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, giveaway.channelId);
				if (!channel) {
					console.log('Guild Verification for channel ' + giveaway.channelId + ' in guild ' + giveaway.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild Verification for channel ' + giveaway.channelId + ' in guild ' + giveaway.guildId + ' could not be started!\n' + JSON.stringify(giveaway));

					giveaway.winners = ['Cancelled as channel could not be found!'];
					GiveawayHelper.updateGiveaway(giveaway, giveaway.trackerId);
					continue;
				}

				// Should not stop the existing tracker on a message fetching error
				let message = await DiscordHelper.fetch(channel?.messages, giveaway.messageId);
				if (!message) {
					console.log('Guild Verification for message ' + giveaway.messageId + ' in channel ' + giveaway.channelId + ' in guild ' + giveaway.guildId + ' could not find message!');
					LogHelper.writeToLog('Guild Verification for message ' + giveaway.messageId + ' in channel ' + giveaway.channelId + ' in guild ' + giveaway.guildId + ' could not find message\n' + JSON.stringify(giveaway));
				}

				giveaway.fromMemory = true;
				giveaway.guild = guild;
				giveaway.channel = channel;
				giveaway.message = message;

				giveaway.deferReply = async function() {};
				giveaway.followUp = async function() {};
				giveaway.deleteReply = async function() {};

				await this.execute(giveaway);
			} catch (e) {
				console.log(e);
				console.log('giveaway for channel ' + giveaway.channelId + ' in guild ' + giveaway.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('giveaway for channel ' + giveaway.channelId + ' in guild ' + giveaway.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(giveaway));

				giveaway.winners = ['Cancelled as another error happened, DM oxids!'];
				GiveawayHelper.updateGiveaway(giveaway, giveaway.trackerId);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + giveaways.length + ' giveaways from memory!');
		LogHelper.writeToLog('Actually started ' + giveaways.length + ' giveaways from memory!');
	},
	async execute(interaction) {
		let collector;

		let winners, preventRepeatedWinners, description, message, trackerId, endDate, notificationRole, entries, onlyVerified, initiator;
		if (interaction.fromMemory) {
			winners = interaction.options.winners;
			preventRepeatedWinners = interaction.options.preventRepeatedWinners;
			description = interaction.options.description;
			endDate = new Date(interaction.endDate);
			message = interaction.message;
			trackerId = interaction.trackerId;
			notificationRole = interaction.options.notificationRole;
			entries = interaction.entries;
			onlyVerified = interaction.options.onlyVerified;
			initiator = interaction.initiator;

			if (endDate <= new Date()) {
				await endGiveaway();
				return;
			}
		} else {
			winners = interaction.options.getNumber('winners');
			preventRepeatedWinners = interaction.options.getBoolean('prevent-repeated-winners') ?? true;
			description = interaction.options.getString('description');
			notificationRole = interaction.options.getRole('notification-role')?.id;
			onlyVerified = interaction.options.getBoolean('only-verified') ?? true;
			trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
			initiator = interaction.user.id;

			entries = [];

			let duration = interaction.options.getString('duration');
			if (!duration || !duration.trim()) {
				duration = '24h';
			}

			const regex = /^(\d{1,2})h$/;
			const match = duration.match(regex);
			if (!match) {
				DiscordHelper.reply(interaction, { content: 'Invalid time format! Use e.g. "12h"', ephemeral: true });
				return;
			}

			const hours = parseInt(match[1], 10);
			if (hours < 1) {
				DiscordHelper.reply(interaction, { content: 'You need to enter a positive duration!', ephemeral: true });
				return;
			}

			endDate = new Date();
			endDate.setHours(endDate.getHours() + hours);
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);



		const buttons = [
			new ButtonBuilder()
				.setCustomId(trackerId + ':' + 'enter')
				.setEmoji({ name: '🎉' })
				.setLabel('Enter giveaway')
				.setStyle(ButtonStyle.Success),
			notificationRole
				? new ButtonBuilder()
					.setCustomId(trackerId + ':' + 'role')
					.setEmoji({ name: '🔔' })
					.setLabel('Toggle notifications')
					.setStyle(ButtonStyle.Primary)
				: null,
			new ButtonBuilder()
				.setCustomId(trackerId + ':' + 'list-participants')
				.setEmoji({ name: '⚙️' })
				.setLabel('List participants')
				.setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(trackerId + ':' + 'end-early')
				.setEmoji({ name: '⚙️' })
				.setLabel('Draw winners now')
				.setStyle(ButtonStyle.Danger),
		].filter(b => !!b);

		const actionRow = new ActionRowBuilder().addComponents(buttons);

		let emoji =  interaction.guild.emojis.cache.find(emoji => emoji.name === 'tome') ?? '';
		if (emoji) {
			emoji = '<:tome:' + emoji + '>'
		}

		const embeds = DiscordHelper.getEmbeds([{
			name: '',
			value: 'Giveaway will be rolled on: <t:' + Math.floor(endDate.getTime() / 1000) + ':f>'
		}], 1, (description ?? (emoji + ' ' + winners + 'x Tome Giveaway ' + emoji)), null, 'Blue');

		if (message) {
			message = await DiscordHelper.edit(message, {
				embeds: embeds,
				content: notificationRole ? '<@&' + notificationRole + '>' : '',
				components: actionRow ? [actionRow] : []
			});
		} else {
			message = await DiscordHelper.send(interaction.channel, {
				embeds: embeds,
				content: notificationRole ? '<@&' + notificationRole + '>' : '',
				components: actionRow ? [actionRow] : []
			});
		}

		if (!message) {
			return;
		}

		GiveawayHelper.updateGiveaway(getTrackerForFile(), trackerId);
		startCollector();

		setTimeout(() => {
			endGiveaway();
		}, endDate - new Date());

		// If from memory, the function will be executed anyways
		if (!interaction.fromMemory) {
			DiscordHelper.deleteReply(interaction);
		}



		async function endGiveaway(endedBy) {

			// Checks whether the giveaway has been manually ended
			if (GiveawayHelper.getGiveaway(trackerId)?.winners?.length) {
				return;
			}

			// Selects the winners
			let currentWinners = [];
			if (entries?.length <= winners) {
				currentWinners = entries;
			} else {
				currentWinners = _.sampleSize(entries, winners);
			}

			// Sends the message
			let description;
			if (currentWinners?.length) {
				description = 'Winners are:';

				for (const winner of currentWinners) {
					description += '\n<@' + winner.discordId + '> ';

					const verifiedAccount = await VerificationHelper.getVerifiedAccountByDiscord(winner.discordId);
					const minecraftUsername = verifiedAccount ? await WynnApiHelper.getPlayerName(verifiedAccount.minecraftUUID) : null;
					if (minecraftUsername) {
						description += '(`' + minecraftUsername + '`)';
					} else {
						description += '(`' + winner.discordName + '`)'
					}
				}
			} else {
				description = 'Nobody entered, so there are no winners :(';
			}

			if (endedBy) {
				description += '\n\nThis giveaway was ended by <@' + endedBy.id + '> (`' + endedBy.username + '`)';
				endDate = new Date();
			}

			let winnerEmbed = new EmbedBuilder()
				.setColor('Blue')
				.setThumbnail(DiscordHelper.getBotImage())
				.setTitle(currentWinners.length + ' winners have been drawn (' + entries.length + ' entries)')
				.setDescription(description);

			// Also mentions them in the main message
			const winnersPing = currentWinners.map(winner => '<@' + winner.discordId + '>').join(' ');
			DiscordHelper.edit(message, { content: winnersPing, embeds: [winnerEmbed], components: [] });

			const giveaway = getTrackerForFile();
			giveaway.winners = currentWinners?.length ? currentWinners : ['No entries found.'];

			GiveawayHelper.updateGiveaway(giveaway, trackerId);

			// Mention the winners & initiator in a shadow ping
			DiscordHelper.delete(await DiscordHelper.send(interaction.channel, winnersPing + ' <@' + initiator + '>'));
		}

		function getTrackerForFile() {
			return {
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: message.id,
				options: {
					winners: winners,
					preventRepeatedWinners: preventRepeatedWinners,
					description: description,
					notificationRole: notificationRole,
					onlyVerified: onlyVerified
				},
				endDate: endDate,
				trackerId: trackerId,
				entries: entries,
				initiator: initiator
			};
		}

		function startCollector() {
			if (collector) {
				try {
					collector.stop();
				} catch (e) {
					console.log('giveaway: collector.stop():', e);
					LogHelper.writeToLog('giveaway: collector.stop():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
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
					let hasKick;
					switch (_.last(i.customId.split(':'))) {
						case 'enter':

							// Checks if the user is forbidden to participate
							const previousGiveaways = _.filter(await GiveawayHelper.getGiveaways(false), g =>
								g.guildId === interaction.guild.id && g.winners?.length);
							const previousGiveaway = _.first(_.orderBy(previousGiveaways, g => g.endDate, 'desc'));

							if (preventRepeatedWinners && _.find(previousGiveaway?.winners, w => w.discordId === i.user.id)) {
								DiscordHelper.reply(i, { content: 'You can\'t enter the giveaway, because you won last time.', ephemeral: true });
								return;
							}

							if (onlyVerified && !(await VerificationHelper.getVerifiedAccountByDiscord(i.user.id))) {
								DiscordHelper.reply(i, { content: 'Please verify your Discord account before entering!', ephemeral: true });
								return;
							}

							if (entries.find(e => e.discordId === i.user.id)) {
								entries = _.reject(entries, e => e.discordId === i.user.id);
								DiscordHelper.reply(i, { content: 'You withdrew from the giveaway.', ephemeral: true });
							} else {
								entries.push({ discordId: i.user.id, discordName: i.user.username });
								DiscordHelper.reply(i, { content: 'You entered the giveaway. Good luck 🍀', ephemeral: true });
							}

							GiveawayHelper.updateGiveaway(getTrackerForFile(), trackerId);
							break;

						case 'role':
							if (i.member.roles.cache.some(r => r.id === notificationRole)) {
								DiscordHelper.remove(i.member.roles, notificationRole);
								DiscordHelper.reply(i, { content: 'Your notification role was removed.', ephemeral: true });
								break;
							} else {
								DiscordHelper.add(i.member.roles, notificationRole);
								DiscordHelper.reply(i, { content: 'You received the notification role.', ephemeral: true });
								break;
							}

						case 'list-participants':
							hasKick = (await DiscordHelper.fetch(i.guild?.members, i.user.id))?.permissions?.has(PermissionFlagsBits.KickMembers);
							let visibleEntires = _.cloneDeep(entries);
							if (!hasKick) {
								visibleEntires = _.filter(visibleEntires, e => e.discordId === i.user.id);
							}

							DiscordHelper.reply(i, {
								content: 'Participants:\n' + _.map(visibleEntires, e => '<@' + e.discordId + '> (' + e.discordName + ')').join('\n'),
								ephemeral: true
							});
							break;

						case 'end-early':
							hasKick = (await DiscordHelper.fetch(i.guild?.members, i.user.id))?.permissions?.has(PermissionFlagsBits.KickMembers);
							if (!hasKick) {
								DiscordHelper.reply(i, { content: 'You do not have permission for this command.', ephemeral: true });
								break;
							}

							const customId = 'modal-confirm-' + i.user.id + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100);
							const modal = new ModalBuilder({
								customId: customId,
								title: 'Confirmation'
							});

							modal.addLabelComponents(
								new LabelBuilder()
									.setLabel('Confirmation')
									.setStringSelectMenuComponent(new StringSelectMenuBuilder()
										.setCustomId('confirm')
										.setPlaceholder('Set to "yes" to end the giveaway early.')
										.setRequired(false)
										.addOptions(
											new StringSelectMenuOptionBuilder()
												.setLabel('Yes')
												.setValue('yes'),
											new StringSelectMenuOptionBuilder()
												.setLabel('No')
												.setValue('no'),
										)
									),
							);

							await DiscordHelper.showModal(i, modal);
							const modalInteraction = await DiscordHelper.awaitModalSubmit(i, {
								filter: (i2) => i2.customId === customId && i2.user.id === i.user.id,
								time: 1000 * 60 * 30
							});

							if (!modalInteraction) {
								break;
							}

							let confirmed = modalInteraction.fields.getStringSelectValues('confirm');
							confirmed = confirmed?.length && confirmed[0].toLowerCase() === 'yes';
							if (!confirmed) {
								await DiscordHelper.reply(modalInteraction, {
									content: 'You did not end the giveaway early!',
									ephemeral: true
								});
								break;
							}

							endGiveaway(i.user);
							await DiscordHelper.reply(modalInteraction, {
								content: 'You did end the giveaway early!',
								ephemeral: true
							});
							break;

						default:
							await DiscordHelper.deferReply(i, true);
							DiscordHelper.editReply(i, { content: 'Unknown interaction. How did you get here?', ephemeral: true });
					}
				} catch (e) {
					console.log('giveaway: collector.collect():', e);
					LogHelper.writeToLog('giveaway: collector.collect():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

					if (!await DiscordHelper.editReply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true })) {
						DiscordHelper.reply(i, { content: 'There was an error processing. Please contact oxids.', ephemeral: true });
					}
				}
			});

			collector.on('end', () => {
				try {
					collector.stop();
				} catch (e) {
					console.log('giveaway: collector.end():', e);
					LogHelper.writeToLog('giveaway: collector.end():' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				}
			});
		}
	},
};