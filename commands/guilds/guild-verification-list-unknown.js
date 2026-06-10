const { SlashCommandBuilder, EmbedBuilder} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const VerificationHelper = require('../../helpers/verification.helper.js');
const FormatHelper = require("../../helpers/format.helper");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-verification-list-unknown')
		.setDescription('Checks which users of a guild are not verified.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to check members for')
				.setRequired(true))
		.setDMPermission(false),
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

		let unverifiedMembers = [];
		for (const member of guild.members.all) {
			if (!(await VerificationHelper.getVerifiedAccountByMinecraft(member.uuid))) {
				unverifiedMembers.push(member);
			}
		}

		if (!unverifiedMembers.length) {
			await DiscordHelper.followUp(interaction, 'Every member of the guild "' + guildName + '" is verified!');
			return;
		}

		unverifiedMembers = _.groupBy(unverifiedMembers, 'rank');

		let fields = [];
		for (const rank of Object.keys(unverifiedMembers)) {
			let members = unverifiedMembers[rank];
			if (!members?.length) {
				continue;
			}

			members = _.orderBy(members, [member => member.username], 'asc');
			fields = _.concat(fields, FormatHelper.getFieldsFromValues(FormatHelper.getGuildRank(rank, true), _.map(members, member => {
				return '`' + member.username + '` <t:' + Math.floor(new Date(member.joined).getTime() / 1000) + ':f>';
			})))
		}

		const embeds = DiscordHelper.getEmbeds(fields, 1, 'Unverified members of ' + guildName, await WynnApiHelper.getGuildThumbnail(guildName));
		await DiscordHelper.followUp(interaction, { embeds: embeds });
	},
};