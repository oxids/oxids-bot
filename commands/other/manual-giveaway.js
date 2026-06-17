const WynnApiHelper = require('../../helpers/wynn-api.helper');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
var _ = require('lodash');
const DiscordHelper = require("../../helpers/discord.helper");

const MAX_PARTICIPANTS = 8;



const data = new SlashCommandBuilder().setName('manual-giveaway')
	.setDescription('Creates a manual giveaway that gets rolled instantly.')
	.addNumberOption(option =>
		option.setName('winners')
			.setDescription('The amount of winners')
			.setRequired(true))
	.addStringOption(option =>
		option.setName('participants')
			.setDescription('List of participants (Split by space, comma or semicolon)'));

for (let i = 0; i < MAX_PARTICIPANTS; i++) {
	data.addStringOption(option =>
		option.setName('participant' + (i + 1))
			.setDescription((i + 1) + '. participant'));
}

module.exports = {
	data: data,
	async execute(interaction) {
		const winners = interaction.options.getNumber('winners');
		const listParticipants = interaction.options.getString('participants');
		
		let participants = [];

		// Adds the manual participants
		for (let i = 0; i < MAX_PARTICIPANTS; i++) {
			const participant = interaction.options.getString('participant' + (i + 1));
			if (!participant?.trim()) {
				continue;
			}

			participants.push(participant?.trim())
		}

		// Adds the list of participants
		if (listParticipants) {
			const seperator = listParticipants.includes(';') ? ';' : listParticipants.includes(',') ? ',' : ' ';
			for (let participant of listParticipants.split(seperator)) {
				if (!participant?.trim()) {
					continue;
				}

				participants.push(participant?.trim());
			}
		}

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		if (winners < 1) {
			await DiscordHelper.followUp(interaction, 'There has to be at least 1 winner!');
			return;
		}

		if (participants < 1) {
			await DiscordHelper.followUp(interaction, 'There has to be at least 1 participant!');
			return;
		}

		// Escapes the names
		participants = _.map(participants, p => '`' + p + '`');

		let embed = new EmbedBuilder()
			.setColor('Blue')
			.setThumbnail(DiscordHelper.getBotImage())
			.setTitle('Giveaway')
			.setDescription('**Participants (' + participants.length + ')**: ' + participants.join(', ')
				+ '\n**Amount of winners**: ' + winners
				+ '\n\n**Winners**: ' + _.sampleSize(participants, winners).join(', '));
		
		await DiscordHelper.followUp(interaction, { embeds: [embed]});
	},
};