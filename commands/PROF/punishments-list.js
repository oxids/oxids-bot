const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
var _ = require('lodash');
const PunishmentHelper = require('../../helpers/punishment.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const { applicationServer } = require('../../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('punishments-list')
		.setDescription('Displays the punishments of Profession Heaven.')
		.addStringOption(option =>
			option.setName('username')
				.setDescription('The user who was punished (Default: All)'))
		.addStringOption(option =>
			option.setName('type')
				.setDescription('Filters the type of punishments (Default: None)')
				.addChoices(
					{ name: 'Warnings', value: 'warn' },
					{ name: 'Bans', value: 'ban' }))
		.addBooleanOption(option =>
			option.setName('only-active')
				.setDescription('Only show active punishments (Default: true)'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {

		// Only works on PROF discord
		if (interaction.guildId !== applicationServer) {
			DiscordHelper.reply(interaction, 'This command currently only works on the PROF guild discord!');
			return;
		}

		let username = interaction.options.getString('username');
		const type = interaction.options.getString('type');
		const onlyActive = interaction.options.getBoolean('only-active') ?? true;

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Loads the punishments
		let punishments;
		try {
			punishments = await PunishmentHelper.getPunishments(username, type, onlyActive);
		} catch (e) {
			if (e.publicMessage) {
				DiscordHelper.followUp(interaction, e.publicMessage);
				return;
			}

			throw e;
		}

		// Escape if no punishments
		if (!punishments.length) {
			DiscordHelper.followUp(interaction, 'No '
				+ (type ? PunishmentHelper.getPunishmentName(type) : 'punishments')
				+ ' found'
				+ (username ? ' for user "' + username + '"' : '')
				+ '!');
			return;
		}

		const embeds = username ? PunishmentHelper.getUserPunishmentsEmbed(username, punishments) : await getListEmbeds(punishments, type);
		DiscordHelper.sendEmbedsToInteraction(interaction, embeds);
	},
};

async function getListEmbeds(punishments, type) {

	// Formats the strings
	punishments = _.map(punishments, p => {
		p.punishment = PunishmentHelper.getPunishmentName(p.punishment);
		return p;
	});



	// Outputs the result
	const fields = _.map(punishments, (punishment, index) => {
		const punishmentInfo = PunishmentHelper.getTitleAndColor(punishment);

		return { name: punishmentInfo.title, value: 'until: '
			+ (punishment.punishEndDate
				? '<t:' + Math.floor(punishment.punishEndDate.getTime() / 1000) + '>'
				: 'PERMANENT')

			+ '\n\nPunished by: `' + punishment.punishUsername + '`'
				+ '\nPunished on: ' + '<t:' + Math.floor(punishment.punishDate.getTime() / 1000) + '>'
				+ '\nPunished for: "' + punishment.punishReason + '"'

			+ (punishment.revokeDate
				? '\n\nRevoked by `' + punishment.revokeUsername + '`'
					+ '\nRevoked on: ' + '<t:' + Math.floor(punishment.revokeDate.getTime() / 1000) + '>'
					+ '\nRevoked for: "' + punishment.revokeReason + '"'
				: '')

			+ '\n\nNameMC: https://namemc.com/profile/' + punishment.uuid
				+ '\nStats: https://wynncraft.com/stats/player/' + punishment.uuid

			+ (index < punishments.length - 1
				? '\n\n───────────────────────\n \u200b'
				: ''
			)
		};
	});

	const title = (type ? PunishmentHelper.getPunishmentName(type) + 's' : 'Punishments')
		+ ' for Profession Heaven [PROF]';

	return DiscordHelper.getEmbeds(fields, 1, title, await WynnApiHelper.getGuildThumbnail('Profession Heaven'));
}
