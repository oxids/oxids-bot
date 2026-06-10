const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
var _ = require('lodash');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FormatHelper = require('../../helpers/format.helper.js');
const RefreshHelper = require('../../helpers/refresh.helper.js');

// Required for the canvas to parse the date labels
require('chartjs-adapter-moment');

// Bugfix because it persists and causes issues on multiple runs, for some reason
// https://github.com/SeanSobey/ChartjsNodeCanvas/issues/9
const canvas = new ChartJSNodeCanvas({ width: 400, height: 200, backgroundColour: 'rgba(0,0,0,0.5)', plugins: {
    globalVariableLegacy: ['chartjs-adapter-moment']
}});

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guild-xp-tracker')
		.setDescription('Displays xp gain for a guild for the current grind session. Basically /guild-xp with more info.')
		.addStringOption(option =>
			option.setName('guild')
				.setDescription('The guild to show infos for')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('username')
				.setDescription('The person that grinds. Tracks additional data for them'))
		.setDMPermission(false),
	async execute(interaction) {
		let guildName = interaction.options.getString('guild');
		const username = interaction.options.getString('username');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);
		
		// Loads the info of the guild
		let guild = await getGuild(guildName, username);
		if (!guild?.members) {
			await DiscordHelper.followUp(interaction, 'Guild "' + guildName + '" not found!');
			return;
		}

		// Corrects case of the guild name parameter
		guildName = guild.name;

		// Gets the current xp as the reference point
		const xpGains = [await getCurrentGains(guild, username)];
		const referencePoint = _.minBy(xpGains, g => g.date);

		// Function for the refresher
		const embedsFunc = async function () {

			// Refreshes current XP gain
			guild = await getGuild(guildName, username);
	
			// Adds the current data to the gains, to always have up-to-date data
			// Checks if the gain is the same as the last gain
			const newGain = await getCurrentGains(guild, username);
			const lastGain = _.last(_.cloneDeep(xpGains));
			if (!lastGain || !_.isEqual(_.map(lastGain?.members, m => m.contributed), _.map(newGain?.members, m => m.contributed))) {
				xpGains.push(newGain);
			}			

			// Also shows the last 5m
			const referencePoint5m = _.minBy(getFilteredXPGains(xpGains, 1 / 24 / 12), xpGain => xpGain.date);

			// Gets the reference point for the xp gains
			const mappedGains = getMappedGains(_.cloneDeep(newGain.members), _.cloneDeep(referencePoint), _.cloneDeep(referencePoint5m));	

			// Loads the embeds and attachments
			const title = 'Most XP contributed for ' + guild.name + ' [' + guild.prefix + ']'
				+ ' since <t:' + Math.floor((new Date(referencePoint.date)).getTime() / 1000) + '>';

			const embeds = DiscordHelper.getEmbeds(getFields(_.cloneDeep(mappedGains), _.cloneDeep(guild)), 1, title, await WynnApiHelper.getGuildThumbnail(guild.name));
			const message = { embeds: embeds };

			const attachment = await getAttachment(_.cloneDeep(xpGains), mappedGains);
			if (attachment) {
				message.embeds = _.map(message.embeds, embed => {
					return embed.setImage('attachment://' + attachment.name);
				});
	
				message.files = [attachment];
			}
			
			return message;
		}

		// API TTL is 2min
		RefreshHelper.addRefresher(interaction, embedsFunc, 1000 * 60 * 1);
	},
};

function getFields(mappedGains, guild) {

	// Number formats
	mappedGains = _.map(mappedGains, member => {
		member.xpGained = member.xpGained.toLocaleString();
		member.average = member.average.toLocaleString(undefined, { maximumFractionDigits: 0 });
		member.xpGained5m = member.xpGained5m.toLocaleString();
		member.average5m = member.average5m.toLocaleString(undefined, { maximumFractionDigits: 0 });
		member.killedMobs = member.killedMobs
			? member.killedMobs.toLocaleString(undefined, { maximumFractionDigits: 0 })
			: null;

		return member;
	});

	const fields = FormatHelper.getFieldsFromValues('XP Gains', _.map(mappedGains, member => getFormattedMember(member, guild)));
	if (!fields?.length) {
		return [{ name: 'No data', value: 'Nobody contributed any XP.' }];
	}

	return fields;
}

