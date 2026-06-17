const { SlashCommandBuilder } = require('discord.js');
const DiscordHelper = require("../../helpers/discord.helper");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!'),
	async execute(interaction) {
		await DiscordHelper.reply(interaction, 'Pong!');
	},
};