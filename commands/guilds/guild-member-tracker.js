const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');
var _ = require('lodash');



const GUILD_MEMBER_TRACKERS_FILENAME = './assets/guild-member-trackers.json';

let intervals = []; // All intervals across all bot instances

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-member-tracker')
		.setDescription('Tracks the members of a guild.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to track members for')
				.setRequired(true))
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The channel to post into (Default: Current channel)'))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('Set to true if you want the bot to stop tracking members'))
		.addRoleOption(option =>
			option.setName('ping-role')
				.setDescription('The role to be pinged with every join/leave (Default: None)'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(GUILD_MEMBER_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId && a.channelId === b.channelId;
		});

		console.log('Starting ' + activeTrackers.length + ' guild-member trackers from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' guild-member trackers from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('Guild Member Tracker for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild Member Tracker for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(GUILD_MEMBER_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.options.channel);
				if (!channel) {
					console.log('Guild Member Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('Guild Member Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.options.channel === tracker.options.channel);
					FileHelper.writeToFile(GUILD_MEMBER_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				tracker.fromMemory = true;
				tracker.guild = guild;
				tracker.options.channel = channel;

				tracker.deferReply = async function() {};
				tracker.followUp = async function() {};

				await this.execute(tracker);
			} catch (e) {
				console.log(e);
				console.log('Guild Member Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('Guild Member Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
				FileHelper.writeToFile(GUILD_MEMBER_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' guild-member trackers from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' guild-member trackers from memory!');
	},
	async execute(interaction) {

		// Checks if the command was executed from memory
		let channel, guildName, disable, pingRole;
		if (interaction.fromMemory) {
			channel = interaction.options.channel;
			guildName = interaction.options.guild;
			pingRole = interaction.options.pingRole;
		} else {
			channel = interaction.options.getChannel('channel') ?? interaction.channel;
			guildName = interaction.options.getString('guild');
			disable = interaction.options.getBoolean('disable');
			pingRole = interaction.options.getRole('ping-role')?.id;
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = intervals.find(i => i.guildId === interaction.guild.id && i.channelId === channel.id)?.interval;
		if (existingInterval) {
			removeActiveTracker(interaction, existingInterval, channel);
			DiscordHelper.followUp(interaction, 'Stopped the existing guild member tracker.');

			// If the tracker should be turned off, logic ends here
			if (disable) {
				return;
			}
		}

		// If there was no existing tracker, tell the user
		if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active guild member trackers for this channel.');
			return;
		}

		// Checks if the guild exists
		let guild = await WynnApiHelper.getGuildInfo(guildName);
		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;
		
		// Checks the members every 60s
		const startDate = new Date();
		const interval = setInterval(async () => {
			try {

				// Checks if the Interval has to be stopped
				// Stops after 3 months
				if (((new Date()) - startDate) > (1000 * 60 * 60 * 24 * 30 * 3)) {
					removeActiveTracker(interaction, interval, channel);
					DiscordHelper.followUp(interaction, 'Stopped the guild member tracker because it ran for 3 months. Feel free to start it again!');
					return;
				}

				// Loads and displays territory changes
				const newGuild = await WynnApiHelper.getGuildInfo(guildName);

				// Bugfix as Wynn API can give empty guild randomly
				if (!newGuild?.members?.all?.length) {
					return;
				}

				if (!guild?.members?.all?.length) {
					guild = _.cloneDeep(newGuild);
					return;
				}

				checkChangedMembers(_.cloneDeep(newGuild), _.cloneDeep(guild), channel, pingRole);

				guild = _.cloneDeep(newGuild);
			} catch (e) {
				console.log(e);
				LogHelper.writeToLog('guild-member-tracker: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
			}
		}, 1000 * 60 * 1);

		// Adds the tracker to the active trackers
		addActiveTracker(interaction, interval, channel);

		// Tells the user the guild members are now being tracked
		await DiscordHelper.followUp(interaction, 'Members for guild ' + guildName + ' are now being tracked!');
	},
};



async function checkChangedMembers(newGuild, oldGuild, channel, pingRole) {

	// Checks which players joined the guild
	const newPlayers = _.filter(newGuild.members.all, member => !_.find(oldGuild.members.all, member2 => member2.uuid === member.uuid));
	const leftPlayers = _.filter(oldGuild.members.all, member => !_.find(newGuild.members.all, member2 => member2.uuid === member.uuid));

	for (let player of newPlayers) {
		sendPlayerChangedMessage(player, channel, pingRole, 'joined');
	}
	for (let player of leftPlayers) {
		sendPlayerChangedMessage(player, channel, pingRole, 'left');
	}

	// Checks which players changed ranks
	let changedPlayers = _.filter(newGuild.members.all, member => _.find(oldGuild.members.all, member2 => member2.uuid === member.uuid && member2.rank !== member.rank));

	for (let player of changedPlayers) {
		const oldMember = _.find(oldGuild.members.all, member => member.uuid === player.uuid);
		sendRankChangedMessage(player, oldMember.rank, channel, pingRole);
	}
}

async function sendPlayerChangedMessage(player, channel, pingRole, type) {
	let fields, color, header;
	if (type === 'joined') {
		color = 'Green';
		header = '**`' + player.username + '`** joined the guild.';

		fields = [
			{
				name: 'Joined on', value:  '<t:' + Math.floor(new Date().getTime() / 1000) + ':f>',
			}
		];
	} else {
		color = 'Red';
		header = '**`' + player.username + '`** left the guild.';

		const joinedSince = FormatHelper.getFormattedTimeSinceTwoDates(new Date(player.joined));
		fields = [
			{
				name: 'Left on', value:  '<t:' + Math.floor(new Date().getTime() / 1000) + ':f>', inline: true,
			},
			{
				name: 'Member since', value:  '<t:' + Math.floor(new Date(player.joined).getTime() / 1000) + ':f> (' + joinedSince + ')', inline: true,
			},
			{
				name: 'Rank', value: FormatHelper.getGuildRank(player.rank, true),
			},
		];
	}

	fields = _.concat(fields, [
		{
			name: 'UUID', value:  player.uuid,
		},
		{
			name: 'Stats', value:  'https://wynncraft.com/stats/player/' + player.uuid,
		},
		{
			name: 'NameMC', value:  'https://namemc.com/profile/' + player.uuid,
		},
	]);

	let text = null;
	if (pingRole) {
		text = `<@&${ pingRole }>`;
	}

	DiscordHelper.sendFieldsToChannel(channel, fields, 1, header, 'https://mc-heads.net/avatar/' + player.username, color, text);
}

async function sendRankChangedMessage(player, oldRank, channel, pingRole) {
	let color, header;

	if (player.rank.trim().length > oldRank.trim().length) {
		color = 'Green';
		header = '**`' + player.username + '`** has been promoted';
	} else {
		color = 'Red';
		header = '**`' + player.username + '`** has been demoted';
	}

	header += ' to ' + FormatHelper.getGuildRank(player.rank, true) + '.';

	const fields = [
		{
			name: 'New Rank', value: FormatHelper.getGuildRank(player.rank, true), inline: true
		},
		{
			name: 'Old Rank', value: FormatHelper.getGuildRank(oldRank, true), inline: true
		},
		{
			name: 'Member since', value:  '<t:' + Math.floor(new Date(player.joined).getTime() / 1000) + ':f> '
				+ '(' + FormatHelper.getFormattedTimeSinceTwoDates(new Date(player.joined)) + ')',
		},
		{
			name: 'UUID', value:  player.uuid,
		},
		{
			name: 'Stats', value:  'https://wynncraft.com/stats/player/' + player.uuid,
		},
		{
			name: 'NameMC', value:  'https://namemc.com/profile/' + player.uuid,
		},
	];

	let text = null;
	if (pingRole) {
		text = `<@&${ pingRole }>`;
	}

	DiscordHelper.sendFieldsToChannel(channel, fields, 1, header, 'https://mc-heads.net/avatar/' + player.username, color, text);
}

function addActiveTracker(interaction, interval, channel) {

	// Add the current Interval to the active Interval
	intervals.push({ 
		guildId: interaction.guild.id, 
		channelId: channel.id,
		interval: interval
	});



	// Save the Tracker to the file, to auto restart if the bot restarts
	// If its started from memory, its already in the file
	if (interaction.fromMemory) {
		return;
	}

	let activeTrackers = FileHelper.readFromFile(GUILD_MEMBER_TRACKERS_FILENAME);
	if (!activeTrackers) {
		activeTrackers = [];
	}

	// Sets the interaction properties
	const savedInteraction = _.cloneDeep(interaction);
	savedInteraction.options = {};

	savedInteraction.options.channel = interaction.options.getChannel('channel')?.id ?? channel.id;
	savedInteraction.options.guild = interaction.options.getString('guild');
	savedInteraction.options.pingRole = interaction.options.getRole('ping-role')?.id;

	activeTrackers.push(savedInteraction);
	FileHelper.writeToFile(GUILD_MEMBER_TRACKERS_FILENAME, activeTrackers);
}

function removeActiveTracker(interaction, interval, channel) {
	clearInterval(interval);
	intervals = intervals.filter(i => i.guildId != interaction.guild.id);

	let activeTrackers = FileHelper.readFromFile(GUILD_MEMBER_TRACKERS_FILENAME);
	if (!activeTrackers) {
		return;
	}

	activeTrackers = _.reject(activeTrackers, tracker => tracker.guildId === interaction.guildId && tracker.channelId === channel.id);
	FileHelper.writeToFile(GUILD_MEMBER_TRACKERS_FILENAME, activeTrackers);
}