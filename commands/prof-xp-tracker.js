const { SlashCommandBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');
var _ = require('lodash');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const DiscordHelper = require('../helpers/discord.helper.js');
const FormatHelper = require('../helpers/format.helper.js');
const RefreshHelper = require('../helpers/refresh.helper.js');
const FileHelper = require('../helpers/file.helper.js');

// Required for the canvas to parse the date labels
require('chartjs-adapter-moment');

// Bugfix because it persists and causes issues on multiple runs, for some reason
// https://github.com/SeanSobey/ChartjsNodeCanvas/issues/9
const canvas = new ChartJSNodeCanvas({ width: 400, height: 200, backgroundColour: 'rgba(0,0,0,0.5)', plugins: {
    globalVariableLegacy: ['chartjs-adapter-moment']
}});

const MAX_LEVEL = 132;
const XP_REQS_FILENAME = './assets/gathering-xp-requirements.json';
const XP_REQS = FileHelper.readFromFile(XP_REQS_FILENAME);

const SHOWN_PROFESSIONS = [
	{ name: 'Fishing', value: 'fishing', color: 'blue' },
	{ name: 'Woodcutting', value: 'woodcutting', color: 'brown' },
	{ name: 'Mining', value: 'mining', color: 'grey' },
	{ name: 'Farming', value: 'farming', color: 'yellow' },
	
	{ name: 'Scribing', value: 'scribing', color: 'white' },
	{ name: 'Jeweling', value: 'jeweling', color: 'yellow' },
	{ name: 'Alchemism', value: 'alchemism', color: 'purple' },
	{ name: 'Cooking', value: 'cooking', color: 'brown' },
	{ name: 'Weaponsmithing', value: 'weaponsmithing', color: 'yellow' },
	{ name: 'Tailoring', value: 'tailoring', color: 'blue' },
	{ name: 'Woodworking', value: 'woodworking', color: 'green' },
	{ name: 'Armouring', value: 'armouring', color: 'grey' },
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('prof-xp-tracker')
		.setDescription('Displays prof xp gain for a player.')
		.addStringOption(option =>
			option.setName('username')
				.setDescription('The user to track')
				.setRequired(true))
		.setDMPermission(false),
	async execute(interaction) {
		const username = interaction.options.getString('username');

		// Tells discord the command is being processed
		await DiscordHelper.deferReply(interaction);
		
		// Loads the classes of the player and asks him to pick the class to track
		askUserForClass(interaction, username);
	},
};



//region Functions for class selection

async function askUserForClass(interaction, username) {
	const playerInfo = await WynnApiHelper.getPlayerInfo(username);
	if (!playerInfo) {
		await DiscordHelper.followUp(interaction, 'User "' + username + '" not found!');
		return;
	}

	let classes = await getClasses(username);
	if (!classes?.length) {
		await DiscordHelper.followUp(interaction, 'Classes for user "' + username + '" not found!');
		return;
	}

	// Sorts the classes by total level
	classes = _.orderBy(classes, c => c.totalLevel, 'desc');

	// Random tracking number
	const trackerId = new Date().getTime() + Math.floor(Math.random() * 100);

	// Creates the buttons
	const buttons = _.map(classes, c => {
		return new ButtonBuilder()
			.setCustomId(trackerId + ':' + c.uuid)
			.setEmoji({ name: getClassEmoji(c.type) })
			.setLabel(c.type + ' ' + (c.nickname ? '(' + c.nickname + ')' : '') + ' Lvl. ' + c.totalLevel)
			.setStyle(ButtonStyle.Primary);
	});

	const mappedButtons = [];
	let curObj = { type: 1, components: [] };
	_.forEach(buttons, button => {
		curObj.components.push(button);

		if (curObj.components.length === 5) {
			mappedButtons.push(curObj);

			curObj = _.cloneDeep(curObj);
			curObj.components = [];
		}
	});

	if (curObj.components.length) {
		mappedButtons.push(curObj);
	}



	// Listens to button clicks
	const collector = interaction.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 1000 * 60 * 5 }); 

	// Stores the entries
	let classSelected = false;
	collector.on('collect', i => {
		i.deferUpdate();				

		// Checks if its the button for this instance
        // If not, another instance is listening
        if (!i.customId || !i.customId.includes(trackerId + ':')) {
            return;
        }

		const classUUID = _.last(i.customId.split(':'));
		startTracker(username, classUUID, interaction, playerInfo.uuid);
		
		classSelected = true;
		collector.stop();
	});

	// Sends the message with the winners
	collector.on('end', () => {
		try {
			if (!classSelected) {
				collector.stop();
				DiscordHelper.editReply(interaction, {
					content: 'You didn\'t select a class in time.', 
					components: []
				});
			}
		} catch (e) {
			console.log(e);
			LogHelper.writeToLog('prof-xp-tracker: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
		}
	});



	DiscordHelper.followUp(interaction, {
		content: 'Please select the class to track',
		components: mappedButtons
	});
}

