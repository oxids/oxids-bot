const { SlashCommandBuilder } = require('discord.js');
const AnimalApiHelper = require('../helpers/animal-api.helper.js');
var _ = require('lodash');
const DiscordHelper = require("../helpers/discord.helper");



module.exports = {
	data: new SlashCommandBuilder()
		.setName('cat')
		.setDescription('Send an image of a cat.')
		.addStringOption(option =>
			option.setName('breed')
				.setDescription('The breed of the cat'))
		.setDMPermission(false),
	async execute(interaction) {
		const breed = interaction.options.getString('breed');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		const cat = await AnimalApiHelper.getCatImage(breed);
		if (!cat) {
			DiscordHelper.editReply(interaction, 'Cat couldn\'t be loaded :(');
			return;
		}

		DiscordHelper.editReply(interaction, cat);
	},
};