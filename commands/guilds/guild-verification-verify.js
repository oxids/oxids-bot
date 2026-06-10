const { SlashCommandBuilder	} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const VerificationHelper = require('../../helpers/verification.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
const { trustedVerifiers } = require('../../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-verification-verify')
		.setDescription('Manually verify a user.')
		.addUserOption(option =>
			option.setName('user')
				.setDescription('The discord user to be verified')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('uuid')
				.setDescription('The uuid of the Minecraft account of the user')
				.setRequired(true))
		.setDMPermission(false),
	async execute(interaction) {

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction, true);

		if (!_.find(trustedVerifiers, v => v.discordId ===  interaction.user.id)) {
			DiscordHelper.editReply(interaction, { content: 'Only oxids can manually verify people.', ephemeral: true });
			return;
		}

		const discordUser = interaction.options.getUser('user');
		let uuid = interaction.options.getString('uuid');

		let user = await WynnApiHelper.getPlayerInfo(uuid);
		if (!user) {
			DiscordHelper.editReply(interaction, { content: 'The account ' + uuid + ' could not be found!', ephemeral: true });
			return;
		}

		if (_.find(await VerificationHelper.getVerifiedAccountByDiscord(discordUser.id))) {
			DiscordHelper.editReply(interaction, { content: 'The Discord account ' + discordUser.id + ' is already verified!', ephemeral: true });
			return;
		}

		const minecraftAccount = await WynnApiHelper.getPlayerInfo(uuid);
		if (!minecraftAccount) {
			DiscordHelper.editReply(interaction, { content: 'The Minecraft account ' + uuid + ' could not be found!', ephemeral: true });
			return;
		}

		uuid = minecraftAccount.uuid;
		if (_.find(await VerificationHelper.getVerifiedAccountByMinecraft(uuid))) {
			DiscordHelper.editReply(interaction, { content: 'The Minecraft account ' + uuid + ' is already verified!', ephemeral: true });
			return;
		}

		await LogHelper.writeToLog('New verification by ' + interaction.user.username + ' (' + interaction.user.id + '): ' +
			'Discord: ' + discordUser.id + ', Minecraft: ' + minecraftAccount.username + ' (' + minecraftAccount.uuid + ')')

		VerificationHelper.setVerifiedAccount(discordUser.id, uuid);
		DiscordHelper.editReply(interaction, { content: 'The Minecraft account ' + user.username + ' and Discord account '
			+ discordUser.id + ' is now verified!', ephemeral: true });
		DiscordHelper.send(interaction.channel, { content: 'The Minecraft account ' + user.username + ' and Discord account '
				+ discordUser.id + ' is now verified!' });
	},
};