async function getClasses(username) {
	const json = await WynnApiHelper.callWynnApi('/player/' + username + '/characters');
	if (!json) {
		return null;
	}

	const classes = await json?.body?.json();
	return WynnApiHelper.mapObjectToArray(classes, 'uuid');
}

function getClassEmoji(className) {
	switch (className) {
		case 'NINJA':
		case 'ASSASSIN':
			return '🗡️';

		case 'KNIGHT':
		case 'WARRIOR':
			return '🛡️';

		case 'HUNTER':
		case 'ARCHER':
			return '🏹';

		case 'SKYSEER':
		case 'SHAMAN':
			return '🌱';

		case 'DARKWIZARD':
		case 'MAGE':
			return '🪄';
	}
}

function getDisplayedProfessions(xpGains) {
	if (!xpGains?.length) {
		return [];
	} 

	// Same format to prevent issues
	const mappedXpGains = _.map(xpGains, xpGain => {
		if (!xpGain.class) {
			xpGain.class = xpGain;
		}

		return xpGain;
	});

	// Prints only profs with values
	let shownProfessions = _.filter(SHOWN_PROFESSIONS, profession => _.find(mappedXpGains, xpGain => !!xpGain.class.professions[profession.value].xpGained));
	if (!shownProfessions?.length) {
		return [];
	}

	// Only show top 4 to not have an overloaded graph
	shownProfessions = _.orderBy(shownProfessions, 
		[profession => _.find(xpGains, xpGain => !!xpGain.class.professions[profession.value].xpGained)],
		['desc']
	);
	
	return shownProfessions;
}

//endregion



//region Functions for graph

