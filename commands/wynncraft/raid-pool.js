const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const DiscordHelper = require('../../helpers/discord.helper.js');
const FileHelper = require('../../helpers/file.helper.js');
const LogHelper = require('../../helpers/log.helper.js');
var _ = require('lodash');
const WynnApiHelper = require('../../helpers/wynn-api.helper.js');
const ImageHelper = require('../../helpers/image.helper.js');
const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');



const RAIDPOOL_TRACKERS_FILENAME = './assets/raid-pool-trackers.json';

let intervals = []; // All intervals across all bot instances

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raid-pool')
        .setDescription('Displays the current Raid loot pool & aspects and might automatically post updates.')
        .addBooleanOption(option =>
            option.setName('post-updates')
                .setDescription('(Optional) Set to true if changes in the Raid pool should automatically be posted'))
        .addRoleOption(option =>
            option.setName('ping-role')
                .setDescription('(optional) Role to be pinged when the pool changes'))
        .addBooleanOption(option =>
            option.setName('disable')
                .setDescription('(Optional) Set to true if you want the bot to stop the automatic updates'))
        .setDMPermission(false),
    async onStartup(client) {
        let activeTrackers = FileHelper.readFromFile(RAIDPOOL_TRACKERS_FILENAME);
        if (!activeTrackers) {
            return;
        }

        // Removes Duplicates
        activeTrackers = _.uniqWith(activeTrackers, (a, b) => {
            return a.guildId === b.guildId;
        });

        console.log('Starting ' + activeTrackers.length + ' raid-pool from memory!');
        LogHelper.writeToLog('Starting ' + activeTrackers.length + ' raid-pool from memory!\n' + JSON.stringify(activeTrackers));

        for (let tracker of _.cloneDeep(activeTrackers)) {
            try {

                // Tell the command that its an execution from memory and sets used functions
                const guild = await DiscordHelper.fetch(client?.guilds, tracker.guildId);
                if (!guild) {
                    console.log('Raid Pool for guild ' + tracker.guildId + ' could not be started!');
                    LogHelper.writeToLog('Raid Pool for guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
                    activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId);
                    FileHelper.writeToFile(RAIDPOOL_TRACKERS_FILENAME, activeTrackers);
                    continue;
                }

                const channel = await DiscordHelper.fetch(guild?.channels, tracker.channelId);
                if (!channel) {
                    console.log('Raid Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!');
                    LogHelper.writeToLog('Raid Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(tracker));
                    activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
                    FileHelper.writeToFile(RAIDPOOL_TRACKERS_FILENAME, activeTrackers);
                    continue;
                }

                tracker.fromMemory = true;
                tracker.guild = guild;
                tracker.channel = channel;

                tracker.deferReply = async function() {};
                tracker.followUp = async function() {};
                tracker.deleteReply = async function() {};

                await this.execute(tracker);

                LogHelper.writeToLog('Started a Raid Pool for server ' + guild.id + ' ' + (guild.name || 'n/A') + '!\n');
            } catch (e) {
                console.log(e);
                console.log('Raid Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
                LogHelper.writeToLog('Raid Pool for channel ' + tracker.channelId + ' in guild ' + tracker.guildId + ' could not be started!\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '\n' + JSON.stringify(tracker));
                activeTrackers = _.reject(activeTrackers, a => a.guildId === tracker.guildId && a.channelId === tracker.channelId);
                FileHelper.writeToFile(RAIDPOOL_TRACKERS_FILENAME, activeTrackers);
            }
        }

        // Removes the trackers which couldnt be started
        console.log('Actually started ' + activeTrackers.length + ' Raid Pool from memory!');
        LogHelper.writeToLog('Actually started ' + activeTrackers.length + ' Raid Pool from memory!');
    },
    async execute(interaction) {
        let interval;

        let postUpdates, pingRole, disable, raidpool, trackerId;
        if (interaction.fromMemory) {
            postUpdates = interaction.options.postUpdates;
            pingRole = interaction.options.pingRole;
            trackerId = interaction.trackerId;
            raidpool = interaction.raidpool;
        } else {
            postUpdates = interaction.options.getBoolean('post-updates');
            pingRole = interaction.options.getRole('ping-role')?.id;
            disable = interaction.options.getBoolean('disable');
            trackerId = new Date().getTime() + Math.floor(Math.random() * 100);
            raidpool = null;
        }

        // Tells discord the command is being processed
        await DiscordHelper.deferReply(interaction);

        if (!interaction.fromMemory && (postUpdates || pingRole)) {
            const hasKick = (await DiscordHelper.fetch(interaction.guild?.members, interaction.user.id))?.permissions?.has(PermissionFlagsBits.KickMembers);
            if (!hasKick) {
                DiscordHelper.editReply(interaction, 'You don\'t have permissions to do this!');
            }
        }

        // Checks if the guild that started the tracker already has a tracker running
        // Don't kill the tracker if the user only wants the current pool without tracking
        const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
        if (existingInterval && (postUpdates || disable)) {
            removeActiveTracker(true);
            DiscordHelper.followUp(interaction, 'Stopped the existing raid-pool tracker.');

            if (disable) {
                return;
            }
        } else if (disable) {
            DiscordHelper.followUp(interaction, 'There are no active raid-pool trackers for this server.');
            return;
        }

        if (postUpdates) {
            interval = setInterval(async () => {
                try {
                    processRaidpoolData(await WynnApiHelper.getRaidPool());
                } catch (e) {
                    console.log('raid-pool: interval: ', e);
                    LogHelper.writeToLog('raid-pool: interval: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
                }
            }, 1000 * 60 * 1);
        }

        try {
            processRaidpoolData(await WynnApiHelper.getRaidPool(), !interaction.fromMemory);
        } catch (e) {
            console.log('raid-pool: initial start:', e);
            LogHelper.writeToLog('raid-pool: initial start:' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }



        function addActiveTracker() {
            removeActiveTracker();

            intervals.push({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                postUpdates: postUpdates,
                pingRole: pingRole,
                trackerId: trackerId,
                raidpool: raidpool
            });

            updateTrackersFile();
        }

        function removeActiveTracker(initialCheck = false) {
            const existingInterval = intervals.find(i => i.guildId === interaction.guild.id);
            if (!existingInterval) {
                return;
            }

            intervals = intervals.filter(i => !(i.guildId === interaction.guild.id));

            // Only remove the interval if another will be started afterwards
            if (initialCheck) {
                clearInterval(existingInterval.interval);
            }

            updateTrackersFile(true);
        }

        function updateTrackersFile(removeCurrent = false) {
            let activeTrackers = FileHelper.readFromFile(RAIDPOOL_TRACKERS_FILENAME);
            if (!activeTrackers) {
                activeTrackers = [];
            }

            activeTrackers = _.filter(activeTrackers, tracker => !(tracker.guildId === interaction.guild.id));

            if (!removeCurrent) {
                activeTrackers.push(getTrackerForFile());
            }

            FileHelper.writeToFile(RAIDPOOL_TRACKERS_FILENAME, activeTrackers);
        }

        function getTrackerForFile() {
            return {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                options: {
                    postUpdates: postUpdates,
                    pingRole: pingRole,
                },
                trackerId: trackerId,
                raidpool: raidpool
            };
        }

        async function processRaidpoolData(newRaidpool, initialCall = false) {
            if (!newRaidpool || _.isEqual(newRaidpool, raidpool)) {
                return;
            }

            raidpool = _.cloneDeep(newRaidpool);

            let text = '';
            if (initialCall) {
                text += '';
            } else {
                text += '# New Raidpool detected';
            }

            if (!initialCall) {
                if (pingRole) {
                    text += `\n<@&${ pingRole }>`;
                }

                text += '\n\n-# This is an automated message for raid pool changes. Run `/raid-pool disable:true` to turn them off.'
            }

            const attachments = [];
            for (const raid of newRaidpool) {
                const attachment = await createRaidImage(raid);
                if (!attachment) {
                    continue;
                }

                attachments.push(attachment);
            }

            if (initialCall && !interaction.fromMemory) {
                DiscordHelper.editReply(interaction, {
                    content: text,
                    files: attachments
                });
            } else {
                DiscordHelper.send(interaction.channel, {
                    content: text,
                    files: attachments
                });
            }

            addActiveTracker();
        }

        async function createRaidImage(raid) {
            raid = _.cloneDeep(raid);

            // Filter rewards and display wards in front
            if (!raid?.rewards?.length) {
                return null;
            }

            raid.rewards = _.orderBy(_.filter(raid.rewards, reward => {
                if (!reward?.type || (reward.type !== 'WARD' && reward.type !== 'ASPECT' && reward.type !== 'TOME')) {
                    return false;
                }

                return true;
            }), reward => {
                switch (reward.type) {
                    case 'WARD':
                        return 0;
                    case 'ASPECT':
                        return 1;
                    case 'TOME':
                        return 2;
                }
            });

            const itemsPerRow = 4;
            const itemWidth = 300;
            const itemHeight = 100;
            const padding = 20;
            const rowHeight = 180;
            const headerHeight = 80;

            const rows = Math.ceil(raid.rewards.length / itemsPerRow);
            const canvasWidth = (itemsPerRow * (itemWidth + padding)) + padding;
            const canvasHeight = headerHeight + (rows * rowHeight);

            const canvas = createCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext('2d');

            // 1. Draw Global Background
            let bgImage;
            try {
                bgImage = await loadImage('./assets/images/raid-backgrounds/' + raid.name + '.png');
            } catch (e) {
                console.error('Asset could not be drawn: ' + './assets/images/raid-backgrounds/' + raid.name + '.png');
                LogHelper.writeToLog('Asset could not be drawn: ' + './assets/images/raid-backgrounds/' + raid.name + '.png');
                bgImage = await loadImage('./assets/images/raid-backgrounds/Default.png');
            }

            ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);

            // Header Text
            ctx.font = 'bold 40px sans-serif';
            ctx.fillStyle = '#FFFFFF';
            switch (raid.name) {
                case 'Nest of the Grootslangs':
                    ctx.fillStyle = '#55FF00';
                    break;
                case 'Orphion\'s Nexus of Light':
                    ctx.fillStyle = '#FFEE77';
                    break;
                case 'The Canyon Colossus':
                    ctx.fillStyle = '#06402B';
                    break;
                case 'The Nameless Anomaly':
                    ctx.fillStyle = '#00DDFF';
                    break;
                case 'The Wartorn Palace':
                    ctx.fillStyle = '#640000';
                    break;
            }

            ImageHelper.drawTextWithOutline(ctx, raid.name, canvasWidth / 2, 60, ctx.fillStyle, '#000000', 6);

            for (let i = 0; i < raid.rewards.length; i++) {
                await ImageHelper.createItemImage(ctx, raid.rewards[i], i, itemsPerRow, itemHeight, itemWidth, headerHeight, rowHeight, padding);
            }

            return new AttachmentBuilder(canvas.toBuffer(), { name: `${raid.internalName}.png` });
        }
    }
};