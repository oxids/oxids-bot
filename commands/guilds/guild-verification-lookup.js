const { SlashCommandBuilder	} = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const VerificationHelper = require('../../helpers/verification.helper.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-verification-lookup')
		.setDescription('Checks who a user is verified to.')
		.addUserOption(option =>
			option.setName('discord-user')
				.setDescription('(Optional) The discord user to look up'))
		.addStringOption(option =>
			option.setName('minecraft-username')
				.setDescription('(Optional) The username of the Minecraft account to look up'))
		.setDMPermission(false),
	async execute(interaction) {

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction, true);

		const discordUser = interaction.options.getUser('discord-user');
		const username = interaction.options.getString('minecraft-username');

		let minecraftUser;
		let verifiedUser;
		if (username) {
			minecraftUser = await WynnApiHelper.getPlayerInfo(username);
			if (!minecraftUser) {
				DiscordHelper.editReply(interaction, { content: 'The account ' + username + ' could not be found!', ephemeral: true });
				return;
			}

			verifiedUser = await VerificationHelper.getVerifiedAccountByMinecraft(minecraftUser.uuid);
		} else if (discordUser) {
			verifiedUser = await VerificationHelper.getVerifiedAccountByDiscord(discordUser.id);
		} else {
			DiscordHelper.editReply(interaction, { content: 'Please provide a Discord account or Minecraft uuid!', ephemeral: true });
			return;
		}

		if (!verifiedUser) {
			DiscordHelper.editReply(interaction, { content: 'Could not find a linked account!', ephemeral: true });
			return;
		}

		if (!minecraftUser) {
			minecraftUser = await WynnApiHelper.getPlayerInfo(verifiedUser.minecraftUUID);
		}

		DiscordHelper.editReply(interaction, { content: 'The Minecraft account ' + (minecraftUser?.username ?? verifiedUser.minecraftUUID)
			+ ' is linked with the Discord account <@' + verifiedUser.discordId + '>!\n\n'
			+ 'Discord Id: ' + verifiedUser.discordId + '\n'
			+ 'Stats: https://wynncraft.com/stats/player/' + verifiedUser.minecraftUUID, ephemeral: true });
	},
};