function getMappedGains(members, referencePoint, referencePoint5m) {

	// Reduces the guild members xp gain by the reference point xp
	const minutesBetween = ((new Date()) - new Date(referencePoint.date)) / (1000 * 60);

	members = _.map(members, member => {

		// XP Gained total
		member.xpGained = calculateContributed(member, referencePoint);
		member.killedMobs = calculateContributed(member, referencePoint, 'killedMobs');

		if (member.xpGained) {
			member.average = member.xpGained / (minutesBetween ? minutesBetween : 1);
		} else {
			member.average = 0;
		}

		// XP Gained 5m
		if (!referencePoint5m) {
			member.xpGained5m = 0;
			member.average5m = 0;
		} else {
			member.xpGained5m = calculateContributed(member, referencePoint5m);

			if (member.xpGained5m) {
				member.average5m = minutesBetween < 5 
					? (member.xpGained5m / minutesBetween)  
					: (member.xpGained5m / 5);
			} else {
				member.average5m = 0;
			}
		}

		return member;
	});

	// Removes people without xp and sorts the data by most xp gained
	members = _.filter(members, member => !!member.xpGained);
	members = _.orderBy(members, member => member.xpGained, 'desc');

	return members;
}

async function getGuild(guildName, username = null) {
	const guild = await WynnApiHelper.getGuildInfo(guildName);
	if (!guild) {
		return null;
	}

	// If a username was provided, tracks mob kills for them
	if (!username) {
		return guild;
	}

	const user = _.find(guild.members.all, member => member.username === username);
	if (!user) {
		return guild;
	}

	const userDetails = await (await WynnApiHelper.callWynnApi('/player/' + user.uuid))?.body?.json();
	if (!userDetails) {
		return guild;
	}

	guild.members.all = _.map(guild.members.all, member => {
		if (member.username === username) {
			member.killedMobs = userDetails.globalData.killedMobs;
		}

		return member;
	});

	return guild;
}

