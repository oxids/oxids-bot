const { SlashCommandBuilder } = require('discord.js');
const DiscordHelper = require('../helpers/discord.helper.js');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('solve-question-mark')
		.setDescription('Gives you all the needed steps for color maze.')
		.addStringOption(option =>
			option.setName('left-player')
				.setDescription('The name of the player on the left')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('middle-player')
				.setDescription('The name of the player in the middle')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('right-player')
				.setDescription('The name of the player on the right')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('remaining-player')
				.setDescription('The name of the player not on one of the pressure plates')
				.setRequired(true)),
	async execute(interaction) {
		const leftPlayer = interaction.options.getString('left-player');
		const middlePlayer = interaction.options.getString('middle-player');
		const rightPlayer = interaction.options.getString('right-player');
		const remainingPlayer = interaction.options.getString('remaining-player');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Outputs the result
		const steps = [
			remainingPlayer + ' go to the middle room on violet/purple.',
			leftPlayer + ' go to the right room on green.',
			remainingPlayer + ' go on dark blue.',
			middlePlayer + ' go to left room on green.',
			rightPlayer + ' go to left upper room on pink, through left room.',
			middlePlayer + ' go to middle room on orange.',
			remainingPlayer + ' go to left upper room on pink.',
			leftPlayer + ' go to right upper room on light blue.',
			rightPlayer + ' go to middle upper room on light blue.',
			remainingPlayer + ' go to middle upper room on cyan/gray.',
			middlePlayer + ' go to left upper room on cyan/gray.',
			leftPlayer + ' go on cyan/gray.',
			rightPlayer + ' go to final room on yellow.',
			leftPlayer + ' go on brown.',
			remainingPlayer + ' go to middle room on orange, through right upper room.',
			middlePlayer + ' go to final room through middle upper room.',
			remainingPlayer + ' go to final room through right upper room.',
			leftPlayer + ' go to final room.',
		]


		let fields = steps.map((step, index) => { 
			return { value: '**Step ' + (index + 1) + '**: ' + step };
		});

		const embeds = DiscordHelper.getEmbeds(fields, 1, 'Solution for color maze in ??? quest', DiscordHelper.getBotImage());
		DiscordHelper.editReply(interaction, { embeds: embeds });
	},
};