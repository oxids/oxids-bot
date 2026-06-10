const { SlashCommandBuilder } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');
const RefreshHelper = require('../../helpers/refresh.helper.js');
var _ = require('lodash');



module.exports = {
	data: new SlashCommandBuilder()
		.setName('enemy-guild-tracker')
		.setDescription('Tracks a guild\'s players for an hour.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to track')
				.setRequired(true))
		.setDMPermission(false),
	async execute(interaction) {
		let guildName = interaction.options.getString('guild');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Checks if the guild exists (If one was provided)
		let guild = await WynnApiHelper.getGuildInfo(guildName);

		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;

		// Caches guild members to show server changes
		let cachedMembers = guild.members.all;


		// Loads the initial data 
		const thumbnail = await WynnApiHelper.getGuildThumbnail(guildName);
		const lookupPlayers = _.map(guild.members.all, member => member.username);
		let onlineUsers = await WynnApiHelper.getOnlinePlayers(lookupPlayers, guild);

		// Function for the refresher
		const embedsFunc = async function () {

			// Update data
			onlineUsers = await WynnApiHelper.getOnlinePlayers(lookupPlayers, guild);

			// Updates the cached members
			cachedMembers = updateCachedMembers(onlineUsers, cachedMembers);

			// Updates the message
			return getEmbeds(guild, onlineUsers, thumbnail, cachedMembers);
		}

		RefreshHelper.addRefresher(interaction, embedsFunc, 1000 * 15);
	},
};



function updateCachedMembers(members, cachedMembers) {

	// Clones the cached members to loop through
	const clonedCachedMembers = _.cloneDeep(cachedMembers);

	// Uses the cached servers, because every guild member is loaded in initially
	_.forEach(clonedCachedMembers, cachedMember => {
		const onlineMember = _.cloneDeep(_.find(members, m => m.username === cachedMember.username));

		// If the member is online, checks if he switched servers
		if (onlineMember) {
			if (!cachedMember.offlineSince && onlineMember.server === cachedMember.server) {
				return;
			}
			
			// Resets that the user was offline
			cachedMember.offlineSince = null;

			// If the member switched servers, it updates his server data
			if (onlineMember.server !== cachedMember.server) {
				cachedMember.prevServer = cachedMember.server ?? 'Offl.';
				cachedMember.prevTime = Math.floor(new Date().getTime() / 1000);
				cachedMember.server = onlineMember.server;
			}

			cachedMembers = replaceCachedMember(cachedMember, cachedMembers);
			return;
		}

		// If the member is no longer online, it resets his server data after 5 minutes, to display him being offline
		// 5 minutes, because people are sometimes randomly displayed as offline for 30s
		if (cachedMember.server) {

			// Checks if the 5 minutes are up
			if (cachedMember.offlineSince && ((new Date()) - cachedMember.offlineSince <= 1000 * 60 * 5)) {
				return;
			} 

			// If he is newly offline, it now starts tracking
			// If not the 5 minutes are up
			if (!cachedMember.offlineSince) {
				cachedMember.offlineSince = new Date();
			} else {
				cachedMember.offlineSince = null;
				cachedMember.server = null;
			}

			cachedMembers = replaceCachedMember(cachedMember, cachedMembers);
			return;
		} 
	});

	// Returns the array with the corrected data
	return cachedMembers;
}

function replaceCachedMember(member, cachedMembers) {
	cachedMembers = _.reject(cachedMembers, m => m.username === member.username);
	cachedMembers.push(_.cloneDeep(member));	

	return cachedMembers;
}



function getEmbeds(guild, onlineMembers, thumbnail, cachedMembers) {

	// Checks if there are any members online
	let fields;
	if (!onlineMembers.length) {
		fields = [{ name: 'Username | Rank | Server', value: 'No members online' }];
	} else {

		// Formats the strings
		onlineMembers = _.cloneDeep(onlineMembers);
		onlineMembers = FormatHelper.formatEqualLength(onlineMembers, 'username');
		onlineMembers = FormatHelper.formatEqualLength(onlineMembers, 'rank');
		onlineMembers = FormatHelper.formatEqualLength(onlineMembers, 'server');

		onlineMembers = _.orderBy(onlineMembers, 
			['rank', member => member.server.trim(), member => member.username.trim()],
			['desc', 'asc', 'asc']);

		fields = FormatHelper.getFieldsFromValues('Username | Rank | Server', _.map(onlineMembers, member => getFormattedMember(member, cachedMembers)));
	}

	// Returns the formatted fields
	return DiscordHelper.getEmbeds(fields, 1, 'Online members of ' + guild.name + ' [' + guild.prefix + ']', thumbnail);
}

function getFormattedMember(member, cachedMembers) {
	let message =  '` ' + member.username
		+ ' `|` ' + member.rank
		+ ' `|` ' + member.server
		+ ' `';

	// Not in the escaped part, because that doesnt support timestamps
	let cachedMember = _.find(cachedMembers, m => m.username.trim() === member.username.trim());

	// If there was a switch since tracking, it will be displayed
	if (cachedMember?.prevServer) {
		message += ' (Prev. ' + cachedMember.prevServer + ' <t:' + cachedMember.prevTime + ':t>)';
	}

	return message;
}

