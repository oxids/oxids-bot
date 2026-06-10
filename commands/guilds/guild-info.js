const { SlashCommandBuilder } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');
var _ = require('lodash');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-info')
		.setDescription('Displays info for a guild.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to show infos for')
				.setRequired(true)),
	async execute(interaction) {
		let guildName = interaction.options.getString('guild');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);
		
		// Loads the info of the guild
		const guild = await WynnApiHelper.getGuildInfo(guildName);
		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;
		
		const embeds = await getEmbeds(guild);
		DiscordHelper.sendEmbedsToInteraction(interaction, embeds);
	},
};

async function getEmbeds(guild) {
	return _.concat(await getPageOne(guild), await getMemberPages(guild));
}

async function getPageOne(guild) {
	const fields = [
		{ name: 'Guild', value: guild.name + ' [' + guild.prefix + ']'},
		{ name: 'Level', value: guild.level + ' | ' + guild.xpPercent + '%'},
		{ name: 'Owner', value: _.first(guild.members.owner)?.username },
		{ name: 'Members', value: guild.members.total + ' (Online: ' + guild.online + ')' },
		{ name: 'Created', value: '<t:' + Math.floor(new Date(guild.created).getTime() / 1000) + '>' },
		{ name: 'Territories', value: guild.territories?.toString() }
	];

	return DiscordHelper.getEmbeds(fields, 1, 'Guild Info for ' + guild.name + ' [' + guild.prefix + ']', await WynnApiHelper.getGuildThumbnail(guild.name));
}

async function getMemberPages(guild) {
	let embeds = [];

	for (let field of await getMemberFields(guild, true)) {
		embeds = _.concat(embeds, DiscordHelper.getEmbeds([field], 1, 'Online members of ' + guild.name + ' [' + guild.prefix + ']', 
			await WynnApiHelper.getGuildThumbnail(guild.name)));
	}	
	
	for (let field of await getMemberFields(guild)) {
		embeds = _.concat(embeds, DiscordHelper.getEmbeds([field], 1, 'Members of ' + guild.name + ' [' + guild.prefix + ']', 
			await WynnApiHelper.getGuildThumbnail(guild.name)));
	}
	
	return embeds;
}

async function getMemberFields(guild, filterOnline = false) {
	let members;

	if (filterOnline) {
		const lookupPlayers = _.map(guild.members.all, member => member.username);
		members = await WynnApiHelper.getOnlinePlayers(lookupPlayers, guild);
	} else {
		members = _.filter(guild.members.all, member => {

			// Filters for online
			if (filterOnline) {
				return !!member.server;
			}
	
			return true;
		});
	}

	// Formats the strings
	members = _.map(members, member => {
		member.contributed = member.contributed?.toLocaleString() ?? '0';
		return member;
	});

	members = FormatHelper.formatEqualLength(members, 'username');
	members = FormatHelper.formatEqualLength(members, 'rank');
	members = FormatHelper.formatEqualLength(members, 'server');
	members = FormatHelper.formatEqualLength(members, 'contributed');

	members = _.orderBy(members, 
		['rank', member => !!member.server.trim(), member => member.username.trim()],
		['desc', 'desc', 'asc']);

	// Returns the formatted fields
	return FormatHelper.getFieldsFromValues('Username | Rank | Server | XP gained', _.map(members, member => getFormattedMember(member)));
}

function getFormattedMember(member) {
	return '` ' + member.username
		+ ' `|` ' + member.rank
		+ ' `|` ' + member.server
		+ ' `|` ' + member.contributed
		+ ' `';
}