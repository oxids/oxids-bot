const { SlashCommandBuilder } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');
var _ = require('lodash');

const PROF_WHITELIST = [
	'0ae6f3ca-8349-4728-904b-32a0ba0e65e8', // ha15224
	'b6efba62-55de-4fce-9c78-58592ecd8209', // MntRunner
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-inactives')
		.setDescription('Shows the most inactive members of a guild.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to check inactive members for')
				.setRequired(true))
		.addBooleanOption(option =>
			option.setName('prof-mode')
				.setDescription('(optional) Set to true if you want the PROF sort order'))
		.setDMPermission(false),
	async execute(interaction) {
		let guildName = interaction.options.getString('guild');
		let profMode = interaction.options.getBoolean('prof-mode') ?? false;

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


		// Puts all the guild members in one array
		if (!guild?.members?.all?.length) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" has no members!');
			return;
		}


		// Loads the Player Info for all the members of the guild
		let members = [];
		
		for (let playerInfo of guild?.members?.all) {
			if (!playerInfo) {
				continue;
			}

			playerInfo.daysAbsent = playerInfo.lastJoin ? Math.floor((new Date() - new Date(playerInfo.lastJoin)) / (1000 * 60 * 60 * 24)) : '';
			playerInfo.hoursAbsent = playerInfo.lastJoin ? Math.floor((new Date() - new Date(playerInfo.lastJoin)) / (1000 * 60 * 60 * 1)) : '';

			// Sometimes the rank isnt loaded correctly
			if (playerInfo.guild?.rank) {
				playerInfo.rank = FormatHelper.getGuildRank(playerInfo.guild?.rank);
			} else {
				playerInfo.rank = _.find(guild.members.all, member => member.uuid === playerInfo.uuid)?.rank;
			}

			members.push(playerInfo);
		}

		if (profMode) {
			members = _.orderBy(members, [

				// People on the whitelist are in the very back
				member => PROF_WHITELIST.includes(member.uuid),

				// First show Recruits older than 12h
				member => FormatHelper.getGuildRank(member.rank, true) === FormatHelper.GUILD_RANKS_ENUM.RECRUIT && member.hoursAbsent >= 30,

				// Then show Recruiters older than 12h
				member => FormatHelper.getGuildRank(member.rank, true) === FormatHelper.GUILD_RANKS_ENUM.RECRUITER && member.hoursAbsent >= 30,

				/*
				// First show Recruits older than 2 weeks
				member => FormatHelper.getGuildRank(member.rank, true) === FormatHelper.GUILD_RANKS_ENUM.RECRUIT && member.daysAbsent >= 14,

				// Then show Recruiters older than 3 months
				member => FormatHelper.getGuildRank(member.rank, true) === FormatHelper.GUILD_RANKS_ENUM.RECRUITER && member.daysAbsent >= 90,

				// Then show Recruits older than 1 week
				member => FormatHelper.getGuildRank(member.rank, true) === FormatHelper.GUILD_RANKS_ENUM.RECRUIT && member.daysAbsent >= 7,
				*/

				// Then sort by last join & name
				member => member.lastJoin,
				member => member.username.trim()
			],
				['asc', 'desc', 'desc', 'asc', 'asc']
				/*['asc', 'desc', 'desc', 'desc', 'asc', 'asc']*/
			);
		} else {
			members = _.orderBy(members,
				['lastJoin', member => member.username.trim()],
				['asc', 'asc']);
		}

		// Put members with no public api to the back
		members = _.orderBy(members, m => m.lastJoin ? -1 : (m.rank?.trim()?.length ?? 0), 'asc');

		// Formats the strings
		members = FormatHelper.formatEqualLength(members, 'username');

		if (profMode) {
			members = FormatHelper.formatEqualLength(members, 'hoursAbsent');
		} else {
			members = FormatHelper.formatEqualLength(members, 'daysAbsent');
		}

		members = FormatHelper.formatEqualLength(members, 'rank');

		// Outputs the result
		const fields = FormatHelper.getFieldsFromValues('Username | Last online | Rank', _.map(members, member => getFormattedMember(member, profMode)));

		let embeds = [];
		for (let field of fields) {
			embeds = _.concat(embeds, DiscordHelper.getEmbeds([field], 1, 'Most inactive members of ' + guild.name + ' [' + guild.prefix + ']',
				await WynnApiHelper.getGuildThumbnail(guild.name)));
		}

		DiscordHelper.sendEmbedsToInteraction(interaction, embeds);
	},
};

function getFormattedMember(member, profMode) {
	return '` ' + member.username 
		+ ' `|` ' + (profMode ? (member.hoursAbsent + 'h') : (member.daysAbsent + 'd'))
		+ ' `|` ' + member.rank
		+ ' `';
}