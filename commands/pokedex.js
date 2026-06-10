const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const AnimalApiHelper = require('../helpers/animal-api.helper.js');
var _ = require('lodash');
const DiscordHelper = require("../helpers/discord.helper");



const MAX_POKEMON_NO = 1025;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pokedex')
		.setDescription('Send the sprite and dex entry of a Pokemon.')
		.addStringOption(option =>
			option.setName('pokemon')
				.setDescription('Name or national dex no. of the pokemon (Default: Random)'))
		.setDMPermission(false),
	async execute(interaction) {
		let pokemonNo = interaction.options.getString('pokemon');
		if (!pokemonNo) {
			pokemonNo = Math.floor(Math.random() * MAX_POKEMON_NO).toString();
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);



		const pokemon = await AnimalApiHelper.getPokemonImage(pokemonNo);
		if (!pokemon?.sprites) {
			DiscordHelper.editReply(interaction, 'Pokemon couldn\'t be loaded :(');
			return;
		}

		const cry = new AttachmentBuilder(pokemon.cries.latest).setName('cry');
		cry.name = 'cry.ogg';

		const embed = new EmbedBuilder()
			.setTitle('#' + pokemon.id + ' ' + firstLetterUpper(pokemon.name))
			.setDescription(getDescription(pokemon))
			.setImage(pokemon.sprites.other['official-artwork'].front_default);

		DiscordHelper.editReply(interaction, { embeds: [embed], files: [cry] });
	},
};



function getDescription(pokemon) {
	const flavor = pokemon.flavor?.length
		? _.nth(pokemon.flavor, Math.floor(Math.random() * pokemon.flavor.length))
		: null;

	return 'Typing: ' + _.join(_.map(Object.keys(pokemon.types), key => firstLetterUpper(pokemon.types[key].type.name)), ', ') 
		+ '\nHeight: ' + (pokemon.height / 10).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'm'
		+ '\nWeight: ' + (pokemon.weight / 10).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'kg'
		+ '\n\n' + flavor?.flavor_text?.split('\n').join(' ');
}

function firstLetterUpper(value) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}