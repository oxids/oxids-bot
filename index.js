const { token } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const LogHelper = require('./helpers/log.helper.js');
const FormatHelper = require('./helpers/format.helper.js');
var _ = require('lodash');
const pjson = require('./package.json');
const DiscordHelper = require("./helpers/discord.helper");

const ACTIVITIES = [
    '⛏️ Gathering Ore',
    '⛏️ Gathering Ingots',
    '🪓 Gathering Wood',
    '🪓 Gathering Paper',
    '🧑‍🌾 Gathering String',
    '🧑‍🌾 Gathering Grains',
    '🎣 Gathering Meat',
    '🎣 Gathering Oil',

    '🏹 Crafting C-Spring',
    '👞 Crafting GXP Boots',
    '🧑‍🍳 Crafting HP Food',
    '📜 Crafting XP Scrolls',

    '🪶 Grinding Silver Feathers',
    '🥚 Grinding Spider Eggs',

    '🔥 Warring FFAs',
    '🔥 Dry-Sniping PROF',
    '🐮 Worshipping Salted',
    '💬 Chatting in Detlas',
    '💤 Waiting for bombs',
    '💤 AFK in Lutho',
    '💸 Buying crates',
    '💰 Flipping Mythics',
    '💰 Flipping Shares',
    '💰 Throwing ing bombs',
    '👀 Hunting Proffers',
    '😠 Respawning in Rymek',

    '🔎 Solving ???',
    '☄️ Finishing Red Meteor',
    '🖥️ Defeating Wynntron',
    '🧝 Suffering through RoL',
    '🐔 Taking care of Cluckles',
    '🍄 Rescuing Yahya',
    '🏃 Lootrunning SE',
    '🐶 Petting Orphion',
    '❄️ Defeating Theorick',
    '🕷️ Defeating Arakadicus',
    '🧟 Defeating Charon',
];



LogHelper.writeToLog('\n\n\n');
LogHelper.writeToLog('index: Starting...');

try {
    const client = new Client({ intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ] });
    setCommands(client);
    setEvents(client);

    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error('index: client.on(): ', error);
            LogHelper.writeToLog('index: client.on(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));

            if (interaction.replied || interaction.deferred) {
                await DiscordHelper.followUp(interaction, { content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await DiscordHelper.reply(interaction, { content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    });

    client.once(Events.ClientReady, c => {
        console.log(`Ready! Logged in as ${c.user.tag}`);
    });

    LogHelper.writeToLog('Starting bot!');
    client.login(token).then(() => {
        LogHelper.writeToLog(`Bot logged in!`);

        startIntervals(client);

        // Restart the command if it needs that
        for (const command of client.commands) {
            if (command[1].onStartup) {
                command[1].onStartup(client);
            }
        }

        // Sets a random message as status every 15m
        setActivity(client);
        setInterval(() => {
            setActivity(client);
        }, 1000 * 60 * 15);
    }).catch(error => {
        console.error('login(): ', error);
        LogHelper.writeToLog('login(): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
    });

} catch (error) {
    LogHelper.writeToLog('ERROR STARTING THE BOT: ' +  JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.log('ERROR STARTING THE BOT: ', error);
}


const startDate = new Date();
function setActivity(client) {
    const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
    client.user.setActivity('/help | ' + activity + ' | 🛠️ ' + pjson.version + ' |   🕒 Last restart: ' + FormatHelper.getFormattedTimeSinceTwoDates(startDate) + ' ago', {
        type: ActivityType.Custom
    });
}



// Sets the Commands for the client using the commands folder
function setCommands(client) {
    client.commands = new Collection();

    const commandFiles = _.filter(_.flattenDeep(_.map(fs.readdirSync(path.join(__dirname, 'commands'), { withFileTypes: true }), fileOrDirectoy => {
        if (!fileOrDirectoy.isDirectory()) {
            return path.join(fileOrDirectoy.parentPath, fileOrDirectoy.name);
        }

        return _.map(fs.readdirSync(path.join(fileOrDirectoy.parentPath, fileOrDirectoy.name), { withFileTypes: true }), fileOrDirectory2 => {
            if (fileOrDirectory2.isDirectory()) {
                return null;
            }

            return path.join(fileOrDirectory2.parentPath, fileOrDirectory2.name);
        });
    })), c => !!c);

    for (const file of commandFiles) {
        const command = require(file);

        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${commandFiles} is missing a required "data" or "execute" property.`);
        }
    }
}

function setEvents(client) {
    const eventFiles = _.filter(_.flattenDeep(_.map(fs.readdirSync(path.join(__dirname, 'events'), { withFileTypes: true }), fileOrDirectoy => {
        if (!fileOrDirectoy.isDirectory()) {
            return path.join(fileOrDirectoy.parentPath, fileOrDirectoy.name);
        }

        return _.map(fs.readdirSync(path.join(fileOrDirectoy.parentPath, fileOrDirectoy.name), { withFileTypes: true }), fileOrDirectory2 => {
            if (fileOrDirectory2.isDirectory()) {
                return null;
            }

            return path.join(fileOrDirectory2.parentPath, fileOrDirectory2.name);
        });
    })), c => !!c);

    for (const file of eventFiles) {
        const event = require(file);

        if (event.once) {
            client.once(event.name, (...args) => event.execute(client, ...args));
        } else {
            client.on(event.name, (...args) => event.execute(client, ...args));
        }
    }
}

async function startIntervals(client) {
    const intervalsPath = path.join(__dirname, 'intervals');
    const intervalsFiles = fs.readdirSync(intervalsPath).filter(file => file.endsWith('.js'));

    _.forEach(intervalsFiles, file => {
        const filePath = path.join(intervalsPath, file);
        const interval = require(filePath);

        // Checks if the interval has all the neccessary data
        if ('time' in interval && 'execute' in interval) {
            console.log("Started an interval!");
            LogHelper.writeToLog('Started an interval!');

            interval.execute(client);
            setInterval(() => {
                interval.execute(client);
            }, interval.time);   
        } else {
            console.log(`[WARNING] The interval at ${filePath} is missing a required "time" or "execute" property.`);
        }
    });
}