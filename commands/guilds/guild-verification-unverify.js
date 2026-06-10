const { SlashCommandBuilder	} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
var _ = require('lodash');
const VerificationHelper = require('../../helpers/verification.helper.js');
const LogHelper = require('../../helpers/log.helper.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-verification-unverify')
		.setDescription('Unverify your discord account.')
		.setDMPermission(false),
	async execute(interaction) {

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction, true);

		const verifiedUser = await VerificationHelper.getVerifiedAccountByDiscord(interaction.user.id);
		if (!verifiedUser) {
			DiscordHelper.editReply(interaction, { content: 'You are not verified.', ephemeral: true });
			return;
		}

		await VerificationHelper.removeVerifiedAccount(interaction.user.id);
		DiscordHelper.editReply(interaction, { content: 'You are no longer verified. Your ranks will be updated within the next 15m.', ephemeral: true });

		await LogHelper.writeToLog('Verification removed by ' + interaction.user.username + ' (' + interaction.user.id + '): ' +
			'Minecraft: ' + verifiedUser.minecraftUUID)
	},
};