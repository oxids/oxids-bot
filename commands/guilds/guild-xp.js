/*const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
var _ = require('lodash');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const FileHelper = require('../../helpers/file.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');
const SeqApiHelper = require('../../helpers/seq-api.helper.js');

// Required for the canvas to parse the date labels
require('chartjs-adapter-moment');

// Bugfix because it persists and causes issues on multiple runs, for some reason
// https://github.com/SeanSobey/ChartjsNodeCanvas/issues/9
const canvas = new ChartJSNodeCanvas({ width: 400, height: 200, backgroundColour: 'rgba(0,0,0,0.5)', plugins: {
    globalVariableLegacy: ['chartjs-adapter-moment']
}});

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-xp')
		.setDescription('Displays xp gain for a guild.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to show infos for')
				.setRequired(true))
		.addNumberOption(option =>
			option.setName('days')
				.setDescription('How many days it should count (Default: Current month)'))
		.addStringOption(option =>
			option.setName('username')
				.setDescription('Only shows xp from this user (Default: All)')),
	async execute(interaction) {
		let guildName = interaction.options.getString('guild');
		let days = interaction.options.getNumber('days');
		const username = interaction.options.getString('username');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Tells the user to use guild-xp-tracker instead of days 0
		if (days === 0) {
			DiscordHelper.followUp(interaction, 'If you\'d like to track your current xp gain, consider using ** /guild-xp-tracker**!');
			return;
		}

		// Loads the user
		let playerInfo;
		if (username) {
			playerInfo = await WynnApiHelper.getPlayerInfo(username);
			if (!playerInfo) {
				DiscordHelper.followUp(interaction, 'User "' + username + '" not found!');
				return;
			}
		}

		// Uses the current month as default
		if (!days) {
			const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
			const now = new Date();

			const daysBetween = (now - firstOfMonth) / (1000 * 60 * 60 * 24);
			days = daysBetween;
		}

		// Loads the info of the guild
		let guild = await WynnApiHelper.getGuildInfo(guildName);
		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;

		// Loads the xp gains from the SEQ Database
		let xp = await SeqApiHelper.executeSql(`
			SELECT
				PLAYERS.PLAYER_UUID,
				PLAYERS.XP_CONTRIBUTION,
				MIN(PLAYERS.USERNAME) AS USERNAME,
				MIN(PLAYERS.RECORDED_AT) AS RECORDED_AT
			FROM GUILDS
				 INNER JOIN PLAYERS ON GUILDS.GUILD_ID = PLAYERS.GUILD_ID
			WHERE GUILDS.GUILD_NAME = @guildName
		  		AND RECORDED_AT >= DATEADD(DAY, -1 * @days, GETDATE())
			  	AND XP_CONTRIBUTION != 0
			GROUP BY PLAYERS.PLAYER_UUID, PLAYERS.XP_CONTRIBUTION
			ORDER BY PLAYERS.PLAYER_UUID ASC, RECORDED_AT ASC
		`, [
			{ name: 'guildName', type: SeqApiHelper.sqlTypes.NVarChar(64), value: guild.name },
			{ name: 'days', type: SeqApiHelper.sqlTypes.Int(), value: days },
		]);

		if (!xp?.length || !xp[0]?.length) {
			DiscordHelper.followUp(interaction, 'No XP found for guild ' + guild.name + '.');
			return;
		}

		xp = _.map(xp[0], d => {
			d.XP_CONTRIBUTION = Number(d.XP_CONTRIBUTION);
			return d;
		});

		// Filters xp gains to only have relevant ones
		if (playerInfo) {
			xp = _.filter(xp, entry => entry.PLAYER_UUID === playerInfo.uuid);
		}

		// Loads the embeds and attachments
		let embeds = DiscordHelper.getEmbeds(getFields(_.cloneDeep(xp), guild), 1, 'XP contributed for ' + guild.name + ' [' + guild.prefix + ']'
			+ ' since <t:' + Math.floor((new Date(_.minBy(xp, g => g.RECORDED_AT).RECORDED_AT)).getTime() / 1000) + '>'  ,
			await WynnApiHelper.getGuildThumbnail(guild.name));

		let embed = { embeds: embeds }
		if (playerInfo) {
			const attachment = await getAttachment(_.cloneDeep(xp), guild);
			if (!attachment) {
				DiscordHelper.followUp(interaction, 'Couldn\'t generate the chart.');
				return;
			}

			embeds = _.map(embeds, embed => {
				return embed.setImage('attachment://' + attachment.name);
			});

			embed = { embeds: embeds, files: [attachment] };
		}

		DiscordHelper.editReply(interaction, embed);
	},
};

function getFields(xpGains, guild) {
	if (!xpGains?.length) {
		return [{ name: 'No data', value: 'Nobody contributed any XP.' }];
	}

	let filteredXpGains = [];
	for (const member of _.uniqBy(xpGains, d => d.PLAYER_UUID)) {
		const uuid = member.PLAYER_UUID;
		const minXp = _.minBy(_.filter(xpGains, d => d.PLAYER_UUID === uuid), d => d.RECORDED_AT);
		const maxXp = _.maxBy(_.filter(xpGains, d => d.PLAYER_UUID === uuid), d => d.RECORDED_AT);

		if (maxXp.XP_CONTRIBUTION > minXp.XP_CONTRIBUTION) {
			filteredXpGains.push({ username: maxXp.USERNAME, xp: maxXp.XP_CONTRIBUTION - minXp.XP_CONTRIBUTION });
		}
	}

	if (!filteredXpGains?.length) {
		return [{ name: 'No data', value: 'Nobody contributed any XP.' }];
	}

	let title = 'Total XP: ' + _.sumBy(filteredXpGains, d => d.xp).toLocaleString() + '\n\nUsername | Total XP';

	filteredXpGains = _.orderBy(filteredXpGains, d => d.xp, 'desc');
	filteredXpGains = _.map(filteredXpGains, d => {
		d.xpFormatted = d.xp.toLocaleString();
		return d;
	});

	filteredXpGains = FormatHelper.formatEqualLength(filteredXpGains, 'username');
	filteredXpGains = FormatHelper.formatEqualLength(filteredXpGains, 'xpFormatted');

	const fields = FormatHelper.getFieldsFromValues(null, _.map(filteredXpGains, member => getFormattedMember(member)), title);
	if (!fields?.length) {
		return [{ name: 'No data', value: 'Nobody contributed any XP.' }];
	}

	return fields;
}

async function getAttachment(xpGains, guild) {
	if (!xpGains?.length) {
		return null;
	}

	const data = { 
		labels: _.map(xpGains, d => new Date(d.RECORDED_AT).getTime()),
		datasets: [{ 
			label: 'Level of ' + guild.name + ' [' + guild.prefix + ']',
			data: _.map(xpGains, d => d.XP_CONTRIBUTION - xpGains[0].XP_CONTRIBUTION),
			backgroundColor: 'yellow',
			borderColor: '#FFFFFF',
			pointRadius: 0
		}]};
	const options = {
		plugins: {
			legend: {
				labels: {
					color: "white",
				}
			}
		},
		scales: { 
			x: {
				grid: {
					color: 'rgba(255, 255, 255, 0.2)',
					borderColor: 'white'
				},
				type: 'time',
				time: {
					unit: 'hour',
					displayFormats: {
						'millisecond': 'DD.MM',
						'second': 'DD.MM',
						'minute': 'DD.MM',
						'hour': 'DD.MM',
						'day': 'DD.MM',
						'week': 'DD.MM',
						'month': 'DD.MM',
						'quarter': 'DD.MM',
						'year': 'DD.MM',
					}
				},
				ticks: {
					autoSkip: true,
					maxTicksLimit: 20,
					color: 'white'
				},
			},
			y: {
				grid: {
					color: 'rgba(255, 255, 255, 0.2)',
					borderColor: 'white'
				},
				type: 'linear',
				ticks: {
					color: 'white'
				}
			}
		}
	}

	const configuration = { type: 'line', data: data, options: options };
	const builder = new AttachmentBuilder(await canvas.renderToBuffer(configuration));
	builder.name = 'xp-gain.png';

	return builder;
}

function getFormattedMember(member) {
	let memberText = '` ' + member.username 
		+ ' `|` ' + member.xpFormatted
		+ ' `';

	return memberText;
}*/

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
var _ = require('lodash');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const FileHelper = require('../../helpers/file.helper.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');

