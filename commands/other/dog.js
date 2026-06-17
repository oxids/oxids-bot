const { SlashCommandBuilder } = require('discord.js');
const AnimalApiHelper = require('../../helpers/animal-api.helper.js');
var _ = require('lodash');
const DiscordHelper = require("../../helpers/discord.helper");



module.exports = {
	data: new SlashCommandBuilder()
		.setName('dog')
		.setDescription('Send an image of a dog.')
		.addStringOption(option =>
			option.setName('breed')
				.setDescription('The breed of the dog'))
		.setDMPermission(false),
	async execute(interaction) {
		const breed = interaction.options.getString('breed');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		const dog = await AnimalApiHelper.getDogImage(breed);
		if (!dog) {
			DiscordHelper.editReply(interaction, 'Dog couldn\'t be loaded :(');
			return;
		}

		DiscordHelper.editReply(interaction, dog);
	},
};