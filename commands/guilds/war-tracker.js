const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const FormatHelper = require('../../helpers/format.helper.js');



const TERRITORIES_FILENAME = './assets/territories.json';
const WAR_TRACKERS_FILENAME = './assets/war-trackers.json';
const PING_EVERY_X_MINUTES = 10;

let intervals = []; // All intervals across all bot instances
let lastTerLoadingDate; // When territories were updated the last time. Global accross all bot instances, so it doesn't reload them from the API for every instance

module.exports = {
	data: new SlashCommandBuilder()
		.setName('war-tracker')
		.setDescription('Tracks wars.')
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The channel to post into (Default: Current channel)'))
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to track wars for (Default: All guilds)'))
		.addStringOption(option =>
			option.setName('always-track')
				.setDescription('Territories that are always tracked. Separate with "," (Default: None)'))
		.addBooleanOption(option =>
			option.setName('disable')
				.setDescription('Set to true if you want the bot to stop tracking wars'))
		.addRoleOption(option =>
			option.setName('ping-role')
				.setDescription('The role to be pinged once every 10m, not if the own territory was recaptured. (Default: None)'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async onStartup(client) {
		let activeTrackers = FileHelper.readFromFile(WAR_TRACKERS_FILENAME);
		if (!activeTrackers) {
			return;
		}

		// Removes Duplicates
		activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
			return a.guildId === b.guildId && a.channelId === b.channelId;
		});

		console.log('Starting ' + activeTrackers.length + ' war trackers from memory!');
		LogHelper.writeToLog('Starting ' + activeTrackers.length + ' war trackers from memory!\n' + JSON.stringify(activeTrackers));

		for (let tracker of _.cloneDeep(activeTrackers)) {
			try {

				// Tell the command that its an execution from memory and sets used functions
				const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
				if (!guild) {
					console.log('War Tracker for guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('War Tracker for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
					FileHelper.writeToFile(WAR_TRACKERS_FILENAME, activeTrackers);
					continue;
				}

				const channel = await DiscordHelper.fetch(guild?.channels, tracker.options.channel);
				if (!channel) {
					console.log('War Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!');
					LogHelper.writeToLog('War Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started\n' + JSON.stringify(tracker));
					activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.options.channel === tracker.options.channel);
					FileHelper.writeToFile(WAR_TRACKERS_FILENAME, activeTrackers);
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
				console.log('War Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
				LogHelper.writeToLog('War Tracker for channel ' + tracker.options.channel + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
				activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.options.channel === tracker.options.channel);
				FileHelper.writeToFile(WAR_TRACKERS_FILENAME, activeTrackers);
			}
		}

		// Removes the trackers which couldnt be started
		console.log('Actually started ' + activeTrackers.length + ' war trackers from memory!');
		LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' war trackers from memory!');
	},
	async execute(interaction) {

		// Checks if the command was executed from memory
		let channel, guildName, disable, alwaysTrack, pingRole;
		if (interaction.fromMemory) {
			channel = interaction.options.channel;
			guildName = interaction.options.guild;
			alwaysTrack = _.filter(_.map(_.split(interaction.options.alwaysTrack, ','), ter => ter.trim()), ter => !!ter);
			pingRole = interaction.options.pingRole;
		} else {
			channel = interaction.options.getChannel('channel') ?? interaction.channel;
			guildName = interaction.options.getString('guild');
			disable = interaction.options.getBoolean('disable');
			alwaysTrack = _.filter(_.map(_.split(interaction.options.getString('always-track'), ','), ter => ter.trim()), ter => !!ter);
			pingRole = interaction.options.getRole('ping-role')?.id;
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Checks if the guild that started the tracker already has a tracker running
		const existingInterval = intervals.find(i => i.guildId === interaction.guild.id && i.channelId === channel.id)?.interval;
		if (existingInterval) {
			removeActiveTracker(interaction, existingInterval, channel);
			DiscordHelper.followUp(interaction, 'Stopped the existing war tracker.');

			// If the tracker should be turned off, logic ends here
			if (disable) {
				return;
			}
		}

		// If there was no existing tracker, tell the user
		if (disable) {
			DiscordHelper.followUp(interaction, 'There are no active war trackers for this channel.');
			return;
		}

		// Checks if the guild exists (If one was provided)
		if (guildName) {
			const guild = await WynnApiHelper.getGuildInfo(guildName);

			if (!guild?.members) {
				await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
				return;
			}

			// Corrects case of the guild name parameter
			guildName = guild.name;
		}

		// Loads the initial data
		// Old territories are stored locally per instance, so all changes are displayed
		let oldTerritories = await getNewTerritories(interaction);
		
		// Checks the territories every 60s
		const pingInfos = { pingRole, lastPingDate: null };
		const interval = setInterval(async () => {
			try {

				// Loads and displays territory changes
				const newTerritories = await getNewTerritories(interaction);
				checkChangedTerritories(interaction, newTerritories, oldTerritories, channel, guildName, alwaysTrack, pingInfos);

				oldTerritories = newTerritories;
			} catch (e) {
				console.log(e);
				LogHelper.writeToLog('war-tracker: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
			}
		}, 1000 * 60 * 1);

		// Adds the tracker to the active trackers
		addActiveTracker(interaction, interval, channel);

		// Tells the user territories are now being tracked
		if (guildName) {
			await DiscordHelper.followUp(interaction, 'Wars for guild ' + guildName + ' are now being tracked!');
		} else {
			await DiscordHelper.followUp(interaction, 'Wars are now being tracked!');
		}
	},
};



async function getNewTerritories(interaction) {

	// If territories were loaded by another interval in the last 15s, this one doesnt need to load it again
	if (lastTerLoadingDate && (new Date() - lastTerLoadingDate < 15000)) {
		return FileHelper.readFromFile(TERRITORIES_FILENAME);
	}

	lastTerLoadingDate = new Date();
	const newTerritoriesData = await getTerritories();

	if (!newTerritoriesData) {
		await DiscordHelper.followUp(interaction, 'Territories could not be loaded!');
		return [];
	}

	// Maps the territories and saves them in the json file
	const newTerritories = Object.keys(newTerritoriesData).map(key => {
		const territory = newTerritoriesData[key];
		territory.territory = key;

		return territory;
	});

	FileHelper.writeToFile(TERRITORIES_FILENAME, newTerritories);
	return newTerritories;
}

async function checkChangedTerritories(interaction, newTerritories, oldTerritories, channel, guildName, alwaysTrack, pingInfos) {

	// Checks which territories changed owner
	// If a guild was specified, only checks for this guild
	const changedOldTerritories = oldTerritories.filter(oldTerritory => {
		const newTerritory = newTerritories.find(newTerritory => newTerritory.territory === oldTerritory.territory);

		// The guild didn't change owner
		if (oldTerritory.guild.name === newTerritory.guild.name) {
			return false;
		}

		// All wars are always tracked
		if (!guildName && !alwaysTrack?.length) {
			return true;
		}

		// The guild is tracked and has won/lost the territory
		if (guildName && (oldTerritory.guild.name === guildName || newTerritory.guild.name === guildName)) {
			return true;
		}

		// The territory is always tracked
		if (_.includes(alwaysTrack, newTerritory.territory)) {
			return true;
		}

		return false;
	});

	if (!changedOldTerritories?.length) {
		return;
	}

	for (let oldTerritory of changedOldTerritories) {
		sendTerritoryChangedMessage(interaction, newTerritories, oldTerritory, channel, guildName, pingInfos);
	}
}

async function getTerritories() {
	const territoryInfo = await WynnApiHelper.callWynnApi('/guild/list/territory');
	return await territoryInfo?.body?.json();
}

async function sendTerritoryChangedMessage(interaction, newTerritories, oldTerritory, channel, guildName, pingInfos) {
	const newTerritory = newTerritories.find(newTerritory => newTerritory.territory === oldTerritory.territory);

	// Who took the territory from who
	let fields = [
		{
			name: 'Old guild', value: '[' + oldTerritory.guild.prefix + '] ' + oldTerritory.guild.name, inline: true,
		},
		{
			name: '\u200B', value: '  →', inline: true,
		},
		{
			name: 'New guild', value: '[' + newTerritory.guild.prefix + '] ' + newTerritory.guild.name, inline: true,
		},
	];


	// How many ters to the guilds now have
	const oldGuildTers = newTerritories.filter(territory => territory.guild.name === oldTerritory.guild.name).length;
	const newGuildTers = newTerritories.filter(territory => territory.guild.name === newTerritory.guild.name).length;

	fields = fields.concat([
		{
			name: '[' + oldTerritory.guild.prefix + '] territory count', value: (oldGuildTers + 1) + ' → ' + oldGuildTers, inline: true,
		},
		{
			name: '\u200B', value: '\u200B', inline: true,
		},
		{
			name: '[' + newTerritory.guild.prefix + '] territory count', value: (newGuildTers - 1) + ' → ' + newGuildTers, inline: true,
		},
	]);


	// How long was the territory held for
	const oldAquiredDate = new Date(oldTerritory.acquired);
	const newAquiredDate = new Date(newTerritory.acquired);

	const heldtMessage = FormatHelper.getFormattedTimeSinceTwoDates(oldAquiredDate, newAquiredDate);
	fields = fields.concat([
		{
			name: 'Territory held for', value: heldtMessage,
		}
	]);


	// When was the territory aquired
	const timestamp = Math.floor(newAquiredDate.getTime() / 1000);
	fields = fields.concat([
		{
			name: 'Acquired on', value:  '<t:' + timestamp + ':f>',
		}
	]);

	// If a certain guild is tracked, set color
	let color = 'Blue';
	let header = oldTerritory.territory;
	let text = null;

	if (guildName && newTerritory.guild.name === guildName) {
		color = 'Green';
		header += ' was captured!';
	} else {

		// Checks if the territory was borrowed by the guild
		const borrowedTerritories = WynnApiHelper.getBorrowedTerritories(interaction.guild.id);
		let territoryBorrowed = _.find(borrowedTerritories, territory => {
			return territory.territory.toLowerCase() === newTerritory.territory.toLowerCase() 
				&& (!territory.guildName || territory.guildName.toLowerCase() === newTerritory.guild.name.toLowerCase());
		});

		if (pingInfos?.pingRole && !territoryBorrowed && (!pingInfos.lastPingDate || (((new Date()) - pingInfos.lastPingDate) >= (1000 * 60 * PING_EVERY_X_MINUTES)))) {
			pingInfos.lastPingDate = new Date();
			text = `<@&${ pingInfos.pingRole }>`;
		}

		if (guildName) {
			color = 'Red';
			header += ' was taken!';
		}		

		if (territoryBorrowed) {
			header += ' (Borrowed)';
		}
	}
	
	DiscordHelper.sendFieldsToChannel(channel, fields, 1, header, await WynnApiHelper.getGuildThumbnail(newTerritory.guild.name), color, text);
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

	let activeTrackers = FileHelper.readFromFile(WAR_TRACKERS_FILENAME);
	if (!activeTrackers) {
		activeTrackers = [];
	}

	// Sets the interaction properties
	const savedInteraction = _.cloneDeep(interaction);
	savedInteraction.options = {};

	savedInteraction.options.channel = interaction.options.getChannel('channel')?.id ?? channel.id;
	savedInteraction.options.guild = interaction.options.getString('guild');
	savedInteraction.options.alwaysTrack = interaction.options.getString('always-track');
	savedInteraction.options.pingRole = interaction.options.getRole('ping-role')?.id;

	activeTrackers.push(savedInteraction);
	FileHelper.writeToFile(WAR_TRACKERS_FILENAME, activeTrackers);
}

function removeActiveTracker(interaction, interval, channel) {
	clearInterval(interval);
	intervals = intervals.filter(i => i.guildId != interaction.guild.id);

	let activeTrackers = FileHelper.readFromFile(WAR_TRACKERS_FILENAME);
	if (!activeTrackers) {
		return;
	}

	activeTrackers = _.reject(activeTrackers, tracker => tracker.guildId === interaction.guildId && tracker.channelId === channel.id);
	FileHelper.writeToFile(WAR_TRACKERS_FILENAME, activeTrackers);
}