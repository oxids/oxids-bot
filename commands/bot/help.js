const { SlashCommandBuilder } = require('discord.js');
const FeaturesCommand = require("./features.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Get help with using the bot.'),
	async execute(interaction) {
		FeaturesCommand.execute(interaction, true);
	},
};