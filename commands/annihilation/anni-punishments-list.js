const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
var _ = require('lodash');
const AnniPunishmentHelper = require('../../helpers/anni-punishment.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('anni-punishments-list')
		.setDescription('Displays the Annihilation punishments of the current server.')
		.addUserOption(option =>
			option.setName('user')
				.setDescription('The user who was punished (Default: All)'))
		.addStringOption(option =>
			option.setName('type')
				.setDescription('Filters the type of punishments (Default: None)')
				.addChoices(
					{ name: 'Untimeliness', value: 'untimeliness' },
					{ name: 'Ban', value: 'ban' }))
		.addBooleanOption(option =>
			option.setName('only-active')
				.setDescription('Only show active punishments (Default: true)'))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.setDMPermission(false),
	async execute(interaction) {

		const user = interaction.options.getUser('user');
		const type = interaction.options.getString('type');
		const onlyActive = interaction.options.getBoolean('only-active') ?? true;

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Loads the punishments
		let punishments;
		try {
			punishments = await AnniPunishmentHelper.getPunishments(interaction.guildId, user?.id, type, onlyActive);
		} catch (e) {
			throw e;
		}

		// Escape if no punishments
		if (!punishments.length) {
			DiscordHelper.followUp(interaction, 'No '
				+ (type ?? 'punishments')
				+ ' found'
				+ (user ? ' for user ' + `<@${user.id}>` : '')
				+ '!');
			return;
		}

		const embeds = user ? AnniPunishmentHelper.getUserPunishmentsEmbed(user?.id, punishments) : await getListEmbeds(interaction, punishments, type);
		DiscordHelper.sendEmbedsToInteraction(interaction, embeds);
	},
};

async function getListEmbeds(interaction, punishments, type) {

	// Outputs the result
	const fields = _.map(punishments, (punishment, index) => {
		const punishmentInfo = AnniPunishmentHelper.getTitleAndColor(punishment);

		return {
			name: punishmentInfo.title,
			value: 'For ' + punishment.amountTotal + ' events (' + (punishment.amountTotal - punishment.amountServed) + ' left)'

				+ '\n\nPunished by: `' + punishment.punishUsername + '`'
					+ '\nPunished on: ' + '<t:' + Math.floor(punishment.punishDate.getTime() / 1000) + '>'
					+ (punishment.punishReason ? '\nPunished for: "' + punishment.punishReason + '"' : '')

				+ (punishment.revokeDate
					? '\n\nRevoked by `' + punishment.revokeUsername + '`'
						+ '\nRevoked on: ' + '<t:' + Math.floor(punishment.revokeDate.getTime() / 1000) + '>'
						+ '\nRevoked for: "' + punishment.revokeReason + '"'
					: '')

				+ '\n\nUser: ' + `<@${punishment.userId}>` + ' (' + punishment.userId + ')'

				+ (index < punishments.length - 1
						? '\n\n───────────────────────\n \u200b'
						: ''
				)
		};
	});

	const title = (type ? type + '\'s' : 'Punishments') + ' for ' + interaction.guild.name
	return DiscordHelper.getEmbeds(fields, 1, title, await interaction.guild.iconURL());
}