// Required for the canvas to parse the date labels
require('chartjs-adapter-moment');

const XP_GAIN_FOLDERNAME = './assets/xp-gains';

// Bugfix because it persists and causes issues on multiple runs, for some reason
// https://github.com/SeanSobey/ChartjsNodeCanvas/issues/9
const canvas = new ChartJSNodeCanvas({ width: 400, height: 200, backgroundColour: 'rgba(0,0,0,0.5)', plugins: {
		globalVariableLegacy: ['chartjs-adapter-moment']
	}});

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-xp')
		.setDescription('Displays xp gain for a guild.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to show infos for')
				.setRequired(true))
		.addNumberOption(option =>
			option.setName('days')
				.setDescription('How many days it should count (Default: Current month)'))
		.addStringOption(option =>
			option.setName('username')
				.setDescription('Only shows xp from this user (Default: All)')),
	async execute(interaction) {
		let guildName = interaction.options.getString('guild');
		let days = interaction.options.getNumber('days');
		const username = interaction.options.getString('username');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);

		// Tells the user to use guild-xp-tracker instead of days 0
		if (days === 0) {
			DiscordHelper.followUp(interaction, 'If you\'d like to track your current xp gain, consider using **/guild-xp-tracker**!');
			return;
		}

		// Loads the user
		let playerInfo;
		if (username) {
			playerInfo = await WynnApiHelper.getPlayerInfo(username);
			if (!playerInfo) {
				DiscordHelper.followUp(interaction, 'User "' + username + '" not found!');
				return;
			}
		}

		// Uses the current month as default
		if (!days) {
			const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
			const now = new Date();

			const daysBetween = (now - firstOfMonth) / (1000 * 60 * 60 * 24);
			days = daysBetween;
		}

		// Loads the info of the guild
		let guild = await WynnApiHelper.getGuildInfo(guildName);
		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;

		// Checks if the xp for the guild is tracked
		let xpGains = FileHelper.readFromFile(XP_GAIN_FOLDERNAME + '/' + guild.name + '.json');
		if (!xpGains?.length && days !== 0) {
			DiscordHelper.followUp(interaction, 'Guild XP tracker is not active for this guild.');
			return;
		}

		// Filters xp gains to only have relevant ones
		xpGains = filterXPGains(xpGains, days, playerInfo?.uuid);

		// Gets the reference point for the xp gains
		let referencePoint = _.minBy(xpGains, g => g.date);

		// Function for the refresher
		const embedsFunc = async function () {
			const currentXpGains = _.cloneDeep(xpGains);

			// Refreshes current XP gain
			guild = await WynnApiHelper.getGuildInfo(guildName);
			if (playerInfo) {
				guild.members.all = _.filter(guild.members.all, member => member.uuid === playerInfo.uuid);
			}

			// Adds the current data to the gains, to always have up-to-date data
			const newGain = getCurrentGains(guild, playerInfo?.uuid);
			if (!newGain) {
				DiscordHelper.followUp(interaction, 'Error getting gains from user');
				return;
			}

			currentXpGains.push(newGain);
			xpGains.push(newGain);

			// Checks if the reference point is not yet set, because of not having data in the current timeframe
			if (!referencePoint) {
				referencePoint = newGain;
			}

			// Loads the embeds and attachments
			const attachment = await getAttachment(currentXpGains, guild);
			if (!attachment) {
				DiscordHelper.followUp(interaction, 'Couldn\'t generate the chart.');
				return;
			}

			let embeds = DiscordHelper.getEmbeds(getFields(guild, referencePoint), 1, 'XP contributed for ' + guild.name + ' [' + guild.prefix + ']'
				+ ' since <t:' + Math.floor((new Date(referencePoint.date)).getTime() / 1000) + '>'  ,
				await WynnApiHelper.getGuildThumbnail(guild.name));

			embeds = _.map(embeds, embed => {
				return embed.setImage('attachment://' + attachment.name);
			});

			return { embeds: embeds, files: [attachment] };
		}

		const embed = await embedsFunc();
		if (!embed) {
			return;
		}

		DiscordHelper.editReply(interaction, embed);
	},
};

