const { SlashCommandBuilder } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');
var _ = require('lodash');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('soul-points')
		.setDescription('Displays when worlds will give another soul point.'),
	async execute(interaction) {

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);
		
		await DiscordHelper.followUp(interaction, 'Soul points have been removed with rekindled world.\nhttps://forums.wynncraft.com/threads/2-1-rekindled-world-changelog.316880/');
		return;

		// Loads the info of the worlds
		let worlds = await WynnApiHelper.getWorlds();
		if (!worlds?.length) {
			await DiscordHelper.followUp(interaction, 'Worlds could not be loaded!');
			return;
		}

		// Calculates when the worlds will get their soul points
		// Its every 20 minutes from the start
		const nowDate = new Date();
		worlds = _.map(worlds, world => {
			if (!world.firstSeen) {
				return world;
			}

			world.firstSeen = new Date(world.firstSeen);
			world.firstSeenTimestamp = Math.floor((nowDate - new Date(world.firstSeen)) / 1000);
			world.playersFormatted = (world.players?.length ?? 0) + '/40';

			// Calculation according to fuy.gg
			// https://github.com/Essentuan/fuy.gg/blob/853c436d7834a732c289703711533c92e6e13336/src/main/java/com/busted_moments/client/commands/FuyCommand.java#L141
			world.nextSoulPointMS = (1000 * 60 * 20) - ((nowDate - world.firstSeen) % (1000 * 60 * 20)) - (1000 * 90);
			if (world.nextSoulPointMS <= 0) {
				world.nextSoulPointMS += (1000 * 60 * 20);
			}

			const minutes = Math.floor(world.nextSoulPointMS / (1000 * 60));
			const seconds = (Math.floor(world.nextSoulPointMS / 1000) % 60) + 1;
			world.nextSoulPoint = minutes + 'm ' + (seconds < 10 ? ' ' : '')  + seconds + 's';

			return world;
		});

		// Formats the strings
		worlds = FormatHelper.formatEqualLength(worlds, 'world');
		worlds = FormatHelper.formatEqualLength(worlds, 'nextSoulPoint');
		worlds = FormatHelper.formatEqualLength(worlds, 'playersFormatted');

		worlds = _.orderBy(worlds, 
			['nextSoulPointMS'],
			['asc']);

		fields = FormatHelper.getFieldsFromValues('World | Players | Time until soul point | Running since', _.map(worlds, world => getFormattedWorld(world)));
		
		// Returns the formatted fields
		let embeds = [];
		for (let field of fields) {
			embeds = _.concat(embeds, _.map(DiscordHelper.getEmbeds([field], 1, 'Upcoming soul points', DiscordHelper.getBotImage()), embed => {
				embed.setDescription('This might be inaccurate, as each worlds day-night cycle starts at a different time for whatever reason.\nCredit to fuy.gg for providing a semi-reliable formula :)');
				return embed;
			}));
		}

		DiscordHelper.sendEmbedsToInteraction(interaction, embeds);
	},
};

function getFormattedWorld(world) {
	return '` ' + world.world
		+ ' `|` ' + world.playersFormatted
		+ ' `|` ' + world.nextSoulPoint
		+ ' `| <t:' + world.firstSeenTimestamp + ':T>';
}