async function startTracker(username, classUUID, interaction, uuid) {

	// Gets the current xp as the reference point
	const xpGains = [{ date: new Date(), class: getMappedGains(await getClass(username, classUUID), null, null) }];
	const referencePoint = _.minBy(xpGains, g => g.date);

	// Function for the refresher
	const embedsFunc = async function () {

		// Adds the current data to the gains, to always have up-to-date data
		// Checks if the gain is the same as the last gain
		let newGain = await getClass(username, classUUID);
		const lastGain = _.last(_.cloneDeep(xpGains));

		// Also shows the last 5m
		const referencePoint5m = _.minBy(getFilteredXPGains(xpGains, 1 / 24 / 12), xpGain => xpGain.date);

		// Maps the gain to get the xp obtained
		newGain = getMappedGains(_.cloneDeep(newGain), _.cloneDeep(referencePoint), _.cloneDeep(referencePoint5m));

		if (!lastGain || checkProfsChanged(newGain, lastGain)) {
			xpGains.push({ date: new Date(), class: newGain });
		}			

		// Loads the embeds and attachments
		const title = 'Profession experience gained since <t:' + Math.floor((new Date(referencePoint.date)).getTime() / 1000) + '>';

		const embeds = DiscordHelper.getEmbeds(getFields(_.cloneDeep(newGain)), 1, title, 'https://mc-heads.net/avatar/' + uuid);
		const message = { embeds: embeds };

		const attachment = await getAttachment(_.cloneDeep(xpGains));
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
}

function checkProfsChanged(newGain, referencePoint) {
	let changed = false;

	_.forEach(SHOWN_PROFESSIONS, profession => {
		if (newGain.professions[profession.value].level !== referencePoint.class.professions[profession.value].level 
			|| newGain.professions[profession.value].xpPercent !== referencePoint.class.professions[profession.value].xpPercent) {
				changed = true;
			}
	});

	return changed;
}

async function getClass(username, classUUID) {
	const json = await WynnApiHelper.callWynnApi('/player/' + username + '/characters/' + classUUID);
	if (!json) {
		return null;
	}

	return await json?.body?.json();
}

function getFilteredXPGains(xpGains, days) {

	// Filters the xp gains by date
	return _.filter(xpGains, gain => {
		return ((new Date()) - new Date(gain.date)) <= (1000 * 60 * 60 * 24 * days);
	});
}

function getMappedGains(newGain, referencePoint, referencePoint5m) {
	if (!referencePoint) {
		_.forEach(SHOWN_PROFESSIONS, profession => {
			newGain.professions[profession.value].xpGained = 0;
			newGain.professions[profession.value].average = 0;
			newGain.professions[profession.value].xpGained5m = 0;
			newGain.professions[profession.value].average5m = 0;
		});

		return newGain;
	}

	// Reduces the guild members xp gain by the reference point xp
	const minutesBetween = ((new Date()) - new Date(referencePoint.date)) / (1000 * 60);

	// XP Gained total
	_.forEach(SHOWN_PROFESSIONS, profession => {
		newGain.professions[profession.value].xpGained = getExperienceGained(newGain, referencePoint.class, profession.value);

		if (newGain.professions[profession.value].xpGained) {
			newGain.professions[profession.value].average = newGain.professions[profession.value].xpGained / (minutesBetween ? minutesBetween : 1);
		} else {
			newGain.professions[profession.value].average = 0;
		}

		// XP Gained 5m
		if (!referencePoint5m) {
			newGain.professions[profession.value].xpGained5m = 0;
			newGain.professions[profession.value].average5m = 0;
		} else {
			newGain.professions[profession.value].xpGained5m = getExperienceGained(newGain, referencePoint5m.class, profession.value);

			if (newGain.professions[profession.value].xpGained5m) {
				newGain.professions[profession.value].average5m = minutesBetween < 5 
					? (newGain.professions[profession.value].xpGained5m / minutesBetween)  
					: (newGain.professions[profession.value].xpGained5m / 5);
			} else {
				newGain.professions[profession.value].average5m = 0;
			}
		}
	});

	return newGain;
}

function getExperienceGained(currentPoint, referencePoint, profession) {
	let oldLevel = referencePoint.professions[profession].level + (referencePoint.professions[profession].xpPercent / 100);	
	let newLevel = currentPoint.professions[profession].level + (currentPoint.professions[profession].xpPercent / 100);

	// Has to take into account, that at max level, the overflow can exceed 99% and e.g. be 200%
	let oldLevelOverflow = 0;
	if (oldLevel > MAX_LEVEL) {
		oldLevelOverflow = Math.floor(oldLevel) - MAX_LEVEL;
		oldLevel -= oldLevelOverflow;
	}

	let newLevelOverflow = 0;
	if (newLevel > MAX_LEVEL) {
		newLevelOverflow = Math.floor(newLevel) - MAX_LEVEL;
		newLevel -= newLevelOverflow;
	}

	if (oldLevel === newLevel && oldLevelOverflow === newLevelOverflow) {
		return 0;
	}

	// Adds the xp needed for the original level
	let xp = XP_REQS[Math.floor(oldLevel)];

	// Removes the xp that was already obtained prior
	xp -= XP_REQS[Math.floor(oldLevel)] * (oldLevel % 1);

	// Adds the xp for the current level (If not the same)
	if (Math.floor(oldLevel) !== Math.floor(newLevel)) {
		xp += XP_REQS[Math.floor(newLevel)];
	}

	// Removed the xp that was not yet obtained for the current level
	xp -= XP_REQS[Math.floor(newLevel)] * (1 - (newLevel % 1));

	// Adds the xp from any levels, that were fully finished between
	for (let i = Math.floor(oldLevel) + 1; i < Math.floor(newLevel); i++) {
		xp += XP_REQS[Math.floor(i)];
	}

	// Adds the xp for any overflows
	for (let i = 0; i < oldLevelOverflow; i++) {
		xp -= XP_REQS[MAX_LEVEL];
	}
	for (let i = 0; i < newLevelOverflow; i++) {
		xp += XP_REQS[MAX_LEVEL];
	}

	return Math.floor(xp);
}

function getFields(newGain) {
	const mappedGain = _.cloneDeep(newGain);

	// Number formats
	_.forEach(SHOWN_PROFESSIONS, profession => {
		mappedGain.professions[profession.value].xpGainedFormatted = mappedGain.professions[profession.value].xpGained.toLocaleString();
		mappedGain.professions[profession.value].averageFormatted = mappedGain.professions[profession.value].average.toLocaleString(undefined, { maximumFractionDigits: 0 });
		mappedGain.professions[profession.value].xpGained5mFormatted = mappedGain.professions[profession.value].xpGained5m.toLocaleString();
		mappedGain.professions[profession.value].average5mFormatted = mappedGain.professions[profession.value].average5m.toLocaleString(undefined, { maximumFractionDigits: 0 });
	});

	const fields = FormatHelper.getFieldsFromValues('Profession XP Gains', [getFormattedMember(mappedGain)]);
	if (!fields?.length) {
		return [{ name: 'No data', value: 'No profession XP gained!' }];
	}

	return fields;
}

function getFormattedMember(member) {
	let memberText = '';

	const shownProfessions = getDisplayedProfessions([member]);
	_.forEach(shownProfessions, profession => {
		memberText += '**' + profession.name + '**'
			+ '\nTotal XP: `' + member.professions[profession.value].xpGainedFormatted
				+ '` (`' + member.professions[profession.value].averageFormatted + '/m`)'
			+ '\nLast 5m XP: `' + (member.professions[profession.value].xpGained5mFormatted ?? 0)
				+ '` (`' + (member.professions[profession.value].average5mFormatted ?? 0) + '/m`)'
			+ '\n\n';	
	});

	if (!memberText) {
		return 'No profession XP gained!';
	}

	return memberText;
}

async function getAttachment(xpGains) {
	return await getTotalAttachment(_.cloneDeep(xpGains));
}

async function getTotalAttachment(xpGains) {
	let shownProfessions = getDisplayedProfessions(xpGains);
	shownProfessions = _.slice(shownProfessions, 0, 4);

	if (!shownProfessions?.length) {
		return null;
	}

	// Maps the xp gain data in the correct format
	// Displays the xp gain for the top 3 gainers
	const datasets = _.map(shownProfessions, (profession, index) => {
		let color = profession.color;

		return { 
			label: profession.name,
			backgroundColor: color,
			borderColor: color,
			pointRadius: 0,

			data: _.map(xpGains, xpGain => xpGain.class.professions[profession.value].xpGained),
		}
	});

	const data = { 
		labels: _.map(xpGains, xpGain => new Date(xpGain.date).getTime()),
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
					text: 'XP gained'
				},
				ticks: {
					color: 'white'
				}
			}
		}
	}

	const configuration = { type: 'line', data: data, options: options };
	const builder = new AttachmentBuilder(await canvas.renderToBuffer(configuration));
	builder.name = 'prof-xp-gain.png';

	return builder;
}

//endregion