function getFields(guild, referencePoint) {

	// Gets the reference point for the xp gains
	let members = _.cloneDeep(guild.members.all);

	// Reduces the guild members xp gain by the reference point xp
	if (referencePoint) {
		members = _.map(members, member => {
			member.xpGained = calculateContributedXP(member, referencePoint);
			return member;
		});
	}

	members = _.filter(members, member => !!member.xpGained);

	let title = 'Username | Total XP';
	const totalXp = _.sumBy(members, member => member.xpGained);
	if (totalXp) {
		title = 'Total XP: ' + totalXp.toLocaleString() + '\n\n' + title;
	}

	members = _.orderBy(members, member => member.xpGained, 'desc');
	members = _.map(members, member => {
		member.xpGained = member.xpGained.toLocaleString();
		return member;
	});

	members = FormatHelper.formatEqualLength(members, 'username');
	members = FormatHelper.formatEqualLength(members, 'xpGained');

	const fields = FormatHelper.getFieldsFromValues(null, _.map(members, member => getFormattedMember(member)), title);
	if (!fields?.length) {
		return [{ name: 'No data', value: 'Nobody contributed any XP.' }];
	}

	return fields;
}

async function getAttachment(xpGains, guild) {

	// Maps the xp gain data in the correct format
	const mappedGains = _.map(xpGains, xpGain => {
		const label = new Date(xpGain.date).getTime();
		const data = xpGain.level + (xpGain.xpPercent * 0.01);

		return { label: label, data: data };
	});

	// Sets the xp gain image
	const minData = _.minBy(xpGains, g => g.level + (g.xpPercent * 0.01));
	const maxData = _.maxBy(xpGains, g => g.level + (g.xpPercent * 0.01));

	const data = {
		labels: _.map(mappedGains, d => d.label),
		datasets: [{
			label: 'Level of ' + guild.name + ' [' + guild.prefix + ']',
			data: _.map(mappedGains, d => d.data),
			backgroundColor: 'yellow',
			borderColor: '#FFFFFF',
			pointRadius: 0
		}]};
	const options = {
		plugins: {
			legend: {
				labels: {
					color: "white",
				}
			}
		},
		scales: {
			x: {
				grid: {
					color: 'rgba(255, 255, 255, 0.2)',
					borderColor: 'white'
				},
				type: 'time',
				time: {
					unit: 'hour',
					displayFormats: {
						'millisecond': 'DD.MM',
						'second': 'DD.MM',
						'minute': 'DD.MM',
						'hour': 'DD.MM',
						'day': 'DD.MM',
						'week': 'DD.MM',
						'month': 'DD.MM',
						'quarter': 'DD.MM',
						'year': 'DD.MM',
					}
				},
				ticks: {
					autoSkip: true,
					maxTicksLimit: 20,
					color: 'white'
				},
			},
			y: {
				grid: {
					color: 'rgba(255, 255, 255, 0.2)',
					borderColor: 'white'
				},
				type: 'linear',
				min: minData ? (minData.level + (minData.xpPercent * 0.01)) : undefined,
				max: maxData ? (maxData.level + (maxData.xpPercent * 0.01)) : undefined,
				ticks: {
					color: 'white'
				}
			}
		}
	}

	const configuration = { type: 'line', data: data, options: options };
	const builder = new AttachmentBuilder(await canvas.renderToBuffer(configuration));
	builder.name = 'xp-gain.png';

	return builder;
}