function getFormattedMember(member, guild) {

	// How much of needed % did the person get
	let gainPercentage;
	if (member.xpGained && guild.xpNeeded) {
		const xpGainedNumber = Number(member.xpGained.split('.').join('').split(',').join(''));
		gainPercentage = ((xpGainedNumber / guild.xpNeeded) * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	let memberText = '**`' + member.username + '`**'
		+ '\nTotal XP: `' + member.xpGained + '` (`' + member.average + '/m`)' + (gainPercentage ? (' (`' + gainPercentage + '%`)') : '')
		+ '\nLast 5m XP: `' + (member.xpGained5m ?? 0) + '` (`' + (member.average5m ?? 0) + '/m`)';

	if (member.killedMobs) {
		memberText += '\nMobs killed: `' + member.killedMobs + '`';
	}		

	memberText += '\n'; 

	return memberText;
}



//region Filter gains

function getFilteredXPGains(xpGains, days) {

	// Filters the xp gains by date
	return _.filter(xpGains, gain => {
		return ((new Date()) - new Date(gain.date)) <= (1000 * 60 * 60 * 24 * days);
	});
}

async function getCurrentGains(guild) {
	const gains = {
		date: new Date(),
		level: guild.level,
		xpPercent: guild.xpPercent,
		members: _.map(guild.members.all, member => {
			return {
				uuid: member.uuid,
				username: member.username,
				contributed: member.contributed,
				killedMobs: member.killedMobs
			};
		})
	};

	return gains;
}

function calculateContributed(member, referencePoint, field = 'contributed') {
	const reference = _.cloneDeep(_.find(referencePoint.members, ref => ref.uuid === member.uuid));
	if (!reference) {
		return member.contributed;
	}

	let referenceValue = reference[field] ?? 0;

	// When people leave the guild, it would be negative
	if (referenceValue > (member[field] ?? 0)) {
		referenceValue = 0;
	}

	return (member[field] ?? 0) - referenceValue;
}

//endregion



//region Charts

async function getAttachment(xpGains, mappedGains) {
	return await getTotalAttachment(_.cloneDeep(xpGains), _.cloneDeep(mappedGains));
}

async function getTotalAttachment(xpGains, mappedGains) {

	// Checks who the top 3 earners are
	const topContributed = _.slice(mappedGains, 0, 3);
	if (!xpGains?.length || !topContributed?.length) {
		return null;
	}

	// Maps the xp gain data in the correct format
	// Displays the xp gain for the top 3 gainers
	const datasets = _.map(topContributed, (gain, index) => {
		let color;
		switch (index) {
			case 0:
				color = 'red'
				break;
			case 1:
				color = 'blue';
				break;
			case 2:
				color = 'green';
				break;
		}

		return { 
			label: gain.username,
			backgroundColor: color,
			borderColor: color,
			pointRadius: 0,

			data: _.filter(_.map(xpGains, xpGain => {
				const userGain = _.find(xpGain.members, member => member.uuid === gain.uuid);
				if (!userGain) {
					return null;
				}

				return calculateContributed(userGain, _.find(xpGains));
			}), data => data !== null),
		}
	});

	const data = { 
		labels: _.map(_.filter(xpGains, (xpGain, index) => xpGain.contributed !== null), xpGain => new Date(xpGain.date).getTime()),
		datasets: datasets
	};

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
					unit: 'minute',
					stepSize: 1,
					displayFormats: {
						'millisecond': 'HH:mm',
						'second': 'HH:mm',
						'minute': 'HH:mm',
						'hour': 'HH:mm',
						'day': 'HH:mm',
						'week': 'HH:mm',
						'month': 'HH:mm',
						'quarter': 'HH:mm',
						'year': 'HH:mm',
					}
				},
				ticks: {
					autoSkip: true,
					maxTicksLimit: 20,
					color: 'white'
				}
			},
			y: {
				grid: {
					color: 'rgba(255, 255, 255, 0.2)',
					borderColor: 'white'
				},
				type: 'linear',
				title: {
					display: true,
					text: 'XP'
				},
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

/*async function getAveragesAttachment(xpGains, mappedGains) {

	// Checks who the top 3 earners are
	const topContributed = _.slice(mappedGains, 0, 3);
	if (!topContributed?.length) {
		return null;
	}


	// Filters out equals gains, because API doesnt always update
	let lastGain = null;
	xpGains = _.filter(xpGains, xpGain => {
		let isEqual = false;

		if (_.isEqual(_.map(lastGain?.members, m => m.contributed), _.map(xpGain?.members, m => m.contributed))) {
			isEqual = true;
		}

		lastGain = xpGain;
		return !isEqual;
	});

	// Maps the xp gain data in the correct format
	// Displays the xp gain for the top 3 gainers
	const datasets = _.map(topContributed, (gain, index) => {
		let lastGain = null;
		let color;

		switch (index) {
			case 0:
				color = 'red'
				break;
			case 1:
				color = 'blue';
				break;
			case 2:
				color = 'green';
				break;
		}

		return { 
			label: gain.username,
			backgroundColor: color,
			borderColor: color,
			pointRadius: 0,

			data: _.filter(_.map(xpGains, xpGain => {
				const userGain = _.find(xpGain.members, member => member.uuid === gain.uuid);
				if (!userGain) {
					return 0;
				}

				let data;
				if (!lastGain) {
					data = null;
				} else {
					data = calculateContributed(_.cloneDeep(userGain), _.cloneDeep(lastGain))
				}

				

				// Calculates xp/m
				if (data && lastGain) {
					data = (data / (((new Date(xpGain.date)) - new Date(lastGain.date)) / (1000 * 60)));
				}
				
				lastGain = xpGain;
				return data;
			}), data => data !== null),
		}
	});

	const data = { 
		labels: _.map(_.filter(xpGains, (xpGain, index) => index !== 0), xpGain => new Date(xpGain.date)), 
		datasets: datasets
	};

	const options = {
		legend: {
			fontColor: "white",
		},
		scales: { 
			xAxes: {
				grid: {
					color: 'rgba(255, 255, 255, 0.2)',
					borderColor: 'white'
				},
				type: 'time',
				time: {
					unit: 'minute',
					stepSize: 1,
					displayFormats: {
						'minute': 'HH:mm'
					}
				},
				ticks: {
					autoSkip: true,
					maxTicksLimit: 20
				}
			},
			yAxes: { 
				grid: {
					color: 'rgba(255, 255, 255, 0.2)',
					borderColor: 'white'
				},
				type: 'linear',
				title: {
					display: true,
					text: 'XP/m'
				}
			}
		}
	}

	const configuration = { type: 'line', data: data, options: options };
	const builder = new AttachmentBuilder(await canvas.renderToBuffer(configuration));
	builder.name = 'xp-gain1.png';

	return builder;
}*/

//endregion