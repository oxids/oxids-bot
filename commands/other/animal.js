const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const AnimalApiHelper = require('../../helpers/animal-api.helper.js');
var _ = require('lodash');
const DiscordHelper = require('../../helpers/discord.helper.js');


const ANIMALS = [
	{ name: 'Bird', value: 'bird' },
	{ name: 'Capybara', value: 'capybara' },
	{ name: 'Cat', value: 'cat' },
	{ name: 'Dog', value: 'dog' },
	{ name: 'Fox', value: 'fox' },
	{ name: 'Kangaroo', value: 'kangaroo' },
	{ name: 'Koala', value: 'koala' },
	{ name: 'Panda', value: 'panda' },
	{ name: 'Raccoon', value: 'raccoon' },
	{ name: 'Red panda', value: 'red_panda' },
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('animal')
		.setDescription('Send an image and a fun fact of an animal.')
		.addStringOption(option =>
			option.setName('animal')
				.setDescription('The animal for which you want an image. Leave blank for a random animal!')
				.addChoices(...ANIMALS))
		.setDMPermission(false),
	async execute(interaction) {
		let animal = interaction.options.getString('animal');
		if (!animal) {
			animal = _.nth(ANIMALS, Math.floor(Math.random() * ANIMALS.length)).value;
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);


		let message;
		switch (animal) {
			case 'capybara':
				message = await getCapybaraMessage();
				break;
			default:
				message = await getMessage(animal);
				break;
		}

		DiscordHelper.editReply(interaction, message);
		return;
	},
};

async function getMessage(animal) {
	const image = await AnimalApiHelper.getAnimalImage(animal);
	if (!image?.image) {
		return 'Animal couldn\'t be loaded :(';
	}

	const embed = new EmbedBuilder()
		.setTitle(_.find(ANIMALS, a => a.value === animal)?.name)
		.setDescription(image.fact)
		.setImage(image.image);

	return { embeds: [embed] };
}

async function getCapybaraMessage() {
	const capybara = await AnimalApiHelper.getCapyImage();
	if (!capybara?.body) {
		return 'Capybara couldn\'t be loaded :(';
	}

	const capybaraBuffer = capybara.body;
	const builder = new AttachmentBuilder(capybaraBuffer);
	builder.name = 'capybara.png';

	const embed = new EmbedBuilder()
		.setTitle('Capybara')
		.setImage(`attachment://capybara.png`);

	return { embeds: [embed], files: [builder] };
}