function filterXPGains(xpGains, days, userUUID) {

	// Filters the xp gains by date
	let gains = _.filter(xpGains, gain => {
		return ((new Date()) - new Date(gain.date)) <= (1000 * 60 * 60 * 24 * days);
	});

	// Only uses the gains from the specific users
	if (userUUID) {
		gains = _.filter(_.map(gains, gain => {
			const memberGain = _.find(gain.members, m => m.uuid === userUUID);
			if (!memberGain) {
				return null;
			}

			gain.level = memberGain.contributed;
			gain.xpPercent = 0;
			gain.members = [memberGain];

			return gain;
		}), gain => !!gain);
	}

	return gains;
}

function getCurrentGains(guild, userUUID) {
	const gain = {
		date: new Date(),
		level: guild.level,
		xpPercent: guild.xpPercent,
		members: _.map(guild.members.all, member => {
			return {
				uuid: member.uuid,
				contributed: member.contributed
			};
		})
	};

	// Only uses the gains from the specific users
	if (userUUID) {
		const memberGain = _.find(gain.members, m => m.uuid === userUUID);
		if (!memberGain) {
			return null;
		}

		gain.level = memberGain.contributed;
		gain.xpPercent = 0;
		gain.members = [memberGain];
	}

	return gain;
}

function calculateContributedXP(member, referencePoint) {
	let referenceXp = _.find(referencePoint.members, ref => ref.uuid === member.uuid)?.contributed ?? 0;

	// When people leave the guild, it would be negative
	if (referenceXp > member.contributed) {
		referenceXp = 0;
	}

	return member.contributed - referenceXp;
}

function getFormattedMember(member) {
	let memberText = '` ' + member.username
		+ ' `|` ' + member.xpGained
		+ ' `';

	return memberText;
}